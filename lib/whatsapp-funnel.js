'use strict';
const stages=['welcome','product','yes','details','order'];
const columns={welcome:'welcome_at',product:'product_at',yes:'yes_at',details:'details_at',order:'order_at'};
async function schema(db){
 await db.query(`CREATE TABLE IF NOT EXISTS wa_funnel_meta(id INTEGER PRIMARY KEY CHECK(id=1),started_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 INSERT INTO wa_funnel_meta(id) VALUES(1) ON CONFLICT DO NOTHING;
 CREATE TABLE IF NOT EXISTS wa_funnel_progress(phone TEXT PRIMARY KEY,welcome_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),welcome_message_id BIGINT NOT NULL,product_at TIMESTAMPTZ,yes_at TIMESTAMPTZ,details_at TIMESTAMPTZ,order_at TIMESTAMPTZ,representative_at TIMESTAMPTZ,product_id TEXT,order_id TEXT,last_event_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`);
}
const messageBody=p=>p.text?.body||p.image?.caption||p.interactive?.body?.text||'';
function events(previous,input,result,order){
 const found=[];
 const welcomeIndex=result.messages.findIndex(p=>messageBody(p).startsWith('رش گلو بیوٹی اینڈ سکن کیئر میں خوش آمدید!'));
 // A reaction/voice welcome in an old checkout must not invent earlier steps
 // for a customer whose checkout began before this tracking was installed.
 if(welcomeIndex>=0&&(!previous.stage||['menu','complete'].includes(previous.stage)||!result.state.stage))found.push({stage:'welcome',index:welcomeIndex});
 if(!input.reaction&&!input.audio){
  if(result.state.stage==='confirm'&&result.state.productId&&(previous.stage!=='confirm'||previous.productId!==result.state.productId||input.action?.startsWith('product:')||/^[1-4۱-۴١-٤]$/.test(String(input.text||'').trim())))found.push({stage:'product',productId:result.state.productId});
  if(result.state.stage==='details'&&previous.stage!=='details'&&result.state.productId){found.push({stage:'product',productId:result.state.productId},{stage:'yes',productId:result.state.productId});}
  if(result.state.stage==='payment'&&previous.stage!=='payment')found.push({stage:'details'});
  if(order)found.push({stage:'order',orderId:String(order.id)});
  if(result.handoff)found.push({stage:'representative'});
 }
 return found;
}
async function record(db,phone,items,messageIds){
 for(const item of items){
  if(item.stage==='welcome'){
   if(!messageIds[item.index])continue;
   await db.query(`INSERT INTO wa_funnel_progress(phone,welcome_message_id) VALUES($1,$2)
    ON CONFLICT(phone) DO UPDATE SET welcome_message_id=CASE WHEN EXISTS(SELECT 1 FROM wa_messages m WHERE m.id=wa_funnel_progress.welcome_message_id AND m.status='failed') THEN $2 ELSE wa_funnel_progress.welcome_message_id END,last_event_at=NOW()`,[phone,messageIds[item.index]]);
  }else if(item.stage==='representative')await db.query('UPDATE wa_funnel_progress SET representative_at=NOW(),last_event_at=NOW() WHERE phone=$1',[phone]);
  else if(columns[item.stage]){
   const col=columns[item.stage];
   await db.query(`UPDATE wa_funnel_progress SET ${col}=COALESCE(${col},NOW()),product_id=COALESCE($2,product_id),order_id=COALESCE($3,order_id),last_event_at=NOW() WHERE phone=$1`,[phone,item.productId||null,item.orderId||null]);
  }
 }
}
// Counts are cumulative distinct customers since tracking began, not sessions or deliveries.
const cohort=`FROM wa_funnel_progress f JOIN wa_messages w ON w.id=f.welcome_message_id WHERE w.status IN ('sent','delivered','read')`;
async function summary(db){
 const started=(await db.query('SELECT started_at FROM wa_funnel_meta WHERE id=1')).rows[0]?.started_at;
 const row=(await db.query(`SELECT COUNT(*)::int AS welcome,COUNT(product_at)::int AS product,COUNT(yes_at)::int AS yes,COUNT(details_at)::int AS details,COUNT(order_at)::int AS "order",
 COUNT(*) FILTER(WHERE product_at IS NULL AND yes_at IS NULL AND details_at IS NULL AND order_at IS NULL)::int AS stalled_welcome,
 COUNT(*) FILTER(WHERE product_at IS NOT NULL AND yes_at IS NULL AND details_at IS NULL AND order_at IS NULL)::int AS stalled_product,
 COUNT(*) FILTER(WHERE yes_at IS NOT NULL AND details_at IS NULL AND order_at IS NULL)::int AS stalled_yes,
 COUNT(*) FILTER(WHERE details_at IS NOT NULL AND order_at IS NULL)::int AS stalled_details ${cohort}`)).rows[0];
 const failed=(await db.query(`SELECT COUNT(*)::int AS n FROM wa_funnel_progress f JOIN wa_messages w ON w.id=f.welcome_message_id WHERE w.status='failed'`)).rows[0].n;
 const contacts=(await db.query(`WITH bounds AS (SELECT date_trunc('day',NOW() AT TIME ZONE 'Asia/Karachi') AS today)
 SELECT COUNT(DISTINCT phone) FILTER (WHERE created_at >= (today AT TIME ZONE 'Asia/Karachi'))::int AS today,
 COUNT(DISTINCT phone) FILTER (WHERE created_at >= ((today - INTERVAL '6 days') AT TIME ZONE 'Asia/Karachi'))::int AS last7,
 COUNT(DISTINCT phone)::int AS last30
 FROM wa_messages CROSS JOIN bounds WHERE direction='inbound' AND created_at >= ((today - INTERVAL '29 days') AT TIME ZONE 'Asia/Karachi') AND created_at <= NOW()`)).rows[0];
 return {contacts,started_at:started,counts:row,failed_welcome:failed,unit:'unique_customers',history:'new_tracking_only'};
}
function condition(stage){
 if(stage==='welcome')return 'TRUE';
 if(columns[stage])return `f.${columns[stage]} IS NOT NULL`;
 return ({stalled_welcome:'f.product_at IS NULL AND f.yes_at IS NULL AND f.details_at IS NULL AND f.order_at IS NULL',stalled_product:'f.product_at IS NOT NULL AND f.yes_at IS NULL AND f.details_at IS NULL AND f.order_at IS NULL',stalled_yes:'f.yes_at IS NOT NULL AND f.details_at IS NULL AND f.order_at IS NULL',stalled_details:'f.details_at IS NOT NULL AND f.order_at IS NULL'})[stage];
}
async function customers(db,stage,cursor='0'){
 const where=condition(stage);if(!where||!/^\d{1,6}$/.test(String(cursor))||Number(cursor)>100000){const e=new Error('Invalid tracking filter');e.status=400;throw e;}
 const rows=(await db.query(`SELECT f.phone,c.name,f.product_id,p.name AS product_name,f.order_id,f.welcome_at,f.product_at,f.yes_at,f.details_at,f.order_at,f.representative_at,f.last_event_at,c.paused,
 (SELECT body FROM wa_messages m WHERE m.phone=f.phone ORDER BY m.id DESC LIMIT 1) AS last_message
 FROM wa_funnel_progress f JOIN wa_messages w ON w.id=f.welcome_message_id LEFT JOIN wa_chats c ON c.phone=f.phone LEFT JOIN products p ON p.id::text=f.product_id
 WHERE w.status IN ('sent','delivered','read') AND (${where}) ORDER BY f.last_event_at DESC,f.phone LIMIT 51 OFFSET $1`,[Number(cursor)])).rows;
 return {customers:rows.slice(0,50),next_cursor:rows.length>50?String(Number(cursor)+50):null};
}
module.exports={schema,events,record,summary,customers,stages};
