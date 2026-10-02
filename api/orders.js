const {Pool}=require('@neondatabase/serverless');const crypto=require('crypto');function admin(req){const raw=(req.headers.cookie||'').match(/(?:^|; )rg_admin=([^;]*)/);if(!raw)return false;try{const t=decodeURIComponent(raw[1]),[exp,sig]=t.split('.'),key=process.env.ADMIN_AUTH_SECRET||process.env.RESEND_API_KEY||'';if(!key||!exp||Date.now()>Number(exp))return false;const good=crypto.createHmac('sha256',key).update(exp).digest('hex');return sig===good}catch(e){return false}}

const ORDER_EMAILS=['ali.sajid7298@gmail.com','rushglow35@gmail.com'];
async function notifyOrder(order){
  if(!process.env.RESEND_API_KEY){console.error('Order notification unavailable: email service missing');return}
  const text=[
    'A new RUSHGLOW order has been placed.',
    'Order number: #'+order.id,
    'Products: '+(order.product_name||''),
    'Total: Rs. '+(order.price||''),
    'Customer: '+(order.customer_name||''),
    'Phone: '+(order.phone||''),
    'Alternate phone: '+(order.alternate_phone||'Not provided'),
    'Address: '+(order.address||''),
    'City / District: '+(order.city||''),
    'Payment method: '+(order.payment_method||''),
    'Transaction ID: '+(order.transaction_id||'Not provided'),
    'Status: '+(order.status||'Pending'),
    'Payment screenshot: '+(order.payment_screenshot?'Available in the control panel':'Not provided'),
    '',
    'View and manage this order: https://rushglow.org/admin.html'
  ].join('\n');
  await Promise.all(ORDER_EMAILS.map(async recipient=>{
    try{
      const response=await fetch('https://api.resend.com/emails',{
        method:'POST',signal:AbortSignal.timeout(8000),
        headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'rushglow-order-'+order.id+'-'+recipient},
        body:JSON.stringify({from:process.env.ADMIN_EMAIL_FROM||'RushGlow <verification@rushglow.org>',to:[recipient],subject:'New RUSHGLOW Order #'+order.id,text})
      });
      if(!response.ok)console.error('Order notification failed',String(order.id),recipient,response.status);
    }catch(error){console.error('Order notification failed',String(order.id),recipient,error.name)}
  }));
}

