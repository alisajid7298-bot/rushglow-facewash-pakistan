const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../lib/whatsapp-service'),'utf8');
test('Incoming video preserves its media ID and caption',()=>{
 const module={exports:{}};vm.runInNewContext(source+'\nmodule.exports.extract=extract;',{module,require:require('node:module').createRequire(require.resolve('../lib/whatsapp-service')),process,console});
 const input=module.exports.extract({type:'video',video:{id:'12345',caption:'My video'}});
 assert.equal(input.mediaId,'12345');assert.equal(input.text,'My video');assert.equal(input.video,true);
 assert.match(source,/input\.reaction\|\|input\.audio\|\|input\.video/);
});
function media(type,contentType,data,headers={}){
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../lib/whatsapp-media'),'utf8'),{module,process,require:()=>({graph:async()=>({url:'https://lookaside.fbsbx.com/media'})}),URL,AbortSignal,Buffer,fetch:async()=>new Response(data,{headers:{'Content-Type':contentType,...headers}})});
 const res={code:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(x){this.data=x;return this},send(x){this.data=x;return this},end(){return this}};
 return {res,run:range=>module.exports.serve({query:async()=>({rows:[{message_type:type}]})},{query:{id:'12345'},headers:range?{range}:{}},res)};
}
test('Video MP4 is served with seek ranges and private headers',async()=>{
 const c=media('video','video/mp4',Buffer.from('0123456789'));await c.run('bytes=2-5');assert.equal(c.res.code,206);assert.equal(c.res.data.toString(),'2345');assert.equal(c.res.headers['Content-Type'],'video/mp4');assert.equal(c.res.headers['Cache-Control'],'private, no-store');
});
test('Video rejects active content and files above the safe response limit',async()=>{
 const html=media('video','text/html','bad');await html.run();assert.equal(html.res.code,415);
 const big=media('video','video/mp4','data',{'Content-Length':'5000000'});await big.run();assert.equal(big.res.code,413);
});
test('Existing image and audio playback remain supported',async()=>{
 for(const [kind,mime] of [['image','image/jpeg'],['audio','audio/ogg']]){const c=media(kind,mime,'data');await c.run();assert.equal(c.res.code,200);assert.equal(c.res.headers['Content-Type'],mime)}
});
