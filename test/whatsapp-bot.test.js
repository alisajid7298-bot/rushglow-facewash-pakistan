'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const bot=require('../lib/whatsapp-bot'),service=require('../lib/whatsapp-service');
const products=[{id:'1',name:'RushGlow Face Wash',price:'Rs 1,250',stock:3,photo:'data:image/jpeg;base64,YQ=='},{id:'2',name:'Sold out product',price:'500',stock:0}];
const step=(state,text,action)=>bot.advance(state,{text,action},products,'Ali');
function checkout(city){let r=step({},'','product:1');assert.equal(r.state.stage,'confirm');assert.ok(r.messages[0].interactive.header.image.link.endsWith('image=1'));r=step(r.state,'yes');assert.equal(r.state.stage,'details');r=step(r.state,'03141913520\nAddress: Mahalla Hadi Khel, Thand Koi\nCity: '+city);assert.equal(r.state.stage,'payment');return r;}
test('Product selection, confirmation, combined customer details and COD checkout',()=>{const r=checkout('Swabi');assert.equal(r.messages[0].interactive.body.text,'Please Select Your Payment Method:');const done=step(r.state,'','cod');assert.equal(done.order,true);assert.equal(done.state.phone,'03141913520');assert.equal(done.state.payment,'Cash on Delivery');});
test('Outside Swabi delivery is free and EasyPaisa proof requires verification',()=>{let r=checkout('Peshawar');assert.equal(bot.delivery('Peshawar'),0);r=step(r.state,'','easypaisa');assert.match(r.messages[0].text.body,/03409505282/);assert.match(r.messages[0].text.body,/manually/);assert.equal(r.order,undefined);r=step(r.state,'1234567890');assert.equal(r.order,true);assert.equal(r.state.transactionId,'1234567890');});
test('Address without a city asks for district before deciding delivery fee',()=>{let r=step({},'','product:1');r=step(r.state,'haan');r=step(r.state,'03141913520');assert.equal(r.state.stage,'details');r=step(r.state,'House 4, Main Bazar, Thand Koi');assert.equal(r.state.stage,'city');r=step(r.state,'Swabi');assert.equal(r.messages[0].interactive.body.text,'Please Select Your Payment Method:');});
test('Cancel clears pending customer details and cannot place an order',()=>{const r=step(checkout('Swabi').state,'cancel');assert.deepEqual(r.state,{});assert.equal(r.order,undefined);});
test('Sold out products cannot be selected and are absent from menu',()=>{const menu=step({},'menu');assert.equal(menu.messages[0].interactive.action.sections[0].rows.length,2);assert.equal(step({},'','product:2').state.stage,undefined);});
test('Human handoff pauses automation explicitly',()=>{const r=step({},'human');assert.equal(r.handoff,true);});
test('Delivery is free for every city and district',()=>{assert.equal(bot.delivery('Swabi'),0);assert.equal(bot.delivery('ضلع صوابی'),0);assert.equal(bot.delivery('Peshawar near Swabi road'),0);});
test('Webhook signature verifies exact bytes and rejects tampering or missing secret',()=>{const raw=Buffer.from('{ "entry": [] }'),secret='test-app-secret';const sig='sha256='+crypto.createHmac('sha256',secret).update(raw).digest('hex');assert.equal(service.validSignature(raw,sig,secret),true);assert.equal(service.validSignature(Buffer.from('{"entry":[]}'),sig,secret),false);assert.equal(service.validSignature(raw,sig,''),false);});
test('Admin cookie requires a valid unexpired HMAC',()=>{process.env.ADMIN_AUTH_SECRET='test-admin-key';const exp=String(Date.now()+10000),sig=crypto.createHmac('sha256','test-admin-key').update(exp).digest('hex');assert.equal(service.admin({headers:{cookie:'rg_admin='+exp+'.'+sig}}),true);assert.equal(service.admin({headers:{cookie:'rg_admin='+exp+'.bad'}}),false);assert.equal(service.admin({headers:{cookie:''}}),false);delete process.env.ADMIN_AUTH_SECRET;});


test('Catalog preserves approved wording, product order and valid WhatsApp row sizes',()=>{
 const p=[{id:52,name:'RushGlow FaceWash + Skin Polish Combo + RushGlow Whitening Serum',price:4700,stock:1},
 {id:41,name:'RushGlow FaceWash + Skin Polish Combo',price:2450,stock:1},
 {id:22,name:'RushGlow Whitening Serum',price:2000,stock:1},
 {id:23,name:'RushGlow Skin Polish',price:1500,stock:1},
 {id:24,name:'RushGlow FaceWash',price:1200,stock:1}];
 const m=bot.catalog(p).interactive;
 assert.equal(m.body.text,'Welcome to RUSHGLOW Beauty & Skincare!\nPlease Select a Product with Free Delivery.');
 assert.equal(m.action.button,'View Products');
 const rows=m.action.sections[0].rows;
 assert.deepEqual(rows.map(r=>r.id),['product:24','product:23','product:22','product:52','representative']);
 assert.equal(rows[0].title,'RUSHGLOW FACEWASH');
 assert.equal(rows[1].title,'RUSHGLOW SKIN POLISH');
 assert.equal(rows[2].title,'RUSHGLOW WHITENING SERUM');
 assert.equal(rows[3].title+' '+rows[3].description.split('\n')[0],'COMBO KIT (Face wash+ Serum + Skin Polish)');
 assert.equal(rows[3].description.split('\n')[1],'Rs. 4700/-');
 assert.equal(rows[4].title,'Talk to Representative');
 for(const row of rows){assert.ok(row.title.length<=24);assert.ok((row.description||'').length<=72);}
 const selected=bot.selectedReply(p[4]).interactive;
 assert.equal(selected.body.text,'RUSHGLOW FACEWASH\nRs. 1200/-\n\nWould You Like to Order this Product?');
 assert.deepEqual(selected.action.buttons.map(b=>b.reply.title),['YES','CANCEL']);
 const details=bot.advance({stage:'confirm'},{action:'yes'},p,'Ali');
 assert.equal(details.messages[0].text.body,'Please Provide Your Phone Number and Complete Delivery address. Make Sure to Include Your City and District.');
 const handoff=bot.advance({stage:'confirm'},{action:'representative'},p,'Ali');
 assert.equal(handoff.handoff,true);assert.equal(handoff.state.stage,'human');
});
test('Receipt uses the approved capitalization, dynamic order details and Representative',()=>{
 assert.equal(bot.orderConfirmation({id:17,product_name:'RushGlow FaceWash',price:1200,payment_method:'Cash on Delivery'}),
 'Your order #17 has been received successfully!\nProduct: RushGlow Face Wash Total: Rs. 1200/-\nPayment Method: Cash on Delivery (COD)\nThe Representative will keep you updated about your order.\nThank you for shopping with RUSHGLOW!');
});
