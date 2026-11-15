'use strict';
const service=require('./whatsapp-service');
const packedText=id=>'Your order #'+id+' has been packed and is ready for dispatch. Thank you for shopping with RUSHGLOW!';
async function ordersForChat(pool,phone){
 return (await pool.query(`SELECT o.id,o.product_name,o.price,o.status,o.wa_packed_message_id,
 n.status AS packed_notification_status,n.error AS packed_notification_error
 FROM orders o JOIN wa_messages original ON original.meta_id=o.wa_message_id AND original.direction='inbound'
 LEFT JOIN wa_messages n ON n.id=o.wa_packed_message_id
 WHERE original.phone=$1 ORDER BY o.id DESC LIMIT 10`,[phone])).rows;
}
async function markPacked(pool,id){
 if(!/^[1-9][0-9]{0,17}$/.test(String(id||''))){const e=new Error('Invalid order number');e.status=400;throw e;}
 const db=await pool.connect();let phone,messageId,blocked;
 try{
  await db.query('BEGIN');
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['rushglow-packed:'+id]);
  const order=(await db.query(`SELECT o.id,o.status,o.wa_packed_message_id,original.phone AS chat_phone
   FROM orders o LEFT JOIN wa_messages original ON original.meta_id=o.wa_message_id AND original.direction='inbound'
   WHERE o.id=$1 FOR UPDATE OF o`,[id])).rows[0];
  if(!order){const e=new Error('Order not found');e.status=404;throw e;}
  if(!order.chat_phone){const e=new Error('This order is not linked to a WhatsApp customer chat.');e.status=409;throw e;}
  if(!['Pending','Paid','Packed'].includes(order.status||'Pending')){const e=new Error('This order has already moved beyond packing. Its status has not been changed.');e.status=409;throw e;}
  phone=order.chat_phone;
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['rushglow-wa:'+phone]);
  await db.query("UPDATE orders SET status='Packed' WHERE id=$1",[id]);
  messageId=order.wa_packed_message_id;
  if(!messageId){
   const chat=(await db.query('SELECT last_inbound FROM wa_chats WHERE phone=$1',[phone])).rows[0];
   const age=chat?.last_inbound?Date.now()-new Date(chat.last_inbound).getTime():Infinity;
   if(!process.env.WA_ACCESS_TOKEN||!process.env.WA_PHONE_NUMBER_ID)blocked={notification_status:'not_connected',notification_error:'Order marked Packed. WhatsApp is not connected; no message was sent.'};
   else if(!Number.isFinite(age)||age<0||age>=23.9*3600000)blocked={notification_status:'window_closed',notification_error:'Order marked Packed. Customer must message again before this free WhatsApp update can be sent. An approved template is required outside the 24-hour window.'};
   else{
    messageId=await service.enqueue(db,phone,{type:'text',text:{body:packedText(id)}},'order_update');
    await db.query('UPDATE orders SET wa_packed_message_id=$2 WHERE id=$1',[id,messageId]);
   }
  }
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 if(blocked)return {id:String(id),order_status:'Packed',...blocked};
 // A stored message ID makes repeated clicks reuse the same update. Failed or
 // uncertain deliveries are never automatically retried.
 await service.flush(pool,phone);
 const notification=(await pool.query('SELECT status,error FROM wa_messages WHERE id=$1',[messageId])).rows[0];
 return {id:String(id),order_status:'Packed',notification_status:notification?.status||'queued',notification_error:notification?.error||null};
}
module.exports={packedText,ordersForChat,markPacked};
