'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('Admin counters open their matching customer groups and safe inbox links',async()=>{
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.style={};this.dataset={};this.attrs={};this.hidden=false;this.textContent='';}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=[...nodes];}
  setAttribute(k,v){this.attrs[k]=v;}
  querySelectorAll(){return Object.values(elements).filter(e=>e.tagName==='button'&&e.dataset.stage).concat(...Object.values(elements).map(e=>e.children.filter(c=>c.tagName==='button'&&c.dataset.stage)));}
 }
 const ids=['adminApp','waFunnel','waFunnelMeta','waFunnelCounts','waFunnelWaiting','waFunnelFailures','waFunnelNotice','waFunnelCustomers','waFunnelListTitle','waFunnelList','waFunnelListNotice','waFunnelMore','waFunnelRefresh'];const elements=Object.fromEntries(ids.map(id=>[id,new Element('div')]));elements.adminApp.style.display='none';
 const calls=[];const context={document:{getElementById:id=>elements[id],createElement:tag=>new Element(tag),hidden:false},window:{addEventListener(){}},setInterval(){},Date,encodeURIComponent,console,fetch:async url=>{calls.push(url);return {ok:true,json:async()=>url.includes('funnel_chats')?{customers:[{phone:'923001234567',name:'<img onerror=bad>',last_message:'<script>bad</script>',product_name:'FaceWash',product_at:'2026-11-16'}],next_cursor:null}:{started_at:'2026-11-16T00:00:00Z',counts:{welcome:10,product:5,yes:3,details:2,order:1,stalled_welcome:5,stalled_product:2,stalled_yes:1,stalled_details:1},failed_welcome:2}};}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../whatsapp-funnel-admin.js'),'utf8'),context);
 assert.equal(calls.length,0);elements.adminApp.style.display='block';await context.window.loadWhatsAppFunnel();assert.equal(elements.waFunnelCounts.children.length,5);assert.equal(elements.waFunnelWaiting.children.length,4);
 await elements.waFunnelWaiting.children[1].onclick();assert.ok(calls.at(-1).includes('stage=stalled_product'));assert.equal(elements.waFunnelList.children.length,1);const row=elements.waFunnelList.children[0];assert.equal(row.children[0].href,'/whatsapp-inbox.html?phone=923001234567');assert.ok(row.children[0].textContent.includes('<img onerror=bad>'));assert.equal(row.children[2].textContent,'<script>bad</script>');assert.equal(elements.waFunnelMore.hidden,true);
});
