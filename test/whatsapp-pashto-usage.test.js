'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {advance}=require('../lib/whatsapp-bot');
const products=[{id:24,name:'RushGlow Facewash',price:1200,stock:5},{id:23,name:'RushGlow Skin Polish',price:1500,stock:5},{id:22,name:'RushGlow Whitening Serum',price:2000,stock:5}];
test('Roman Pashto usage questions interrupt checkout without consuming details',()=>{
 for(const phrase of ['Da ba sanga istemalom','Da ba tsanga istemalawom','Da ba senga lagawom','دا به څنګه استعمال کړم','Da ba snga istmalom','Da ba sngaa istemlom','is ko kaies istemal karen','How to use facwash']){
  for(const stage of ['confirm','details','city','payment','proof']){
   const state={stage,quickOrder:stage==='details',quickLanguage:'ps',productId:'24',unitPrice:1200,phone:'03000000000',address:'Test address',city:'Swabi'};
   const result=advance(state,{text:phrase},products,'Test');assert.deepEqual(result.state,state);assert.match(result.messages[0].text.body,/Facewash|چہرہ گیلا|Wet your face/);assert.equal(result.order,undefined);assert.equal(result.handoff,undefined);
  }
 }
 const state={stage:'details',quickOrder:true,quickLanguage:'ps'};
 const result=advance(state,{text:'Da ba sanga istemalom'},products,'Test');assert.deepEqual(result.state,state);assert.match(result.messages[0].text.body,/Da kom product/);
 const next=advance({...state,productId:'24',unitPrice:1200},{text:'03000000000 Address: Main Bazaar Swabi, City: Swabi'},products,'Test');assert.equal(next.order,true);
});
test('spelling correction handles questions but leaves actual checkout data untouched',()=>{
 const {correctQuestion}=require('../lib/whatsapp-spelling');
 assert.equal(correctQuestion('da ba snga istmalom'),'da ba sanga istemalom');
 assert.equal(correctQuestion('delivry kitna'),'delivery kitna');
 assert.equal(correctQuestion('03000000000 Address: Sanga Road, Swabi'),'03000000000 Address: Sanga Road, Swabi');
 assert.equal(correctQuestion('Sanga Road Swabi'),'Sanga Road Swabi');
 assert.equal(correctQuestion('yes'),'yes');
 assert.equal(correctQuestion('easypaisa'),'easypaisa');
 const state={stage:'details',quickOrder:true,quickLanguage:'ps',productId:'24',unitPrice:1200};
 const reply=advance(state,{text:'Da delivry snga da'},products,'Test');assert.deepEqual(reply.state,state);assert.match(reply.messages[0].text.body,/delivery free/);
});
