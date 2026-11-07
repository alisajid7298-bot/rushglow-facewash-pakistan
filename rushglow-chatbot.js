document.body.insertAdjacentHTML('beforeend',"<style>\n#rgChatLaunch{position:fixed;right:18px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:1000;border:0;border-radius:28px;background:#075f55;color:#fff;padding:14px 20px;font:700 15px Arial;box-shadow:0 4px 20px #0003;cursor:pointer}\n#rgChat{position:fixed;right:18px;bottom:calc(145px + env(safe-area-inset-bottom));width:min(370px,calc(100vw - 24px));max-height:70dvh;z-index:1100;background:#fff;border:1px solid #d5e6df;border-radius:18px;box-shadow:0 12px 40px #0003;overflow:hidden;color:#15372d;font-family:Arial,sans-serif}\n#rgChat[hidden]{display:none}#rgChat header{position:static;display:flex;justify-content:space-between;align-items:center;padding:14px;background:#075f55;color:white}#rgChat header button{background:transparent;color:white;border:0;font-size:26px;min-width:44px;min-height:44px;cursor:pointer}\n#rgChatLog{height:260px;max-height:35dvh;overflow:auto;padding:14px;background:#f5faf7}.rgChatMessage{padding:11px;border-radius:12px;background:#e4f1eb;margin:0 0 10px;line-height:1.5;font-size:14px;white-space:pre-wrap;overflow-wrap:anywhere}.rgChatMessage.user{background:#075f55;color:white;margin-left:35px}.rgChatMessage a{color:#075f55;text-decoration:underline}\n#rgChatChoices{display:flex;flex-wrap:wrap;gap:6px;padding:10px}#rgChatChoices button{border:1px solid #c1d8cf;border-radius:20px;background:white;color:#075f55;padding:9px;font-size:12px;cursor:pointer}\n#rgChat form{display:flex;gap:6px;padding:10px;border-top:1px solid #eee}#rgChat input{min-width:0;flex:1;padding:12px;border:1px solid #bdcec6;border-radius:8px;font-size:16px}#rgChat form button{background:#075f55;color:white;border:0;border-radius:8px;padding:12px;cursor:pointer}\n#rgChat small{display:block;padding:0 12px 10px;font-size:11px;color:#586d63}@media(max-width:480px){#rgChat{right:12px;bottom:calc(140px + env(safe-area-inset-bottom))}#rgChatLaunch{right:12px}}\n</style>\n<button id=\"rgChatLaunch\" aria-controls=\"rgChat\" aria-expanded=\"false\">💬 Ask RushGlow</button>\n<section id=\"rgChat\" role=\"dialog\" aria-labelledby=\"rgChatTitle\" hidden>\n<header><strong id=\"rgChatTitle\">RushGlow Shopping Assistant</strong><button id=\"rgChatClose\" aria-label=\"Close chatbot\">×</button></header>\n<div id=\"rgChatLog\" role=\"log\" aria-live=\"polite\" aria-relevant=\"additions\"></div>\n<div id=\"rgChatChoices\"></div>\n<form id=\"rgChatForm\"><input id=\"rgChatInput\" aria-label=\"Your question\" placeholder=\"Ask about products or delivery…\" maxlength=\"500\" autocomplete=\"off\"><button type=\"submit\">Send</button></form>\n<small>Shopping assistant · Complete orders securely in checkout. Never share passwords or OTPs.</small>\n</section>\n");

(()=>{

const support='https://wa.me/923427278255';
const greeting='Assalamualaikum! Welcome to RushGlow. Which product would you like to order? Tap View Products to see photos and current prices.';

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
 choices([['View Products',showShopping],['Track Order',()=>{close();document.getElementById('track').scrollIntoView({behavior:'smooth'})}],['Talk to Team',()=>ask('owner')]]);
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
 if(/^(hi|hello|salam|salaam|assalam.*|سلام|السلام علیکم)$/i.test(text.trim())){append(greeting);topics();return}
 if(/face\\s*wash|serum|polish|price|qeemat|product|order|خرید|قیمت|آرڈر/i.test(text)){showShopping();return}
 append('Please tap View Products to choose your product, or Talk to Team for help.');topics();
}
function close(){panel.hidden=true;launch.setAttribute('aria-expanded','false');launch.focus()}
launch.onclick=()=>{if(!panel.hidden){close();return}panel.hidden=false;launch.setAttribute('aria-expanded','true');if(!log.children.length)append(greeting);input.focus()};
document.getElementById('rgChatClose').onclick=close;
panel.addEventListener('keydown',event=>{if(event.key==='Escape')close()});
document.getElementById('rgChatForm').onsubmit=event=>{event.preventDefault();const text=input.value.trim();if(!text)return;input.value='';ask(text);input.focus()};
topics();
})();

