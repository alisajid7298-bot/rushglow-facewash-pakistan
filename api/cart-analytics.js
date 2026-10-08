const crypto=require('crypto');
const {Pool}=require('@neondatabase/serverless');
function admin(req){
 try{const raw=(req.headers.cookie||'').match(/(?:^|;\s*)rg_admin=([^;]*)/);if(!raw)return false;
 const parts=decodeURIComponent(raw[1]).split('.'),[exp,sig]=parts,key=process.env.ADMIN_AUTH_SECRET||process.env.RESEND_API_KEY||'';
 if(!key||parts.length!==2||!/^\d+$/.test(exp)||Number(exp)<=Date.now()||!/^[a-f0-9]{64}$/.test(sig||''))return false;
 return crypto.timingSafeEqual(Buffer.from(sig,'hex'),Buffer.from(crypto.createHmac('sha256',key).update(exp).digest('hex'),'hex'));
 }catch{return false}
}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 if(req.method==='GET'&&!admin(req))return res.status(401).json({error:'Admin login required'});
 const range=String((req.query||{}).range||'all');
 const periods={day:1,week:7,month:30,all:0};
 if(req.method==='GET'&&!Object.prototype.hasOwnProperty.call(periods,range))return res.status(400).json({error:'Invalid period'});
 const days=periods[range]||0;
 const b=req.body||{};
 const event=b.event||'cart';
 if(req.method==='POST'&&(!/^[a-f0-9-]{36}$/i.test(b.visitor_id||'')||!['cart','visit'].includes(event)||(event==='cart'&&!/^\d{1,18}$/.test(String(b.product_id||'')))))return res.status(400).json({error:'Invalid tracking event'});
 let pool;
 try{
 const cs=process.env.POSTGRES_URL||process.env.DATABASE_URL||process.env.POSTGRES_URL_NON_POOLING;
 if(!cs)return res.status(503).json({error:'Tracking not configured'});
 pool=new Pool({connectionString:cs});
 await pool.query(`CREATE TABLE IF NOT EXISTS cart_activity(visitor_hash TEXT NOT NULL,product_id BIGINT NOT NULL,event_day DATE NOT NULL DEFAULT ((NOW() AT TIME ZONE 'UTC')::date),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(visitor_hash,product_id,event_day))`);
 await pool.query(`CREATE TABLE IF NOT EXISTS website_visitors(visitor_hash TEXT NOT NULL,event_day DATE NOT NULL DEFAULT ((NOW() AT TIME ZONE 'UTC')::date),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(visitor_hash,event_day))`);
 await pool.query('ALTER TABLE cart_activity ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ');
 await pool.query('ALTER TABLE website_visitors ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ');
 await pool.query(`CREATE TABLE IF NOT EXISTS website_visit_sources(visitor_hash TEXT NOT NULL,source TEXT NOT NULL,event_day DATE NOT NULL DEFAULT ((NOW() AT TIME ZONE 'UTC')::date),last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(visitor_hash,source,event_day))`);
 if(req.method==='POST'){
 const visitor=crypto.createHash('sha256').update(b.visitor_id.toLowerCase()).digest('hex');
 if(event==='visit'){
 const allowed=['Facebook','Google','TikTok','Instagram','WhatsApp','YouTube','Other','Direct/Unknown'];
 const source=allowed.includes(b.source)?b.source:'Direct/Unknown';
 await pool.query('INSERT INTO website_visitors(visitor_hash,last_seen_at) VALUES($1,NOW()) ON CONFLICT(visitor_hash,event_day) DO UPDATE SET last_seen_at=EXCLUDED.last_seen_at',[visitor]);
 await pool.query('INSERT INTO website_visit_sources(visitor_hash,source) VALUES($1,$2) ON CONFLICT(visitor_hash,source,event_day) DO UPDATE SET last_seen_at=NOW()',[visitor,source]);
 return res.json({ok:true});
 }
 await pool.query(`INSERT INTO cart_activity(visitor_hash,product_id,last_activity_at) SELECT $1,id,NOW() FROM products WHERE id=$2 ON CONFLICT(visitor_hash,product_id,event_day) DO UPDATE SET last_activity_at=EXCLUDED.last_activity_at`,[visitor,String(b.product_id)]);
 return res.json({ok:true});
 }
 const totals=await pool.query(`SELECT COUNT(DISTINCT visitor_hash)::int AS visitors,COUNT(DISTINCT visitor_hash) FILTER(WHERE event_day=(NOW() AT TIME ZONE 'UTC')::date)::int AS today,COUNT(DISTINCT visitor_hash) FILTER(WHERE event_day>=(NOW() AT TIME ZONE 'UTC')::date-6)::int AS last_seven_days,COUNT(DISTINCT visitor_hash) FILTER(WHERE event_day>=(NOW() AT TIME ZONE 'UTC')::date-29)::int AS last_thirty_days,MIN(created_at) AS first_event,MAX(COALESCE(last_activity_at,created_at)) AS last_activity FROM cart_activity`);
 const products=await pool.query(`SELECT a.product_id,COALESCE(p.name,'Deleted product') AS name,COUNT(DISTINCT a.visitor_hash)::int AS visitors,MAX(COALESCE(a.last_activity_at,a.created_at)) AS last_activity FROM cart_activity a LEFT JOIN products p ON p.id=a.product_id WHERE ($1::int=0 OR a.event_day>=(NOW() AT TIME ZONE 'UTC')::date-($1::int-1)) GROUP BY a.product_id,p.name ORDER BY visitors DESC,a.product_id DESC LIMIT 30`,[days]);
 const site=await pool.query(`SELECT COUNT(DISTINCT visitor_hash)::int AS visitors,COUNT(DISTINCT visitor_hash) FILTER(WHERE event_day=(NOW() AT TIME ZONE 'UTC')::date)::int AS today,COUNT(DISTINCT visitor_hash) FILTER(WHERE event_day>=(NOW() AT TIME ZONE 'UTC')::date-6)::int AS last_seven_days,COUNT(DISTINCT visitor_hash) FILTER(WHERE event_day>=(NOW() AT TIME ZONE 'UTC')::date-29)::int AS last_thirty_days,MIN(created_at) AS first_event,MAX(COALESCE(last_seen_at,created_at)) AS last_visit FROM website_visitors`);
 const sources=await pool.query(`SELECT source,COUNT(DISTINCT visitor_hash)::int AS visitors,MAX(last_seen_at) AS last_visit FROM website_visit_sources WHERE ($1::int=0 OR event_day>=(NOW() AT TIME ZONE 'UTC')::date-($1::int-1)) GROUP BY source ORDER BY visitors DESC,source`,[days]);
 return res.json({sources:sources.rows,totals:totals.rows[0],site_totals:site.rows[0],products:products.rows,time_zone:'UTC'});
 }catch(error){console.error('Cart tracking error',error.message);return res.status(500).json({error:'Cart activity could not be loaded'})}
 finally{if(pool)await pool.end().catch(()=>{})}
};