'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const service=require('../lib/whatsapp-service'),funnel=require('../lib/whatsapp-funnel'),orders=require('../api/orders');
test('Funnel tracks real unique customers, successful welcome cohorts, checkout and protected drilldowns',async()=>{
 const pg=new PGlite(),db={query:async(sql,params)=>!params&&sql.includes(';')?(await pg.exec(sql)).at(-1):pg.query(sql,params),release(){},end:async()=>{}},pool={...db,connect:async()=>db};
 const oldFetch=global.fetch,oldNotify=orders.notifyOrder,oldRecord=funnel.record;let sent=0,fail=false;const keys=['WA_ACCESS_TOKEN','WA_PHONE_NUMBER_ID','DATABASE_URL','ADMIN_AUTH_SECRET'],old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 Object.assign(process.env,{WA_ACCESS_TOKEN:'test',WA_PHONE_NUMBER_ID:'test',DATABASE_URL:'test',ADMIN_AUTH_SECRET:'funnel-test'});orders.notifyOrder=async()=>{};
 global.fetch=async()=>({ok:!fail,json:async()=>fail?{error:{code:131026}}:{messages:[{id:'funnel-out-'+(++sent)}]}});
 let seq=0;const msg=(phone,text,action,id)=>({id:id||'funnel-in-'+(++seq),from:phone,timestamp:String(Math.floor(Date.now()/1000)),type:action?'interactive':'text',...(action?{interactive:{button_reply:{id:action,title:action}}}:{text:{body:text}})});
 const send=async(phone,text,action,id)=>service.processMessage(pool,msg(phone,text,action,id),'Customer '+phone.slice(-1));
 const A='923001111111',B='923002222222',C='923003333333',D='923004444444',E='923005555555';
 try{
 await pg.exec(`CREATE TABLE products(id BIGSERIAL PRIMARY KEY,name TEXT,price TEXT,stock INTEGER,photo TEXT,bundle_ids TEXT);
 CREATE TABLE orders(id BIGSERIAL PRIMARY KEY,product_id BIGINT,product_name TEXT,price TEXT,customer_name TEXT,phone TEXT,address TEXT,city TEXT,notes TEXT,payment_method TEXT,transaction_id TEXT,delivery TEXT,items TEXT,traffic_source TEXT,status TEXT);
 INSERT INTO products(id,name,price,stock,photo,bundle_ids) VALUES(24,'RushGlow FaceWash','1200',50,'','[]');`);
 await service.schema(db);await db.query('UPDATE wa_settings SET enabled=TRUE');
 // Before tracking starts at a customer's welcome, an old checkout is not invented as a new lead.
 await send('923009999999','','product:24');assert.equal((await db.query('SELECT COUNT(*)::int n FROM wa_funnel_progress')).rows[0].n,0);
 for(const phone of [A,B,C,D])await send(phone,'Hi');
 await send(A,'1');await send(A,'','yes');await send(A,'Name: Sajid Ali\n03001234567\nHouse 12, Main Road\nCity: Lahore');await send(A,'','cod','order-once');await send(A,'','cod','order-once');
 await send(B,'1');await send(D,'1');await send(D,'','yes');
 let s=await funnel.summary(db);assert.deepEqual(Object.fromEntries(['welcome','product','yes','details','order'].map(k=>[k,s.counts[k]])),{welcome:4,product:3,yes:2,details:1,order:1});
 assert.equal(s.counts.stalled_welcome,1);assert.equal(s.counts.stalled_product,1);assert.equal(s.counts.stalled_yes,1);assert.equal(s.counts.stalled_details,0);
 assert.equal((await funnel.customers(db,'stalled_product')).customers[0].phone,B);assert.equal((await funnel.customers(db,'order')).customers[0].order_id,'1');
 await send(C,'5');assert.equal((await funnel.customers(db,'stalled_welcome')).customers[0].paused,true);
 await send(B,'Hi');await send(B,'Hi');assert.equal((await funnel.summary(db)).counts.welcome,4);
 fail=true;await send(E,'Hi');fail=false;s=await funnel.summary(db);assert.equal(s.failed_welcome,1);assert.equal(s.counts.welcome,4);
 await send(E,'Hi');s=await funnel.summary(db);assert.equal(s.failed_welcome,0);assert.equal(s.counts.welcome,5);
 const before=(await db.query('SELECT * FROM wa_funnel_progress WHERE phone=$1',[D])).rows[0];
 await service.processMessage(pool,{...msg(D,''),type:'audio',audio:{id:'12345'}},'Voice Customer');await service.processMessage(pool,{...msg(D,''),type:'reaction',reaction:{emoji:'👍',message_id:'original'}},'Voice Customer');
 const after=(await db.query('SELECT * FROM wa_funnel_progress WHERE phone=$1',[D])).rows[0];assert.equal(new Date(after.yes_at).getTime(),new Date(before.yes_at).getTime());assert.equal(after.details_at,null);assert.equal((await funnel.summary(db)).counts.welcome,5);
 await assert.rejects(funnel.customers(db,"order' OR TRUE--"),e=>e.status===400);await assert.rejects(funnel.customers(db,'welcome','-1'),e=>e.status===400);
 // Broken analytics rolls back just the metrics savepoint; the customer still gets a reply.
 funnel.record=async d=>{await d.query('SELECT missing_tracking_column FROM wa_settings');};const sentBefore=sent;await send('923006666666','Hi');assert.equal(sent,sentBefore+1);funnel.record=oldRecord;
 // API authorization and invalid drilldowns are checked at the real route boundary.
 const mod={exports:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../api/whatsapp'),'utf8'),{module:mod,process,console,Buffer,URL,AbortSignal,require:id=>id==='@neondatabase/serverless'?{Pool:function(){return pool;}}:id==='../lib/whatsapp-service'?service:id==='../lib/whatsapp-funnel'?funnel:require(id)});
 const exp=String(Date.now()+60000),cookie='rg_admin='+exp+'.'+crypto.createHmac('sha256',process.env.ADMIN_AUTH_SECRET).update(exp).digest('hex');
 async function call(action,auth=true,stage){const res={code:200,setHeader(){},status(c){this.code=c;return this;},json(data){this.data=data;return this;},end(){return this;}};await mod.exports({method:'GET',query:{action,stage},headers:auth?{cookie}:{}},res);return res;}
 assert.equal((await call('funnel',false)).code,401);assert.equal((await call('funnel')).data.counts.order,1);assert.equal((await call('funnel_chats',true,'bad')).code,400);assert.equal((await call('funnel_chats',true,'stalled_product')).data.customers[0].phone,B);
 // Bounded pages expose a next cursor without losing access to later customers.
 for(let n=0;n<51;n++){const p='923007'+String(n).padStart(6,'0');const id=(await db.query("INSERT INTO wa_messages(phone,direction,body,status) VALUES($1,'bot','welcome','sent') RETURNING id",[p])).rows[0].id;await funnel.record(db,p,[{stage:'welcome',index:0}],[id]);}
 const first=await funnel.customers(db,'welcome');assert.equal(first.customers.length,50);assert.equal(first.next_cursor,'50');assert.ok((await funnel.customers(db,'welcome',first.next_cursor)).customers.length>0);
 }finally{global.fetch=oldFetch;orders.notifyOrder=oldNotify;funnel.record=oldRecord;for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}await pg.close();}
});
