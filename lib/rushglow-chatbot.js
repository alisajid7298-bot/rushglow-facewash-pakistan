'use strict';
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
 if(/payment|pay |cash|cod|easypaisa|easy paisa|card|bank/.test(q))
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
module.exports={reply};
