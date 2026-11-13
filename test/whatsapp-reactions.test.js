'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const service=require('../lib/whatsapp-service');
test('Reactions preserve emoji, checkout and service window, and send welcome while the window is open',async()=>{
 const pg=new PGlite();
 const db={query:async(sql,params)=>{if(!params&&sql.includes(';'))return (await pg.exec(sql)).at(-1);return pg.query(sql,params);},release(){}};
 const pool={...db,connect:async()=>db};const originalFetch=global.fetch;let sent=0;
 global.fetch=async()=>({ok:true,json:async()=>({messages:[{id:'welcome-'+(++sent)}]})});
 try{
 await pg.exec('CREATE TABLE orders(id bigint);CREATE TABLE products(id bigint,name text,price text,stock int,photo text,bundle_ids text)');await service.schema(db);
 await db.query("INSERT INTO wa_chats(phone,name,state,last_inbound) VALUES($1,'Ali',$2,to_timestamp(1000))",['923001234567',JSON.stringify({stage:'payment'})]);
 await db.query("INSERT INTO wa_messages(meta_id,phone,direction,body,status) VALUES('original','923001234567','bot','Complete original message','read'),('private-other','923009999999','bot','Other customer private message','read')");
 const react=(id,emoji,target='original')=>({id,from:'923001234567',timestamp:'2000',type:'reaction',reaction:{emoji,message_id:target}});
 await service.processMessage(pool,react('reaction-1','👍'),'Ali');
 await service.processMessage(pool,react('reaction-1','👍'),'Ali');
 await service.processMessage(pool,react('reaction-2',''),'Ali');
 await service.processMessage(pool,react('reaction-3','❤️','private-other'),'Ali');
 const chat=(await db.query("SELECT * FROM wa_chats WHERE phone='923001234567'")).rows[0];
 assert.equal(new Date(chat.last_inbound).getTime(),1000000);assert.deepEqual(chat.state,{stage:'payment'});
 assert.equal((await db.query("SELECT COUNT(*)::int n FROM wa_messages WHERE direction='bot'")).rows[0].n,2);
 const saved=(await db.query("SELECT body,payload FROM wa_messages WHERE meta_id='reaction-1'")).rows[0];
 assert.equal(saved.body,'Reaction: 👍');assert.deepEqual(saved.payload,{type:'reaction',reaction:{emoji:'👍',message_id:'original'}});
 const api=fs.readFileSync(require.resolve('../api/whatsapp'),'utf8');
 const sql=api.match(/pool.query\(`(SELECT m.id,m.direction,CASE[\s\S]*?LIMIT 150)`/)[1];
 const rows=(await db.query(sql,['923001234567'])).rows;
 assert.equal(rows.find(r=>r.body==='Reaction: 👍').reaction_to_body,'Complete original message');
 assert.equal(rows.find(r=>r.body==='Reaction: ❤️').reaction_to_body,null);
 assert.ok(rows.some(r=>r.body==='Reaction removed'));
 assert.equal(rows.filter(r=>r.message_type==='reaction').length,3);
 // A new reaction during an open service window gets welcome, not the payment step.
 await db.query('UPDATE wa_settings SET enabled=TRUE');
 const lastInbound=new Date(Date.now()-60000);
 await db.query("UPDATE wa_chats SET last_inbound=$1 WHERE phone='923001234567'",[lastInbound]);
 await service.processMessage(pool,react('reaction-4','👍'),'Ali');
 await service.processMessage(pool,react('reaction-4','👍'),'Ali');
 assert.equal(sent,1);
 const welcome=(await db.query("SELECT body FROM wa_messages WHERE meta_id='welcome-1'")).rows[0];
 assert.equal(welcome.body,'Welcome to RUSHGLOW Beauty & Skincare!\nPlease Select a Product with Free Delivery.');
 const after=(await db.query("SELECT * FROM wa_chats WHERE phone='923001234567'")).rows[0];
 assert.deepEqual(after.state,{stage:'payment'});assert.equal(new Date(after.last_inbound).getTime(),lastInbound.getTime());
 await db.query("UPDATE wa_chats SET paused=TRUE WHERE phone='923001234567'");
 await service.processMessage(pool,react('reaction-5','👍'),'Ali');assert.equal(sent,1);
 }finally{global.fetch=originalFetch;await pg.close();}
});
