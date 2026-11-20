'use strict';
// Local multilingual intent matching. Only confirmed catalogue/business facts
// are used; unrecognised questions go to a person instead of guessing.
const pashtoLocation=/\b(?:(?:kam|km|kama)\s+z(?:a|e|y)(?:y|ye|ay|ai|i|e)?|m[ei]l(?:a|o|aw|ow|awa|awo|ow[ao])\s*sh(?:e|i|ay|y))\b/i;
const urduLocation=/\b(?:kah(?:a|aa)n?|kidhar|k[ie]der|k[ia]dar|kidr|kdr)\b|کہاں|کدھر|کس جگہ/;
const urduAvailability=/\b(?:m[ei]l(?:t[ai]|te|ay|e|a|ega|ega|ayga|egi|aygi|eng[eiy]|na)|available|dastiyab)\b|مل(?:تا|تی|تے|ے|یں|نا)|دستیاب/;
const asksUrduLocation=q=>urduLocation.test(q)&&urduAvailability.test(q);
const pashtoOrder=/\b(?:order|ardar|ar[dt]er)\s+(?:kol|kawal|kawol|kawal[ao]y|kawam)\s+(?:g[hw]*ar[ae]m|g[hw]*war[ae]m|ghwaram|gwaram|gawaram)\b|آرډر\s+کول\s+غواړم/;
const urduOrder=/\b(?:order|ordar|ardar)\s+(?:karna|krna|kerna|karne|krne|dena|daina|dene)\s+(?:hai|he|hy|h|chaht[ai]\s*(?:hu|hoon|hon|hun)?)\b|(?:آرڈر|ارڈر)\s+(?:کرنا|دینا)\s+(?:ہے|چاہتا ہوں|چاہتی ہوں)/;
function language(q){
 if(pashtoLocation.test(q)||pashtoOrder.test(q))return 'ps';
 if(asksUrduLocation(q)||urduOrder.test(q))return 'ur';
 if(/[ښځټډړږڼګڅېۍ]/.test(q)||/\b(staso|satsu|stasu|zma|paker|pakar|melow|melawa|dokan|kam zaye|km zye|kemat|da de|dade|da zama|sa matlb|paxto|pashto|posheto|dey|dy|dersham)\b/.test(q))return 'ps';
 if(/[\u0600-\u06ff]/.test(q))return 'ur';
 if(/\b(kitn[aeiy]|ketn[aeiy]|qeemat|kimat|kya|khya|kaise|kasi|kese|kab|chahiye|chahei|muj[ei]|muji|hai|hain|he|karo|karna|kar[eiy]|pata|wala|matlab|matlb|din)\b/.test(q))return 'ur';
 return 'en';
}
const romanPashto={
 'ستاسو پوښتنه استازي ته ولېږل شوه. هغه به درسره مرسته وکړي.':'Staso pukhtana namayinda ta walegal shwa. Hagha ba dar sara madad kare.',
 'د واټس‌اپ آرډر لپاره ټولو ښارونو او ضلعو ته ډیلیوري وړیا ده.':'Da WhatsApp order lapara har shehar aw zila ta delivery free da.',
 'تاسو د پارسل ترلاسه کولو پر وخت نغدې پیسې یا ایزي پیسه کارولی شئ.':'Taso Cash on Delivery ya EasyPaisa use kawalay shay. Pa COD ke che parcel dar ta rasegi, bia paise warkray.',
 'مخ لوند کړئ، لږ فېس واش په نرمه توګه وموښئ او په اوبو یې ووینځئ. له سترګو یې لرې وساتئ.':'Makh lond kray, lag Facewash pa narmi sara wamoonday aw pa obo ye waminzay. Da stargo na ye lere satay.',
 'په پاک لږ لوند مخ یې په نرمه توګه ووهئ او ووینځئ. ډېر مه موښئ او له سترګو یې لرې وساتئ.':'Pa pak aw lag lond makh ye pa narmi sara walagaway aw waminzay. Der ye ma moonday aw da stargo na ye lere satay.',
 'په پاک وچ مخ لږ سیرم ووهئ، جذب کېدو ته یې پرېږدئ او د بسته لارښوونې تعقیب کړئ. د ورځې سن سکرین وکاروئ.':'Pa pak aw woch makh lag serum walagaway, che jazb shi, da pack hidayat follow kray. Da wrazay sunscreen use kray.',
 ' (نشته)':' (nashte)',
 'ډیلیوري وړیا ده. د آرډر لپاره د پروډکټ نمبر راولېږئ.':'Delivery bilkul free da. Da order lapara da product number rawalegay.',
 'د پروډکټ نمبر راولېږئ، هو ولیکئ، بیا نوم، فون نمبر او بشپړ پته راکړئ. وروسته د تادیې طریقه وټاکئ.':'Da product number rawalegay, aw walikay, bia khpal num, phone number aw mukamal address rawkray. Bia da payment tareeqa select kray.'
};
const phrase=(lang,ur,ps,en)=>lang==='ps'?(romanPashto[ps]||en):({ur,en}[lang]);
function ranks(q){const r=[];
 if(/face\s*(?:wash|wach|wachh|each)|facewash|فیس\s*واش|فېس\s*واش/.test(q))r.push(0);
 if(/skin\s*polish|polish|پالش|پولش/.test(q))r.push(1);
 if(/ser[ua]m|seram|se?rum|سیرم|سېروم|سیروم/.test(q))r.push(2);
 if(/combo|full\s*set|complete\s*set|all\s*(?:products|three)|مکمل\s*سیٹ|کومبو|ټول\s*سیټ/.test(q))return [3];
 return r;
}
function classify(q,state,products,presentation,price){
 const lang=language(q),say=(ur,ps,en)=>phrase(lang,ur,ps,en);
 const active=['confirm','details','city','payment','proof'].includes(state.stage);
 const menu=!active;
 const question=/[?؟]|\b(kitn[aeiy]|ketn[aeiy]|qeemat|kimat|kemat|kya|khya|kaise|kasi|kese|kab|where|how|what|when|which|can i|do you|is it|km zye|kam zaye|kama zaye|sa matlb|da de|dade|melow she|melawa she)\b|قیمت|کتن[ایے]|کیسے|کہاں|کب|څنګه|چېرته|څومره|څه/.test(q);
 const phone=/\d(?:[\s-]*\d){9,}/.test(q),address=/\b(?:address|district|city|house|street|mohalla|mahalla|name)\s*[:\-]|(?:نام|پتہ|شہر|ضلع)\s*[:：]/.test(q);
 if(phone||address)return null;
 const found=ranks(q);const matches=products.filter(p=>found.includes(presentation(p)?.rank));
 const selected=products.find(p=>String(p.id)===String(state.productId||state.faqProductId));
 const reply=(message,extra={})=>({message,...extra});
 const human=()=>reply(say('آپ کا سوال نمائندے کو بھیج دیا گیا ہے۔ وہ آپ کی مدد کریں گے۔','ستاسو پوښتنه استازي ته ولېږل شوه. هغه به درسره مرسته وکړي.','Your question has been sent to our representative. They will help you here.'),{handoff:true});
 // A clarification of the address prompt is not a request for a representative.
 if(['details','city'].includes(state.stage)&&/^(?:da\s*(?:de|di)\s+sa\s+mat(?:a)?l[ae]?b\s*(?:de|dy|day)?|(?:is|as|es)\s+ka\s+(?:kya|khya)\s+mat(?:a)?l[ae]?b\s*(?:hai|ha|he)?\s*(?:g|ji)?|what does (?:this|that|it) mean|what do you mean|اس کا کیا مطلب ہے)[\s?؟.!۔]*$/.test(q)){
  const message=lang==='ps'?'Taso munga ta phone number aw mukamal address rawalegay, nu staso order ba confirm she.':lang==='ur'?'آپ اپنا فون نمبر اور مکمل ڈیلیوری پتہ بھیجیں، پھر ادائیگی کا طریقہ منتخب کریں تاکہ آرڈر مکمل ہو جائے۔':'Please send your phone number and complete delivery address, then choose your payment method to complete the order.';
  return reply(message);
 }
 if(!found.length&&/\b(?:cream|cram)\b|کریم/.test(q))return human();
 if(/\b(?:rash|allerg\w*|pregnan\w*|cure|treat|refund|return|complaint|damaged|side effects?|guarantee|side effect|kharab|masla)\b|الرجی|حاملہ|علاج|گارنٹی|شکایت|خراب|واپسی/.test(q))return human();
 if(/\b(?:track|tracking|status|where.*order|order.*where|parcel.*(?:kab|where)|kitn[aeiy] din|ketn[aeiy] din|kab (?:ay|aa)|delivery time|how long|how many days|when.*(?:deliver|arrive)|delivery.*(?:days|time|kab))\b|کتنے دن|کب آئے|کب پہنچے|پارسل کہاں|څو ورځې/.test(q))return human();
 const location=/\b(?:shop|store|dukan|dukaan|dokan|pickup|pick up|location|visit|melow she|melawa she|milawa she|k[ia]dar|k[ie]der|kahan|km zye|kam zaye|where.*(?:buy|get|find|available)|(?:milta|milti|milega|milay ga|melta)\b)|دکان|لوکیشن|کہاں مل|دوکان|چېرته/.test(q);
 const orderIntent=!found.length&&(menu||state.stage==='confirm'||state.stage==='details')&&!/\b(?:nahi|nahin|na|not|no|cancel|don.t)\b|نہیں|منسوخ|نه/.test(q)&&(pashtoOrder.test(q)||urduOrder.test(q)||/\b(?:i want to (?:place an? |make an? )?order|i (?:want|would like) to buy)\b/.test(q));
 if(orderIntent||pashtoLocation.test(q)||asksUrduLocation(q)||(location&&(question||found.length||/\b(?:k[ia]dar|k[ie]der|kahan|milta|melta)\b/.test(q)))){
  const available=products.filter(p=>presentation(p)&&Number(p.stock)>0);
  const lines=available.filter((p,i,a)=>a.findIndex(x=>presentation(x).rank===presentation(p).rank)===i).sort((a,b)=>presentation(a).rank-presentation(b).rank).map(p=>presentation(p).name+' — Rs. '+price(p.price));
  if(!lines.length)return human();
  const message=lang==='ps'?'Taso os zamunga product pa WhatsApp direct order kawalay shay. Da product name, phone number aw mukamal address (shehar aw zila) rawalegay. Delivery free da. Cash on Delivery ba order confirm shi.':lang==='ur'?'اب آپ ہماری پروڈکٹس اسی واٹس‌اپ سے براہِ راست آرڈر کر سکتے ہیں۔ پروڈکٹ کا نام، فون نمبر اور مکمل پتہ (شہر اور ضلع سمیت) بھیج دیں۔ ڈیلیوری مفت ہے۔ آپ کا آرڈر کیش آن ڈیلیوری پر کنفرم ہو جائے گا۔':'You can order directly on this WhatsApp. Send the product name, phone number and complete address (city and district). Delivery is free. Your order will be confirmed on Cash on Delivery.';
  const orderMessage=lang==='ps'?'Tek da. Ta kam product order ke? Munga ta da product name, phone number aw mukamal address (shehar aw zila) rawalegay. Delivery free da. Sta order ba Cash on Delivery confirm shi.':lang==='ur'?'ٹھیک ہے، آپ کون سی پروڈکٹ آرڈر کرنا چاہتے ہیں؟ پروڈکٹ کا نام، فون نمبر اور مکمل پتہ (شہر اور ضلع سمیت) بھیج دیں۔ ڈیلیوری مفت ہے۔ آپ کا آرڈر کیش آن ڈیلیوری پر کنفرم ہو جائے گا۔':'Sure! Which product would you like to order? Send the product name, phone number and complete address (city and district). Delivery is free. Your order will be confirmed on Cash on Delivery.';
  return reply((orderIntent?orderMessage:message)+'\n\n'+lines.join('\n'),{directDetails:!state.quickOrder&&(menu||state.stage==='confirm'||(!orderIntent&&state.stage==='details')),language:lang});
 }
 if(/\b(?:delivery|delev[ei]r[ye]|shipping|courier|deliver|charges|delivery fee)\b|ڈیلیوری|ترسیل|وړیا|رسونه/.test(q)&&question&&!/(?:cash on delivery|keshe on delevre|kishe on delevre)/i.test(q))return reply(say('تمام شہروں اور اضلاع میں واٹس‌اپ آرڈر پر ڈیلیوری مفت ہے۔','د واټس‌اپ آرډر لپاره ټولو ښارونو او ضلعو ته ډیلیوري وړیا ده.','Delivery is free for WhatsApp orders in all cities and districts.'));
 if(/\b(?:cash on delivery|cash|cod|easypaisa|easy paisa|payment|keshe on delevre|kishe on delevre)\b|کیش آن ڈیلیوری|ایزی پیسہ|ادائیگی/.test(q)&&question)return reply(say('آپ کیش آن ڈیلیوری یا ایزی پیسہ سے ادائیگی کر سکتے ہیں۔ کیش آن ڈیلیوری میں پارسل ملنے پر رقم ادا کریں۔','تاسو د پارسل ترلاسه کولو پر وخت نغدې پیسې یا ایزي پیسه کارولی شئ.','You can pay by Cash on Delivery or EasyPaisa. With COD, pay when the parcel arrives.'));
 if(/\b(?:use|usage|apply|ist[ei]mal|istemal|lagan[ae]|laga|kaise lag|how to use)\b|استعمال|لگانے|څنګه استعمال/.test(q)&&question){const rank=found.length===1?found[0]:presentation(selected||{name:''})?.rank; if(rank===0)return reply(say('چہرہ گیلا کریں، تھوڑی مقدار سے نرمی سے مساج کریں اور پانی سے دھو لیں۔ آنکھوں سے بچائیں۔ پیک پر درج ہدایات پر عمل کریں۔','مخ لوند کړئ، لږ فېس واش په نرمه توګه وموښئ او په اوبو یې ووینځئ. له سترګو یې لرې وساتئ.','Wet your face, gently massage a small amount, rinse and avoid your eyes. Follow the label instructions.'));if(rank===1)return reply(say('صاف اور ہلکے گیلے چہرے پر نرمی سے لگائیں اور دھو لیں۔ زیادہ رگڑنے اور آنکھوں سے بچیں۔ پیک کی ہدایات پڑھیں۔','په پاک لږ لوند مخ یې په نرمه توګه ووهئ او ووینځئ. ډېر مه موښئ او له سترګو یې لرې وساتئ.','Apply gently to clean, slightly damp skin and rinse. Avoid excessive rubbing and the eyes; follow the label.'));if(rank===2)return reply(say('صاف خشک چہرے پر تھوڑی مقدار لگائیں، جذب ہونے دیں اور پیک کی ہدایات پر عمل کریں۔ دن میں سن اسکرین استعمال کریں۔','په پاک وچ مخ لږ سیرم ووهئ، جذب کېدو ته یې پرېږدئ او د بسته لارښوونې تعقیب کړئ. د ورځې سن سکرین وکاروئ.','Apply a small amount to clean, dry skin, let it absorb, and follow the label. Use sunscreen during the day.'));return human();}
 const priceQuestion=/\b(?:price|cost|rate|qeemat|kimat|kemat|kitn[aeiy]|ketn[aeiy]|how much|dade)\b|قیمت|کتن[ایے]|بیه|څومره/.test(q);
 if(priceQuestion){const candidates=matches.length?matches:selected?[selected]:products.filter(p=>presentation(p));const unique=candidates.filter((p,i,a)=>a.findIndex(x=>presentation(x)?.rank===presentation(p)?.rank)===i).sort((a,b)=>presentation(a).rank-presentation(b).rank);if(!unique.length)return human();const lines=unique.map(p=>`${presentation(p).rank+1}. ${presentation(p).name} — Rs. ${price(p.price)}${Number(p.stock)>0?'':say(' (دستیاب نہیں)',' (نشته)',' (out of stock)')}`);return reply(lines.join('\n')+'\n\n'+say('ڈیلیوری مفت ہے۔ آرڈر دینے کے لیے پروڈکٹ کا نمبر بھیجیں۔','ډیلیوري وړیا ده. د آرډر لپاره د پروډکټ نمبر راولېږئ.','Free delivery. Send the product number to order.'),{faqProductId:unique.length===1?String(unique[0].id):undefined});}
 if(menu&&/\b(?:how.*order|order.*how|kasi order|kaise order|kese order|order kr|order kar|checkout)\b|آرڈر کیسے|څنګه آرډر/.test(q)&&question)return reply(say('پروڈکٹ کا نمبر بھیجیں، جی ہاں لکھیں، پھر اپنا نام، فون نمبر اور مکمل پتہ دیں۔ اس کے بعد ادائیگی کا طریقہ منتخب کریں۔','د پروډکټ نمبر راولېږئ، هو ولیکئ، بیا نوم، فون نمبر او بشپړ پته راکړئ. وروسته د تادیې طریقه وټاکئ.','Send a product number, confirm, enter your name, phone number and full address, then select a payment method.'));
 if((menu||state.stage==='confirm')&&found.length>1)return human();
 if((menu||state.stage==='confirm')&&matches.length===1&&!question&&(/\b(?:want|need|buy|order|only|chahiye|chahei|paker|pakar|pake?r|serf|sirf)\b|چاہیے|خرید|پکار/.test(q)||q.length<=35)){return {productId:String(matches[0].id)};}
 if(question||((menu||state.stage==='confirm')&&/\b(?:cream|cram|beauty cream|buty cram|discount|offer|pashto|paxto|posheto)\b|کریم|آفر/.test(q)))return human();
 return null;
}
module.exports={classify,language,ranks};
