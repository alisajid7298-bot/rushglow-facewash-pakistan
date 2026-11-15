'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const service=require('../lib/whatsapp-service'),complete=require('../lib/whatsapp-complete'),echo=require('../lib/whatsapp-app-echo'),updates=require('../lib/whatsapp-order-updates');
test('Completion from panel or verified owner WhatsApp syncs status and sends no duplicate messages',async()=>{
 const pg=new PGlite(),db={query:async(sql,params)=>!params&&sql.includes(';')?(await pg.exec(sql)).at(-1):pg.query(sql,params),release(){},end:async()=>{}},pool={...db,connect:async()=>db};
 const keys=['DATABASE_URL','ADMIN_AUTH_SECRET','WA_ACCESS_TOKEN','WA_PHONE_NUMBER_ID'],old=Object.fromEntries(keys.map(k=>[k,process.env[k]])),previous=global.fetch;let sends=[],fail=false;
 Object.assign(process.env,{DATABASE_URL:'test',ADMIN_AUTH_SECRET:'completion-test',WA_ACCESS_TOKEN:'test',WA_PHONE_NUMBER_ID:'test'});
 global.fetch=async(url,opt)=>{sends.push(JSON.parse(opt.body));return {ok:!fail,json:async()=>fail?{error:{code:131026}}:{messages:[{id:'completion-'+sends.length}]}};};
 try{
 await pg.exec('CREATE TABLE orders(id bigint PRIMARY KEY,product_name text,price text,phone text,status text);CREATE TABLE products(id bigint,name text,price text,stock int,photo text,bundle_ids text)');await service.schema(db);
 const phone='966552927768',owner='923141913520';await db.query('INSERT INTO wa_chats(phone,state,paused,last_inbound) VALUES($1,$2,TRUE,NOW())',[phone,JSON.stringify({stage:'human'})]);
 for(let id=1;id<=8;id++){await db.query("INSERT INTO wa_messages(meta_id,phone,direction,body) VALUES($1,$2,'inbound','COD')",['order-'+id,phone]);await db.query("INSERT INTO orders(id,product_name,price,phone,status,wa_message_id) VALUES($1,'FaceWash','1200','03420000000','Pending',$2)",[id,'order-'+id]);}
 const first=await complete.markComplete(pool,'1');assert.equal(first.order_status,'Delivery Complete');assert.equal(first.notification_status,'sent');assert.equal(sends[0].to,phone);assert.equal(sends[0].text.body,'*'+complete.completeText('1')+'*');await complete.markComplete(pool,'1');assert.equal(sends.length,1);
 await db.query("UPDATE wa_messages SET status='read' WHERE meta_id='completion-1'");assert.equal((await updates.ordersForChat(pool,phone)).find(o=>String(o.id)==='1').completed_notification_status,'read');
 let chat=(await db.query('SELECT * FROM wa_chats WHERE phone=$1',[phone])).rows[0];assert.equal(chat.paused,true);assert.equal(chat.state.stage,'human');
 await db.query("UPDATE wa_chats SET last_inbound=NOW()-INTERVAL '25 hours' WHERE phone=$1",[phone]);assert.equal((await complete.markComplete(pool,'2')).notification_status,'window_closed');assert.equal(sends.length,1);assert.equal((await db.query('SELECT status FROM orders WHERE id=2')).rows[0].status,'Delivery Complete');
 const event={id:'owner-complete',from:owner,to:phone,type:'text',text:{body:'Order #3 completed'},timestamp:String(Math.floor(Date.now()/1000))};
 await echo.record(pool,event,owner);await echo.record(pool,event,owner);assert.equal((await db.query('SELECT status FROM orders WHERE id=3')).rows[0].status,'Delivery Complete');assert.equal(sends.length,1);assert.equal((await complete.markComplete(pool,'3')).notification_status,'sent');assert.equal(sends.length,1);
 await echo.record(pool,{...event,id:'wrong-sender',from:'923000000000',text:{body:'Order #4 completed'}},owner);assert.equal((await db.query('SELECT status FROM orders WHERE id=4')).rows[0].status,'Pending');
 await echo.record(pool,{...event,id:'wrong-chat',to:'923001111111',text:{body:'Order #4 completed'}},owner);assert.equal((await db.query('SELECT status FROM orders WHERE id=4')).rows[0].status,'Pending');
 await db.query('UPDATE wa_chats SET last_inbound=NOW() WHERE phone=$1',[phone]);fail=true;assert.equal((await complete.markComplete(pool,'5')).notification_status,'failed');await complete.markComplete(pool,'5');assert.equal(sends.length,2);fail=false;
 await db.query('UPDATE orders SET wa_message_id=NULL WHERE id=6');assert.equal((await complete.markComplete(pool,'6')).notification_status,'not_linked');assert.equal(sends.length,2);
 const mod={exports:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../api/whatsapp'),'utf8'),{module:mod,process,console,Buffer,fetch:global.fetch,URL,AbortSignal,require:id=>id==='@neondatabase/serverless'?{Pool:function(){return pool;}}:id==='../lib/whatsapp-service'?service:id==='../lib/whatsapp-complete'?complete:require(id)});
 const exp=String(Date.now()+60000),cookie='rg_admin='+exp+'.'+crypto.createHmac('sha256',process.env.ADMIN_AUTH_SECRET).update(exp).digest('hex');
 async function call(auth,origin){const req={method:'POST',query:{action:'complete_order'},headers:{origin,...(auth?{cookie}:{})},async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify({id:'7'}));}};const res={code:200,setHeader(){},status(c){this.code=c;return this;},json(data){this.data=data;return this;},end(){return this;}};await mod.exports(req,res);return res;}
 assert.equal((await call(false,'https://rushglow.org')).code,401);assert.equal((await call(true,'https://evil.example')).code,403);assert.equal((await db.query('SELECT status FROM orders WHERE id=7')).rows[0].status,'Pending');assert.equal((await call(true,'https://rushglow.org')).data.order_status,'Delivery Complete');assert.equal(sends.length,3);
 assert.equal(complete.completionOrder('آپ کا آرڈر #۱۸ مکمل ہو گیا ہے۔'),'18');assert.equal(complete.completionOrder('Is Order #18 completed?'),null);
 await assert.rejects(complete.markComplete(pool,'999'),e=>e.status===404);
 }finally{global.fetch=previous;for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}await pg.close();}
});
