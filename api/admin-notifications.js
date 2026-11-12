function latestUpdates(){return require('../lib/deployment-updates.json')}
const crypto=require('crypto');
const {Pool}=require('@neondatabase/serverless');
function isAdmin(req){
 try{const raw=(req.headers.cookie||'').match(/(?:^|;\s*)rg_admin=([^;]*)/);if(!raw)return false;
 const parts=decodeURIComponent(raw[1]).split('.'),[exp,sig]=parts,key=process.env.ADMIN_AUTH_SECRET||process.env.RESEND_API_KEY||'';
 if(!key||parts.length!==2||!/^\d+$/.test(exp)||Number(exp)<=Date.now()||!/^[a-f0-9]{64}$/.test(sig||''))return false;
 return crypto.timingSafeEqual(Buffer.from(sig,'hex'),Buffer.from(crypto.createHmac('sha256',key).update(exp).digest('hex'),'hex'));
 }catch{return false}
}

async function sendUpdateDigest(req,res){
 if(!['https://rushglow.org','https://www.rushglow.org'].includes(req.headers.origin))return res.status(403).json({error:'Invalid request origin'});
 if(req.body?.action!=='email-latest-updates')return res.status(400).json({error:'Unknown action'});
 if(!process.env.RESEND_API_KEY)return res.status(503).json({error:'Email service is not configured'});
 const recipients=['ali.sajid7298@gmail.com','rushglow35@gmail.com'];
 const updates=latestUpdates();if(!updates.deployed_at)return res.status(503).json({error:'Deployment update metadata is not available yet. Please refresh after deployment.'});
 const date=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Karachi',day:'numeric',month:'long',year:'numeric'}).format(new Date(updates.deployed_at));
 const text=['RushGlow website updates — '+date,'','Latest deployed update:',updates.summary,'','Recent updates:',...updates.recent_updates.map(x=>'- '+x.summary),'','Deployment time (PKT): '+new Date(updates.deployed_at).toLocaleString('en-GB',{timeZone:'Asia/Karachi'}),'','Website: https://rushglow.org','Control panel: https://rushglow.org/admin.html','Website Chat Inbox: https://rushglow.org/web-chat-inbox.html','','WhatsApp number activation and Meta approval are separate from website deployments.'].join('\n');
 const results=await Promise.all(recipients.map(async email=>{try{
 const r=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'rushglow-updates-'+crypto.createHash('sha256').update(JSON.stringify(updates)).digest('hex').slice(0,32)+'-'+email},body:JSON.stringify({from:process.env.ADMIN_EMAIL_FROM||'RushGlow <verification@rushglow.org>',to:[email],subject:'RushGlow — Website Updates — '+date,text})});
 const data=await r.json().catch(()=>({}));return {email,accepted:r.ok,id:r.ok?data.id:undefined};
 }catch{return {email,accepted:false}}}));
 const ok=results.every(r=>r.accepted);
 return res.status(ok?200:502).json({ok,results,message:ok?'Email service accepted the update email for both addresses. Please check inbox/spam.': 'One or more emails could not be sent. Retry to resend failed requests; accepted requests are deduplicated for 24 hours.'});
}

module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 if(!isAdmin(req))return res.status(401).json({error:'Admin login required'});
 if(req.method==='POST')return sendUpdateDigest(req,res);
 if(req.query?.updates==='1')return res.json(latestUpdates());
 let pool;
 try{
 const cs=process.env.POSTGRES_URL||process.env.DATABASE_URL||process.env.POSTGRES_URL_NON_POOLING;
 if(!cs)return res.status(503).json({error:'Notifications unavailable'});
 pool=new Pool({connectionString:cs});
 const q=await pool.query("SELECT * FROM (SELECT 'order'::text AS kind,id::text AS id,created_at,NULL::integer AS rating,NULL::boolean AS approved FROM orders UNION ALL SELECT 'review'::text AS kind,id::text AS id,created_at,rating,approved FROM reviews) events ORDER BY created_at DESC,kind,id DESC LIMIT 100");
 return res.json({events:q.rows});
 }catch(error){console.error('Notification list failed',error.message);return res.status(500).json({error:'Notifications could not be loaded'})}
 finally{if(pool)await pool.end().catch(()=>{})}
};
