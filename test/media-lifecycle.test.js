'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function load(serve,auth=true){
 let ended=false,schemas=0,config;
 const pool={end:async()=>{ended=true;}};
 const mod={exports:{}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../api/whatsapp'),'utf8'),{module:mod,process:{env:{DATABASE_URL:'test'}},console:{error(){}},Buffer,require:id=>id==='@neondatabase/serverless'?{Pool:function(c){config=c;return pool;}}:id==='../lib/whatsapp-service'?{admin:()=>auth,schema:async()=>{schemas++;}}:id==='../lib/whatsapp-bot'?{}:id==='../lib/whatsapp-media'?{serve}:require(id)});
 const req={method:'GET',query:{action:'media',id:'1463659642543862'},headers:{}};
 const res={code:200,setHeader(){},status(n){this.code=n;return this;},json(data){this.data=data;return this;},send(data){this.data=data;return this;}};
 return {run:()=>mod.exports(req,res),res,ended:()=>ended,schemas:()=>schemas,config:()=>config};
}
test('Private image response finishes before its database connection is closed, without schema locks',async()=>{
 let release,entered;const ready=new Promise(r=>entered=r),wait=new Promise(r=>release=r);
 const c=load(async(pool,req,res)=>{entered();await wait;assert.equal(c.ended(),false);return res.send(Buffer.from('image'));});
 const pending=c.run();await ready;assert.equal(c.ended(),false);assert.equal(c.schemas(),0);assert.equal(c.config().query_timeout,10000);release();await pending;assert.equal(c.ended(),true);assert.equal(c.res.data.toString(),'image');
});
test('Media rejection becomes a clear service response and still closes pool',async()=>{
 const c=load(async()=>{throw new Error('Meta unavailable');});await c.run();assert.equal(c.res.code,503);assert.equal(c.ended(),true);
});
test('Private media still requires authenticated admin before database or fetch',async()=>{
 let called=false;const c=load(async()=>{called=true;},false);await c.run();assert.equal(c.res.code,401);assert.equal(called,false);assert.equal(c.config(),undefined);
});
