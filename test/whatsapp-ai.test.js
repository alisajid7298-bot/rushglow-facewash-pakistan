'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const service=require('../lib/whatsapp-service');
test('AI fallback and voice keep the real checkout, both email notifications and owner pause intact',async()=>{
 const pg=new PGlite(),db={query:async(sql,params)=>!params&&sql.includes(';')?(await pg.exec(sql)).at(-1):pg.query(sql,params),release(){}},pool={...db,connect:async()=>db};
 const keys=['GROQ_API_KEY','WA_ACCESS_TOKEN','WA_PHONE_NUMBER_ID','RESEND_API_KEY'],old=Object.fromEntries(keys.map(k=>[k,process.env[k]])),previous=global.fetch;
 Object.assign(process.env,{GROQ_API_KEY:'unit-test',WA_ACCESS_TOKEN:'unit-test',WA_PHONE_NUMBER_ID:'unit-test',RESEND_API_KEY:'unit-test'});
 let sent=[],emails=[],aiCalls=0,voiceCalls=0,transcript='za order kol ghawaram',fail=false;
 global.fetch=async(url,opt)=>{
  if(String(url).includes('api.groq.com')){
   if(String(url).includes('transcriptions')){voiceCalls++;assert.equal(opt.body.get('model'),'whisper-large-v3');return Response.json({text:transcript});}
   aiCalls++;const payload=JSON.parse(opt.body);assert.ok(!payload.messages[1].content.includes('03001234567'));
   if(fail)return new Response('',{status:429});return Response.json({choices:[{message:{content:JSON.stringify({intent:'reply',language:'en',reply:'Please follow the product label instructions.'})}}]});
  }
  if(String(url).includes('graph.facebook.com')&&String(url).endsWith('/12345'))return Response.json({url:'https://lookaside.fbsbx.com/audio'});
  if(String(url).includes('lookaside.fbsbx.com'))return new Response('voice-test',{headers:{'Content-Type':'audio/ogg'}});
  if(String(url).includes('api.resend.com')){emails.push(JSON.parse(opt.body));return Response.json({id:'email'});}
  sent.push(JSON.parse(opt.body));return Response.json({messages:[{id:'sent-'+sent.length}]});
 };
 try{
  await pg.exec(`CREATE TABLE products(id BIGSERIAL PRIMARY KEY,name TEXT,price TEXT,stock INTEGER,photo TEXT,bundle_ids TEXT); CREATE TABLE orders(id BIGSERIAL PRIMARY KEY,product_id BIGINT,product_name TEXT,price TEXT,customer_name TEXT,phone TEXT,address TEXT,city TEXT,notes TEXT,payment_method TEXT,transaction_id TEXT,delivery TEXT,items TEXT,traffic_source TEXT,status TEXT); INSERT INTO products(name,price,stock,photo,bundle_ids) VALUES('Face wash','1200',5,'','[]');`);
  await service.schema(db);await db.query('UPDATE wa_settings SET enabled=TRUE,reminder_enabled=FALSE');
  const phone='923001234567',msg=(id,body)=>({id,from:phone,timestamp:String(Math.floor(Date.now()/1000)),type:'text',text:{body}});
  const voice={...msg('voice',''),type:'audio',text:undefined,audio:{id:'12345'}};
  await service.processMessage(pool,msg('faq','Can I keep it in my bathroom?'),'Test');assert.equal(aiCalls,1);assert.match(sent.at(-1).text.body,/label instructions/);
  await service.processMessage(pool,voice,'Test');assert.equal(voiceCalls,1);assert.match(sent.at(-1).text.body,/Tek da/);
  await service.processMessage(pool,msg('details','Facewash\n03001234567\nAddress: Main bazaar Swabi, City: Swabi'),'Test');
  const order=(await db.query('SELECT * FROM orders')).rows[0];assert.equal(order.product_name,'Face wash');assert.equal(order.price,'1200');assert.equal(order.payment_method,'Cash on Delivery');assert.equal(emails.length,2);assert.equal(new Set(emails.map(e=>e.to[0])).size,2);
  await service.processMessage(pool,msg('details','Facewash\n03001234567\nAddress: Main bazaar Swabi, City: Swabi'),'Test');assert.equal(emails.length,2);
  await db.query("UPDATE wa_chats SET state='{}',paused=TRUE WHERE phone=$1",[phone]);await service.processMessage(pool,{...voice,id:'paused-audio'},'Test');assert.equal(voiceCalls,1);
  await db.query("UPDATE wa_chats SET paused=FALSE WHERE phone=$1",[phone]);fail=true;await service.processMessage(pool,msg('fail','Can I keep it in my bathroom?'),'Test');assert.equal(aiCalls,2);assert.equal((await db.query('SELECT paused FROM wa_chats WHERE phone=$1',[phone])).rows[0].paused,true);
 }finally{global.fetch=previous;for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}await pg.close();}
});
