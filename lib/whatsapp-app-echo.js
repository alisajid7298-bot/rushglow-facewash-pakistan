'use strict';
// Called only for signed smb_message_echoes events scoped to our phone number ID.
async function record(pool,message,businessPhone,profile=''){
 const phone=String(message.to||'').replace(/^\+/,''),sender=String(message.from||'').replace(/^\+/,''),owner=String(businessPhone||'').replace(/\D/g,'');
 if(!/^\d{8,15}$/.test(phone)||!message.id||!owner||sender!==owner||phone===owner)return;
 const timestamp=Number(message.timestamp);if(!Number.isFinite(timestamp)||timestamp<=0)return;
 const type=String(message.type||'unknown');
 const reaction=type==='reaction'?{emoji:String(message.reaction?.emoji||'').slice(0,64),message_id:String(message.reaction?.message_id||'').slice(0,500)}:null;
 const labels={image:'Photo sent from WhatsApp Business app',audio:'Voice/audio sent from WhatsApp Business app',video:'Video sent from WhatsApp Business app',document:'Document sent from WhatsApp Business app',sticker:'Sticker sent from WhatsApp Business app',location:'Location sent from WhatsApp Business app',contacts:'Contact sent from WhatsApp Business app'};
 const text=reaction?(reaction.emoji?'Reaction: '+reaction.emoji:'Reaction removed'):(message.text?.body||message.image?.caption||message.video?.caption||message.document?.caption||message.button?.text||message.interactive?.body?.text||labels[type]||'Message sent from WhatsApp Business app (content unavailable from Meta)');
 const mediaId=type==='image'?message.image?.id||null:type==='audio'?message.audio?.id||null:type==='video'?message.video?.id||null:type==='sticker'?message.sticker?.id||null:null;
 const payload={type,source:'whatsapp_business_app',...(reaction?{reaction}:{}),...(message.errors?.length?{errors:message.errors.slice(0,5).map(e=>({code:e.code,details:String(e.error_data?.details||e.message||e.title||'').slice(0,600)}))}:{})};
 const db=await pool.connect();
 try{
  await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['rushglow-wa:'+phone]);
  const saved=await db.query("INSERT INTO wa_messages(meta_id,phone,direction,body,media_id,payload,status,created_at) VALUES($1,$2,'app_owner',$3,$4,$5,'sent',to_timestamp($6)) ON CONFLICT(meta_id) DO NOTHING RETURNING id",[String(message.id),phone,String(text).slice(0,20000),mediaId,JSON.stringify(payload),timestamp]);
  if(saved.rows.length){
   // Human replies take over the conversation without opening/extending the
   // customer's API service window or changing their order/checkout state.
   await db.query("INSERT INTO wa_chats(phone,name,paused) VALUES($1,$2,TRUE) ON CONFLICT(phone) DO UPDATE SET name=CASE WHEN wa_chats.name='' THEN $2 ELSE wa_chats.name END,paused=TRUE,updated_at=NOW()",[phone,String(profile||'').slice(0,100)]);
  }
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 const completion=require('./whatsapp-complete');
 const orderId=type==='text'?completion.completionOrder(text):null;
 if(orderId){try{await completion.markComplete(pool,orderId,{phone,metaId:String(message.id)});}catch(e){if(!e.status)throw e;}}
}
module.exports={record};

