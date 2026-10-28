'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const review=require('../lib/whatsapp-review');
const handler=require('../api/whatsapp-review');
const {Readable}=require('node:stream');
const keys=['WA_MANAGEMENT_WABA_ID','WA_PHONE_NUMBER_ID','WA_ACCESS_TOKEN','WA_REVIEW_CODE_HASH','WA_REVIEW_EXPIRES','ADMIN_AUTH_SECRET'];
test('Isolated reviewer access, expiry, account pinning and read-only enforcement',async()=>{
 const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));const code='a'.repeat(64);
 try{
  process.env.WA_MANAGEMENT_WABA_ID=review.TEST_WABA;process.env.WA_PHONE_NUMBER_ID=review.TEST_PHONE;process.env.WA_ACCESS_TOKEN='test-token';process.env.WA_REVIEW_CODE_HASH=crypto.createHash('sha256').update(code).digest('hex');process.env.WA_REVIEW_EXPIRES=String(Date.now()+3600000);process.env.ADMIN_AUTH_SECRET='test-admin';
  assert.equal(review.validCode(code),true);assert.equal(review.validCode('b'.repeat(64)),false);
  const cookie='rg_wa_review='+review.session();assert.equal(review.reviewer({headers:{cookie}}),true);assert.equal(review.reviewer({headers:{cookie:cookie+'bad'}}),false);
  async function call(action,body,headers={},method='POST'){
   const req=Readable.from([Buffer.from(JSON.stringify(body||{}))]);Object.assign(req,{method,query:{action},headers:{origin:'https://rushglow.org',...headers}});
   const res={code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(d){this.body=d;return this;}};await handler(req,res);return res;
  }
  assert.equal((await call('create',{confirm:true},{cookie})).code,403);
  assert.equal((await call('login',{code},{origin:'https://attacker.example'})).code,403);
  assert.equal((await call('templates',{}, {},'GET')).code,401);
  const login=await call('login',{code});assert.equal(login.code,200);assert.match(login.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Strict/);
  assert.equal((await call('messages',{}, {cookie},'GET')).code,400);
  process.env.WA_PHONE_NUMBER_ID='owner-number';assert.equal(review.reviewer({headers:{cookie}}),false);assert.equal((await call('templates',{}, {cookie},'GET')).code,401);
  process.env.WA_PHONE_NUMBER_ID=review.TEST_PHONE;process.env.WA_REVIEW_EXPIRES=String(Date.now()-1);assert.equal(review.validCode(code),false);assert.equal(review.reviewer({headers:{cookie}}),false);
 }finally{for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}}
});
test('Only review templates are exposed and payload contains sample order data',()=>{
 assert.deepEqual(review.safeTemplates({data:[{name:'private_order',components:[]},{id:'1',name:review.PREFIX+'demo',status:'PENDING',category:'UTILITY',language:'en_US',components:[{type:'BODY',text:'test'}],private:'hidden'}]}),[{id:'1',name:review.PREFIX+'demo',status:'PENDING',category:'UTILITY',language:'en_US',body:'test'}]);
 assert.equal(review.template('demo').category,'UTILITY');assert.match(review.template('demo').components[0].text,/\{\{1\}\}/);assert.throws(()=>review.template('../other'));
});
