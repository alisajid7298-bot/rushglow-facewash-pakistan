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
const welcome='Welcome to RUSHGLOW Beauty & Skincare!\nPlease Select a Product with Free Delivery.';
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
  const rows=available.map(({p,display})=>({id:'product:'+p.id,title:display.title,
    description:(display.details?display.details+'\n':'')+'Rs. '+price(p.price)+'/-'}));
  rows.push({id:'representative',title:'Talk to Representative'});
  return {type:'interactive',interactive:{type:'list',body:{text:welcome},action:{button:'View Products',sections:[{title:'Products',rows}]}}};
}
function selectedReply(product) {
  const name=presentation(product)?.name||product.name;
  const reply=buttons(name+'\nRs. '+price(product.price)+'/-\n\nWould You Like to Order this Product?',[['yes','YES'],['cancel','CANCEL']]);
  if(product.photo) reply.interactive.header={type:'image',image:{link:'https://rushglow.org/api/whatsapp?image='+product.id}};
  return reply;
}
function orderConfirmation(order) {
  const name=presentation({name:order.product_name})?.receipt||order.product_name;
  const payment=order.payment_method==='Cash on Delivery'?'Cash on Delivery (COD)':order.payment_method;
  return 'Your order #'+order.id+' has been received successfully!\nProduct: '+name+' Total: Rs. '+order.price+'/-\nPayment Method: '+payment+'\n'+
    (order.payment_method==='EasyPaisa'?'Payment will be verified by the Representative.\n':'')+
    'The Representative will keep you updated about your order.\nThank you for shopping with RUSHGLOW!';
}
// Pure state machine: network calls and stock/order writes happen in the webhook transaction.
function advance(current,input,products,profileName) {
  let state={...(current||{})};
  const body=normalize(input.text), action=input.action||body;
  const result=(messages,extra={})=>({state,messages:Array.isArray(messages)?messages:[messages],...extra});
  if (action==='representative'||/^(human|owner|agent|representative|talk to representative|help human|insan|انسان)$/.test(body)) {
    state.stage='human'; return result(text('Your message has been sent to the Representative. They will reply here.'),{handoff:true});
  }
  if (/^(cancel|no|nahi|نہیں|منسوخ)$/.test(action)) { state={}; return result(text('Order cancel kar diya. Dobara products dekhne ke liye MENU likhein.')); }
  if (/^(menu|start|products|product|hi|hello|salam|assalam|السلام علیکم)$/.test(body)) {state={};return result(catalog(products));}
  if (/^(delivery|delivery charges|shipping)$/.test(body)) return result(text('Delivery is FREE for all cities and districts.'));
  if (/^(price|prices|قیمت)$/.test(body)) return result(catalog(products));
  const chosen=/^product:(\d+)$/.exec(action);
  if(chosen) {
    const p=products.find(p=>String(p.id)===chosen[1]&&Number(p.stock)>0);
    if(!p)return result(text('Yeh product abhi available nahi. MENU likh kar doosra product select karein.'));
    state={stage:'confirm',productId:String(p.id),unitPrice:price(p.price)};return result(selectedReply(p));
  }
  if(state.stage==='confirm') {
    if(!/^(yes|ha|han|haan|جی|ہاں)$/.test(action))return result(buttons('Would You Like to Order this Product?',[['yes','YES'],['cancel','CANCEL']]));
    state.stage='details';state.name=String(profileName||'WhatsApp customer').slice(0,100);
    return result(text('Please Provide Your Phone Number and Complete Delivery address. Make Sure to Include Your City and District.'));
  }
  if(state.stage==='details') {
    const raw=normalize(input.text);
    const match=raw.match(/(?:\+?92[\s-]*3(?:[\s-]*\d){9}|03(?:[\s-]*\d){9})/);
    if(match){const digits=match[0].replace(/\D/g,'');state.phone=digits.startsWith('92')?'+'+digits:digits;}
    let address=match?String(input.text).replace(match[0],'').trim():String(input.text||'').trim();
    address=address.replace(/^(phone|number|address|پتہ|نمبر)\s*[:：-]?\s*/ig,'').trim();
    if(address.replace(/[^a-z\u0600-\u06ff]/ig,'').length>=8) state.address=address.slice(0,1000);
    if(!state.phone)return result(text('Apna sahi Pakistani phone number de dein, misal: 03XXXXXXXXX.'));
    if(!state.address)return result(text('Ab poora delivery address aur city/district de dein.'));
    const cityLabel=state.address.match(/(?:city|district|shehar|shahar|شہر|ضلع)\s*[:：-]\s*([^,\n]+)/i);
    if(cityLabel)state.city=cityLabel[1].trim().slice(0,100);
    else if(/\bswabi\b|صوابی/i.test(state.address))state.city='Swabi';
    if(!state.city){state.stage='city';return result(text('Delivery kis city/district mein chahiye? Sirf city/district ka naam likhein.'));}
    state.stage='payment';return result(paymentPrompt(state));
  }
  if(state.stage==='city') {
    if(body.length<2||body.length>100)return result(text('City/district ka sahi naam likhein.'));
    state.city=input.text.trim();state.stage='payment';return result(paymentPrompt(state));
  }
  if(state.stage==='payment') {
    if(/^(cod|cash on delivery|cash)$/.test(action)) {state.payment='Cash on Delivery';return result([],{order:true});}
    if(/^(easypaisa|easy paisa)$/.test(action)) {state.stage='proof';state.payment='EasyPaisa';return result(text('EasyPaisa: 03409505282\nTotal: Rs '+(state.unitPrice+delivery(state.city))+'\nPayment ke baad transaction ID bhejein. Screenshot bhi bhej sakte hain. Payment Representative manually check karega; bank PIN ya OTP na bhejein.'));}
    return result(paymentPrompt(state));
  }
  if(state.stage==='proof') {
    if(input.mediaId){state.paymentMediaId=input.mediaId;return result([],{order:true});}
    if(body.length<5||!/[0-9]/.test(body))return result(text('Payment ka transaction ID ya screenshot bhejein. Representative payment manually verify karega.'));
    state.transactionId=input.text.trim().slice(0,100);return result([],{order:true});
  }
  return result(catalog(products));
}
function paymentPrompt(state){return buttons('Please Select Your Payment Method:',[['cod','Cash on Delivery'],['easypaisa','EasyPaisa']]);}
module.exports={advance,price,delivery,text,catalog,selectedReply,orderConfirmation};
