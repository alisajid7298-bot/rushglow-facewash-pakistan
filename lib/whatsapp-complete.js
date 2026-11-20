'use strict';
const service=require('./whatsapp-service');
const completeText=id=>'آپ کا آرڈر #'+id+' مکمل ہو گیا ہے۔ رش گلو سے خریداری کا شکریہ!';
// Only exact completion messages sent by the verified business app are commands.
function completionOrder(text){
 const s=String(text||'').trim().replace(/[۰-۹٠-٩]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.includes(c)?'۰۱۲۳۴۵۶۷۸۹'.indexOf(c):'٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
 return /^(?:Order\s+#?([1-9][0-9]{0,17})\s+completed[.!]?|آپ کا آرڈر\s+#?([1-9][0-9]{0,17})\s+مکمل ہو گیا ہے[۔.!]?(?:\s+رش گلو سے خریداری کا شکریہ!)?)$/i.exec(s)?.slice(1).find(Boolean)||null;
}
function isShortCompletion(text){return /^(?:complete|completed|compalet|complate|compl[e]?t)[.!]?$/i.test(String(text||'').trim());}
// Called inside the verified owner echo transaction, only on a newly saved echo.
async function completeSingleOrder(db,phone){
 const orders=(await db.query(`SELECT o.id FROM orders o JOIN wa_messages original ON original.meta_id=o.wa_message_id AND original.direction='inbound'
  WHERE original.phone=$1 AND COALESCE(o.status,'Pending') IN ('Pending','Paid','Packed','Shipped','Out for Delivery')
  ORDER BY o.id FOR UPDATE OF o`,[phone])).rows;
 if(orders.length!==1)return false;
 const id=orders[0].id;
 await db.query("UPDATE orders SET status='Delivery Complete' WHERE id=$1",[id]);
 const chat=(await db.query('SELECT last_inbound FROM wa_chats WHERE phone=$1',[phone])).rows[0];
 const age=chat?.last_inbound?Date.now()-new Date(chat.last_inbound).getTime():Infinity;
 if(!process.env.WA_ACCESS_TOKEN||!process.env.WA_PHONE_NUMBER_ID||!Number.isFinite(age)||age<0||age>=23.9*3600000)return false;
 const messageId=await service.enqueue(db,phone,{type:'text',text:{body:completeText(id)}},'order_update');
 await db.query('UPDATE orders SET wa_completed_message_id=$2 WHERE id=$1',[id,messageId]);
 return true;
}
async function markComplete(pool,id,ownerEcho=null){
 if(!/^[1-9][0-9]{0,17}$/.test(String(id||''))){const e=new Error('Invalid order number');e.status=400;throw e;}
 const db=await pool.connect();let phone,messageId,blocked;
 try{
  await db.query('BEGIN');
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['rushglow-complete:'+id]);
  const order=(await db.query(`SELECT o.id,o.status,o.wa_completed_message_id,original.phone AS chat_phone
   FROM orders o LEFT JOIN wa_messages original ON original.meta_id=o.wa_message_id AND original.direction='inbound'
   WHERE o.id=$1 FOR UPDATE OF o`,[id])).rows[0];
  if(!order){const e=new Error('Order not found');e.status=404;throw e;}
  if(!['Pending','Paid','Packed','Shipped','Out for Delivery','Delivery Complete'].includes(order.status||'Pending')){const e=new Error('This order cannot be completed from its current status.');e.status=409;throw e;}
  phone=order.chat_phone;
  // Signed owner messages may only change the order belonging to that recipient.
  if(ownerEcho){
   const echo=(await db.query("SELECT id FROM wa_messages WHERE meta_id=$1 AND phone=$2 AND direction='app_owner'",[ownerEcho.metaId,ownerEcho.phone])).rows[0];
   if(!echo||!phone||phone!==ownerEcho.phone){await db.query('ROLLBACK');return {ignored:true};}
   messageId=order.wa_completed_message_id||echo.id;
  }else messageId=order.wa_completed_message_id;
  await db.query("UPDATE orders SET status='Delivery Complete' WHERE id=$1",[id]);
  if(ownerEcho)await db.query('UPDATE orders SET wa_completed_message_id=COALESCE(wa_completed_message_id,$2) WHERE id=$1',[id,messageId]);
  else if(!messageId){
   const chat=phone?(await db.query('SELECT last_inbound FROM wa_chats WHERE phone=$1',[phone])).rows[0]:null;
   const age=chat?.last_inbound?Date.now()-new Date(chat.last_inbound).getTime():Infinity;
   if(!phone)blocked={notification_status:'not_linked',notification_error:'Order completed. No linked WhatsApp customer chat; no message was sent.'};
   else if(!process.env.WA_ACCESS_TOKEN||!process.env.WA_PHONE_NUMBER_ID)blocked={notification_status:'not_connected',notification_error:'Order completed. WhatsApp is not connected; no message was sent.'};
   else if(!Number.isFinite(age)||age<0||age>=23.9*3600000)blocked={notification_status:'window_closed',notification_error:'Order completed. Customer must message again before this free WhatsApp update can be sent. You can send the completion message manually from the owner WhatsApp Business app.'};
   else{
    messageId=await service.enqueue(db,phone,{type:'text',text:{body:completeText(id)}},'order_update');
    await db.query('UPDATE orders SET wa_completed_message_id=$2 WHERE id=$1',[id,messageId]);
   }
  }
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 if(blocked)return {id:String(id),order_status:'Delivery Complete',...blocked};
 if(!ownerEcho)await service.flush(pool,phone);
 const notification=(await pool.query('SELECT status,error FROM wa_messages WHERE id=$1',[messageId])).rows[0];
 return {id:String(id),order_status:'Delivery Complete',notification_status:notification?.status||'queued',notification_error:notification?.error||null};
}
module.exports={completeText,completionOrder,isShortCompletion,completeSingleOrder,markComplete};
