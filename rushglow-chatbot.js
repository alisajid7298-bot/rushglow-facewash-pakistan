document.body.insertAdjacentHTML('beforeend',"<style>\n#rgChatLaunch{position:fixed;right:18px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:1000;border:0;border-radius:28px;background:#075f55;color:#fff;padding:14px 20px;font:700 15px Arial;box-shadow:0 4px 20px #0003;cursor:pointer}\n#rgChat{position:fixed;right:18px;bottom:calc(145px + env(safe-area-inset-bottom));width:min(370px,calc(100vw - 24px));max-height:70dvh;z-index:1100;background:#fff;border:1px solid #d5e6df;border-radius:18px;box-shadow:0 12px 40px #0003;overflow:hidden;color:#15372d;font-family:Arial,sans-serif}\n#rgChat[hidden]{display:none}#rgChat header{position:static;display:flex;justify-content:space-between;align-items:center;padding:14px;background:#075f55;color:white}#rgChat header button{background:transparent;color:white;border:0;font-size:26px;min-width:44px;min-height:44px;cursor:pointer}\n#rgChatLog{height:260px;max-height:35dvh;overflow:auto;padding:14px;background:#f5faf7}.rgChatMessage{padding:11px;border-radius:12px;background:#e4f1eb;margin:0 0 10px;line-height:1.5;font-size:14px;white-space:pre-wrap;overflow-wrap:anywhere}.rgChatMessage.user{background:#075f55;color:white;margin-left:35px}.rgChatMessage a{color:#075f55;text-decoration:underline}\n#rgChatChoices{display:flex;flex-wrap:wrap;gap:6px;padding:10px}#rgChatChoices button{border:1px solid #c1d8cf;border-radius:20px;background:white;color:#075f55;padding:9px;font-size:12px;cursor:pointer}\n#rgChat form{display:flex;gap:6px;padding:10px;border-top:1px solid #eee}#rgChat input{min-width:0;flex:1;padding:12px;border:1px solid #bdcec6;border-radius:8px;font-size:16px}#rgChat form button{background:#075f55;color:white;border:0;border-radius:8px;padding:12px;cursor:pointer}\n#rgChat small{display:block;padding:0 12px 10px;font-size:11px;color:#586d63}@media(max-width:480px){#rgChat{right:12px;bottom:calc(140px + env(safe-area-inset-bottom))}#rgChatLaunch{right:12px}}\n</style>\n<button id=\"rgChatLaunch\" aria-controls=\"rgChat\" aria-expanded=\"false\">💬 Ask RushGlow</button>\n<section id=\"rgChat\" role=\"dialog\" aria-labelledby=\"rgChatTitle\" hidden>\n<header><strong id=\"rgChatTitle\">RushGlow Shopping Assistant</strong><button id=\"rgChatClose\" aria-label=\"Close chatbot\">×</button></header>\n<div id=\"rgChatLog\" role=\"log\" aria-live=\"polite\" aria-relevant=\"additions\"></div>\n<div id=\"rgChatChoices\"></div>\n<form id=\"rgChatForm\"><input id=\"rgChatInput\" aria-label=\"Your question\" placeholder=\"Ask about products or delivery…\" maxlength=\"500\" autocomplete=\"off\"><button type=\"submit\">Send</button></form>\n<small>Shopping assistant · Complete orders securely in checkout. Never share passwords or OTPs.</small>\n</section>\n");

