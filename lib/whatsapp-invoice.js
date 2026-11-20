'use strict';
const service=require('./whatsapp-service');
const crypto=require('node:crypto');
const MAX_BYTES=2500000;
function fail(status,message){throw Object.assign(new Error(message),{status});}
function readPdf(encoded){
 if(typeof encoded!=='string'||encoded.length>Math.ceil(MAX_BYTES/3)*4||! /^[A-Za-z0-9+/]+={0,2}$/.test(encoded))fail(400,'Choose a PDF invoice up to 2.5 MB.');
 const pdf=Buffer.from(encoded,'base64');
 if(pdf.length>MAX_BYTES||pdf.subarray(0,5).toString()!=='%PDF-')fail(400,'Choose a valid PDF invoice.');
 return pdf;
}
async function send(pool,body){
 const id=String(body.id||''),phone=String(body.phone||'');
 if(!/^[1-9]\d{0,17}$/.test(id)||!/^\d{8,15}$/.test(phone))fail(400,'Invalid order or customer.');
 const pdf=readPdf(body.pdf),hash=crypto.createHash('sha256').update(pdf).digest('hex');
 if(!process.env.WA_ACCESS_TOKEN||!process.env.WA_PHONE_NUMBER_ID)fail(409,'WhatsApp is not connected.');
 const db=await pool.connect();let messageId;
 try{
  await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['rushglow-wa:'+phone]);
  const order=(await db.query("SELECT o.id,c.last_inbound FROM orders o JOIN wa_messages original ON original.meta_id=o.wa_message_id AND original.direction='inbound' JOIN wa_chats c ON c.phone=original.phone WHERE o.id=$1 AND c.phone=$2",[id,phone])).rows[0];
  if(!order)fail(404,'Order does not belong to this customer chat.');
  const age=Date.now()-new Date(order.last_inbound).getTime();
  if(!order.last_inbound||!Number.isFinite(age)||age<0||age>=23.9*3600000)fail(409,'Customer must send a new message before you can send the invoice.');
  const caption='RushGlow — Invoice for Order #'+id,filename='RushGlow-Order-'+id+'.pdf';
  const previous=(await db.query("SELECT id,status,error FROM wa_messages WHERE phone=$1 AND direction='human' AND body=$2 AND payload->>'invoice_hash'=$3 ORDER BY id DESC LIMIT 1",[phone,caption,hash])).rows[0];
  if(previous){await db.query('COMMIT');return {status:previous.status,error:previous.error,already:true};}
  const form=new FormData();form.append('messaging_product','whatsapp');form.append('type','application/pdf');form.append('file',new Blob([pdf],{type:'application/pdf'}),filename);
  const response=await fetch('https://graph.facebook.com/v25.0/'+process.env.WA_PHONE_NUMBER_ID+'/media',{method:'POST',headers:{Authorization:'Bearer '+process.env.WA_ACCESS_TOKEN},body:form,signal:AbortSignal.timeout(15000)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!/^\d{1,30}$/.test(String(data.id||'')))fail(502,'Invoice upload failed. '+service.metaError(data.error||{code:response.status}));
  const payload={type:'document',document:{id:String(data.id),filename,caption}};
  messageId=(await db.query("INSERT INTO wa_messages(phone,direction,body,media_id,payload,status) VALUES($1,'human',$2,$3,$4,'sending') RETURNING id",[phone,caption,String(data.id),JSON.stringify({...payload,invoice_hash:hash})])).rows[0].id;
  await db.query('COMMIT');
  try{
   const result=await service.graph(process.env.WA_PHONE_NUMBER_ID+'/messages',{method:'POST',body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:phone,...payload})});
   await db.query("UPDATE wa_messages SET status='sent',meta_id=$2 WHERE id=$1",[messageId,result.messages?.[0]?.id||null]);
  }catch(e){await db.query("UPDATE wa_messages SET status='failed',error=$2 WHERE id=$1",[messageId,e.metaDescription||'Delivery uncertain; check WhatsApp before sending again.']);}
  return (await db.query('SELECT status,error FROM wa_messages WHERE id=$1',[messageId])).rows[0];
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
}
module.exports={send,readPdf};
