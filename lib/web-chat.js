'use strict';
const {Pool}=require('@neondatabase/serverless');
const crypto=require('crypto');
const orders=require('../api/orders');
const hash=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
function admin(req){try{const raw=(req.headers.cookie||'').match(/(?:^|;\s*)rg_admin=([^;]*)/);if(!raw)return false;const [exp,sig]=decodeURIComponent(raw[1]).split('.');const key=process.env.ADMIN_AUTH_SECRET||process.env.RESEND_API_KEY;if(!key||!/^\d+$/.test(exp)||Number(exp)<=Date.now()||!/^[a-f0-9]{64}$/.test(sig||''))return false;return crypto.timingSafeEqual(Buffer.from(sig,'hex'),Buffer.from(crypto.createHmac('sha256',key).update(exp).digest('hex'),'hex'))}catch{return false}}
async function schema(pool){await pool.query(`CREATE TABLE IF NOT EXISTS web_chat_sessions(id TEXT PRIMARY KEY,token_hash TEXT UNIQUE NOT NULL,name TEXT NOT NULL DEFAULT 'Website visitor',paused BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()); CREATE TABLE IF NOT EXISTS web_chat_messages(id BIGSERIAL PRIMARY KEY,session_id TEXT NOT NULL REFERENCES web_chat_sessions(id),sender TEXT NOT NULL,body TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()); CREATE INDEX IF NOT EXISTS web_chat_message_session ON web_chat_messages(session_id,id); CREATE TABLE IF NOT EXISTS web_chat_limits(key TEXT PRIMARY KEY,hits INTEGER NOT NULL,started_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`)}
async function limit(pool,req,action){const ip=String(req.headers['x-forwarded-for']||'unknown').split(',')[0].trim();const key=hash((process.env.ADMIN_AUTH_SECRET||process.env.RESEND_API_KEY||'web-chat')+':'+ip+':'+(action==='start'?'start':'message'));const max=action==='start'?15:240;const q=await pool.query("INSERT INTO web_chat_limits(key,hits) VALUES($1,1) ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN web_chat_limits.started_at<NOW()-INTERVAL '1 hour' THEN 1 ELSE web_chat_limits.hits+1 END,started_at=CASE WHEN web_chat_limits.started_at<NOW()-INTERVAL '1 hour' THEN NOW() ELSE web_chat_limits.started_at END RETURNING hits",[key]);return q.rows[0].hits<=max}
module.exports=async(req,res)=>{res.setHeader('Cache-Control','no-store');let pool;try{
 const action=String(req.query?.action||'messages'),isAdmin=admin(req),body=req.body||{};
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 if(req.method==='POST'&&!['https://rushglow.org','https://www.rushglow.org'].includes(req.headers.origin))return res.status(403).json({error:'Invalid origin'});
 if(['chats','reply','pause'].includes(action)&&!isAdmin)return res.status(401).json({error:'Admin login required'});
 const cs=process.env.POSTGRES_URL||process.env.DATABASE_URL||process.env.POSTGRES_URL_NON_POOLING;if(!cs)return res.status(503).json({error:'Chat temporarily unavailable'});pool=new Pool({connectionString:cs});await schema(pool);
 if(req.method==='POST'&&!isAdmin&&!await limit(pool,req,action))return res.status(429).json({error:'Too many requests. Please try again later.'});
 if(action==='start'&&req.method==='POST'){const token=crypto.randomBytes(32).toString('hex'),id=crypto.randomBytes(16).toString('hex');await pool.query('INSERT INTO web_chat_sessions(id,token_hash) VALUES($1,$2)',[id,hash(token)]);return res.status(201).json({token,id})}
 if(action==='chats'&&req.method==='GET')return res.json({chats:(await pool.query(`SELECT c.id,c.name,c.paused,c.updated_at,(SELECT body FROM web_chat_messages m WHERE m.session_id=c.id ORDER BY m.id DESC LIMIT 1) AS last_message FROM web_chat_sessions c ORDER BY c.updated_at DESC LIMIT 100`)).rows});
 let session;
 if(isAdmin&&req.query?.id)session=(await pool.query('SELECT id,name,paused FROM web_chat_sessions WHERE id=$1',[String(req.query.id)])).rows[0];
 else{const token=String(req.headers['x-rg-chat-token']||'');if(!/^[a-f0-9]{64}$/.test(token))return res.status(401).json({error:'Chat session required'});session=(await pool.query('SELECT id,name,paused FROM web_chat_sessions WHERE token_hash=$1',[hash(token)])).rows[0]}
 if(!session)return res.status(401).json({error:'Chat session expired'});
 if(action==='messages'&&req.method==='GET'){const after=String(req.query?.after||'0');if(!/^\d{1,18}$/.test(after))return res.status(400).json({error:'Invalid cursor'});return res.json({session,messages:(await pool.query('SELECT id,sender,body,created_at FROM web_chat_messages WHERE session_id=$1 AND id>$2 ORDER BY id LIMIT 150',[session.id,after])).rows})}
 if(action==='pause'&&req.method==='POST'){if(typeof body.paused!=='boolean')return res.status(400).json({error:'Invalid mode'});await pool.query('UPDATE web_chat_sessions SET paused=$2,updated_at=NOW() WHERE id=$1',[session.id,body.paused]);return res.json({ok:true})}
 if(['message','reply'].includes(action)&&req.method==='POST'){const text=String(body.text||'').trim();if(!text||text.length>4000)return res.status(400).json({error:'Enter a message of 1–4000 characters'});const sender=isAdmin&&action==='reply'?'team':body.sender==='bot'?'bot':'customer';await pool.query('INSERT INTO web_chat_messages(session_id,sender,body) VALUES($1,$2,$3)',[session.id,sender,text]);await pool.query('UPDATE web_chat_sessions SET paused=CASE WHEN $2 THEN TRUE ELSE paused END,updated_at=NOW() WHERE id=$1',[session.id,sender==='team'||(sender==='customer'&&body.handoff===true)]);return res.json({ok:true})}
 if(action==='order'&&req.method==='POST'){
  if(!/^[a-f0-9-]{20,80}$/.test(String(body.request_id||'')))return res.status(400).json({error:'Invalid order request'});
  const name=String(body.name||'').trim(),address=String(body.address||'').trim(),city=String(body.city||'').trim(),phone=String(body.phone||'').replace(/[\s()+-]/g,'');
  if(name.length<2||name.length>100||address.length<8||address.length>1000||city.length<2||city.length>100||!/^(03\d{9}|923\d{9})$/.test(phone))return res.status(400).json({error:'Check your name, Pakistani phone, full address and city.'});
  const qty=Number(body.qty);if(!Number.isInteger(qty)||qty<1||qty>100||!/^\d+$/.test(String(body.product_id)))return res.status(400).json({error:'Invalid product or quantity'});
  if(!['Cash on Delivery','EasyPaisa'].includes(body.payment))return res.status(400).json({error:'Choose a payment method'});
  const screenshot=String(body.screenshot||'');if(body.payment==='EasyPaisa'&&!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(screenshot))return res.status(400).json({error:'Upload your payment screenshot'});if(screenshot.length>1000000)return res.status(413).json({error:'Payment image is too large'});
  const orderBody={customer_name:name,phone,address,city,payment_method:body.payment,payment_screenshot:screenshot,items:[{id:body.product_id,qty}],notes:'Website chat order',web_chat_key:session.id+':'+body.request_id,traffic_source:body.traffic_source,expected_total:Number(body.expected_total)};
  let status=200,result;const response={setHeader(){},status(n){status=n;return this},json(x){result=x;return this},end(){return this}};
  await orders({...req,method:'POST',query:{},body:orderBody,_webChatOrder:true},response);
  if(status!==201)return res.status(status).json({error:result?.error||'Order could not be placed'});
  await pool.query('UPDATE web_chat_sessions SET name=$2,updated_at=NOW() WHERE id=$1',[session.id,name]);
  await pool.query("INSERT INTO web_chat_messages(session_id,sender,body) SELECT $1,'bot',$2 WHERE NOT EXISTS(SELECT 1 FROM web_chat_messages WHERE session_id=$1 AND sender='bot' AND body=$2)",[session.id,'Order #'+result.id+' placed. Total Rs. '+result.price+'. Payment: '+result.payment_method+'. Status: '+result.status+'.']);
  return res.status(201).json({id:result.id,total:result.price,status:result.status,payment:result.payment_method});
 }
 return res.status(400).json({error:'Unknown action'});
 }catch(e){console.error('Website chat error',e.code||e.name);return res.status(503).json({error:'Chat temporarily unavailable. Please try again.'})}finally{if(pool)await pool.end().catch(()=>{})}};
