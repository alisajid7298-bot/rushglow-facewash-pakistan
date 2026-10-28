'use strict';
const crypto=require('node:crypto');
const service=require('./whatsapp-service');
const review=require('./whatsapp-review');
const cookie=value=>'rg_wa_review='+value+'; Path=/api/whatsapp; HttpOnly; Secure; SameSite=Strict; Max-Age='+(value?'28800':'0');
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
  const action=req.query?.action||'status';
  let body={};
  if(req.method==='POST'){
    if(!['https://rushglow.org','https://www.rushglow.org'].includes(req.headers.origin))return res.status(403).json({error:'Invalid request origin'});
    let size=0;const chunks=[];
    for await(const chunk of req){size+=chunk.length;if(size>2048)return res.status(413).json({error:'Request too large'});chunks.push(Buffer.from(chunk));}
    try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return res.status(400).json({error:'Invalid request'});}
    if(action==='logout'){res.setHeader('Set-Cookie',cookie(''));return res.json({ok:true});}
    if(action==='login'){
      if(!review.validCode(body.code))return res.status(401).json({error:'Invalid or expired reviewer access code'});
      res.setHeader('Set-Cookie',cookie(review.session()));return res.json({ok:true});
    }
  }
  const admin=service.admin(req), reviewer=review.reviewer(req);
  if(!admin&&!reviewer)return res.status(401).json({error:'Owner login or reviewer access code required'});
  if(!review.enabled())return res.status(409).json({error:'Test template management is unavailable. The configured account must be the RushGlow Meta test account.'});
  try{
    if(req.method==='GET'&&action==='status')return res.json({role:admin?'admin':'reviewer',testOnly:true,reviewerExpires:reviewer?Number(process.env.WA_REVIEW_EXPIRES):null});
    if(req.method==='GET'&&action==='templates'){
      const after=String(req.query?.after||'');
      if(after&&!/^[a-zA-Z0-9_=-]{1,2048}$/.test(after))return res.status(400).json({error:'Invalid cursor'});
      const data=await service.graph(review.TEST_WABA+'/message_templates?fields=id,name,status,category,language,components&limit=100'+(after?'&after='+encodeURIComponent(after):''));
      return res.json({templates:review.safeTemplates(data),after:data.paging?.next?data.paging?.cursors?.after||null:null});
    }
    if(req.method==='POST'&&action==='create'){
      if(!admin)return res.status(403).json({error:'Reviewer access is read-only'});
      if(body.confirm!==true)return res.status(400).json({error:'Confirm submission to Meta'});
      // Server chooses the content and unique name; callers cannot target another account or create marketing messages.
      const suffix=new Date().toISOString().slice(0,10).replace(/-/g,'')+'_'+crypto.randomBytes(4).toString('hex');
      const payload=review.template(suffix);
      const data=await service.graph(review.TEST_WABA+'/message_templates',{method:'POST',body:JSON.stringify(payload)});
      return res.json({ok:true,id:data.id,name:payload.name,status:data.status||'SUBMITTED',category:data.category||payload.category});
    }
    return res.status(400).json({error:'Unknown action'});
  }catch(e){console.error('WhatsApp template management error',e.code||e.name);return res.status(502).json({error:'Meta API request failed. Check the token permissions and expiry.',code:e.code||'UPSTREAM_ERROR'});}
};
module.exports.config={api:{bodyParser:false}};
