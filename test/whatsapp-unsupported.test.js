'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const service=require('../lib/whatsapp-service');
test('Unsupported Meta events preserve checkout and reply window without sending welcome',async()=>{
 const pg=new PGlite(),db={query:async(sql,params)=>!params&&sql.includes(';')?(await pg.exec(sql)).at(-1):pg.query(sql,params),release(){}},pool={...db,connect:async()=>db};
 const originalFetch=global.fetch;let sends=0;global.fetch=async()=>{sends++;throw Error('Unexpected send');};
 try{
 await pg.exec('CREATE TABLE orders(id bigint);CREATE TABLE products(id bigint,name text,price text,stock int,photo text,bundle_ids text)');await service.schema(db);await db.query('UPDATE wa_settings SET enabled=TRUE');
 const phone='923001234567',last=new Date(Date.now()-60000),state={stage:'payment',productId:'24'};
 await db.query('INSERT INTO wa_chats(phone,name,state,last_inbound) VALUES($1,$2,$3,$4)',[phone,'Ali',JSON.stringify(state),last]);
 const event={id:'unsupported-1',from:phone,type:'unsupported',timestamp:String(Math.floor(Date.now()/1000)),errors:[{code:131051,error_data:{details:'Unsupported message type'}}]};
 await service.processMessage(pool,event,'Ali');await service.processMessage(pool,event,'Ali');
 const chat=(await db.query('SELECT * FROM wa_chats WHERE phone=$1',[phone])).rows[0];assert.deepEqual(chat.state,state);assert.equal(new Date(chat.last_inbound).getTime(),last.getTime());assert.equal(chat.paused,false);assert.equal(sends,0);
 const rows=(await db.query('SELECT * FROM wa_messages')).rows;assert.equal(rows.length,1);assert.match(rows[0].body,/content unavailable/);assert.equal(rows[0].payload.errors[0].code,131051);
 await service.processMessage(pool,{...event,id:'unsupported-new',from:'923009999999'},'New');assert.equal((await db.query('SELECT last_inbound FROM wa_chats WHERE phone=$1',['923009999999'])).rows[0].last_inbound,null);assert.equal(sends,0);
 assert.match(service.metaError({code:131026,error_data:{details:'Message undeliverable'}}),/Message could not be delivered/);
 assert.match(service.metaError({code:131051,error_data:{details:'Unsupported format'}}),/Unsupported format/);
 }finally{global.fetch=originalFetch;await pg.close();}
});
