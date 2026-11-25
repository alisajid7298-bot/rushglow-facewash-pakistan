'use strict';
const crypto=require('node:crypto');
const TOPIC='rushglow-order-followup';
const MESSAGE='السلام علیکم!\nکیا آپ کو آرڈر کرنے میں کوئی مشکل پیش آ رہی ہے، یا آپ کسی اور پروڈکٹ کے بارے میں معلومات چاہتے ہیں؟ براہِ کرم ہمیں بتائیں، ہم آپ کی مدد کے لیے حاضر ہیں۔\n\nRushGlow Beauty & Skin Care';
const GREETING_MESSAGE='السلام علیکم پیارے کسٹمر! ❤️\n\nہم آپ کے جواب کا انتظار کر رہے ہیں۔ 😊\n\nکیا آپ چہرے کے داغ دھبوں، دانوں، بے رونق جلد یا رنگت کے حوالے سے پریشان ہیں؟\n\nاپنی جلد کا مسئلہ ہمیں بتائیں، ہماری ٹیم آپ کو مناسب پروڈکٹ منتخب کرنے میں مفت رہنمائی فراہم کرے گی۔ 🌸\n\n🚚 پورے پاکستان میں مفت ڈیلیوری\n💵 ادائیگی پارسل وصول کرنے کے بعد\n\nآپ کا اعتماد، ہماری ترجیح! ❤️\n\nRushGlow Beauty & Skin Care';
const greeting=state=>state?.stage==='menu'&&state.greetingFollowup===true;
const reminderKey=state=>greeting(state)?'greeting':String(state?.productId);
const signature=job=>crypto.createHmac('sha256',process.env.ADMIN_AUTH_SECRET||process.env.RESEND_API_KEY||'').update(JSON.stringify([job.probe===true,job.phone||'',job.session||'',job.generation||0])).digest('hex');
const seal=job=>({...job,signature:signature(job)});
function verified(job){if(!job||!process.env.ADMIN_AUTH_SECRET&&!process.env.RESEND_API_KEY||!/^[a-f0-9]{64}$/.test(job.signature||''))return false;return crypto.timingSafeEqual(Buffer.from(job.signature,'hex'),Buffer.from(signature(job),'hex'));}
const active=state=>!!state?.productId&&['confirm','details','city','payment','proof'].includes(state.stage);
async function schema(db){
 await db.query(`ALTER TABLE wa_settings ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN NOT NULL DEFAULT TRUE;
 ALTER TABLE wa_settings ADD COLUMN IF NOT EXISTS reminder_last_check_at TIMESTAMPTZ;
 CREATE TABLE IF NOT EXISTS wa_reminders(phone TEXT PRIMARY KEY,session_id TEXT NOT NULL,product_id TEXT NOT NULL,activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),generation INTEGER NOT NULL DEFAULT 1,consumed BOOLEAN NOT NULL DEFAULT FALSE,message_id BIGINT,last_schedule_error TEXT);`);
}
async function track(db,phone,previous,next){
 if(!active(next)&&!greeting(next)){await db.query('DELETE FROM wa_reminders WHERE phone=$1',[phone]);return;}
 const fresh=(!active(previous)&&!greeting(previous))||reminderKey(previous)!==reminderKey(next);
 await db.query(`INSERT INTO wa_reminders(phone,session_id,product_id) VALUES($1,$2,$3)
 ON CONFLICT(phone) DO UPDATE SET session_id=CASE WHEN $4 THEN $2 ELSE wa_reminders.session_id END,product_id=$3,activity_at=NOW(),generation=wa_reminders.generation+1,consumed=CASE WHEN $4 THEN FALSE ELSE wa_reminders.consumed END,message_id=CASE WHEN $4 THEN NULL ELSE wa_reminders.message_id END,last_schedule_error=NULL`,[phone,crypto.randomUUID(),reminderKey(next),fresh]);
}
async function schedule(db,phone,send){
 const row=(await db.query(`SELECT r.phone,r.session_id,r.generation FROM wa_reminders r JOIN wa_chats c USING(phone) JOIN wa_settings s ON s.id=1 WHERE r.phone=$1 AND NOT r.consumed AND s.reminder_enabled AND s.enabled AND NOT c.paused AND c.representative_requested_at IS NULL`,[phone])).rows[0];
 if(!row)return;
 const publish=send||require('./whatsapp-reminder-queue').send;
 try{await publish(TOPIC,seal({phone:row.phone,session:row.session_id,generation:row.generation}),{delaySeconds:1800,retentionSeconds:86400,idempotencyKey:'followup:'+row.session_id+':'+row.generation});await db.query('UPDATE wa_reminders SET last_schedule_error=NULL WHERE phone=$1 AND session_id=$2 AND generation=$3',[phone,row.session_id,row.generation]);}
 catch(e){await db.query('UPDATE wa_reminders SET last_schedule_error=$4 WHERE phone=$1 AND session_id=$2 AND generation=$3',[phone,row.session_id,row.generation,'Reminder could not be scheduled']);console.error('WhatsApp reminder scheduling unavailable',e.name);throw e;}
}
async function deliver(pool,job,service=require('./whatsapp-service')){
 if(!/^\d{8,15}$/.test(String(job?.phone||''))||typeof job.session!=='string'||!Number.isSafeInteger(job.generation))return;
 const db=await pool.connect();const lock='rushglow-wa:'+job.phone;let locked=false,transaction=false;
 try{
  await db.query('SELECT pg_advisory_lock(hashtextextended($1,0))',[lock]);locked=true;
  await db.query('BEGIN');transaction=true;
  const row=(await db.query(`SELECT r.*,c.state,c.paused,c.representative_requested_at,c.last_inbound,s.enabled,s.reminder_enabled,(NOW()>=r.activity_at+INTERVAL '30 minutes') AS due,(c.last_inbound>NOW()-INTERVAL '23 hours') AS within_window FROM wa_reminders r JOIN wa_chats c USING(phone) JOIN wa_settings s ON s.id=1 WHERE r.phone=$1 FOR UPDATE OF r`,[job.phone])).rows[0];
  if(!row||row.session_id!==job.session||row.generation!==job.generation||row.consumed||!row.enabled||!row.reminder_enabled||row.paused||row.representative_requested_at||!row.within_window||(!active(row.state)&&!greeting(row.state))||reminderKey(row.state)!==row.product_id){await db.query('COMMIT');transaction=false;return;}
  if(!row.due){await db.query('ROLLBACK');transaction=false;throw new Error('Reminder is not due yet');}
  const owner=(await db.query("SELECT 1 FROM wa_messages WHERE phone=$1 AND direction IN ('human','app_owner') AND created_at>= $2 LIMIT 1",[job.phone,row.activity_at])).rows.length;
  if(owner){await db.query('COMMIT');transaction=false;return;}
  const body=greeting(row.state)?GREETING_MESSAGE:MESSAGE;
  const id=await service.enqueue(db,job.phone,{type:'text',text:{body}},'reminder');
  // Persist the claim before contacting Meta. A callback retry must never send twice.
  await db.query("UPDATE wa_messages SET status='sending' WHERE id=$1",[id]);
  await db.query('UPDATE wa_reminders SET consumed=TRUE,message_id=$2 WHERE phone=$1',[job.phone,id]);
  await db.query('COMMIT');transaction=false;
  try{
   const sent=await service.graph(process.env.WA_PHONE_NUMBER_ID+'/messages',{method:'POST',body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:job.phone,type:'text',text:{body}})});
   await db.query("UPDATE wa_messages SET status=CASE WHEN status IN ('delivered','read') THEN status ELSE 'sent' END,meta_id=$2 WHERE id=$1",[id,sent.messages?.[0]?.id||null]);
  }catch(e){await db.query("UPDATE wa_messages SET status='failed',error=$2 WHERE id=$1",[id,e.metaDescription||'Reminder delivery uncertain. Check WhatsApp before retrying.']);console.error('WhatsApp reminder delivery failed',e.code||e.name);}
 }catch(e){if(transaction)await db.query('ROLLBACK');throw e;}
 finally{if(locked)await db.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[lock]).catch(()=>{});db.release();}
}
module.exports={seal,verified,schema,track,schedule,deliver,active,TOPIC,MESSAGE};
