'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const service=require('../lib/whatsapp-service'),appEcho=require('../lib/whatsapp-app-echo'),media=require('../lib/whatsapp-media');
test('Incoming and owner voice messages retain audio IDs and leave checkout intact',async()=>{
 const pg=new PGlite(),db={query:async(sql,params)=>!params&&sql.includes(';')?(await pg.exec(sql)).at(-1):pg.query(sql,params),release(){}},pool={...db,connect:async()=>db};const previous=global.fetch;let sent=0;global.fetch=async()=>({ok:true,json:async()=>({messages:[{id:'audio-welcome-'+(++sent)}]})});
 try{
 await pg.exec('CREATE TABLE orders(id bigint);CREATE TABLE products(id bigint,name text,price text,stock int,photo text,bundle_ids text)');await service.schema(db);await db.query('UPDATE wa_settings SET enabled=TRUE');
 const phone='923001234567',state={stage:'payment',productId:'24'};await db.query('INSERT INTO wa_chats(phone,state) VALUES($1,$2)',[phone,JSON.stringify(state)]);
 const voice={id:'incoming-audio',from:phone,timestamp:String(Math.floor(Date.now()/1000)),type:'audio',audio:{id:'12345',mime_type:'audio/ogg; codecs=opus',voice:true}};
 await service.processMessage(pool,voice,'Ali');await service.processMessage(pool,voice,'Ali');let saved=(await db.query("SELECT * FROM wa_messages WHERE meta_id='incoming-audio'")).rows[0];assert.equal(saved.media_id,'12345');assert.equal(saved.payload.type,'audio');assert.equal(saved.body,'Voice message');assert.equal(sent,1);assert.deepEqual((await db.query('SELECT state FROM wa_chats WHERE phone=$1',[phone])).rows[0].state,state);assert.equal((await db.query('SELECT count(*)::int n FROM orders')).rows[0].n,0);
 await appEcho.record(pool,{...voice,id:'owner-audio',from:'923141913520',to:phone},'923141913520');saved=(await db.query("SELECT * FROM wa_messages WHERE meta_id='owner-audio'")).rows[0];assert.equal(saved.media_id,'12345');assert.equal(saved.direction,'app_owner');assert.equal(sent,1);
 }finally{global.fetch=previous;await pg.close();}
});
test('Media proxy supports audio, range seeking and rejects unsafe sources, formats and oversized files',async()=>{
 const oldGraph=service.graph,oldFetch=global.fetch;let known=true,mime='audio/ogg; codecs=opus',url='https://lookaside.fbsbx.com/audio',bytes=Buffer.from('audio-test-data');
 const pool={query:async()=>({rows:known?[{id:1,message_type:'audio'}]:[]})};service.graph=async()=>({url});global.fetch=async()=>new Response(bytes,{headers:{'Content-Type':mime,'Content-Length':String(bytes.length)}});
 const call=async(range)=>{const res={code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(c){this.code=c;return this;},send(data){this.data=data;return this;},json(data){this.data=data;return this;},end(){return this;}};await media.serve(pool,{query:{id:'12345'},headers:range?{range}:{}},res);return res;};
 try{
 let r=await call();assert.equal(r.code,200);assert.equal(r.headers['Content-Type'],'audio/ogg');assert.deepEqual(r.data,bytes);assert.equal(r.headers['Cache-Control'],'private, no-store');
 r=await call('bytes=2-5');assert.equal(r.code,206);assert.deepEqual(r.data,bytes.subarray(2,6));assert.equal(r.headers['Content-Range'],'bytes 2-5/15');
 r=await call('bytes=-4');assert.deepEqual(r.data,bytes.subarray(-4));assert.equal((await call('bytes=100-200')).code,416);assert.equal((await call('bytes=0-1,3-4')).code,416);
 url='https://attacker.example/audio';assert.equal((await call()).code,502);url='https://lookaside.fbsbx.com/audio';mime='text/html';assert.equal((await call()).code,415);mime='audio/ogg';bytes=Buffer.alloc(4000001);assert.equal((await call()).code,413);known=false;assert.equal((await call()).code,404);
 }finally{service.graph=oldGraph;global.fetch=oldFetch;}
});
test('Audio media route still requires admin authentication',async()=>{
 const module={exports:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../api/whatsapp'),'utf8'),{module,exports:module.exports,process,Buffer,console,URL,require:id=>id==='@neondatabase/serverless'?{Pool:function(){throw Error('Unauthenticated access must not reach database');}}:id==='../lib/whatsapp-service'?service:id==='../lib/whatsapp-bot'?require('../lib/whatsapp-bot'):require(id)});
 const res={code:200,setHeader(){},status(c){this.code=c;return this;},json(data){this.data=data;return this;}};await module.exports({method:'GET',query:{action:'media',id:'12345'},headers:{}},res);assert.equal(res.code,401);
});
test('Background inbox refresh keeps the same audio player and playback position',()=>{
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.style={};this.listeners={};this.currentTime=0;}
  append(...nodes){for(const n of nodes)this.insertBefore(n,null);}
  insertBefore(node,before){if(node.parent)node.remove();node.parent=this;this.children.splice(before?this.children.indexOf(before):this.children.length,0,node);}
  remove(){if(this.parent){this.parent.children.splice(this.parent.children.indexOf(this),1);this.parent=null;}}
  replaceChildren(...nodes){for(const n of [...this.children])n.remove();this.append(...nodes);}
  querySelector(selector){for(const n of this.children){if(selector.startsWith('.')?n.className===selector.slice(1):n.tagName===selector)return n;const found=n.querySelector(selector);if(found)return found;}return null;}
  setAttribute(){} addEventListener(type,fn){this.listeners[type]=fn;}
 }
 const moduleCode=fs.readFileSync(require.resolve('../whatsapp-inbox.html'),'utf8').split('function renderConversation(rows,log){')[1].split('async function messages(){')[0];
 const context={document:{createElement:tag=>new Element(tag)},Map,Set,Array,Date,encodeURIComponent};vm.createContext(context);vm.runInContext('function renderConversation(rows,log){'+moduleCode,context);
 const log=new Element('div'),row={id:1,direction:'inbound',body:'Voice message',message_type:'audio',media_id:'12345',created_at:new Date().toISOString(),status:'received'};
 context.renderConversation([row],log);const player=log.querySelector('audio');assert.ok(player);assert.equal(player.controls,true);assert.equal(player.preload,'none');player.currentTime=17;
 context.renderConversation([{...row,status:'read'},{...row,id:2,media_id:'67890'}],log);assert.equal(log.querySelector('audio'),player);assert.equal(player.currentTime,17);assert.equal(log.children.length,2);
});
