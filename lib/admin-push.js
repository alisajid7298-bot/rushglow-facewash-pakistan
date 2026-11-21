'use strict';
const crypto=require('node:crypto');
const allowedHosts=new Set(['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com']);
function validSubscription(s){
 try{const u=new URL(s.endpoint);if(u.protocol!=='https:'||!allowedHosts.has(u.hostname)||u.port||u.username||u.password||u.hash||u.href.length>2048)return false;
 const valid=(v,n)=>typeof v==='string'&&/^[A-Za-z0-9_-]+$/.test(v)&&Buffer.from(v,'base64url').length===n;
 if(!valid(s.keys?.p256dh,65)||!valid(s.keys?.auth,16))return false;
 crypto.ECDH.convertKey(Buffer.from(s.keys.p256dh,'base64url'),'prime256v1');return true;
 }catch{return false;}
}
async function schema(db){await db.query(`CREATE TABLE IF NOT EXISTS admin_push_keys(id integer PRIMARY KEY CHECK(id=1),public_key text NOT NULL,private_key text NOT NULL);
 CREATE TABLE IF NOT EXISTS admin_push_devices(endpoint text PRIMARY KEY,subscription jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT NOW());`);}
async function keys(db){
 let row=(await db.query('SELECT public_key,private_key FROM admin_push_keys WHERE id=1')).rows[0];
 if(!row){const k=require('web-push').generateVAPIDKeys();await db.query('INSERT INTO admin_push_keys VALUES(1,$1,$2) ON CONFLICT DO NOTHING',[k.publicKey,k.privateKey]);row=(await db.query('SELECT public_key,private_key FROM admin_push_keys WHERE id=1')).rows[0];}return row;
}
async function handle(pool,req,res){
 await schema(pool);
 const action=req.body?.action;
 if(action==='push-key'){const k=await keys(pool);return res.json({publicKey:k.public_key});}
 const subscription=req.body?.subscription;
 if(!validSubscription(subscription))return res.status(400).json({error:'Unsupported push subscription'});
 if(action==='push-off'){await pool.query('DELETE FROM admin_push_devices WHERE endpoint=$1',[subscription.endpoint]);return res.json({enabled:false});}
 if(action==='push-on'){
  const db=await pool.connect();try{await db.query('BEGIN');await db.query("SELECT pg_advisory_xact_lock(hashtextextended('rushglow-admin-push',0))");
   const count=(await db.query('SELECT count(*)::int AS n FROM admin_push_devices WHERE endpoint<>$1',[subscription.endpoint])).rows[0].n;
   if(count>=10){await db.query('ROLLBACK');return res.status(409).json({error:'Device limit reached. Turn off an older device.'});}
   await db.query('INSERT INTO admin_push_devices(endpoint,subscription) VALUES($1,$2) ON CONFLICT(endpoint) DO UPDATE SET subscription=EXCLUDED.subscription,updated_at=NOW()',[subscription.endpoint,JSON.stringify({endpoint:subscription.endpoint,keys:subscription.keys})]);await db.query('COMMIT');return res.json({enabled:true});
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
 if(action==='push-status'){const row=(await pool.query('SELECT 1 FROM admin_push_devices WHERE endpoint=$1',[subscription.endpoint])).rows[0];return res.json({enabled:!!row});}
 if(action==='push-test'){const row=(await pool.query('SELECT subscription FROM admin_push_devices WHERE endpoint=$1',[subscription.endpoint])).rows[0];if(!row)return res.status(409).json({error:'Enable notifications first'});const k=await keys(pool);const ok=await sendOne(pool,row.subscription,k,{kind:'test'});return res.status(ok?200:502).json({ok});}
 return res.status(400).json({error:'Unknown push action'});
}
async function sendOne(db,subscription,k,event){
 if(!validSubscription(subscription))return false;
 try{await require('web-push').sendNotification(subscription,JSON.stringify(event),{vapidDetails:{subject:'https://rushglow.org',publicKey:k.public_key,privateKey:k.private_key},TTL:3600,urgency:'high',timeout:3500});return true;}
 catch(e){if([404,410].includes(e.statusCode))await db.query('DELETE FROM admin_push_devices WHERE endpoint=$1',[subscription.endpoint]).catch(()=>{});return false;}
}
async function notify(db,kind,phone){
 // Only generic text is shown on the lock screen. The destination is encrypted.
 try{const rows=(await db.query('SELECT subscription FROM admin_push_devices LIMIT 10')).rows;if(!rows.length)return;
 const k=await keys(db);const event={kind,...(/^\d{8,15}$/.test(String(phone||''))?{phone:String(phone)}:{})};await Promise.allSettled(rows.map(row=>sendOne(db,row.subscription,k,event)));
 }catch(e){if(e.code!=='42P01')console.error('Admin push unavailable',e.code||e.name);}
}
module.exports={handle,notify,validSubscription};
