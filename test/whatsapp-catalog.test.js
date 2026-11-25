'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),bot=require('../lib/whatsapp-bot');
const products=[{id:52,name:'FaceWash Serum Skin Polish',price:4700},{id:22,name:'Whitening Serum',price:2000},{id:23,name:'Skin Polish',price:1500},{id:24,name:'FaceWash',price:1200},{id:41,name:'FaceWash Skin Polish',price:2450}].map(p=>({...p,stock:500,photo:'photo.jpg'}));
test('One welcome text directly displays numbered products without View Products',()=>{
 const messages=bot.advance({}, {text:'Hi'},products,'Ali').messages;
 assert.equal(messages.length,1);assert.equal(messages[0].type,'image');assert.equal(messages[0].image.link,'https://rushglow.org/api/whatsapp?image=52');const body=messages[0].image.caption;assert.ok(body.length<900);
 assert.match(body,/خوش آمدید/);assert.ok(!body.includes('View Products'));
 let previous=-1;for(const name of ['1. RUSHGLOW FACEWASH','2. RUSHGLOW SKIN POLISH','3. RUSHGLOW WHITENING SERUM','4. COMBO KIT','5. نمائندے سے بات کریں']){const i=body.indexOf(name);assert.ok(i>previous);previous=i;}
 for(const n of [1200,1500,2000,4700])assert.ok(body.includes('قیمت: '+n+' روپے'));
 for(const [index,id]of ['24','23','22','52'].entries())for(const number of [String(index+1),'۱۲۳۴'[index],'١٢٣٤'[index]]){
  const selected=bot.advance({}, {text:number},products,'Ali');assert.equal(selected.state.productId,id);assert.equal(selected.state.stage,'confirm');assert.equal(selected.messages[0].interactive.header.type,'image');
  assert.equal(bot.advance(selected.state,{action:'yes'},products,'Ali').state.stage,'details');
 }
 assert.equal(bot.advance({}, {text:'5'},products,'Ali').handoff,true);assert.equal(bot.advance({}, {text:'۵'},products,'Ali').handoff,true);
 const oldButton=bot.advance({}, {action:'product:24'},products,'Ali');assert.equal(oldButton.state.productId,'24');
});
test('Stock changes never renumber products and numeric checkout data is not a menu selection',()=>{
 const changed=products.map(p=>({...p,stock:p.id===24?0:p.stock}));const body=bot.catalog(changed)[0].image.caption;assert.ok(!body.includes('1. RUSHGLOW FACEWASH'));assert.ok(body.includes('2. RUSHGLOW SKIN POLISH'));
 assert.equal(bot.advance({}, {text:'1'},changed,'Ali').state.productId,undefined);assert.equal(bot.advance({}, {text:'2'},changed,'Ali').state.productId,'23');
 for(const stage of ['details','city','payment','proof']){const r=bot.advance({stage,productId:'24',unitPrice:1200},{text:'5'},products,'Ali');assert.equal(r.handoff,undefined);assert.equal(r.state.productId,'24');}
});

test('Product names and numbers recover stale checkout and confirm COD',()=>{
 for(const stage of ['human','details','city','payment','proof','unknown'])for(const [i,id] of ['24','23','22','52'].entries())for(const value of [String(i+1),['Facewash','Skin Polish','Whitening Serum','Combo Kit'][i]]){
 const r=bot.advance({stage,productId:'old'},{text:value},products,'Ali');assert.equal(r.state.productId,id);assert.equal(r.state.stage,'confirm');
 const done=bot.advance(r.state,{text:'03000000000\nAddress: House 12 Main Road\nCity: Swabi'},products,'Ali');assert.equal(done.order,true);assert.equal(done.state.payment,'Cash on Delivery');
 }
});
