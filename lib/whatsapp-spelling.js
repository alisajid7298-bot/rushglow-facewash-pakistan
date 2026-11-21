'use strict';
// Match intent vocabulary only. Never rewrite customer names, addresses, phone
// numbers, transaction IDs or payment/confirmation commands.
const questionWords=['sanga','tsanga','senga','tsenga','tsomra','somra','kaise','kese','kahan','kidhar','kitna','kitni','kab','kya','how','where','when','which','what'];
const topicWords=['istemalom','istemalawom','istemal','istimal','lagawom','usage','delivery','qeemat','kemat','kimat','price','parcel','facewash','skinpolish','serum','whitening','combo','product','available','milega'];
const equivalent={sanga:'sanga',tsanga:'sanga',senga:'sanga',tsenga:'sanga',kaise:'kaise',kese:'kaise',istemal:'istemal',istimal:'istemal',istemalom:'istemalom',istemalawom:'istemalom'};
const exact=new Set([...questionWords,...topicWords]);
function oneEdit(a,b){
 if(a===b)return true;
 if(Math.abs(a.length-b.length)>1)return false;
 let i=0;while(i<Math.min(a.length,b.length)&&a[i]===b[i])i++;
 if(a.length===b.length)return a.slice(i+1)===b.slice(i+1)||(a[i]===b[i+1]&&a[i+1]===b[i]&&a.slice(i+2)===b.slice(i+2));
 return a.length>b.length?a.slice(i+1)===b.slice(i):a.slice(i)===b.slice(i+1);
}
function closest(word,choices){
 if(exact.has(word))return word;
 if(word.length<4||word.length>20)return word;
 const aliases={sngaa:'sanga',snga:'sanga',istmalom:'istemalom',istemlom:'istemalom',istmal:'istemal',delivry:'delivery',qimat:'qeemat',facwash:'facewash',serm:'serum'};
 if(aliases[word])return aliases[word];
 const matches=[...new Set(choices.filter(c=>c.length>=4&&oneEdit(word,c)).map(c=>equivalent[c]||c))];
 return matches.length===1?matches[0]:word;
}
function correctQuestion(value){
 const q=String(value||'');
 if(q.length>300||/\d|\n|\b(?:address|house|street|road|bazaa?r|mohalla|mahalla|village|district|city|name)\s*[:：-]|(?:نام|پتہ|شہر|ضلع)\s*[:：-]/i.test(q))return q;
 const words=q.match(/[a-z]+/g)||[];
 const corrected=words.map(w=>closest(w,[...questionWords,...topicWords]));
 const hasTopic=corrected.some(w=>topicWords.includes(w));
 const hasQuestion=corrected.some(w=>questionWords.includes(w))||/[?؟]/.test(q);
 // Require evidence of a question and a shop topic or conversational prefix.
 if(!hasQuestion||(!hasTopic&&!/^(?:da\s+ba|da\s+de|sta\s+da|is\s+ko|ye\s+kaise)\b/.test(q)))return q;
 let index=0;return q.replace(/[a-z]+/g,()=>corrected[index++]);
}
module.exports={correctQuestion};
