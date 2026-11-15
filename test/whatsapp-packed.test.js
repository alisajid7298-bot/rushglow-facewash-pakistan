'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const service=require('../lib/whatsapp-service'),updates=require('../lib/whatsapp-order-updates');
test('Packed notifications work for existing orders, use original WhatsApp customer, and send only once',async()=>{
 const pg=new PGlite(),db={query:async(sql,params)=>!params&&sql.includes(';')?(await pg.exec(sql)).at(-1):pg.query(sql,params),release(){}},pool={...db,connect:async()=>db};
 const previousFetch=global.fetch,previousToken=process.env.WA_ACCESS_TOKEN,previousPhone=process.env.WA_PHONE_NUMBER_ID;let sends=[],fail=false;
 process.env.WA_ACCESS_TOKEN='test';process.env.WA_PHONE_NUMBER_ID='test';
 global.fetch=async(url,options)=>{sends.push(JSON.parse(options.body));return {ok:!fail,json:async()=>fail?{error:{code:131026,error_data:{details:'Undeliverable'}}}:{messages:[{id:'packed-'+sends.length}]}};};
 try{
 await pg.exec('CREATE TABLE orders(id bigint PRIMARY KEY,product_name text,price text,phone text,status text);CREATE TABLE products(id bigint,name text,price text,stock int,photo text,bundle_ids text)');await service.schema(db);
 const phone='966552927768';await db.query('INSERT INTO wa_chats(phone,state,paused,last_inbound) VALUES($1,$2,TRUE,NOW())',[phone,JSON.stringify({stage:'human'})]);
 for(let id=1;id<=6;id++){
  await db.query("INSERT INTO wa_messages(meta_id,phone,direction,body) VALUES($1,$2,'inbound','Yes')",['order-'+id,phone]);
  await db.query("INSERT INTO orders(id,product_name,price,phone,status,wa_message_id) VALUES($1,'FaceWash','1200','03420000000','Pending',$2)",[id,'order-'+id]);
 }
 const first=await updates.markPacked(pool,'1');assert.equal(first.order_status,'Packed');assert.equal(first.notification_status,'sent');assert.equal(sends.length,1);assert.equal(sends[0].to,phone);assert.equal(sends[0].text.body,updates.packedText('1'));
 await updates.markPacked(pool,'1');assert.equal(sends.length,1);
 await db.query("UPDATE wa_messages SET status='delivered' WHERE meta_id='packed-1'");const listed=await updates.ordersForChat(pool,phone);assert.equal(listed.find(x=>String(x.id)==='1').packed_notification_status,'delivered');assert.equal((await updates.ordersForChat(pool,'923001111111')).length,0);
 const chat=(await db.query('SELECT * FROM wa_chats WHERE phone=$1',[phone])).rows[0];assert.equal(chat.paused,true);assert.deepEqual(chat.state,{stage:'human'});
 await db.query("UPDATE wa_chats SET last_inbound=NOW()-INTERVAL '25 hours' WHERE phone=$1",[phone]);const closed=await updates.markPacked(pool,'2');assert.equal(closed.notification_status,'window_closed');assert.equal(sends.length,1);assert.equal((await db.query('SELECT status,wa_packed_message_id FROM orders WHERE id=2')).rows[0].status,'Packed');assert.equal((await db.query('SELECT wa_packed_message_id FROM orders WHERE id=2')).rows[0].wa_packed_message_id,null);
 await db.query('UPDATE wa_chats SET last_inbound=NOW() WHERE phone=$1',[phone]);await updates.markPacked(pool,'2');assert.equal(sends.length,2);
 fail=true;const failed=await updates.markPacked(pool,'3');assert.equal(failed.notification_status,'failed');await updates.markPacked(pool,'3');assert.equal(sends.length,3);fail=false;
 await db.query("UPDATE orders SET status='Shipped' WHERE id=4");await assert.rejects(updates.markPacked(pool,'4'),e=>e.status===409);assert.equal((await db.query('SELECT status FROM orders WHERE id=4')).rows[0].status,'Shipped');
 await db.query('UPDATE orders SET wa_message_id=NULL WHERE id=5');await assert.rejects(updates.markPacked(pool,'5'),e=>e.status===409);await assert.rejects(updates.markPacked(pool,'999'),e=>e.status===404);await assert.rejects(updates.markPacked(pool,'bad'),e=>e.status===400);
 delete process.env.WA_ACCESS_TOKEN;const offline=await updates.markPacked(pool,'6');assert.equal(offline.notification_status,'not_connected');assert.equal(sends.length,3);
 }finally{global.fetch=previousFetch;if(previousToken===undefined)delete process.env.WA_ACCESS_TOKEN;else process.env.WA_ACCESS_TOKEN=previousToken;if(previousPhone===undefined)delete process.env.WA_PHONE_NUMBER_ID;else process.env.WA_PHONE_NUMBER_ID=previousPhone;await pg.close();}
});
