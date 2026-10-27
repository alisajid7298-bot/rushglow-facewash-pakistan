'use strict';
const {Pool}=require('@neondatabase/serverless');
const service=require('../lib/whatsapp-service');
const bot=require('../lib/whatsapp-bot');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');let pool;
 try{
  const q=req.query||{};
  if(req.method==='GET'&&q['hub.mode']){
   if(q['hub.mode']==='subscribe'&&process.env.WA_VERIFY_TOKEN&&service.equal(String(q['hub.verify_token']||''),process.env.WA_VERIFY_TOKEN))return res.status(200).send(String(q['hub.challenge']||''));
   return res.status(403).send('Verification denied');
  }
  const isAdmin=service.admin(req);
  const webhook=req.method==='POST'&&!q.action;
  let body;
  if(webhook){
   if(!process.env.WA_APP_SECRET)return res.status(503).json({error:'WhatsApp webhook not configured'});
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1000000)return res.status(413).end();chunks.push(Buffer.from(chunk));}
   const raw=Buffer.concat(chunks);
   if(!service.validSignature(raw,req.headers['x-hub-signature-256'],process.env.WA_APP_SECRET))return res.status(401).json({error:'Invalid signature'});
   try{body=JSON.parse(raw.toString('utf8'));}catch{return res.status(400).end();}
   if(body.object!=='whatsapp_business_account')return res.status(400).end();
   if(!process.env.WA_ACCESS_TOKEN||!process.env.WA_PHONE_NUMBER_ID)return res.status(503).json({error:'WhatsApp API connection incomplete'});
  }else if(!(req.method==='GET'&&q.image)&&!isAdmin)return res.status(401).json({error:'Admin login required'});
  const cs=process.env.POSTGRES_URL||process.env.DATABASE_URL||process.env.POSTGRES_URL_NON_POOLING;
  if(!cs)return res.status(503).json({error:'Database not configured'});
  pool=new Pool({connectionString:cs});
  if(req.method==='GET'&&q.image){
   if(!/^\d+$/.test(String(q.image)))return res.status(400).end();
   const photo=(await pool.query('SELECT photo FROM products WHERE id=$1',[q.image])).rows[0]?.photo||'';
   const inline=/^data:(image\/(?:png|jpeg|webp));base64,([a-zA-Z0-9+/=\s]+)$/.exec(photo);
   if(inline){res.setHeader('Content-Type',inline[1]);return res.send(Buffer.from(inline[2],'base64'));}
   // Public catalog images only; redirects do not receive API credentials.
   if(/^https:\/\//i.test(photo))return res.redirect(302,photo);
   return res.status(404).end();
  }
  await service.schema(pool);
  if(webhook){
   for(const entry of body.entry||[])for(const change of entry.changes||[]){
    const value=change.value||{};
    if(String(value.metadata?.phone_number_id)!==String(process.env.WA_PHONE_NUMBER_ID))continue;
    for(const status of value.statuses||[])await pool.query("UPDATE wa_messages SET status=$2,error=$3 WHERE meta_id=$1",[status.id,String(status.status||'').slice(0,40),status.errors?.length?'Meta error '+String(status.errors[0].code):null]);
    for(const message of value.messages||[])await service.processMessage(pool,message,value.contacts?.find(c=>c.wa_id===message.from)?.profile?.name||'');
   }
   return res.json({ok:true});
  }
  if(req.method==='GET'&&q.action==='status'){
   const enabled=(await pool.query('SELECT enabled FROM wa_settings WHERE id=1')).rows[0].enabled;
   const missing=['WA_VERIFY_TOKEN','WA_APP_SECRET','WA_ACCESS_TOKEN','WA_PHONE_NUMBER_ID'].filter(k=>!process.env[k]);
   return res.json({enabled,configured:missing.length===0,missing,callback:'https://rushglow.org/api/whatsapp',phoneId:process.env.WA_PHONE_NUMBER_ID||'',testMode:false});
  }
  if(req.method==='GET'&&q.action==='chats')return res.json((await pool.query(`SELECT c.phone,c.name,c.paused,c.last_inbound,c.updated_at,(SELECT body FROM wa_messages m WHERE m.phone=c.phone ORDER BY id DESC LIMIT 1) AS last_message FROM wa_chats c ORDER BY updated_at DESC LIMIT 100`)).rows);
  if(req.method==='GET'&&q.action==='messages'){
   if(!/^\d{8,15}$/.test(String(q.phone||'')))return res.status(400).end();
   return res.json((await pool.query('SELECT id,direction,body,media_id,status,error,created_at FROM wa_messages WHERE phone=$1 ORDER BY id DESC LIMIT 150',[q.phone])).rows.reverse());
  }
  if(req.method==='GET'&&q.action==='media'){
   if(!/^\d{1,30}$/.test(String(q.id||'')))return res.status(400).end();
   if(!(await pool.query('SELECT id FROM wa_messages WHERE media_id=$1 LIMIT 1',[q.id])).rows.length)return res.status(404).end();
   const media=await service.graph(q.id);const url=new URL(media.url);
   if(url.protocol!=='https:'||!/(^|\.)(facebook\.com|fbsbx\.com|fbcdn\.net)$/.test(url.hostname))return res.status(502).end();
   const r=await fetch(url,{headers:{Authorization:'Bearer '+process.env.WA_ACCESS_TOKEN},signal:AbortSignal.timeout(10000),redirect:'error'});
   if(!r.ok)return res.status(502).end();
   const type=(r.headers.get('content-type')||'').split(';')[0];if(!['image/jpeg','image/png','image/webp'].includes(type))return res.status(415).end();
   const data=Buffer.from(await r.arrayBuffer());if(data.length>4000000)return res.status(413).end();res.setHeader('Content-Type',type);res.setHeader('X-Content-Type-Options','nosniff');return res.send(data);
  }
  if(req.method!=='POST')return res.status(405).end();
  const origin=req.headers.origin;if(origin!=='https://rushglow.org'&&origin!=='https://www.rushglow.org')return res.status(403).json({error:'Invalid request origin'});
  // bodyParser is off to verify Meta's exact bytes. Admin requests are parsed here.
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>10000)return res.status(413).end();chunks.push(Buffer.from(chunk));}
  try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return res.status(400).end();}
  if(q.action==='enable'){
   if(typeof body.enabled!=='boolean')return res.status(400).end();
   if(body.enabled&&['WA_VERIFY_TOKEN','WA_APP_SECRET','WA_ACCESS_TOKEN','WA_PHONE_NUMBER_ID'].some(k=>!process.env[k]))return res.status(409).json({error:'Complete API settings before enabling replies'});
   await pool.query('UPDATE wa_settings SET enabled=$1 WHERE id=1',[body.enabled]);return res.json({ok:true});
  }
  if(q.action==='connection'){
   if(!process.env.WA_ACCESS_TOKEN||!process.env.WA_PHONE_NUMBER_ID)return res.status(409).json({error:'API credentials missing'});
   const data=await service.graph(process.env.WA_PHONE_NUMBER_ID+'?fields=display_phone_number,verified_name');return res.json({ok:true,display_phone_number:data.display_phone_number,verified_name:data.verified_name});
  }
  const phone=String(body.phone||'');if(!/^\d{8,15}$/.test(phone))return res.status(400).json({error:'Invalid customer phone'});
  if(q.action==='pause'){
   await pool.query('UPDATE wa_chats SET paused=$2,updated_at=NOW() WHERE phone=$1',[phone,!!body.paused]);return res.json({ok:true});
  }
  if(q.action==='reply'){
   if(!process.env.WA_ACCESS_TOKEN||!process.env.WA_PHONE_NUMBER_ID)return res.status(409).json({error:'WhatsApp API not connected'});
   const reply=String(body.text||'').trim();if(!reply||reply.length>4000)return res.status(400).json({error:'Enter a message of 1–4000 characters'});
   const db=await pool.connect();try{await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['rushglow-wa:'+phone]);const chat=(await db.query('SELECT last_inbound FROM wa_chats WHERE phone=$1',[phone])).rows[0];if(!chat||Date.now()-new Date(chat.last_inbound).getTime()>=23.9*3600000){await db.query('ROLLBACK');return res.status(409).json({error:'Customer service window closed. Customer must message again, or an approved template is required.'});}await db.query('UPDATE wa_chats SET paused=TRUE,updated_at=NOW() WHERE phone=$1',[phone]);await service.enqueue(db,phone,bot.text(reply),'human');await db.query('COMMIT');}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
   await service.flush(pool,phone);return res.json({ok:true});
  }
  return res.status(400).json({error:'Unknown action'});
 }catch(e){console.error('WhatsApp service error',e.code||e.name);return res.status(503).json({error:'WhatsApp service temporarily unavailable',...(e.code?{code:e.code}:{})});}
 finally{if(pool)await pool.end().catch(()=>{});}
};
module.exports.config={api:{bodyParser:false}};
