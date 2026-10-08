const crypto=require('crypto');
const {Pool}=require('@neondatabase/serverless');
function isAdmin(req){
 try{const raw=(req.headers.cookie||'').match(/(?:^|;\s*)rg_admin=([^;]*)/);if(!raw)return false;
 const parts=decodeURIComponent(raw[1]).split('.'),[exp,sig]=parts,key=process.env.ADMIN_AUTH_SECRET||process.env.RESEND_API_KEY||'';
 if(!key||parts.length!==2||!/^\d+$/.test(exp)||Number(exp)<=Date.now()||!/^[a-f0-9]{64}$/.test(sig||''))return false;
 return crypto.timingSafeEqual(Buffer.from(sig,'hex'),Buffer.from(crypto.createHmac('sha256',key).update(exp).digest('hex'),'hex'));
 }catch{return false}
}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 if(!isAdmin(req))return res.status(401).json({error:'Admin login required'});
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
