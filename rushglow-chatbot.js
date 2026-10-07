document.body.insertAdjacentHTML('beforeend',"<style>\n#rgChatLaunch{position:fixed;right:18px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:1000;border:0;border-radius:28px;background:#075f55;color:#fff;padding:14px 20px;font:700 15px Arial;box-shadow:0 4px 20px #0003;cursor:pointer}\n#rgChat{position:fixed;right:18px;bottom:calc(145px + env(safe-area-inset-bottom));width:min(370px,calc(100vw - 24px));max-height:70dvh;z-index:1100;background:#fff;border:1px solid #d5e6df;border-radius:18px;box-shadow:0 12px 40px #0003;overflow:hidden;color:#15372d;font-family:Arial,sans-serif}\n#rgChat[hidden]{display:none}#rgChat header{position:static;display:flex;justify-content:space-between;align-items:center;padding:14px;background:#075f55;color:white}#rgChat header button{background:transparent;color:white;border:0;font-size:26px;min-width:44px;min-height:44px;cursor:pointer}\n#rgChatLog{height:260px;max-height:35dvh;overflow:auto;padding:14px;background:#f5faf7}.rgChatMessage{padding:11px;border-radius:12px;background:#e4f1eb;margin:0 0 10px;line-height:1.5;font-size:14px;white-space:pre-wrap;overflow-wrap:anywhere}.rgChatMessage.user{background:#075f55;color:white;margin-left:35px}.rgChatMessage a{color:#075f55;text-decoration:underline}\n#rgChatChoices{display:flex;flex-wrap:wrap;gap:6px;padding:10px}#rgChatChoices button{border:1px solid #c1d8cf;border-radius:20px;background:white;color:#075f55;padding:9px;font-size:12px;cursor:pointer}\n#rgChat form{display:flex;gap:6px;padding:10px;border-top:1px solid #eee}#rgChat input{min-width:0;flex:1;padding:12px;border:1px solid #bdcec6;border-radius:8px;font-size:16px}#rgChat form button{background:#075f55;color:white;border:0;border-radius:8px;padding:12px;cursor:pointer}\n#rgChat small{display:block;padding:0 12px 10px;font-size:11px;color:#586d63}@media(max-width:480px){#rgChat{right:12px;bottom:calc(140px + env(safe-area-inset-bottom))}#rgChatLaunch{right:12px}}\n</style>\n<button id=\"rgChatLaunch\" aria-controls=\"rgChat\" aria-expanded=\"false\">💬 Ask RushGlow</button>\n<section id=\"rgChat\" role=\"dialog\" aria-labelledby=\"rgChatTitle\" hidden>\n<header><strong id=\"rgChatTitle\">RushGlow Shopping Assistant</strong><button id=\"rgChatClose\" aria-label=\"Close chatbot\">×</button></header>\n<div id=\"rgChatLog\" role=\"log\" aria-live=\"polite\" aria-relevant=\"additions\"></div>\n<div id=\"rgChatChoices\"></div>\n<form id=\"rgChatForm\"><input id=\"rgChatInput\" aria-label=\"Your question\" placeholder=\"Ask about products or delivery…\" maxlength=\"500\" autocomplete=\"off\"><button type=\"submit\">Send</button></form>\n<small>Automated FAQ assistant · Please do not share passwords or payment details.</small>\n</section>\n");

