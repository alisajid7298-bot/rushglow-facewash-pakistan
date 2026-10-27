'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const service=require('../lib/whatsapp-service');
test('Webhook retries create one order and reserve stock once; sold out checkout rolls back',async()=>{
 const pg=new PGlite();
 const db={query:async(sql,params)=>{if(!params&&sql.includes(';')){const rows=await pg.exec(sql);return rows.at(-1);}return pg.query(sql,params);},release(){}};
 const pool={...db,connect:async()=>db};
 const originalFetch=global.fetch;let sends=0;
 global.fetch=async()=>({ok:true,json:async()=>({messages:[{id:'out-'+(++sends)}]})});
 process.env.WA_ACCESS_TOKEN='test-only';process.env.WA_PHONE_NUMBER_ID='test-only';
 try{
 await pg.exec(`CREATE TABLE products(id BIGSERIAL PRIMARY KEY,name TEXT,price TEXT,stock INTEGER,photo TEXT,bundle_ids TEXT);
 CREATE TABLE orders(id BIGSERIAL PRIMARY KEY,product_id BIGINT,product_name TEXT,price TEXT,customer_name TEXT,phone TEXT,address TEXT,city TEXT,notes TEXT,payment_method TEXT,transaction_id TEXT,delivery TEXT,items TEXT,traffic_source TEXT,status TEXT);
 INSERT INTO products(name,price,stock,photo,bundle_ids) VALUES('Face wash','1250',1,'','[]');`);
 await service.schema(db);await db.query('UPDATE wa_settings SET enabled=TRUE');
 const message=(id,text,action)=>({id,from:'923001234567',timestamp:String(Math.floor(Date.now()/1000)),type:action?'interactive':'text',...(action?{interactive:{button_reply:{id:action}}}:{text:{body:text}})});
 for(const m of [message('a','','product:1'),message('b','yes'),message('c','03001234567 Address: Main bazar, Thand Koi, Swabi'),message('d','','cod')])await service.processMessage(pool,m,'Customer');
 await service.processMessage(pool,message('d','','cod'),'Customer');
 const orders=(await db.query('SELECT * FROM orders')).rows;assert.equal(orders.length,1);assert.equal(orders[0].price,'1250');assert.equal(orders[0].traffic_source,'WhatsApp');assert.equal(orders[0].wa_message_id,'d');assert.equal((await db.query('SELECT stock FROM products WHERE id=1')).rows[0].stock,0);
 assert.equal((await db.query("SELECT COUNT(*)::int n FROM wa_messages WHERE meta_id='d'")).rows[0].n,1);
 // A stale customer quote must not oversell the last item.
 await db.query("UPDATE wa_chats SET state=$2 WHERE phone=$1",['923001234567',JSON.stringify({stage:'payment',productId:'1',unitPrice:1250,name:'Customer',phone:'03001234567',address:'Main bazar Swabi',city:'Swabi'})]);
 await service.processMessage(pool,message('e','','cod'),'Customer');
 assert.equal((await db.query('SELECT COUNT(*)::int n FROM orders')).rows[0].n,1);
 assert.equal((await db.query('SELECT stock FROM products WHERE id=1')).rows[0].stock,0);
 assert.match((await db.query("SELECT body FROM wa_messages WHERE direction='bot' ORDER BY id DESC LIMIT 1")).rows[0].body,/out of stock/);
 }finally{global.fetch=originalFetch;delete process.env.WA_ACCESS_TOKEN;delete process.env.WA_PHONE_NUMBER_ID;await pg.close();}
});
