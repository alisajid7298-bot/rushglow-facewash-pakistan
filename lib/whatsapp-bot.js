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
  const reply=buttons(name+'\nقیمت: '+price(product.price)+' روپے\n\nکیا آپ یہ پروڈکٹ آرڈر کرنا چاہتے ہیں؟',[['yes','جی ہاں']]);
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
function validAddress(value){
 const q=normalize(value);
 if(!q||/[?؟]|\b(?:sanga|tsanga|senga|somra|tsomra|istemal\w*|istimal\w*|kaise|kese|how|what|why|thanks|thank you|price|qeemat)\b|کیسے|کیا|قیمت|استعمال|څنګه|څومره/.test(q))return false;
 if(/\b(?:thand\s*koi|marghoz|swabi|topi)\b|صوابی|تھنڈ\s*کوئی|مرغز/.test(q)&&q.split(/\s+/).length>=2)return true;
 if(/\b(?:ok|okay|yes|please|order|send|product|facewash|serum|polish|delivery|payment|chahiye|karo|bhej|manana|shukriya)\b/.test(q))return false;
 if(q.split(/\s+/).length>=2&&q.replace(/[^a-z\u0600-\u06ff]/ig,'').length>=8&&/^[a-z\u0600-\u06ff\s,.'-]+$/i.test(q))return true;
 return q.replace(/[^a-z\u0600-\u06ff]/ig,'').length>=8&&(/\b(?:house|street|road|bazaar|bazar|mohalla|mahalla|village|ghar|gali|colony|sector|block|tehsil|near|post office|flat|plot|chowk)\b|گھر|گلی|محلہ|مکان|گاؤں|روڈ|بازار|قریب|کلی|کوڅه/.test(q)||/\b(?:address|پتہ)\s*[:：-]/.test(q)&&/[,;\n]/.test(q));
}
function validCity(value){const q=normalize(value);return q.length>=2&&q.length<=100&&!/[?؟\d]|\b(?:ok|okay|yes|thanks|sanga|tsanga|istemal\w*|how|what|kaise|kese)\b|کیسے|څنګه|شکریہ/.test(q);}
function advance(current,input,products,profileName) {
  let state={...(current||{})};
  const body=normalize(input.text);let action=input.action||body;
  const number= /^(?:da\s+)?([1-5])$/.exec(body)?.[1];
  // Number shortcuts apply at the menu, never consume address/city/payment input.
  const exactName=body.replace(/^rushglow\s*/,'').replace(/face\s*wash/g,'facewash');
  const namedRank=['facewash','skin polish','whitening serum','combo kit'].indexOf(exactName);
  const selection=number|| (namedRank>=0?String(namedRank+1):null);
  if(!input.action&&selection&&((selection!=='5'&&!(state.quickOrder&&state.stage==='details'&&!state.productId))||!state.stage||['complete','confirm','menu'].includes(state.stage))){
    if(selection==='5')action='representative';
    else {const p=products.filter(p=>presentation(p)?.rank===Number(selection)-1).sort((a,b)=>Number(a.id)-Number(b.id))[0];action='product:'+(p?.id||'0');}
  }
  const baseLanguage=require('./whatsapp-questions').language(body);
  const detected=/[ښځټډړږڼګڅېۍ]|مننه/.test(body)?'pashto':/\b(tek da|manana|dera manana|kha da|sanga|tsanga)\b/.test(body)?'ps':baseLanguage==='ur'&&!/[\u0600-\u06ff]/.test(body)?'romanUrdu':baseLanguage;
  const neutral=/^(?:ok(?:ay)?|thanks?|thank you|acha|achha|theek hai|tek da|manana|dera manana|shukriya|جی|ٹھیک ہے|شکریہ|مننه)[.! ]*$/i.test(body);
  const lang=neutral&&state.replyLanguage?state.replyLanguage:detected;
  if(!neutral&&!number&&!input.action&&body)state.replyLanguage=lang;
  if(!input.action&&!selection&&!['confirm','details','city','payment','proof','human'].includes(state.stage)&&neutral){
    const replies={romanUrdu:'Bohat shukriya! 😊 Aap konsi product pasand karenge? Hum selection mein madad kar sakte hain. Delivery free hai!',pashto:'ډېره مننه! 😊 کوم محصول مو خوښېږي؟ موږ درسره په انتخاب کې مرسته کولی شو. ډیلیوري وړیا ده!',en:'Thank you! 😊 Which product interests you? We can help you choose. Delivery is free!',ur:'بہت شکریہ! 😊 آپ کون سی پروڈکٹ پسند کریں گے؟ ہم انتخاب میں آپ کی مدد کر سکتے ہیں۔ ڈیلیوری مفت ہے۔',ps:'Dera manana! 😊 Taso kam product khwakhaway? Munga dar sara pa selection ke madad kawalay sho. Delivery free da.'};
    return {state:{...state,stage:'menu',replyLanguage:lang},messages:[text(replies[lang]||replies.en)]};
  }
  const result=(messages,extra={})=>({state,messages:Array.isArray(messages)?messages:[messages],...extra});
  if (action==='representative'||/^(human|owner|agent|representative|talk to representative|help human|insan|انسان|نمائندہ|نمائندے سے بات کریں)$/.test(body)) {
    state.stage='human'; return result(text('آپ کا پیغام نمائندے کو بھیج دیا گیا ہے۔ وہ یہیں جواب دیں گے۔'),{handoff:true});
  }
  if (/^(cancel|no|nahi|نہیں|منسوخ|منسوخ کریں)$/.test(action)) { state={}; return result(text('آرڈر منسوخ کر دیا گیا ہے۔ پروڈکٹس دوبارہ دیکھنے کے لیے مینو لکھیں۔')); }
  if (/^(menu|start|products|product|hi|hello|salam|assalam|السلام علیکم|سلام|ہیلو|مینو|شروع|مصنوعات)$/.test(body)) {state={stage:'menu',replyLanguage:lang,greetingFollowup:/^(hi|hello|salam|assalam|السلام علیکم|سلام|ہیلو)$/.test(body)};return result(catalog(products));}
  if (/^(delivery|delivery charges|shipping|ڈیلیوری|ترسیل)$/.test(body)) return result(text('تمام شہروں اور اضلاع میں ڈیلیوری مفت ہے۔'));
  if (/^(price|prices|قیمت)$/.test(body)) return result(catalog(products));
  if(!input.action&&!selection){
    const faq=require('./whatsapp-questions').classify(body,state,products,presentation,price);
    if(faq?.directDetails){state={stage:'details',quickOrder:true,quickLanguage:faq.language,name:String(profileName||'WhatsApp customer').slice(0,100)};return result(text(faq.message));}
    if(faq?.productId&&!state.quickOrder)action='product:'+faq.productId;
    else if(faq?.message){if(faq.faqProductId)state.faqProductId=faq.faqProductId;return result(text(faq.message),{...(faq.handoff?{handoff:true}:{}),...(faq.aiCandidate?{aiCandidate:true}:{})});}
  }
  if(state.quickOrder&&state.stage==='details'&&!input.action){
    const say=(ur,ps,en)=>({ur,ps,en}[state.quickLanguage]||ur);
    const ranks=require('./whatsapp-questions').ranks(body);
    if(number&&Number(number)<5&&!state.productId)ranks.push(Number(number)-1);
    if(ranks.length>1)return result(text(say('براہِ کرم ایک پروڈکٹ منتخب کریں۔','Mehrabani wakray yaw product select kray.','Please select one product.')));
    if(ranks.length===1){const p=products.find(p=>presentation(p)?.rank===ranks[0]&&Number(p.stock)>0);if(!p)return result(text(say('یہ پروڈکٹ دستیاب نہیں ہے۔','Da product os nashte.','This product is not available.')));state.productId=String(p.id);state.unitPrice=price(p.price);}
    const match=body.match(/(?:\+?92[\s-]*3(?:[\s-]*\d){9}|03(?:[\s-]*\d){9})/);
    if(match){const digits=match[0].replace(/\D/g,'');state.phone=digits.startsWith('92')?'+'+digits:digits;}
    let address=String(input.text||'').replace(/[۰-۹٠-٩]/g,c=>normalize(c));
    if(match)address=address.replace(match[0],'');
    const name=address.match(/(?:^|\n)(?:name|نام)\s*[:：-]\s*([^,\n]+)/i);if(name){state.name=name[1].trim().slice(0,100);address=address.replace(name[0],'');}
    // Separate the selected product from address information; never use a product-only or phone-only message as an address.
    address=address.replace(/(?:^|\n)\s*(?:product(?: name)?|پروڈکٹ)\s*[:：-]\s*[^\n,]+/ig,'').replace(/\b(?:rushglow\s*)?(?:whitening\s+ser[ua]m|ser[ua]m|skin\s*polish|face\s*(?:wash|wach|each)|combo\s*kit|full\s*set)\b/ig,'').replace(/فیس\s*واش|فېس\s*واش|سیرم|سېروم|پالش|پولش/g,'').replace(/(?:^|\n)\s*(?:phone|number|address|پتہ|نمبر)\s*[:：-]?\s*/ig,'').replace(/^[,\s:;-]+|[,\s:;-]+$/g,'');
    const cityLabel=address.match(/(?:city|district|shehar|shahar|شہر|ضلع)\s*[:：-]\s*([^,\n]+)/i);
    if(cityLabel)state.city=cityLabel[1].trim().slice(0,100);
    else if(/\bswabi\b|\bthand\s*koi\b|\btopi\b|\bmarghoz\b|صوابی|تھنڈکوئی/.test(normalize(address)))state.city='Swabi';
    else if(state.quickAwaitCity&&!match&&!ranks.length&&validCity(address))state.city=address.trim();
    const addressOnly=address.replace(/(?:city|district|shehar|shahar|شہر|ضلع)\s*[:：-]\s*[^,\n]+/ig,'').trim();
    const addressHint=/\b(?:house|street|road|bazaar|bazar|mohalla|mahalla|village|address|ghar|gali)\b|گھر|گلی|محلہ|مکان|پتہ/.test(normalize(String(input.text||'')));
    if(!state.quickAwaitCity&&(!ranks.length||match||addressHint||cityLabel)&&validAddress(addressOnly)&&!/^(?:yes|g ha|ji ha|thank you|okay|theek hai|aw|haan|please|order|swabi|thand\s*koi|topi)$/i.test(addressOnly))state.address=address.slice(0,1000);
    if(!state.productId)return result(text(say('پروڈکٹ کا نام یا نمبر بھیجیں۔','Da product name ya number rawalegay.','Send the product name or number.')));
    if(!state.phone)return result(text(say('اپنا درست پاکستانی فون نمبر بھیجیں۔','Khpal Pakistani phone number rawalegay.','Send your valid Pakistani phone number.')));
    if(!state.address)return result(text(say('اپنا مکمل ڈیلیوری پتہ، شہر اور ضلع سمیت بھیجیں۔','Khpal mukamal address, shehar aw zila rawalegay.','Send your complete delivery address including city and district.')));
    if(!state.city){state.quickAwaitCity=true;return result(text(say('اپنا شہر یا ضلع لکھیں، مثلاً شہر: صوابی۔','Khpal shehar ya zila rawalegay, misaal: City: Swabi.','Send your city or district, e.g. City: Swabi.')));}
    state.payment='Cash on Delivery';return result([],{order:true});
  }
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
    const affirmative=String(action).trim().toLowerCase().replace(/[.!،۔!]+$/g,'').replace(/\s+/g,' ');
    if(!/(?:\+?92[\s-]*3(?:[\s-]*\d){9}|03(?:[\s-]*\d){9})/.test(body)&&!/^(?:yes+|yas|yep|yeah|g|ji|jee|ha+|ha+n|han+|ho|hao|aw|ao|awo|awoo|ok|okay|theek hai|thik hai|هو|او|جی|ہاں|ہان|(?:g|ji|jee)\s+(?:ha+|ha+n|yes|yas|aw|ao|ho)|جی\s+(?:ہاں|ہان))$/.test(affirmative))return result(buttons('کیا آپ یہ پروڈکٹ آرڈر کرنا چاہتے ہیں؟',[['yes','جی ہاں']]),{aiCandidate:!input.action&&!number});
    state.stage='details';state.name=String(profileName||'WhatsApp customer').slice(0,100);
    if(!/(?:\+?92[\s-]*3(?:[\s-]*\d){9}|03(?:[\s-]*\d){9})/.test(body))return result(text('براہِ کرم اپنا نام، فون نمبر اور مکمل ڈیلیوری پتہ لکھیں۔ شہر اور ضلع ضرور شامل کریں۔ آپ اردو یا انگریزی میں لکھ سکتے ہیں۔'));
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
    if(validAddress(address)) state.address=address.slice(0,1000);
    if(!state.phone)return result(text('براہِ کرم درست پاکستانی فون نمبر لکھیں، مثلاً: 03XXXXXXXXX۔'));
    if(!state.address)return result(text('اب اپنا مکمل ڈیلیوری پتہ، شہر اور ضلع لکھیں۔'));
    const cityLabel=state.address.match(/(?:city|district|shehar|shahar|شہر|ضلع)\s*[:：-]\s*([^,\n]+)/i);
    if(cityLabel)state.city=cityLabel[1].trim().slice(0,100);
    else if(/\b(?:swabi|thand\s*koi|marghoz|topi)\b|صوابی|تھنڈ\s*کوئی|مرغز/i.test(state.address))state.city='Swabi';
    if(!state.city){state.stage='city';return result(text('ڈیلیوری کس شہر یا ضلع میں چاہیے؟ شہر یا ضلع کا نام لکھیں۔'));}
    state.payment='Cash on Delivery';return result([],{order:true});
  }
  if(state.stage==='city') {
    if(!validCity(body))return result(text('براہِ کرم شہر یا ضلع کا درست نام لکھیں۔'));
    state.city=input.text.trim();state.payment='Cash on Delivery';return result([],{order:true});
  }
  if(state.stage==='payment') {
    if(/^(cod|cash on delivery|cash|keshe on delevre|kishe on delevre|کیش آن ڈیلیوری)$/.test(action)) {state.payment='Cash on Delivery';return result([],{order:true});}
    return result(paymentPrompt(state));
  }
  if(state.stage==='proof') {
    if(input.mediaId){state.paymentMediaId=input.mediaId;return result([],{order:true});}
    if(body.length<5||!/[0-9]/.test(body))return result(text('ادائیگی کی ٹرانزیکشن آئی ڈی یا اسکرین شاٹ بھیجیں۔ نمائندہ ادائیگی کی تصدیق کرے گا۔'));
    state.transactionId=normalize(input.text).slice(0,100);return result([],{order:true});
  }
  return result(catalog(products),{aiCandidate:!input.action&&!number});
}
function paymentPrompt(state){return buttons('براہِ کرم ادائیگی کا طریقہ منتخب کریں:',[['cod','کیش آن ڈیلیوری']]);}
const productName=product=>presentation(product)?.name||product.name;
module.exports={validAddress,validCity,productName,presentation,advance,price,delivery,text,catalog,selectedReply,orderConfirmation};

