'use strict';
const service=require('./whatsapp-service');
const MAX_BYTES=4000000;
// The calling route requires the existing admin session before reaching here.
async function serve(pool,req,res){
 const id=String(req.query?.id||'');
 if(!/^\d{1,30}$/.test(id))return res.status(400).json({error:'Invalid media ID'});
 const saved=(await pool.query("SELECT id,payload->>'type' AS message_type FROM wa_messages WHERE media_id=$1 LIMIT 1",[id])).rows[0];
 if(!saved)return res.status(404).json({error:'Media not found in this inbox'});
 const audio=saved.message_type==='audio',video=saved.message_type==='video';
 const media=await service.graph(id);const url=new URL(media.url);
 if(url.protocol!=='https:'||!/(^|\.)(facebook\.com|fbsbx\.com|fbcdn\.net)$/.test(url.hostname))return res.status(502).json({error:'Invalid media source'});
 const response=await fetch(url,{headers:{Authorization:'Bearer '+process.env.WA_ACCESS_TOKEN},signal:AbortSignal.timeout(15000),redirect:'error'});
 if(!response.ok)return res.status(502).json({error:'Media is no longer available from Meta'});
 const contentType=(response.headers.get('content-type')||'').toLowerCase(),type=contentType.split(';')[0].trim();
 const allowed=video?['video/mp4','video/3gpp']:audio?['audio/aac','audio/amr','audio/mpeg','audio/mp4','audio/ogg','audio/opus','audio/webm','application/ogg']:['image/jpeg','image/png','image/webp'];
 if(!allowed.includes(type))return res.status(415).json({error:'Unsupported media format'});
 if(Number(response.headers.get('content-length'))>MAX_BYTES){await response.body?.cancel();return res.status(413).json({error:'This file exceeds the 4 MB inbox playback limit. Open it in WhatsApp.'});}
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();return res.status(413).json({error:'This file exceeds the 4 MB inbox playback limit. Open it in WhatsApp.'});}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
 const data=Buffer.concat(chunks,size);res.setHeader('Content-Type',audio?(type==='application/ogg'?'audio/ogg':type):type);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','private, no-store');res.setHeader('Accept-Ranges','bytes');
 const range=req.headers.range;
 if(range){
  const match=/^bytes=(\d*)-(\d*)$/.exec(range);let start=0,end=data.length-1;
  if(match&&(match[1]||match[2])){if(match[1]){start=Number(match[1]);if(match[2])end=Math.min(Number(match[2]),end);}else start=Math.max(0,data.length-Number(match[2]));}
  else start=NaN;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=data.length||end<start){res.setHeader('Content-Range','bytes */'+data.length);return res.status(416).end();}
  res.setHeader('Content-Range','bytes '+start+'-'+end+'/'+data.length);res.setHeader('Content-Length',end-start+1);return res.status(206).send(data.subarray(start,end+1));
 }
 res.setHeader('Content-Length',data.length);return res.send(data);
}
module.exports={serve};