(()=>{

// Shared RushGlow reply engine. No messages are sent by this module.
// Pass the current catalog from the products table; never hard-code prices.
const website='https://rushglow.org';
const support='https://wa.me/923427278255';
function reply(message, products=[]) {
 const q=String(message||'').trim().toLowerCase().slice(0,2000);
 const buttons=['Products & prices','Delivery charges','Payment methods','Track my order','Talk to our team'];
 const result=text=>({text,website,support,buttons});
 if(!q||/^(hi|hello|hey|salam|salaam|assalam.*|start|menu)$/.test(q))
 return result('Welcome to RushGlow! I can help with products, prices, delivery, payment and order tracking. What would you like to know?');
 if(/refund|return|damag|missing|complaint|cancel|human|agent|team|support|problem|error|masla|kharab/.test(q))
 return result('Our team can help with payment problems, missing or damaged items, cancellations and return requests. Please send your order number and a description to '+support+'. Please do not send passwords, verification codes or card details. A return or refund must be confirmed by our team.');
 if(/track|status|where.*order|order.*where|order number/.test(q))
 return result('To check your order, open '+website+'/#track and enter the order number shown after checkout. If you cannot find it, contact our team: '+support+'.');
 if(/deliver|shipping|courier|swabi|charges|kitne din|kab aye/.test(q))
 return result('Delivery is free within Swabi District. Outside Swabi District it costs Rs. 200. Enter your city or district at checkout to see the final total. Delivery time depends on your location and courier; contact '+support+' for an estimate.');
 if(/payment|\bpay\b|cash|\bcod\b|easypaisa|easy paisa|card|bank/.test(q))
 return result('You can pay by Cash on Delivery or EasyPaisa. For COD, pay when your order arrives. For EasyPaisa, use the instructions and account shown at checkout and upload your payment screenshot. Card payments are not listed as an available checkout method.');
 if(/review|rating|stars/.test(q))
 return result('Customers whose order is marked Delivery Complete can review products they purchased. Select Write a Review and enter your order number and the phone number used for that order. Approved reviews appear on the product page.');
 if(/discount|coupon|offer/.test(q))
 return result('Current sale prices appear on product cards. If you have a discount code, enter it at checkout and tap Apply. I cannot promise a discount that has not been confirmed at checkout.');
 if(/buy|place.*order|order.*place|checkout|khareed|kharid|order kar/.test(q))
 return result('Open '+website+', tap Buy Now or add products to your cart and select Checkout. Enter your name, phone, complete address and city, choose a payment method, then tap Place Order. Save your order number. If checkout fails, contact our team before ordering again.');
 if(/cure|treat|allergy|rash|pregnan|medical|guarantee|side effect/.test(q))
 return result('I cannot confirm medical suitability or guarantee skin results. For irritation, allergies or a medical skin condition, consult a qualified healthcare professional. Our team can help with product information: '+support+'.');
 const catalog=Array.isArray(products)?products.filter(p=>p&&p.id&&p.name):[];
 const named=catalog.filter(p=>String(p.name).toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>3).some(w=>q.includes(w)));
 if(/product|price|catalog|facewash|face wash|serum|polish|cost|qeemat|kitne|stock/.test(q)||named.length){
  const selected=named.length?named:catalog;
  if(!selected.length) return result('Please see our current products and prices at '+website+'/#productsSection. I cannot confirm a price or availability while the catalog is unavailable.');
  return result(selected.slice(0,15).map(p=>String(p.name)+': Rs. '+String(p.price||'see website')+
   (Number(p.stock)>0?'':' (currently out of stock)')+
   (named.length&&p.description?' — '+String(p.description).slice(0,500):'')+
   '\n'+website+'/?product='+encodeURIComponent(String(p.id))+'#productsSection').join('\n\n'));
 }
 return result('I can help with RushGlow products, prices, delivery, payment, ordering and reviews. Please choose a topic above, or speak to our team: '+support+'.');
}


const launch=document.getElementById('rgChatLaunch'),panel=document.getElementById('rgChat'),input=document.getElementById('rgChatInput'),log=document.getElementById('rgChatLog');
function append(text,user=false){
 const div=document.createElement('div');div.className='rgChatMessage'+(user?' user':'');
 // Render text safely; link only our public website and WhatsApp support.
 const pieces=String(text).split(/(https:\/\/[^\s]+)/g);
 for(const piece of pieces){
 if(!user&&/^https:\/\/(rushglow\.org(?:\/|$)|wa\.me\/923427278255(?:\?|$))/.test(piece)){
 const a=document.createElement('a');a.href=piece;a.textContent=piece;a.target='_blank';a.rel='noopener noreferrer';div.append(a);
 }else div.append(document.createTextNode(piece));
 }
 log.append(div);while(log.children.length>40)log.firstElementChild.remove();log.scrollTop=log.scrollHeight;
}
function ask(text){
 append(text,true);
 let catalog=[];try{catalog=products}catch{}
 const normalized=String(text).toLowerCase();
 const aliases=[[/qeemat|keemat|kitne ka|kitna price/,'products'],[/delivery|delivary|shipping/,'delivery'],[/payment|easypaisa|cash on delivery|\bcod\b/,'payment'],[/order kese|order kaise|order karna/,'place order'],[/insan|owner|contact/,'support']];
 const match=aliases.find(([rx])=>rx.test(normalized));
 append(reply(match?match[1]:text,catalog).text);
}
function close(){panel.hidden=true;launch.setAttribute('aria-expanded','false');launch.focus()}
launch.onclick=()=>{if(!panel.hidden){close();return}panel.hidden=false;launch.setAttribute('aria-expanded','true');if(!log.children.length)append(reply('hello').text);input.focus()};
document.getElementById('rgChatClose').onclick=close;
panel.addEventListener('keydown',event=>{if(event.key==='Escape')close()});
document.getElementById('rgChatForm').onsubmit=event=>{event.preventDefault();const text=input.value.trim();if(!text)return;input.value='';ask(text);input.focus()};
for(const label of reply('').buttons){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>ask(label);document.getElementById('rgChatChoices').append(b)}
})();

