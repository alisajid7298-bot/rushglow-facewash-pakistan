const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('crypto');
const {PGlite}=require('@electric-sql/pglite');
const {login,verifyPin}=require('../lib/admin-pin-login');
const salt=crypto.randomBytes(16).toString('hex'),pin=String(crypto.randomInt(1000,10000));
const hash='scrypt$'+salt+'$'+crypto.scryptSync(pin,salt,64).toString('hex');
test('PIN login locks after three failures, recovers, alerts both admins and fails closed',async()=>{
 const db=new PGlite();let emails=[];let mailOK=true;
 class Pool {query(...args){return db.query(...args)} async connect(){return {query:(...args)=>db.query(...args),release(){}}} async end(){}}
 process.env.POSTGRES_URL='test';process.env.RESEND_API_KEY='test';process.env.ADMIN_LOGIN_PIN_HASH=hash;
 const originalFetch=global.fetch;global.fetch=async(url,options)=>{emails.push(JSON.parse(options.body));return {ok:mailOK}};
 async function run(value,origin='https://rushglow.org'){
 const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(body){this.body=body;return this}};
 await login({headers:{origin},body:{pin:value}},res,{Pool,sign:()=> 'a'.repeat(64),clearCookie:()=> 'rg_otp=; Max-Age=0'});return res;
 }
 try{
 assert.equal(verifyPin(pin,hash),true);assert.equal(verifyPin('abcd',hash),false);
 assert.equal((await run(pin,'https://other.example')).statusCode,403);
 const wrong=pin==='0000'?'0001':'0000';
 assert.equal((await run(wrong)).body.attempts_remaining,2);
 assert.equal((await run(wrong)).body.attempts_remaining,1);
 assert.equal((await run(wrong)).statusCode,429);
 assert.equal((await run(pin)).statusCode,429);assert.equal(emails.length,0);
 await db.query("UPDATE admin_pin_attempts SET locked_until=NOW()-INTERVAL '1 second',last_attempt_at=NOW()-INTERVAL '16 minutes'");
 const success=await run(pin);assert.equal(success.statusCode,200);assert.match(success.headers['Set-Cookie'][0],/^rg_admin=/);assert.equal(emails.length,2);
 assert.deepEqual(emails.map(x=>x.to[0]),['ali.sajid7298@gmail.com','rushglow35@gmail.com']);assert.ok(emails.every(x=>!x.text.includes(pin)));
 mailOK=false;const failed=await run(pin);assert.equal(failed.statusCode,502);assert.equal(failed.headers['Set-Cookie'],undefined);
 delete process.env.ADMIN_LOGIN_PIN_HASH;assert.equal((await run(pin)).statusCode,503);
 }finally{global.fetch=originalFetch;await db.close()}
});