module.exports=async(req,res)=>{let pool;try{const cs=process.env.POSTGRES_URL||process.env.DATABASE_URL||process.env.POSTGRES_URL_NON_POOLING;if(!cs)return res.status(500).json({error:'Database missing'});pool=new Pool({connectionString:cs});await pool.query("CREATE TABLE IF NOT EXISTS orders (id BIGSERIAL PRIMARY KEY,product_id BIGINT,product_name TEXT,price TEXT,customer_name TEXT,phone TEXT,address TEXT,alternate_phone TEXT,city TEXT,notes TEXT,payment_method TEXT,transaction_id TEXT,payment_screenshot TEXT,discount_code TEXT,delivery TEXT,items TEXT,status TEXT DEFAULT 'Pending',courier TEXT,tracking_id TEXT,created_at TIMESTAMPTZ DEFAULT NOW())");await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier TEXT, ADD COLUMN IF NOT EXISTS tracking_id TEXT");
if(req.method==='POST'){const b=req.body||{};if(!b.customer_name||!b.phone||!b.address||!b.city)return res.status(400).json({error:'Missing details'});const client=await pool.connect();try{await client.query('BEGIN');let items=Array.isArray(b.items)?b.items:[];if(items.length){for(const it of items){const q=await client.query('UPDATE products SET stock=stock-$1 WHERE id=$2 AND stock >= $1 RETURNING stock',[Math.max(1,Number(it.qty||1)),it.id]);if(!q.rows[0])throw new Error('OUT_OF_STOCK:'+String(it.name||'Product'))}}else if(b.product_id){const q=await client.query('UPDATE products SET stock=stock-1 WHERE id=$1 AND stock >= 1 RETURNING stock',[b.product_id]);if(!q.rows[0])throw new Error('OUT_OF_STOCK:'+String(b.product_name||'Product'))}const q=await client.query('INSERT INTO orders(product_id,product_name,price,customer_name,phone,address,alternate_phone,city,notes,payment_method,transaction_id,payment_screenshot,discount_code,delivery,items) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *',[b.product_id||null,b.product_name||'',b.price||'',b.customer_name,b.phone,b.address,b.alternate_phone||'',b.city||'',b.notes||'',b.payment_method||'',b.transaction_id||'',b.payment_screenshot||'',b.discount_code||'',b.delivery||'0',JSON.stringify(items)]);await client.query('COMMIT');await notifyOrder(q.rows[0]);return res.status(201).json(q.rows[0])}catch(e){await client.query('ROLLBACK');if(String(e.message).startsWith('OUT_OF_STOCK:'))return res.status(409).json({error:String(e.message).split(':').slice(1).join(':')+' is out of stock.'});throw e}finally{client.release()}}
if(req.method==='GET'&&req.query&&req.query.id){const q=await pool.query('SELECT id,product_name,status,city,courier,tracking_id,created_at FROM orders WHERE id=$1',[req.query.id]);if(!q.rows[0])return res.status(404).json({error:'Order not found'});return res.status(200).json(q.rows[0])}
if(!admin(req))return res.status(401).json({error:'Admin login required'});
if(req.method==='DELETE'){
const b=req.body||{},id=String(b.id||'');
if(!/^[1-9][0-9]*$/.test(id))return res.status(400).json({error:'Invalid order number'});
const secret=process.env.ADMIN_AUTH_SECRET||process.env.RESEND_API_KEY;
const hash=value=>crypto.createHmac('sha256',secret).update(value).digest('hex');
const session=hash(String(b.challenge||''));
await pool.query("CREATE TABLE IF NOT EXISTS order_delete_challenges (order_id BIGINT PRIMARY KEY, challenge TEXT NOT NULL, session_hash TEXT NOT NULL, code_hash TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
if(b.action==='send'){
if(!process.env.RESEND_API_KEY)return res.status(503).json({error:'Email service is unavailable'});
const exists=await pool.query('SELECT id FROM orders WHERE id=$1',[id]);
if(!exists.rows.length)return res.status(404).json({error:'Order not found'});
const code=String(crypto.randomInt(100000,1000000)),challenge=crypto.randomBytes(32).toString('hex');
const reserved=await pool.query("INSERT INTO order_delete_challenges(order_id,challenge,session_hash,code_hash,expires_at,attempts,sent_at) VALUES($1,$2,$3,$4,NOW()+INTERVAL '10 minutes',0,NOW()) ON CONFLICT(order_id) DO UPDATE SET challenge=$2,session_hash=$3,code_hash=$4,expires_at=NOW()+INTERVAL '10 minutes',attempts=0,sent_at=NOW() WHERE order_delete_challenges.sent_at<=NOW()-INTERVAL '60 seconds' RETURNING challenge",[id,challenge,hash(challenge),hash(code+'.'+challenge)]);
if(!reserved.rows.length)return res.status(429).json({error:'Wait one minute before requesting another deletion code'});
const sent=await Promise.all(ORDER_EMAILS.map(async recipient=>{try{const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.ADMIN_EMAIL_FROM||'RushGlow <verification@rushglow.org>',to:[recipient],subject:'Confirm deletion of RUSHGLOW Order #'+id,text:'A request was made to permanently delete Order #'+id+'.\nVerification code: '+code+'\nThis code expires in 10 minutes and can be used once. Only share it if you approve deleting this order. If you did not request this, do not share the code.'})});return response.ok}catch{return false}}));
if(!sent.every(Boolean)){await pool.query('DELETE FROM order_delete_challenges WHERE order_id=$1 AND challenge=$2',[id,challenge]);return res.status(502).json({error:'The deletion code could not be sent to both emails. Your order has not been deleted. Please try again.'})}
return res.status(200).json({ok:true,challenge,message:'A deletion code has been sent to both admin emails'});
}
if(!/^[a-f0-9]{64}$/.test(String(b.challenge||''))||!/^\d{6}$/.test(String(b.code||'')))return res.status(400).json({error:'Request a deletion code and enter its 6 digits'});
const attempt=await pool.query("UPDATE order_delete_challenges SET attempts=attempts+1 WHERE order_id=$1 AND challenge=$2 AND session_hash=$3 AND expires_at>NOW() AND attempts<5 RETURNING code_hash",[id,b.challenge,session]);
if(!attempt.rows.length||attempt.rows[0].code_hash!==hash(String(b.code)+'.'+b.challenge))return res.status(401).json({error:'Invalid or expired deletion code. After 5 attempts, request a new code.'});
const client=await pool.connect();try{await client.query('BEGIN');const consumed=await client.query('DELETE FROM order_delete_challenges WHERE order_id=$1 AND challenge=$2 AND session_hash=$3 AND expires_at>NOW() RETURNING order_id',[id,b.challenge,session]);if(!consumed.rows.length){await client.query('ROLLBACK');return res.status(401).json({error:'Deletion code has expired or already been used'})}const q=await client.query('DELETE FROM orders WHERE id=$1 RETURNING id',[id]);await client.query('COMMIT');if(!q.rows.length)return res.status(404).json({error:'Order not found'});return res.status(200).json({ok:true,id:q.rows[0].id})}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}
if(req.method==='PATCH'){const b=req.body||{},allowed=['Pending','Paid','Packed','Shipped','Out for Delivery','Delivery Complete'];if(!b.id||!allowed.includes(b.status))return res.status(400).json({error:'Invalid status'});const q=await pool.query('UPDATE orders SET status=$1,courier=$2,tracking_id=$3 WHERE id=$4 RETURNING id,status,courier,tracking_id',[b.status,b.courier||'',b.tracking_id||'',b.id]);if(!q.rows[0])return res.status(404).json({error:'Order not found'});return res.status(200).json(q.rows[0])}
if(req.method==='GET'){const q=await pool.query('SELECT * FROM orders ORDER BY id DESC');return res.status(200).json(q.rows)}return res.status(405).end()}catch(e){console.error(e);return res.status(500).json({error:'Database error'})}finally{if(pool)await pool.end().catch(()=>{})}};