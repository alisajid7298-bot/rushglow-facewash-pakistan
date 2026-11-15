'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),bot=require('../lib/whatsapp-bot');
const products=[{id:24,name:'RushGlow FaceWash',price:1200,stock:20,photo:'photo'}];
test('Urdu bot accepts English and Urdu checkout details and retains English product names',()=>{
 for(const [details,name,city,phone]of [
 ['Name: Sajid Ali\n03427278255\nHouse 12, Main Road\nCity: Lahore','Sajid Ali','Lahore','03427278255'],
 ['نام: ساجد علی\n۰۳۴۲۷۲۷۸۲۵۵\nمکان نمبر ۱۲، مین روڈ\nشہر: لاہور','ساجد علی','لاہور','03427278255']]){
 let r=bot.advance({}, {action:'product:24'},products,'Profile');
 assert.match(r.messages[0].interactive.body.text,/RUSHGLOW FACEWASH/);
 r=bot.advance(r.state,{text:'جی ہاں'},products,'Profile');assert.equal(r.state.stage,'details');
 r=bot.advance(r.state,{text:details},products,'Profile');assert.equal(r.state.stage,'payment');assert.equal(r.state.name,name);assert.equal(r.state.city,city);assert.equal(r.state.phone,phone);assert.match(r.state.address,new RegExp(name));
 const paid=bot.advance(r.state,{text:'COD'},products,'Profile');assert.equal(paid.order,true);assert.equal(paid.state.payment,'Cash on Delivery');
 }
 let r=bot.advance({stage:'details'},{text:'Name: Ali Khan\n03427278255\nHouse 12 Main Road'},products,'Ali');assert.equal(r.state.stage,'city');r=bot.advance(r.state,{text:'Islamabad'},products,'Ali');assert.equal(r.state.city,'Islamabad');assert.equal(r.state.stage,'payment');
 const receipt=bot.orderConfirmation({id:17,product_name:'RushGlow FaceWash',price:1200,payment_method:'Cash on Delivery'});assert.match(receipt,/RushGlow Face Wash/);assert.match(receipt,/کیش آن ڈیلیوری/);
 assert.equal(bot.advance({}, {text:'نمائندے سے بات کریں'},products,'Ali').handoff,true);
 for(const m of bot.catalog(products).filter(m=>m.interactive))for(const section of m.interactive.action.sections)for(const row of section.rows)assert.ok(row.title.length<=24);
});
