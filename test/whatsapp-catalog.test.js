'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),bot=require('../lib/whatsapp-bot');
const products=[{id:52,name:'FaceWash + Serum + Skin Polish',price:4700},{id:22,name:'Whitening Serum',price:2000},{id:23,name:'Skin Polish',price:1500},{id:24,name:'FaceWash',price:1200},{id:41,name:'FaceWash + Skin Polish',price:2450}].map(p=>({...p,stock:500,photo:'photo.jpg'}));
test('Welcome directly displays ordered image cards with selectable products and representative',()=>{
 const result=bot.advance({}, {text:'MENU'},products,'Ali');
 assert.equal(result.messages.length,5);
 assert.match(result.messages[0].text.body,/خوش آمدید/);
 const cards=result.messages.slice(1,5);
 assert.deepEqual(cards.map(c=>c.interactive.action.buttons[0].reply.id),['order_product:24','order_product:23','order_product:22','order_product:52']);
 assert.deepEqual(cards.map(c=>c.interactive.body.text.split('\n\n')[0]),['RUSHGLOW FACEWASH\nقیمت: 1200 روپے','RUSHGLOW SKIN POLISH\nقیمت: 1500 روپے','RUSHGLOW WHITENING SERUM\nقیمت: 2000 روپے','COMBO KIT (Face wash+ Serum + Skin Polish)\nقیمت: 4700 روپے']);
 for(const c of cards){assert.equal(c.interactive.header.type,'image');assert.match(c.interactive.header.image.link,/https:\/\/rushglow.org\/api\/whatsapp\?image=\d+$/);assert.equal(c.interactive.type,'button');}
 assert.equal(result.messages[4].interactive.action.buttons.at(-1).reply.id,'representative');
 for(const c of result.messages.filter(c=>c.interactive))for(const button of c.interactive.action.buttons)assert.ok(button.reply.title.length<=20);
 const selected=bot.advance({}, {action:'product:23'},products,'Ali');assert.equal(selected.state.productId,'23');assert.match(selected.messages[0].interactive.body.text,/آرڈر کرنا چاہتے/);
 const yes=bot.advance(selected.state,{action:'yes'},products,'Ali');assert.equal(yes.state.stage,'details');
 assert.equal(bot.advance({}, {action:'representative'},products,'Ali').handoff,true);
});
test('Out of stock cards are excluded and remaining actions stay usable',()=>{
 const messages=bot.catalog(products.map(p=>({...p,stock:p.id===24?0:p.stock})));
 assert.equal(messages.length,4);assert.equal(messages[1].interactive.action.buttons[0].reply.id,'order_product:23');
});
