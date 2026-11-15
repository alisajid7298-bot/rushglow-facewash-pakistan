'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),bot=require('../lib/whatsapp-bot');
test('Each photo card YES chooses its own product and moves directly to details',()=>{
 const products=[{id:24,name:'FaceWash',price:1200},{id:23,name:'Skin Polish',price:1500},{id:22,name:'Whitening Serum',price:2000},{id:52,name:'FaceWash Serum Skin Polish',price:4700}].map(p=>({...p,photo:'image',stock:20}));
 const cards=bot.catalog(products).slice(1);assert.equal(cards.length,4);
 for(const [i,card]of cards.entries()){
  assert.match(card.interactive.body.text,/کیا آپ یہ پروڈکٹ آرڈر کرنا چاہتے ہیں/);
  assert.equal(card.interactive.header.type,'image');
  const buttons=card.interactive.action.buttons;assert.equal(buttons[0].reply.title,'جی ہاں');assert.equal(buttons[1].reply.title,'منسوخ کریں');
  const next=bot.advance({stage:'payment',productId:'old'}, {action:buttons[0].reply.id},products,'Sajid');
  assert.equal(next.state.productId,String(products[i].id));assert.equal(next.state.stage,'details');assert.equal(next.state.unitPrice,products[i].price);assert.equal(next.order,undefined);
  assert.deepEqual(bot.advance(next.state,{action:'cancel'},products,'Sajid').state,{});
 }
 assert.equal(cards.at(-1).interactive.action.buttons.at(-1).reply.id,'representative');
 assert.equal(cards.slice(0,-1).some(c=>c.interactive.action.buttons.some(b=>b.reply.id==='representative')),false);
 const unavailable=bot.advance({}, {action:'order_product:24'},products.map(p=>({...p,stock:0})),'Sajid');assert.equal(unavailable.state.productId,undefined);
});
