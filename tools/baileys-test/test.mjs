import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {advance,delivery}=require('../../lib/whatsapp-bot.js');
const expected='923427278255';
const allowed=new Set((process.env.TEST_CUSTOMER_NUMBERS||'').split(',').map(s=>s.replace(/\D/g,'')).filter(Boolean));
if(!allowed.size) throw Error('Set TEST_CUSTOMER_NUMBERS to the OTHER phone that will send test messages.');
const {state,saveCreds}=await useMultiFileAuthState('./private-session');
const chats=new Map(),seen=new Set();
const products=await fetch('https://rushglow.org/api/products').then(r=>{if(!r.ok)throw Error('Catalog unavailable');return r.json()}).then(r=>Array.isArray(r)?r:r.products);
if(!Array.isArray(products))throw Error('Catalog response format unsupported');
let reconnecting=false;
async function start(){
const sock=makeWASocket({auth:state,logger:pino({level:'silent'}),syncFullHistory:false,markOnlineOnConnect:false});
sock.ev.on('creds.update',saveCreds);
sock.ev.on('connection.update',async u=>{
if(u.qr){console.log('Scan ONLY with 03427278255, WhatsApp > Linked devices.');qrcode.generate(u.qr,{small:true});}
if(u.connection==='open'){
const actual=sock.user?.id?.split(':')[0]?.split('@')[0];
if(actual!==expected){console.error('Wrong account linked. Bot stopped. Unlink this device on your phone.');sock.end(Error('Wrong account'));return;}
console.log('CONNECTED: test account only. Send MENU from the allowed OTHER phone.');
}
if(u.connection==='close'&&!reconnecting){
const code=u.lastDisconnect?.error?.output?.statusCode;
if(code!==DisconnectReason.loggedOut && code!==undefined){reconnecting=true;setTimeout(()=>{reconnecting=false;start().catch(console.error)},4000);}
}});
async function send(jid,m){
if(m.type==='text')return sock.sendMessage(jid,{text:m.text.body});
const x=m.interactive;
if(x.header?.image?.link)await sock.sendMessage(jid,{image:{url:x.header.image.link}});
if(x.type==='list'){
await sock.sendMessage(jid,{text:x.body.text+'\n\n'+x.action.sections.flatMap(s=>s.rows).map((r,i)=>(i+1)+'. '+r.title+' — '+r.description).join('\n')+'\n\nProduct ka number likhein.'});return;
}
await sock.sendMessage(jid,{text:x.body.text+'\n\n'+x.action.buttons.map(b=>b.reply.title+' (likhein: '+b.reply.id+')').join('\n')});
}
sock.ev.on('messages.upsert',async ({messages,type})=>{
if(type!=='notify')return;
for(const m of messages){
const jid=m.key.remoteJid||'';
if(!jid.endsWith('@s.whatsapp.net')||m.key.fromMe||!allowed.has(jid.split('@')[0])||seen.has(m.key.id))continue;
if(sock.user?.id?.split(':')[0]?.split('@')[0]!==expected)continue;
seen.add(m.key.id);if(seen.size>1000)seen.delete(seen.values().next().value);
let value=m.message?.conversation||m.message?.extendedTextMessage?.text;
if(!value)continue;
try{
let action=value.trim().toLowerCase();
if(/^\d+$/.test(action)){const available=products.filter(p=>Number(p.stock)>0).slice(0,10);const p=available[Number(action)-1];if(p)action='product:'+p.id;}
const result=advance(chats.get(jid),{text:value,action},products,m.pushName);
chats.set(jid,result.state);
for(const msg of result.messages)await send(jid,msg);
if(result.order){
await sock.sendMessage(jid,{text:'DEMO order complete. Total Rs '+(result.state.unitPrice+delivery(result.state.city))+'. Yeh test hai: real order save nahi hua aur payment na bhejein.'});
chats.delete(jid);
}
}catch(e){console.error('Test reply failed:',e.message);}
}
});
}
await start();