(()=>{

// Shared RushGlow reply engine. No messages are sent by this module.
// Pass the current catalog from the products table; never hard-code prices.
const website='https://rushglow.org';
const support='https://wa.me/923427278255';
function reply(message, products=[]) {
 const original=String(message||'').trim().toLowerCase().slice(0,2000);
 const words=[[/فیس\s*واش|face\s+wash|feswash/g,'facewash'],[/سیرم/g,'serum'],[/پالش|پولش/g,'polish'],[/قیمت|ریٹ|keemat|qimat|qemat|rate/g,'price'],[/ڈیلیوری|ترسیل|delivary|delivery fee|shipping/g,'delivery'],[/کتنے دن|کب آئے|kitne din|kab aye|kab mile/g,'delivery time'],[/ادائیگی|پیمنٹ|paymint/g,'payment'],[/ایزی\s*پیسہ/g,'easypaisa'],[/کیش|نقد/g,'cash'],[/آرڈر/g,'order'],[/ٹریک|کہاں پہنچا|kahan pohncha|kaha pohncha/g,'track'],[/واپسی|ریفنڈ|wapis|wapas/g,'return'],[/شکایت|خراب|masla|kharab/g,'problem'],[/استعمال|طریقہ|فائدے|benefits|istemal|istamal|faide|fayde/g,'usage'],[/اجزاء/g,'ingredients'],[/رابطہ|مالک|انسان|contact|owner|insan/g,'support'],[/ڈسکاؤنٹ|کوپن/g,'discount'],[/ریویو|ستارے/g,'review'],[/خرید|khareed|kharid/g,'buy']];
 const q=words.reduce((s,[rx,value])=>s.replace(rx,value),original);
 const buttons=['Products & prices','How to use products','Delivery charges','Payment methods','How to order','Track my order','Discounts & coupons','Returns & support','Lucky Draw'];
 const result=text=>({text,website,support,buttons});
 if(!q||/^(hi|hello|hey|salam|salaam|assalam.*|start|menu|السلام علیکم|سلام)$/.test(q))
 return result('Welcome to RushGlow! I can help with products, prices, delivery, payment, order tracking and Lucky Draw entries. What would you like to know?');
 if(/lucky|lucki|luckydr|lucky.*dr|lottery|قرعہ|قرعہ اندازی|لکی|draw|prize|winner|inaam|inam|انعام|entry slip|entries|chances|serial number|bike|موٹر سائیکل/.test(q))
 return result('RushGlow Lucky Draw entries:\n\n• Each product unit in an order marked Delivery Complete earns 1 chance. 3 delivered product units earn 3 chances.\n• Repeat purchases receive additional entries; your earlier entries remain listed. Pending deliveries do not qualify yet.\n• Check your entries using the same name and mobile number used on your order: '+website+'/#lucky-draw\n• Results show your name, serial number, product and entry date. Tap Print / Save PDF beside an entry to print its slip or save it as PDF.\n• The progress bar shows completed product units towards the 1,000-product target. Check the page for the latest count.\n\nFor prize details, draw date or winner announcements, please confirm with our team: '+support+'. I cannot confirm a prize, date or winning result that has not been officially announced.');
 if(/cure|treat|allergy|rash|pregnan|medical|guarantee|side effect|جلن|الرجی|حاملہ|ilaj|jalan/.test(q))
 return result('I cannot confirm medical suitability or guarantee skin results. For irritation, allergies or a medical skin condition, consult a qualified healthcare professional. Our team can help with product information: '+support+'.');
 if(/refund|return|damag|missing|complaint|cancel|human|agent|team|support|problem|error|masla|kharab/.test(q))
 return result('Our team can help with payment problems, missing or damaged items, cancellations and return requests. Please send your order number and a description to '+support+'. Please do not send passwords, verification codes or card details. A return or refund must be confirmed by our team.');
 if(/track|status|where.*order|order.*where|order number/.test(q))
 return result('To check your order, open '+website+'/#track and enter the order number shown after checkout. If you cannot find it, contact our team: '+support+'.');
 if(/deliver|shipping|courier|swabi|charges|kitne din|kab aye/.test(q)&&!/cash|\bcod\b|easypaisa/.test(q))
 return result('Delivery is free within Swabi District. Outside Swabi District it costs Rs. 200. Enter your city or district at checkout to see the final total. Delivery time depends on your location and courier; contact '+support+' for an estimate.');
 if(/payment|\bpay\b|cash|\bcod\b|easypaisa|easy paisa|card|bank/.test(q))
 return result('You can pay by Cash on Delivery or EasyPaisa. For COD, pay when your order arrives. For EasyPaisa, use the instructions and account shown at checkout and upload your payment screenshot. Card payments are not listed as an available checkout method.');
 if(/review|rating|stars/.test(q))
 return result('Customers whose order is marked Delivery Complete can review products they purchased. Select Write a Review and enter your order number and the phone number used for that order. Approved reviews appear on the product page.');
 if(/discount|coupon|offer/.test(q))
 return result('Current sale prices appear on product cards. If you have a discount code, enter it at checkout and tap Apply. I cannot promise a discount that has not been confirmed at checkout.');
 if(/buy|place.*order|order.*place|checkout|how to order|order kar|order kese|order kaise|order.*کیسے|order.*کرنا/.test(q))
 return result('Open '+website+', tap Buy Now or add products to your cart and select Checkout. Enter your name, phone, complete address and city, choose a payment method, then tap Place Order. Save your order number. If checkout fails, contact our team before ordering again.');

 const catalog=Array.isArray(products)?products.filter(p=>p&&p.id&&p.name):[];
 const named=catalog.filter(p=>String(p.name).toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>3&&!['rushglow','rush','glow'].includes(w)).some(w=>q.includes(w)));
 if(/thank|shukriya|شکریہ/.test(q))return result('You are welcome! Let me know if you need help with another RushGlow question.');
 if(/usage|how.*use|use.*product|ingredients|lagana|lagao|kaise.*use|kese.*use|description/.test(q)){
 if(!named.length)return result('Which product would you like to know about: FaceWash, Skin Polish or Whitening Serum? Include its name in your question, for example: How to use FaceWash.');
 return result(named.map(p=>p.name+'\n'+(p.description?String(p.description).slice(0,1600):'Detailed instructions are not currently listed for this product. Please follow the packaging instructions or ask our team.')+'\n'+website+'/?product='+encodeURIComponent(String(p.id))+'#productsSection').join('\n\n')+'\n\nThese are the product details listed by RushGlow. If usage instructions or ingredients are missing, contact our team: '+support+'.');
 }
 if(/install|app|home screen|موبائل ایپ/.test(q))return result('To add RushGlow to your home screen, tap Install RushGlow App on the website. On Android Chrome, use the browser menu to install or add to home screen. On iPhone, open Safari and use Share → Add to Home Screen.');
 if(/product|price|catalog|facewash|face wash|serum|polish|cost|qeemat|kitne|stock/.test(q)||named.length){
  const selected=named.length?named:catalog;
  if(!selected.length) return result('Please see our current products and prices at '+website+'/#productsSection. I cannot confirm a price or availability while the catalog is unavailable.');
  return result(selected.slice(0,15).map(p=>String(p.name)+': Rs. '+String(p.price||'see website')+
   (Number(p.stock)>0?'':' (currently out of stock)')+
   (named.length&&p.description?' — '+String(p.description).slice(0,500):'')+
   '\n'+website+'/?product='+encodeURIComponent(String(p.id))+'#productsSection').join('\n\n'));
 }
 return result('I can help with RushGlow products, prices, delivery, payment, ordering, reviews and Lucky Draw entries. Please choose a topic above, or speak to our team: '+support+'.');
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
let selectedProduct=null;
function currentCatalog(){try{return Array.isArray(products)?products:[]}catch{return []}}
function choices(options){
 const box=document.getElementById('rgChatChoices');box.replaceChildren();
 for(const [label,action] of options){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=action;box.append(b)}
}
function topics(){
 choices([['Shop / Order',()=>ask('Show products to order')],...reply('').buttons.map(label=>[label,()=>ask(label)])]);
}
function checkoutSelected(){
 const p=currentCatalog().find(p=>selectedProduct&&String(p.id)===String(selectedProduct.id));
 if(!p||Number(p.stock)<=0){selectedProduct=null;append('This product is currently unavailable. Please choose another product.');showShopping();return}
 if(typeof openOrder!=='function'){append('Please use Buy Now on the product card to continue.');return}
 openOrder(p.id,encodeURIComponent(p.name),encodeURIComponent(p.price));
 selectedProduct=null;append('Checkout is open. Enter your delivery details and choose payment, then tap PLACE ORDER. Your order is placed only after checkout succeeds.');
 topics();close();
}
function selectProduct(id){
 const p=currentCatalog().find(p=>String(p.id)===String(id)&&Number(p.stock)>0);if(!p)return;
 selectedProduct=p;append(p.name+' — Rs. '+Number(p.price).toLocaleString('en-PK')+'\nQuantity: 1. Delivery is free within Swabi District; outside Swabi Rs. 200.\nWould you like to continue to checkout?');
 choices([['Yes, continue',checkoutSelected],['Cancel',()=>{selectedProduct=null;append('Selection cancelled.');topics()}],['Choose another product',showShopping]]);
}
function showShopping(){
 selectedProduct=null;
 const catalog=currentCatalog().filter(p=>p&&p.id&&p.name).sort((a,b)=>Number(a.price)-Number(b.price));
 if(!catalog.length){append('Products are still loading. Please try again shortly, or use the product catalogue on this page.');topics();return}
 append('Choose a product below. Prices and availability are from the current catalogue.');
 for(const p of catalog){
 const card=document.createElement('div');card.className='rgChatMessage';
 if(p.photo&&/^(data:image\/(png|jpeg|webp);base64,|https:\/\/)/i.test(p.photo)){
 const img=document.createElement('img');img.src=p.photo;img.alt=p.name;img.loading='lazy';img.style.cssText='display:block;width:130px;height:130px;object-fit:contain;background:white;border-radius:8px;margin-bottom:8px';card.append(img);
 }
 const name=document.createElement('strong');name.textContent=p.name;card.append(name);
 const price=document.createElement('div');price.textContent='Rs. '+Number(p.price).toLocaleString('en-PK')+(Number(p.stock)>0?'':' · Out of stock');card.append(price);
 if(Number(p.stock)>0){const b=document.createElement('button');b.type='button';b.textContent='Order this product';b.style.cssText='margin-top:8px;padding:10px;border:0;border-radius:8px;background:#075f55;color:white;cursor:pointer';b.onclick=()=>selectProduct(p.id);card.append(b)}
 log.append(card);
 }
 while(log.children.length>40)log.firstElementChild.remove();log.scrollTop=log.scrollHeight;topics();
}
function ask(text){
 append(text,true);
 if(selectedProduct&&/^(yes|ha|han|haan|ji|confirm|ok)$/i.test(text.trim())){checkoutSelected();return}
 if(selectedProduct&&/^(cancel|no|nahi|nahin)$/i.test(text.trim())){selectedProduct=null;append('Selection cancelled.');topics();return}
 if(/^(human|owner|agent|insan)$/i.test(text.trim())){append('For a member of our team, open WhatsApp support: '+support+'.');topics();return}
 if(/^(menu|start|products?|prices?|shop)$/i.test(text.trim())||/show products to order|shop \/ order|products & prices|\b(?:buy|order)\b.*(?:facewash|serum|polish)|(?:facewash|serum|polish).*\b(?:buy|order)\b|order karna|order chahiye/i.test(text)){showShopping();return}
 append(reply(text,currentCatalog()).text);
}
function close(){panel.hidden=true;launch.setAttribute('aria-expanded','false');launch.focus()}
launch.onclick=()=>{if(!panel.hidden){close();return}panel.hidden=false;launch.setAttribute('aria-expanded','true');if(!log.children.length)append(reply('hello').text);input.focus()};
document.getElementById('rgChatClose').onclick=close;
panel.addEventListener('keydown',event=>{if(event.key==='Escape')close()});
document.getElementById('rgChatForm').onsubmit=event=>{event.preventDefault();const text=input.value.trim();if(!text)return;input.value='';ask(text);input.focus()};
topics();
})();

