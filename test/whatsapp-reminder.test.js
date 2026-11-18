const {test}=require('node:test'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const reminder=require('../lib/whatsapp-reminder');
test('Reminder scheduling and delivery obey inactivity, handoff, setting, session and idempotency rules',async()=>{
 const db=new PGlite();
 await db.exec(`CREATE TABLE wa_settings(id INT PRIMARY KEY,enabled BOOLEAN);INSERT INTO wa_settings VALUES(1,TRUE);CREATE TABLE wa_chats(phone TEXT PRIMARY KEY,state JSONB,paused BOOLEAN DEFAULT FALSE,representative_requested_at TIMESTAMPTZ,last_inbound TIMESTAMPTZ DEFAULT NOW());CREATE TABLE wa_messages(id BIGSERIAL PRIMARY KEY,phone TEXT,direction TEXT,body TEXT,status TEXT,meta_id TEXT,error TEXT,created_at TIMESTAMPTZ DEFAULT NOW());`);
 await reminder.schema({query:sql=>db.exec(sql)});let sent=0;
 const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
 const service={enqueue:async(c,phone,payload,direction)=>(await c.query("INSERT INTO wa_messages(phone,direction,body,status) VALUES($1,$2,$3,'queued') RETURNING id",[phone,direction,payload.text.body])).rows[0].id,graph:async()=>{sent++;return {messages:[{id:'sent-'+sent}]}}};
 const state={stage:'confirm',productId:'23'};const phone='923000000000';
 async function reset(){await db.query('DELETE FROM wa_reminders');await db.query('DELETE FROM wa_chats');await db.query('DELETE FROM wa_messages');await db.query('UPDATE wa_settings SET enabled=TRUE,reminder_enabled=TRUE');await db.query('INSERT INTO wa_chats(phone,state) VALUES($1,$2)',[phone,JSON.stringify(state)]);await reminder.track(db,phone,{},state);}
 async function job(){const r=(await db.query('SELECT * FROM wa_reminders')).rows[0];return {phone,session:r.session_id,generation:r.generation}}
 async function due(){await db.query("UPDATE wa_reminders SET activity_at=NOW()-INTERVAL '31 minutes'")}
 try{
 await reset();let published;await reminder.schedule(pool,phone,async(...args)=>{published=args});assert.equal(published[2].delaySeconds,1800);assert.equal(published[0],reminder.TOPIC);
 await assert.rejects(reminder.deliver(pool,await job(),service),/not due/);assert.equal(sent,0);
 await due();const original=await job();await reminder.deliver(pool,original,service);await reminder.deliver(pool,original,service);assert.equal(sent,1);assert.equal((await db.query('SELECT body FROM wa_messages')).rows[0].body,reminder.MESSAGE);
 for(const update of ["UPDATE wa_chats SET paused=TRUE","UPDATE wa_chats SET representative_requested_at=NOW()","UPDATE wa_chats SET state='{\"stage\":\"complete\"}'","UPDATE wa_settings SET reminder_enabled=FALSE","UPDATE wa_settings SET enabled=FALSE","UPDATE wa_chats SET last_inbound=NOW()-INTERVAL '24 hours'"]){await reset();await due();await db.query(update);await reminder.deliver(pool,await job(),service);assert.equal(sent,1,update)}
 await reset();const stale=await job();await reminder.track(db,phone,state,state);await due();await reminder.deliver(pool,stale,service);assert.equal(sent,1,'new activity cancels stale callback');await reminder.deliver(pool,await job(),service);assert.equal(sent,2);
 await reset();await due();await db.query("INSERT INTO wa_messages(phone,direction,body,status) VALUES($1,'app_owner','help','sent')",[phone]);await reminder.deliver(pool,await job(),service);assert.equal(sent,2,'owner reply cancels reminder');
 await reset();await reminder.track(db,phone,state,{});assert.equal((await db.query('SELECT * FROM wa_reminders')).rows.length,0,'cancel removes reminder');
 await reset();const old=await job();await reminder.track(db,phone,state,{stage:'confirm',productId:'24'});assert.notEqual((await job()).session,old.session);
 await reset();await assert.rejects(reminder.schedule(pool,phone,async()=>{throw new Error('queue unavailable')}));assert.ok((await db.query('SELECT last_schedule_error FROM wa_reminders')).rows[0].last_schedule_error);
 await reset();await due();let failed=0;const failing={...service,graph:async()=>{failed++;throw new Error('timeout')}};const j=await job();await reminder.deliver(pool,j,failing);await reminder.deliver(pool,j,failing);assert.equal(failed,1,'uncertain send never repeats');
 }finally{await db.close()}
});
