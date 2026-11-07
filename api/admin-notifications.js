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
 const text="RushGlow website updates — 7 November 2026\n\nThe following updates are live on https://rushglow.org:\n\n1. Track Your Order now appears above Get an Offer on WhatsApp.\n2. The WhatsApp offer form and Lucky Draw section are collapsed by default; click their headings to open.\n3. The old FAQ chatbot was replaced by a focused shopping chat.\n4. Chat supports English, Roman Urdu and Urdu; current product photos, prices and available descriptions; quantity selection; name, phone, address and city collection; final order confirmation; Cash on Delivery; and EasyPaisa payment screenshot upload.\n5. Order totals are calculated on the server. Repeated confirmation of the same chat request does not create duplicate orders.\n6. Customers can check order status inside chat.\n7. A protected Website Chat Inbox allows admins to view conversations, reply, take over and resume the bot.\n8. Chat product action buttons now appear together below the price.\n9. Public catalogue cards are wider and more compact, with photo on the left and details on the right. Large screens show three cards per row.\n\nWebsite: https://rushglow.org\nControl panel: https://rushglow.org/admin.html\nWebsite Chat Inbox: https://rushglow.org/web-chat-inbox.html\n\nVerification: eight mocked flow/security checks passed; live chat opening, catalogue, language/quantity prompt and private inbox access were checked. No production test purchase was placed. Actual email receipt, end-to-end owner reply and a real paid order were not verified.\n\nThese updates apply to the website. WhatsApp phone-number activation and Meta approval are separate and have not been confirmed by these changes.\n\nRushGlow project update";
 const results=await Promise.all(recipients.map(async email=>{try{
 const r=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'rushglow-updates-2026-11-07-v1-'+email},body:JSON.stringify({from:process.env.ADMIN_EMAIL_FROM||'RushGlow <verification@rushglow.org>',to:[email],subject:'RushGlow — Website Updates — 7 November 2026',text})});
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
