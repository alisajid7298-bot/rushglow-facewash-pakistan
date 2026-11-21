'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
test('Opt-in device registration, encrypted push, opt-out and invalid endpoint rejection',async()=>{
 const pg=new PGlite(),db={query:async(sql,params)=>!params&&sql.includes(';')?(await pg.exec(sql)).at(-1):pg.query(sql,params),release(){}},pool={...db,connect:async()=>db};
 const sent=[],mod={exports:{}};const webpush={generateVAPIDKeys:()=>({publicKey:'public-test',privateKey:'private-test'}),sendNotification:async(s,p,o)=>{sent.push({s,p:JSON.parse(p),o});}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../lib/admin-push'),'utf8'),{module:mod,require:n=>n==='web-push'?webpush:require(n),URL,Buffer,console});const push=mod.exports;
 const key=crypto.createECDH('prime256v1');key.generateKeys();const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/test-device',keys:{p256dh:key.getPublicKey().toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')}};
 async function call(action,sub=subscription){const res={code:200,status(c){this.code=c;return this},json(d){this.data=d;return this}};await push.handle(pool,{body:{action,subscription:sub}},res);return res;}
 try{await push.notify(pool,'message');assert.equal(sent.length,0);assert.equal((await call('push-key')).data.publicKey,'public-test');assert.equal((await call('push-on',{...subscription,endpoint:'https://untrusted.example/push'})).code,400);assert.equal((await call('push-on')).data.enabled,true);assert.equal((await call('push-status')).data.enabled,true);
 await push.notify(pool,'message','923001234567');assert.equal(sent.length,1);assert.equal(sent[0].p.kind,'message');assert.equal(sent[0].p.phone,'923001234567');assert.deepEqual(Object.keys(sent[0].p).sort(),['kind','phone']);assert.equal((await call('push-test')).data.ok,true);assert.equal((await call('push-off')).data.enabled,false);await push.notify(pool,'order');assert.equal(sent.length,2);assert.equal((await call('push-status')).data.enabled,false);
 }finally{await pg.close();}
});
test('Push setup uses the authenticated ordinary WhatsApp HTTP route, never the queue callback',async()=>{
 const mod={exports:{}};let called=0,closed=0;const pool={end:async()=>{closed++;}};
 const fakeService={admin:req=>req.headers.cookie==='authorized',schema:async()=>{}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../api/whatsapp'),'utf8'),{module:mod,require:n=>n==='@neondatabase/serverless'?{Pool:function(){return pool;}}:n==='../lib/whatsapp-service'?fakeService:n==='../lib/admin-push'?{handle:async(db,req,res)=>{assert.equal(db,pool);assert.equal(req.body.action,'push-key');called++;return res.json({publicKey:'test-public'});}}:require(n),process:{env:{DATABASE_URL:'test'}},Buffer,console});
 async function call(cookie,origin,body={action:'push-key'}){const req={method:'POST',query:{action:'admin_push'},headers:{cookie,origin},async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify(body));}};const res={code:200,setHeader(){},status(c){this.code=c;return this;},json(d){this.data=d;return this;},end(){return this;}};await mod.exports(req,res);return res;}
 assert.equal((await call('', 'https://rushglow.org')).code,401);
 assert.equal((await call('authorized','https://wrong.example')).code,403);
 assert.equal((await call('authorized','https://rushglow.org',{action:'unknown'})).code,400);
 assert.equal((await call('authorized','https://rushglow.org')).data.publicKey,'test-public');assert.equal(called,1);assert.equal(closed,3);
});
