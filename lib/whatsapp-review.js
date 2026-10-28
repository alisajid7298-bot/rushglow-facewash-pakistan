'use strict';
const crypto = require('node:crypto');
const TEST_WABA = '2317363422344339';
const TEST_PHONE = '1298056546731697';
const PREFIX = 'rushglow_review_';
function same(a,b) {
  const x=Buffer.from(String(a)), y=Buffer.from(String(b));
  return x.length===y.length && crypto.timingSafeEqual(x,y);
}
function enabled() {
  return process.env.WA_MANAGEMENT_WABA_ID===TEST_WABA &&
    process.env.WA_PHONE_NUMBER_ID===TEST_PHONE && !!process.env.WA_ACCESS_TOKEN;
}
function reviewConfigured() {
  return enabled() && /^[a-f0-9]{64}$/.test(process.env.WA_REVIEW_CODE_HASH||'') &&
    Number(process.env.WA_REVIEW_EXPIRES)>Date.now();
}
function validCode(code) {
  return reviewConfigured() && /^[a-f0-9]{64}$/.test(String(code||'')) &&
    same(crypto.createHash('sha256').update(code).digest('hex'),process.env.WA_REVIEW_CODE_HASH);
}
function signature(exp) {
  return crypto.createHmac('sha256',process.env.WA_REVIEW_CODE_HASH||'').update('templates-read-only:'+exp).digest('hex');
}
function session() {
  const exp=String(Math.min(Date.now()+8*3600000,Number(process.env.WA_REVIEW_EXPIRES)));
  return exp+'.'+signature(exp);
}
function reviewer(req) {
  if(!reviewConfigured())return false;
  const raw=(req.headers.cookie||'').match(/(?:^|;\s*)rg_wa_review=([^;]*)/)?.[1]||'';
  const [exp,sig,...rest]=raw.split('.');
  return !rest.length && /^\d+$/.test(exp) && Number(exp)>Date.now() &&
    Number(exp)<=Number(process.env.WA_REVIEW_EXPIRES) && same(sig,signature(exp));
}
function template(suffix) {
  if(!/^[a-z0-9_]{1,40}$/.test(suffix||''))throw new Error('INVALID_NAME');
  return {name:PREFIX+suffix,language:'en_US',category:'UTILITY',components:[{
    type:'BODY',text:'Your RushGlow order {{1}} has been received. Total: PKR {{2}}. Payment method: {{3}}. Reply here if you need help with this order.',
    example:{body_text:[['TEST-13','1200','Cash on Delivery']]}
  }]};
}
function safeTemplates(data) {
  return (data.data||[]).filter(t=>String(t.name||'').startsWith(PREFIX)).map(t=>({
    id:t.id,name:t.name,status:t.status,category:t.category,language:t.language,
    body:(t.components||[]).find(c=>c.type==='BODY')?.text||''
  }));
}
module.exports={TEST_WABA,TEST_PHONE,PREFIX,enabled,reviewConfigured,validCode,session,reviewer,template,safeTemplates};
