import crypto from 'crypto';
const ADMIN_EMAIL='ali.sajid7298@gmail.com';
const key=()=>process.env.ADMIN_AUTH_SECRET||process.env.RESEND_API_KEY||'';
const sign=v=>crypto.createHmac('sha256',key()).update(v).digest('hex');
const cookie=(req,n)=>{const m=(req.headers.cookie||'').match(new RegExp('(?:^|; )'+n+'=([^;]*)'));return m?decodeURIComponent(m[1]):''};
export default async function handler(req,res){
 if(req.method==='GET'){const t=cookie(req,'rg_admin');if(!t)return res.status(401).json({ok:false});const [exp,sig]=t.split('.');return res.status(Number(exp)>Date.now()&&sig===sign(exp)?200:401).json({ok:Number(exp)>Date.now()&&sig===sign(exp)});}
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 const {action,email,code}=req.body||{};
 if(action==='send'){
  if(String(email||'').toLowerCase()!==ADMIN_EMAIL)return res.status(403).json({error:'This Gmail is not authorized'});
  const otp=String(crypto.randomInt(100000,1000000)),exp=Date.now()+10*60*1000,payload=exp+'.'+sign(otp+'.'+exp);
  const rr=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:'Rush Glow <onboarding@resend.dev>',to:[ADMIN_EMAIL],subject:'Rush Glow Admin Login Code',html:'<h2>Rush Glow Admin</h2><p>Your verification code is:</p><h1>'+otp+'</h1><p>This code expires in 10 minutes.</p>'})});
  if(!rr.ok){const detail=await rr.text();console.error('Resend error',rr.status,detail);return res.status(500).json({error:'Email could not be sent',detail:detail.slice(0,300)});}
  res.setHeader('Set-Cookie','rg_otp='+encodeURIComponent(payload)+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=600');return res.json({ok:true});
 }
 if(action==='verify'){
  const t=cookie(req,'rg_otp'),[exp,sig]=t.split('.');
  if(!exp||Date.now()>Number(exp)||sig!==sign(String(code||'')+'.'+exp))return res.status(401).json({error:'Invalid or expired code'});
  const sessionExp=Date.now()+12*60*60*1000;
  res.setHeader('Set-Cookie',['rg_admin='+encodeURIComponent(sessionExp+'.'+sign(String(sessionExp)))+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200','rg_otp=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0']);
  return res.json({ok:true});
 }
 return res.status(400).json({error:'Invalid action'});
}
// redeploy for updated RESEND_API_KEY

// refresh deployment after Resend credential update
