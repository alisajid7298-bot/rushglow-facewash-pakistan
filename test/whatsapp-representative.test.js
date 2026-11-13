'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
const service=require('../lib/whatsapp-service'),bot=require('../lib/whatsapp-bot');
test('Representative requests persist, require admin access and clear after successful reply or resume',async()=>{
 const pg=new PGlite();const db={query:async(sql,params)=>{if(!params&&sql.includes(';'))return(await pg.exec(sql)).at(-1);return pg.query(sql,params);},release(){},end:async()=>{}};
 const pool={...db,connect:async()=>db};const savedFetch=global.fetch;let sent=0,fail=false;
 const keys=['DATABASE_URL','ADMIN_AUTH_SECRET','WA_ACCESS_TOKEN','WA_PHONE_NUMBER_ID'],old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 process.env.DATABASE_URL='test';process.env.ADMIN_AUTH_SECRET='representative-test-only';process.env.WA_ACCESS_TOKEN='test';process.env.WA_PHONE_NUMBER_ID='test';
 global.fetch=async()=>({ok:!fail,json:async()=>fail?{error:{code:10}}:{messages:[{id:'reply-'+(++sent)}]}});
 const exp=String(Date.now()+60000),sig=crypto.createHmac('sha256',process.env.ADMIN_AUTH_SECRET).update(exp).digest('hex'),cookie='rg_admin='+exp+'.'+sig;
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../api/whatsapp'),'utf8'),{module,exports:module.exports,process,console,Buffer,fetch:global.fetch,URL,AbortSignal,require:id=>id==='@neondatabase/serverless'?{Pool:function(){return pool;}}:id==='../lib/whatsapp-service'?service:id==='../lib/whatsapp-bot'?bot:require(id)});
 const call=async(action,body,auth=true)=>{const req={method:body?'POST':'GET',query:{action},headers:{origin:'https://rushglow.org',...(auth?{cookie}:{})},async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify(body));}};const res={code:200,setHeader(){},status(c){this.code=c;return this;},json(data){this.data=data;return this;},end(){return this;}};await module.exports(req,res);return res;};
 try{
 await pg.exec('CREATE TABLE orders(id bigint);CREATE TABLE products(id bigint,name text,price text,stock int,photo text,bundle_ids text)');await service.schema(db);await db.query('UPDATE wa_settings SET enabled=TRUE');
 const event={id:'handoff-1',from:'923001234567',timestamp:String(Math.floor(Date.now()/1000)),type:'interactive',interactive:{list_reply:{id:'representative',title:'Talk to Representative'}}};
 await service.processMessage(pool,event,'Test Customer');
 let chat=(await db.query('SELECT * FROM wa_chats')).rows[0];assert.equal(chat.paused,true);assert.ok(chat.representative_requested_at);const requested=new Date(chat.representative_requested_at).getTime();
 await service.processMessage(pool,event,'Test Customer');assert.equal(new Date((await db.query('SELECT * FROM wa_chats')).rows[0].representative_requested_at).getTime(),requested);
 assert.equal((await call('representative_requests',null,false)).code,401);
 const pending=await call('representative_requests');assert.equal(pending.code,200);assert.equal(pending.data.length,1);assert.equal(pending.data[0].name,'Test Customer');
 assert.ok((await call('chats')).data[0].representative_requested_at);
 const requestedAt=new Date(chat.representative_requested_at).toISOString();
 assert.equal((await call('representative_seen',{phone:event.from,requested_at:requestedAt},false)).code,401);
 assert.equal((await call('representative_seen',{phone:event.from,requested_at:'bad'})).code,400);
 assert.equal((await call('representative_seen',{phone:event.from,requested_at:'2000-01-01T00:00:00Z'})).data.cleared,false);
 assert.equal((await call('representative_requests')).data.length,1);
 assert.equal((await call('representative_seen',{phone:event.from,requested_at:requestedAt})).data.cleared,true);
 chat=(await db.query('SELECT * FROM wa_chats')).rows[0];assert.equal(chat.paused,true);assert.equal(chat.state.stage,'human');assert.equal(chat.representative_requested_at,null);
 await db.query('UPDATE wa_chats SET representative_requested_at=NOW()');
 fail=true;await call('reply',{phone:event.from,text:'Testing failure'});assert.equal((await call('representative_requests')).data.length,1);
 fail=false;await call('reply',{phone:event.from,text:'A Representative is here to help.'});assert.equal((await call('representative_requests')).data.length,0);assert.equal((await db.query('SELECT paused FROM wa_chats')).rows[0].paused,true);
 await db.query('UPDATE wa_chats SET representative_requested_at=NOW()');await call('pause',{phone:event.from,paused:false});
 chat=(await db.query('SELECT * FROM wa_chats')).rows[0];assert.equal(chat.representative_requested_at,null);assert.equal(chat.paused,false);
 }finally{global.fetch=savedFetch;for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}await pg.close();}
});
