'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),bot=require('../lib/whatsapp-bot');
const products=[{id:52,name:'FaceWash + Serum + Skin Polish',price:4700},{id:22,name:'Whitening Serum',price:2000},{id:23,name:'Skin Polish',price:1500},{id:24,name:'FaceWash',price:1200},{id:41,name:'FaceWash + Skin Polish',price:2450}].map(p=>({...p,stock:500,photo:'photo.jpg'}));
test('Welcome directly displays ordered image cards with selectable products and representative',()=>{
 const result=bot.advance({}, {text:'MENU'},products,'Ali');
 assert.equal(result.messages.length,1);
 assert.match(result.messages[0].interactive.body.text,/خوش آمدید/);
 const cards=result.messages[0].interactive.action.sections[0].rows.slice(0,4);
 assert.deepEqual(cards.map(c=>c.id),['product:24','product:23','product:22','product:52']);
 assert.deepEqual(cards.map(c=>c.title),['RUSHGLOW FACEWASH','RUSHGLOW SKIN POLISH','RUSHGLOW WHITENING SERUM','COMBO KIT']);
 assert.equal(result.messages[0].interactive.action.sections[0].rows.at(-1).id,'representative');
 for(const row of result.messages[0].interactive.action.sections[0].rows)assert.ok(row.title.length<=24);
 const selected=bot.advance({}, {action:'product:23'},products,'Ali');assert.equal(selected.state.productId,'23');assert.match(selected.messages[0].interactive.body.text,/آرڈر کرنا چاہتے/);
 const yes=bot.advance(selected.state,{action:'yes'},products,'Ali');assert.equal(yes.state.stage,'details');
 assert.equal(bot.advance({}, {action:'representative'},products,'Ali').handoff,true);
});
test('Out of stock cards are excluded and remaining actions stay usable',()=>{
 const messages=bot.catalog(products.map(p=>({...p,stock:p.id===24?0:p.stock})));
 assert.equal(messages.length,1);assert.equal(messages[0].interactive.action.sections[0].rows[0].id,'product:23');
});
