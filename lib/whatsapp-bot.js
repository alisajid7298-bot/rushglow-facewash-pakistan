'use strict';
const normalize = value => String(value || '').trim().toLowerCase().replace(/[۰-۹٠-٩]/g, c => String('۰۱۲۳۴۵۶۷۸۹'.includes(c) ? '۰۱۲۳۴۵۶۷۸۹'.indexOf(c) : '٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
const text = body => ({type:'text', text:{body:String(body).slice(0,4000)}});
const buttons = (body, options) => ({type:'interactive',interactive:{type:'button',body:{text:body},action:{buttons:options.map(([id,title])=>({type:'reply',reply:{id,title}}))}}});
function price(value) {
  const amount=Number(String(value || '').replace(/[^0-9.]/g,''));
  if (!Number.isFinite(amount)||amount<=0) throw new Error('Product price unavailable');
  return amount;
}
function delivery(city) { return /^(swabi|swabi district|district swabi|صوابی|ضلع صوابی|صوابی ضلع)$/i.test(String(city).trim()) ? 0 : 200; }
function catalog(products) {
  const available=products.filter(p=>Number(p.stock)>0).slice(0,10);
  if (!available.length) return text('Abhi products available nahi hain. Owner se baat karne ke liye HUMAN likhein.');
  return {type:'interactive',interactive:{type:'list',body:{text:'RushGlow mein khush aamdeed! Product select karein. Swabi district mein delivery free; bahar Rs 200.'},action:{button:'Products dekhein',sections:[{title:'Available products',rows:available.map(p=>({id:'product:'+p.id,title:p.name.slice(0,24),description:('Rs '+price(p.price)+' • '+p.name).slice(0,72)}))}]}}};
}
function selectedReply(product) {
  const amount=price(product.price);
  const reply=buttons(product.name+' — Rs '+amount+'\nDelivery: Swabi district FREE; Swabi ke bahar Rs 200.\nKya aap yeh product order karna chahte hain?',[['yes','Yes'],['cancel','Cancel']]);
  if(product.photo) reply.interactive.header={type:'image',image:{link:'https://rushglow.org/api/whatsapp?image='+product.id}};
  return reply;
}
// Pure state machine: network calls and stock/order writes happen in the webhook transaction.
function advance(current,input,products,profileName) {
  let state={...(current||{})};
  const body=normalize(input.text), action=input.action||body;
  const result=(messages,extra={})=>({state,messages:Array.isArray(messages)?messages:[messages],...extra});
  if (/^(human|owner|agent|help human|insan|انسان)$/.test(body)) {
    state.stage='human'; return result(text('Aapka message owner/support ko mil gaya hai. Woh yahin reply karenge.'),{handoff:true});
  }
  if (/^(cancel|no|nahi|نہیں|منسوخ)$/.test(action)) { state={}; return result(text('Order cancel kar diya. Dobara products dekhne ke liye MENU likhein.')); }
  if (/^(menu|start|products|product|hi|hello|salam|assalam|السلام علیکم)$/.test(body)) {state={};return result(catalog(products));}
  if (/^(delivery|delivery charges|shipping)$/.test(body)) return result(text('Swabi district mein delivery FREE hai. Swabi ke bahar delivery Rs 200 hai.'));
  if (/^(price|prices|قیمت)$/.test(body)) return result(catalog(products));
  const chosen=/^product:(\d+)$/.exec(action);
  if(chosen) {
    const p=products.find(p=>String(p.id)===chosen[1]&&Number(p.stock)>0);
    if(!p)return result(text('Yeh product abhi available nahi. MENU likh kar doosra product select karein.'));
    state={stage:'confirm',productId:String(p.id),unitPrice:price(p.price)};return result(selectedReply(p));
  }
  if(state.stage==='confirm') {
    if(!/^(yes|ha|han|haan|جی|ہاں)$/.test(action))return result(buttons('Order confirm karne ke liye Yes ya Cancel select karein.',[['yes','Yes'],['cancel','Cancel']]));
    state.stage='details';state.name=String(profileName||'WhatsApp customer').slice(0,100);
    return result(text('Apna phone number aur poora delivery address de dein. Address mein city/district bhi likhein.'));
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
    if(/^(easypaisa|easy paisa)$/.test(action)) {state.stage='proof';state.payment='EasyPaisa';return result(text('EasyPaisa: 03409505282\nTotal: Rs '+(state.unitPrice+delivery(state.city))+'\nPayment ke baad transaction ID bhejein. Screenshot bhi bhej sakte hain. Payment owner manually check karega; bank PIN ya OTP na bhejein.'));}
    return result(paymentPrompt(state));
  }
  if(state.stage==='proof') {
    if(input.mediaId){state.paymentMediaId=input.mediaId;return result([],{order:true});}
    if(body.length<5||!/[0-9]/.test(body))return result(text('Payment ka transaction ID ya screenshot bhejein. Owner payment manually verify karega.'));
    state.transactionId=input.text.trim().slice(0,100);return result([],{order:true});
  }
  return result(catalog(products));
}
function paymentPrompt(state){return buttons('Delivery: '+(delivery(state.city)===0?'FREE (Swabi district)':'Rs 200')+'\nTotal: Rs '+(state.unitPrice+delivery(state.city))+'\nPayment ka tareeqa select karein:',[['cod','Cash on Delivery'],['easypaisa','EasyPaisa']]);}
module.exports={advance,price,delivery,text,catalog,selectedReply};
