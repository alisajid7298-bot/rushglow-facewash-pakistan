'use strict';
const normalize = value => String(value || '').trim().toLowerCase().replace(/[۰-۹٠-٩]/g, c => String('۰۱۲۳۴۵۶۷۸۹'.includes(c) ? '۰۱۲۳۴۵۶۷۸۹'.indexOf(c) : '٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
const text = body => ({type:'text', text:{body:String(body).slice(0,4000)}});
const buttons = (body, options) => ({type:'interactive',interactive:{type:'button',body:{text:body},action:{buttons:options.map(([id,title])=>({type:'reply',reply:{id,title}}))}}});
function price(value) {
  const amount=Number(String(value || '').replace(/[^0-9.]/g,''));
  if (!Number.isFinite(amount)||amount<=0) throw new Error('Product price unavailable');
  return amount;
}
// Delivery is free in every city/district for WhatsApp orders.
function delivery() { return 0; }
const welcome='رش گلو بیوٹی اینڈ سکن کیئر میں خوش آمدید!\n\nاب آپ اسی واٹس‌اپ پر براہِ راست اپنا آرڈر دے سکتے ہیں۔ اپنی پسند کی پروڈکٹ کا صرف نمبر جواب میں بھیجیں اور اپنا آرڈر شروع کریں۔\n\nتمام پروڈکٹس پر مفت ڈیلیوری!';
function presentation(product) {
  const name=normalize(product.name).replace(/face\s*wash/g,'facewash');
  const face=name.includes('facewash'),skin=name.includes('skin polish'),serum=name.includes('serum');
  if(face&&skin&&serum)return {rank:3,title:'COMBO KIT',name:'COMBO KIT (Face wash+ Serum + Skin Polish)',details:'(Face wash+ Serum + Skin Polish)',receipt:'COMBO KIT (Face wash+ Serum + Skin Polish)'};
  if(Number(face)+Number(skin)+Number(serum)>1)return null;
  if(face)return {rank:0,title:'RUSHGLOW FACEWASH',name:'RUSHGLOW FACEWASH',receipt:'RushGlow Face Wash'};
  if(skin)return {rank:1,title:'RUSHGLOW SKIN POLISH',name:'RUSHGLOW SKIN POLISH',receipt:'RushGlow Skin Polish'};
  if(serum)return {rank:2,title:'RUSHGLOW WHITENING SERUM',name:'RUSHGLOW WHITENING SERUM',receipt:'RushGlow Whitening Serum'};
  return null;
}
function catalog(products) {
  const available=products.map(p=>({p,display:presentation(p)})).filter(x=>x.display&&Number(x.p.stock)>0)
    .sort((a,b)=>a.display.rank-b.display.rank||Number(a.p.id)-Number(b.p.id)).slice(0,9);
  const lines=available.map(({p,display})=>(display.rank+1)+'. '+display.name+'\nقیمت: '+price(p.price)+' روپے');
  const message=text(welcome+'\n\n'+lines.join('\n\n')+'\n\n5. نمائندے سے بات کریں\n\nمثال: Skin Polish آرڈر کرنے کے لیے جواب میں صرف 2 بھیجیں۔ مدد کے لیے 5 لکھیں۔');
  const combo=products.filter(p=>presentation(p)?.rank===3&&p.photo).sort((a,b)=>Number(a.id)-Number(b.id))[0];
  // The existing combo photo shows the product range above the numbered caption.
  if(combo&&message.text.body.length<=900)return [{type:'image',image:{link:'https://rushglow.org/api/whatsapp?image='+combo.id,caption:message.text.body}}];
  return [message];
}
function selectedReply(product) {
  const name=presentation(product)?.name||product.name;
  const reply=buttons(name+'\nقیمت: '+price(product.price)+' روپے\n\nکیا آپ یہ پروڈکٹ آرڈر کرنا چاہتے ہیں؟',[['yes','جی ہاں'],['cancel','منسوخ کریں']]);
  if(product.photo) reply.interactive.header={type:'image',image:{link:'https://rushglow.org/api/whatsapp?image='+product.id}};
  return reply;
}
function orderConfirmation(order) {
  const name=presentation({name:order.product_name})?.receipt||order.product_name;
  const payment=order.payment_method==='Cash on Delivery'?'کیش آن ڈیلیوری':order.payment_method==='EasyPaisa'?'ایزی پیسہ':order.payment_method;
  return 'آپ کا آرڈر #'+order.id+' کامیابی سے موصول ہو گیا ہے!\nپروڈکٹ: '+name+'\nکل رقم: '+order.price+' روپے\nادائیگی کا طریقہ: '+payment+'\n'+
    (order.payment_method==='EasyPaisa'?'نمائندہ ادائیگی کی تصدیق کرے گا۔\n':'')+
    'نمائندہ آپ کو آرڈر کی صورتحال سے آگاہ رکھے گا۔\nرش گلو سے خریداری کا شکریہ!';
}
// Pure state machine: network calls and stock/order writes happen in the webhook transaction.
function advance(current,input,products,profileName) {
  let state={...(current||{})};
  const body=normalize(input.text);let action=input.action||body;
  // Number shortcuts apply at the menu, never consume address/city/payment input.
  if(!input.action&&/^[1-5]$/.test(body)&&(!state.stage||['complete','confirm','menu'].includes(state.stage))){
    if(body==='5')action='representative';
    else {const p=products.filter(p=>presentation(p)?.rank===Number(body)-1).sort((a,b)=>Number(a.id)-Number(b.id))[0];action='product:'+(p?.id||'0');}
  }
  const result=(messages,extra={})=>({state,messages:Array.isArray(messages)?messages:[messages],...extra});
  if (action==='representative'||/^(human|owner|agent|representative|talk to representative|help human|insan|انسان|نمائندہ|نمائندے سے بات کریں)$/.test(body)) {
    state.stage='human'; return result(text('آپ کا پیغام نمائندے کو بھیج دیا گیا ہے۔ وہ یہیں جواب دیں گے۔'),{handoff:true});
  }
  if (/^(cancel|no|nahi|نہیں|منسوخ|منسوخ کریں)$/.test(action)) { state={}; return result(text('آرڈر منسوخ کر دیا گیا ہے۔ پروڈکٹس دوبارہ دیکھنے کے لیے مینو لکھیں۔')); }
  if (/^(menu|start|products|product|hi|hello|salam|assalam|السلام علیکم|سلام|ہیلو|مینو|شروع|مصنوعات)$/.test(body)) {state={};return result(catalog(products));}
  if (/^(delivery|delivery charges|shipping|ڈیلیوری|ترسیل)$/.test(body)) return result(text('تمام شہروں اور اضلاع میں ڈیلیوری مفت ہے۔'));
  if (/^(price|prices|قیمت)$/.test(body)) return result(catalog(products));
  const direct=/^order_product:(\d+)$/.exec(action);
  if(direct){
    const p=products.find(p=>String(p.id)===direct[1]&&Number(p.stock)>0);
    if(!p)return result(text('یہ پروڈکٹ فی الحال دستیاب نہیں۔ مینو لکھ کر دوسری پروڈکٹ منتخب کریں۔'));
    state={stage:'details',productId:String(p.id),unitPrice:price(p.price),name:String(profileName||'WhatsApp customer').slice(0,100)};
    return result(text('براہِ کرم اپنا نام، فون نمبر اور مکمل ڈیلیوری پتہ لکھیں۔ شہر اور ضلع ضرور شامل کریں۔ آپ اردو یا انگریزی میں لکھ سکتے ہیں۔'));
  }
  const chosen=/^product:(\d+)$/.exec(action);
  if(chosen) {
    const p=products.find(p=>String(p.id)===chosen[1]&&Number(p.stock)>0);
    if(!p)return result(text('یہ پروڈکٹ فی الحال دستیاب نہیں۔ مینو لکھ کر دوسری پروڈکٹ منتخب کریں۔'));
    state={stage:'confirm',productId:String(p.id),unitPrice:price(p.price)};return result(selectedReply(p));
  }
  if(state.stage==='confirm') {
    if(!/^(yes|ha|han|haan|جی|ہاں|جی ہاں)$/.test(action))return result(buttons('کیا آپ یہ پروڈکٹ آرڈر کرنا چاہتے ہیں؟',[['yes','جی ہاں'],['cancel','منسوخ کریں']]));
    state.stage='details';state.name=String(profileName||'WhatsApp customer').slice(0,100);
    return result(text('براہِ کرم اپنا نام، فون نمبر اور مکمل ڈیلیوری پتہ لکھیں۔ شہر اور ضلع ضرور شامل کریں۔ آپ اردو یا انگریزی میں لکھ سکتے ہیں۔'));
  }
  if(state.stage==='details') {
    const raw=normalize(input.text);
    const match=raw.match(/(?:\+?92[\s-]*3(?:[\s-]*\d){9}|03(?:[\s-]*\d){9})/);
    if(match){const digits=match[0].replace(/\D/g,'');state.phone=digits.startsWith('92')?'+'+digits:digits;}
    let address=String(input.text||'').replace(/[۰-۹٠-٩]/g,c=>normalize(c));
    if(match)address=address.replace(match[0],'').trim();
    const suppliedName=address.match(/(?:^|\n)(?:name|نام)\s*[:：-]\s*([^,\n]+)/i);
    if(suppliedName)state.name=suppliedName[1].trim().slice(0,100);
    address=address.replace(/^(phone|number|address|پتہ|نمبر)\s*[:：-]?\s*/ig,'').trim();
    if(address.replace(/[^a-z\u0600-\u06ff]/ig,'').length>=8) state.address=address.slice(0,1000);
    if(!state.phone)return result(text('براہِ کرم درست پاکستانی فون نمبر لکھیں، مثلاً: 03XXXXXXXXX۔'));
    if(!state.address)return result(text('اب اپنا مکمل ڈیلیوری پتہ، شہر اور ضلع لکھیں۔'));
    const cityLabel=state.address.match(/(?:city|district|shehar|shahar|شہر|ضلع)\s*[:：-]\s*([^,\n]+)/i);
    if(cityLabel)state.city=cityLabel[1].trim().slice(0,100);
    else if(/\bswabi\b|صوابی/i.test(state.address))state.city='Swabi';
    if(!state.city){state.stage='city';return result(text('ڈیلیوری کس شہر یا ضلع میں چاہیے؟ شہر یا ضلع کا نام لکھیں۔'));}
    state.stage='payment';return result(paymentPrompt(state));
  }
  if(state.stage==='city') {
    if(body.length<2||body.length>100)return result(text('براہِ کرم شہر یا ضلع کا درست نام لکھیں۔'));
    state.city=input.text.trim();state.stage='payment';return result(paymentPrompt(state));
  }
  if(state.stage==='payment') {
    if(/^(cod|cash on delivery|cash|کیش آن ڈیلیوری)$/.test(action)) {state.payment='Cash on Delivery';return result([],{order:true});}
    if(/^(easypaisa|easy paisa|ایزی پیسہ)$/.test(action)) {state.stage='proof';state.payment='EasyPaisa';return result(text('ایزی پیسہ: 03409505282\nکل رقم: '+(state.unitPrice+delivery(state.city))+' روپے\nادائیگی کے بعد ٹرانزیکشن آئی ڈی یا اسکرین شاٹ بھیجیں۔ نمائندہ ادائیگی کی تصدیق کرے گا۔ بینک پن یا او ٹی پی نہ بھیجیں۔'));}
    return result(paymentPrompt(state));
  }
  if(state.stage==='proof') {
    if(input.mediaId){state.paymentMediaId=input.mediaId;return result([],{order:true});}
    if(body.length<5||!/[0-9]/.test(body))return result(text('ادائیگی کی ٹرانزیکشن آئی ڈی یا اسکرین شاٹ بھیجیں۔ نمائندہ ادائیگی کی تصدیق کرے گا۔'));
    state.transactionId=normalize(input.text).slice(0,100);return result([],{order:true});
  }
  return result(catalog(products));
}
function paymentPrompt(state){return buttons('براہِ کرم ادائیگی کا طریقہ منتخب کریں:',[['cod','کیش آن ڈیلیوری'],['easypaisa','ایزی پیسہ']]);}
const productName=product=>presentation(product)?.name||product.name;
module.exports={productName,advance,price,delivery,text,catalog,selectedReply,orderConfirmation};

