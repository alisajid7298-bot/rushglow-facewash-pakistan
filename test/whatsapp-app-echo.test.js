'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const service=require('../lib/whatsapp-service'),appEcho=require('../lib/whatsapp-app-echo');
test('Signed Coexistence echoes appear under the recipient, preserve checkout/window and never send bot replies',async()=>{
 const pg=new PGlite(),db={query:async(sql,params)=>!params&&sql.includes(';')?(await pg.exec(sql)).at(-1):pg.query(sql,params),release(){},end:async()=>{}},pool={...db,connect:async()=>db};
 const keys=['DATABASE_URL','WA_ACCESS_TOKEN','WA_PHONE_NUMBER_ID','WA_APP_SECRET'],old=Object.fromEntries(keys.map(k=>[k,process.env[k]])),savedFetch=global.fetch;let sends=0;
 process.env.DATABASE_URL='test';process.env.WA_ACCESS_TOKEN='test';process.env.WA_PHONE_NUMBER_ID='123456';process.env.WA_APP_SECRET='echo-test-only';global.fetch=async()=>{sends++;throw Error('Echo must not send anything');};
 const phone='966552927768',owner='923141913520';
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../api/whatsapp'),'utf8'),{module,exports:module.exports,process,console,Buffer,URL,AbortSignal,fetch:global.fetch,require:id=>id==='@neondatabase/serverless'?{Pool:function(){return pool;}}:id==='../lib/whatsapp-service'?service:id==='../lib/whatsapp-app-echo'?appEcho:id==='../lib/whatsapp-bot'?require('../lib/whatsapp-bot'):require(id)});
 const webhook=async(value,signature=true,field='smb_message_echoes')=>{const raw=Buffer.from(JSON.stringify({object:'whatsapp_business_account',entry:[{changes:[{field,value}]}]}));const req={method:'POST',query:{},headers:{'x-hub-signature-256':signature?'sha256='+crypto.createHmac('sha256',process.env.WA_APP_SECRET).update(raw).digest('hex'):'invalid'},async *[Symbol.asyncIterator](){yield raw;}};const res={code:200,setHeader(){},status(c){this.code=c;return this;},json(data){this.data=data;return this;},end(){}};await module.exports(req,res);return res;};
 try{
 await pg.exec('CREATE TABLE orders(id bigint);CREATE TABLE products(id bigint,name text,price text,stock int,photo text,bundle_ids text)');await service.schema(db);await db.query('UPDATE wa_settings SET enabled=TRUE');
 const last=new Date(Date.now()-60000),state={stage:'payment',productId:'24'};await db.query('INSERT INTO wa_chats(phone,name,state,last_inbound) VALUES($1,$2,$3,$4)',[phone,'Customer name',JSON.stringify(state),last]);
 const echo={id:'echo-1',from:owner,to:phone,timestamp:String(Math.floor(Date.now()/1000)),type:'text',text:{body:'Your order will arrive soon.'}};
 const value={metadata:{phone_number_id:'123456',display_phone_number:owner},message_echoes:[echo]};
 assert.equal((await webhook(value,false)).code,401);assert.equal((await db.query('SELECT * FROM wa_messages')).rows.length,0);
 assert.equal((await webhook({...value,metadata:{...value.metadata,phone_number_id:'different'}})).code,200);assert.equal((await db.query('SELECT * FROM wa_messages')).rows.length,0);
 assert.equal((await webhook(value)).code,200);await webhook(value);
 const rows=(await db.query('SELECT * FROM wa_messages')).rows;assert.equal(rows.length,1);assert.equal(rows[0].phone,phone);assert.equal(rows[0].direction,'app_owner');assert.equal(rows[0].body,echo.text.body);assert.equal(rows[0].payload.source,'whatsapp_business_app');
 let chat=(await db.query('SELECT * FROM wa_chats WHERE phone=$1',[phone])).rows[0];assert.equal(chat.name,'Customer name');assert.equal(chat.paused,true);assert.deepEqual(chat.state,state);assert.equal(new Date(chat.last_inbound).getTime(),last.getTime());assert.equal(sends,0);
 // Duplicated old echoes do not pause again after an admin resumes the bot.
 await db.query('UPDATE wa_chats SET paused=FALSE WHERE phone=$1',[phone]);await webhook(value);assert.equal((await db.query('SELECT paused FROM wa_chats WHERE phone=$1',[phone])).rows[0].paused,false);
 await webhook({...value,message_echoes:[{...echo,id:'echo-image',type:'image',image:{id:'12345',caption:'Receipt photo'}}]});assert.equal((await db.query("SELECT media_id FROM wa_messages WHERE meta_id='echo-image'")).rows[0].media_id,'12345');
 await webhook({...value,message_echoes:[{...echo,id:'echo-new-chat',to:'923001234567'}]});chat=(await db.query("SELECT * FROM wa_chats WHERE phone='923001234567'")).rows[0];assert.equal(chat.last_inbound,null);assert.equal(chat.paused,true);
 for(const bad of [{...echo,id:'bad-sender',from:'923000000000'},{...echo,id:'bad-self',to:owner},{...echo,id:'bad-group',to:'123@g.us'},{...echo,id:'bad-target',to:undefined,to_user_id:'not-a-phone'}])await webhook({...value,message_echoes:[bad]});assert.equal((await db.query("SELECT count(*)::int AS n FROM wa_messages WHERE meta_id LIKE 'bad-%'")).rows[0].n,0);assert.equal(sends,0);
 }finally{global.fetch=savedFetch;for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}await pg.close();}
});
