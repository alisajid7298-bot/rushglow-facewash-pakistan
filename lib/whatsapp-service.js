'use strict';
const crypto=require('node:crypto');
const bot=require('./whatsapp-bot');
const key=()=>process.env.ADMIN_AUTH_SECRET||process.env.RESEND_API_KEY||'';
function equal(a,b){return typeof a==='string'&&typeof b==='string'&&a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));}
function admin(req){try{const token=decodeURIComponent((req.headers.cookie||'').match(/(?:^|;\s*)rg_admin=([^;]*)/)?.[1]||'');const [exp,sig,...rest]=token.split('.');return !!key()&&!rest.length&&/^\d+$/.test(exp)&&Number(exp)>Date.now()&&equal(sig,crypto.createHmac('sha256',key()).update(exp).digest('hex'));}catch{return false;}}
function validSignature(raw,signature,secret){return !!secret&&equal(signature,'sha256='+crypto.createHmac('sha256',secret).update(raw).digest('hex'));}
async function schema(db){
  await db.query(`CREATE TABLE IF NOT EXISTS wa_settings(id INTEGER PRIMARY KEY CHECK(id=1),enabled BOOLEAN NOT NULL DEFAULT FALSE);
    INSERT INTO wa_settings(id) VALUES(1) ON CONFLICT DO NOTHING;
    CREATE TABLE IF NOT EXISTS wa_chats(phone TEXT PRIMARY KEY,name TEXT NOT NULL DEFAULT '',state JSONB NOT NULL DEFAULT '{}',paused BOOLEAN NOT NULL DEFAULT FALSE,last_inbound TIMESTAMPTZ,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS wa_messages(id BIGSERIAL PRIMARY KEY,meta_id TEXT UNIQUE,phone TEXT NOT NULL,direction TEXT NOT NULL,body TEXT NOT NULL DEFAULT '',media_id TEXT,payload JSONB,status TEXT NOT NULL DEFAULT 'received',error TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE INDEX IF NOT EXISTS wa_messages_phone_id ON wa_messages(phone,id);
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS wa_message_id TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS orders_wa_message_id ON orders(wa_message_id) WHERE wa_message_id IS NOT NULL;`);
}
async function products(db){
 const rows=(await db.query('SELECT id,name,price,stock,photo,bundle_ids FROM products ORDER BY id DESC')).rows;
 const byId=new Map(rows.map(p=>[String(p.id),p]));
 return rows.map(p=>{let ids=[];try{ids=JSON.parse(p.bundle_ids||'[]')}catch{}return {...p,stock:ids.length?Math.min(...ids.map(id=>Number(byId.get(String(id))?.stock||0))):p.stock};});
}
async function graph(path,options={}){
 const response=await fetch('https://graph.facebook.com/v25.0/'+path,{...options,signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+process.env.WA_ACCESS_TOKEN,'Content-Type':'application/json',...options.headers}});
 const data=await response.json().catch(()=>({}));
 if(!response.ok){const e=new Error('WhatsApp API request failed');e.code=String(data.error?.code||response.status);throw e;}
 return data;
}
async function enqueue(db,phone,payload,direction='bot'){
 const body=payload.text?.body||payload.interactive?.body?.text||payload.image?.caption||'';
 return (await db.query("INSERT INTO wa_messages(phone,direction,body,payload,status) VALUES($1,$2,$3,$4,'queued') RETURNING id",[phone,direction,body,JSON.stringify(payload)])).rows[0].id;
}
async function flush(db,phone){
 const pending=(await db.query("SELECT id,payload FROM wa_messages WHERE phone=$1 AND status='queued' ORDER BY id",[phone])).rows;
 for(const row of pending){
  const claimed=await db.query("UPDATE wa_messages SET status='sending' WHERE id=$1 AND status='queued' RETURNING id",[row.id]);
  if(!claimed.rows.length)continue;
  try{const result=await graph(process.env.WA_PHONE_NUMBER_ID+'/messages',{method:'POST',body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:phone,...row.payload})});
   await db.query("UPDATE wa_messages SET status='sent',meta_id=$2 WHERE id=$1",[row.id,result.messages?.[0]?.id||null]);
  }catch(e){await db.query("UPDATE wa_messages SET status='failed',error=$2 WHERE id=$1",[row.id,e.code?'Meta error '+e.code:'Delivery uncertain; check WhatsApp before retrying']);console.error('WhatsApp send failed',e.code||e.name);}
 }
}
async function createOrder(db,state,messageId){
 const existing=(await db.query('SELECT * FROM orders WHERE wa_message_id=$1',[messageId])).rows[0];if(existing)return existing;
 const p=(await db.query('SELECT id,name,price,bundle_ids FROM products WHERE id=$1',[state.productId])).rows[0];
 if(!p)throw new Error('STOCK');
 const amount=bot.price(p.price);if(amount!==state.unitPrice)throw new Error('PRICE:'+amount);
 let ids=[];try{ids=JSON.parse(p.bundle_ids||'[]')}catch{}
 const components=ids.length?(await db.query('SELECT id,name FROM products WHERE id=ANY($1::bigint[]) ORDER BY id',[ids])).rows:[p];
 if(ids.length&&components.length!==new Set(ids.map(String)).size)throw new Error('STOCK');
 const quantities=new Map();for(const id of ids.length?ids:[p.id])quantities.set(String(id),(quantities.get(String(id))||0)+1);
 for(const [id,quantity] of [...quantities].sort((a,b)=>Number(a[0])-Number(b[0]))){if(!(await db.query('UPDATE products SET stock=stock-$2 WHERE id=$1 AND stock>=$2 RETURNING id',[id,quantity])).rows.length)throw new Error('STOCK');}
 const charge=bot.delivery(state.city),items=[{id:p.id,name:p.name,price:String(amount),qty:1,...(ids.length?{bundle_components:components}: {})}];
 return (await db.query(`INSERT INTO orders(product_id,product_name,price,customer_name,phone,address,city,notes,payment_method,transaction_id,delivery,items,traffic_source,wa_message_id,status)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'WhatsApp',$13,'Pending') RETURNING *`,[p.id,p.name,String(amount+charge),state.name,state.phone,state.address,state.city,'WhatsApp order'+(state.payment==='EasyPaisa'?' — payment requires manual verification':'')+(state.paymentMediaId?' — receipt available in WhatsApp inbox':''),state.payment,state.transactionId||'',String(charge),JSON.stringify(items),messageId])).rows[0];
}
function extract(message){return {text:message.text?.body||message.image?.caption||message.button?.text||'',action:message.interactive?.button_reply?.id||message.interactive?.list_reply?.id||message.button?.payload||'',mediaId:message.image?.id||null};}
async function processMessage(pool,message,profile){
 const phone=String(message.from||'');if(!/^\d{8,15}$/.test(phone)||!message.id)return;
 const db=await pool.connect();let order;
 try{
  await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['rushglow-wa:'+phone]);
  const input=extract(message);
  const inserted=await db.query("INSERT INTO wa_messages(meta_id,phone,direction,body,media_id,status,created_at) VALUES($1,$2,'inbound',$3,$4,'received',to_timestamp($5)) ON CONFLICT(meta_id) DO NOTHING RETURNING id",[message.id,phone,input.text||input.action||'['+message.type+']',input.mediaId,Number(message.timestamp)||Math.floor(Date.now()/1000)]);
  if(!inserted.rows.length){await db.query('COMMIT');await flush(pool,phone);return;}
  await db.query(`INSERT INTO wa_chats(phone,name,last_inbound) VALUES($1,$2,to_timestamp($3)) ON CONFLICT(phone) DO UPDATE SET name=CASE WHEN $2<>'' THEN $2 ELSE wa_chats.name END,last_inbound=GREATEST(wa_chats.last_inbound,to_timestamp($3)),updated_at=NOW()`,[phone,String(profile||'').slice(0,100),Number(message.timestamp)||Math.floor(Date.now()/1000)]);
  const chat=(await db.query('SELECT * FROM wa_chats WHERE phone=$1',[phone])).rows[0];
  const enabled=(await db.query('SELECT enabled FROM wa_settings WHERE id=1')).rows[0].enabled;
  if(!enabled||chat.paused){await db.query('COMMIT');return;}
  // Do not send automated free-form replies to events outside the customer service window.
  if(Date.now()-Number(message.timestamp)*1000>23.9*3600000){await db.query('COMMIT');return;}
  let result=bot.advance(chat.state,input,await products(db),chat.name);
  if(result.order){
   await db.query('SAVEPOINT order_attempt');
   try{order=await createOrder(db,result.state,message.id);result.state={stage:'complete',orderId:String(order.id)};result.messages=[bot.text('Aapka order #'+order.id+' receive ho gaya.\n'+order.product_name+'\nTotal: Rs '+order.price+'\nPayment: '+order.payment_method+'\n'+(order.payment_method==='EasyPaisa'?'Payment owner verify karega. ':'')+'Owner aapko order update dega. Shukriya!')];}
   catch(e){await db.query('ROLLBACK TO SAVEPOINT order_attempt');if(e.message.startsWith('PRICE:')){const p=(await products(db)).find(p=>String(p.id)===result.state.productId);result.state={stage:'confirm',productId:result.state.productId,unitPrice:bot.price(p.price)};result.messages=[bot.text('Product ki qeemat update hui hai. Nayi qeemat par dobara confirm karein.'),bot.selectedReply(p)];}else if(e.message==='STOCK'){result.state={};result.messages=[bot.text('Maazrat, yeh product ab out of stock hai. Aapka order place nahi hua. MENU likh kar doosra product select karein.')];}else throw e;}
  }
  await db.query('UPDATE wa_chats SET state=$2,paused=$3,updated_at=NOW() WHERE phone=$1',[phone,JSON.stringify(result.state),!!result.handoff]);
  for(const payload of result.messages)await enqueue(db,phone,payload);
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 if(order)await require('../api/orders').notifyOrder(order);
 await flush(pool,phone);
}
module.exports={admin,equal,validSignature,schema,products,graph,enqueue,flush,processMessage};
