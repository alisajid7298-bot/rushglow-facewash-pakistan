'use strict';
(()=>{
 const labels={welcome:'Welcome bheja gaya',product:'Product select kiya',yes:'جی ہاں dabaya',details:'Naam/address diya',order:'Order kiya',stalled_welcome:'Welcome ke baad',stalled_product:'Product ke baad',stalled_yes:'Naam/address ka intezar',stalled_details:'Payment/order ka intezar'};
 let busy=false,selected=null,next=null,listBusy=false;
 const $=id=>document.getElementById(id);
 const active=()=>document.getElementById('adminApp')?.style.display!=='none';
 async function get(action,query=''){
  const r=await fetch('/api/whatsapp?action='+action+query,{cache:'no-store',credentials:'same-origin'});
  const data=await r.json();if(!r.ok)throw Error(data.error||'Tracking load nahi ho saki.');return data;
 }
 function metric(key,count,description){
  const button=document.createElement('button');button.type='button';button.dataset.stage=key;
  button.style.cssText='margin:0;text-align:left;background:#f2f8f5;border:1px solid #c7ddd1;color:#163b35;padding:16px;min-width:0';
  button.setAttribute('aria-pressed',String(selected===key));
  const number=document.createElement('strong');number.style.cssText='display:block;font-size:28px;color:#08796b';number.textContent=count;
  const title=document.createElement('span');title.textContent=labels[key];const help=document.createElement('small');help.style.cssText='display:block;margin-top:8px;line-height:1.5';help.textContent=description;
  button.append(number,title,help);button.onclick=()=>showCustomers(key);return button;
 }
 function markSelected(){for(const b of $('waFunnel').querySelectorAll('button[data-stage]')){const yes=b.dataset.stage===selected;b.setAttribute('aria-pressed',String(yes));b.style.borderColor=yes?'#08796b':'#c7ddd1';b.style.background=yes?'#dff1e6':'#f2f8f5';}}
 async function refresh(){
  if(busy||!active()||!$('waFunnel'))return;busy=true;
  try{
   const d=await get('funnel'),c=d.counts;
   $('waFunnelMeta').textContent='Tracking shuru: '+new Date(d.started_at).toLocaleString('en-GB',{timeZone:'Asia/Karachi'})+' PKT · Har customer har step par sirf ek baar. Purani chats is count mein shamil nahi.';
   let stats=$('waContactStats');
   if(!stats){
    stats=document.createElement('div');stats.id='waContactStats';stats.style.cssText='margin:12px 0';
    const label=document.createElement('label');label.htmlFor='waContactPeriod';label.textContent='WhatsApp Contact Statistics';
    const select=document.createElement('select');select.id='waContactPeriod';select.style.cssText='display:block;width:100%;margin:8px 0;padding:10px';
    for(const [key,title] of [['today','Today'],['last7','Last 7 Days'],['last30','Last 30 Days']]){const option=document.createElement('option');option.value=key;option.textContent=title;select.append(option);}
    const tile=document.createElement('div');tile.style.cssText='padding:16px;border:1px solid #c7ddd1;border-radius:10px;background:#f2f8f5;color:#163b35';
    const n=document.createElement('strong');n.id='waContactCount';n.style.cssText='display:block;font-size:28px;color:#08796b';
    const t=document.createElement('span');t.textContent='Unique WhatsApp Contacts';tile.append(n,t);
    const note=document.createElement('small');note.textContent='Pakistan time · Aaj samet 7 / 30 calendar days';
    stats.append(label,select,tile,note);$('waFunnelCounts').before(stats);
   }
   const period=$('waContactPeriod');
   const renderContacts=()=>{$('waContactCount').textContent=d.contacts?.[period.value]??'—';};
   period.onchange=renderContacts;renderContacts();
   const cards=$('waFunnelCounts');cards.replaceChildren();
   for(const k of ['welcome','product','yes','details','order'])cards.append(metric(k,c[k],k==='welcome'?'WhatsApp ne accept kiya; read hona zaroori nahi.':(c.welcome?Math.round(c[k]/c.welcome*100):0)+'% welcome customers · Chats dekhein'));
   const waiting=$('waFunnelWaiting');waiting.replaceChildren();for(const k of ['stalled_welcome','stalled_product','stalled_yes','stalled_details'])waiting.append(metric(k,c[k],'Agla step abhi record nahi hua · Chats dekhein'));
   $('waFunnelFailures').textContent=d.failed_welcome?d.failed_welcome+' customers ka welcome fail hua; upar successful counts mein shamil nahi.':'';
   $('waFunnelNotice').textContent='Counts mein customer ka ab tak ka sabse aage wala step dikhaya jata hai. Intezar ka matlab customer ka chhor dena zaroori nahi; Representative ya manual order bhi ho sakta hai.';
   markSelected();
  }catch(e){$('waFunnelNotice').textContent=e.message;}finally{busy=false;}
 }
 async function showCustomers(stage,append=false){
  if(listBusy)return;listBusy=true;selected=stage;markSelected();$('waFunnelCustomers').hidden=false;$('waFunnelListTitle').textContent=labels[stage]+' — Customer chats';
  const box=$('waFunnelList');if(!append){box.replaceChildren();next=null;}$('waFunnelListNotice').textContent='Loading…';$('waFunnelMore').disabled=true;
  try{
   const data=await get('funnel_chats','&stage='+encodeURIComponent(stage)+'&cursor='+encodeURIComponent(append?next||'0':'0'));
   for(const c of data.customers){
    const row=document.createElement('div');row.style.cssText='padding:12px;border:1px solid #d5e4db;border-radius:10px;margin:8px 0;overflow-wrap:anywhere';
    const link=document.createElement('a');link.href='/whatsapp-inbox.html?phone='+encodeURIComponent(c.phone);link.target='_blank';link.rel='noopener';link.style.cssText='font-weight:bold;color:#08796b';link.textContent=(c.name||'Customer')+' · +'+c.phone+' — Open chat';
    const details=document.createElement('p');details.style.cssText='margin:8px 0;font-size:13px';const step=c.order_at?'order':c.details_at?'details':c.yes_at?'yes':c.product_at?'product':'welcome';details.textContent=labels[step]+(c.product_name?' · '+c.product_name:'')+(c.order_id?' · Order #'+c.order_id:'')+(c.paused?' · Bot paused':'')+(c.representative_at?' · Representative requested':'');
    const last=document.createElement('small');last.textContent=(c.last_message||'').slice(0,220);row.append(link,details,last);box.append(row);
   }
   next=data.next_cursor;$('waFunnelMore').hidden=!next;$('waFunnelMore').disabled=false;$('waFunnelListNotice').textContent=box.children.length?box.children.length+' customer chats dikh rahi hain.':'Abhi is group mein koi customer nahi.';
  }catch(e){$('waFunnelListNotice').textContent=e.message;}finally{listBusy=false;}
 }
 $('waFunnelRefresh').onclick=async()=>{await refresh();if(selected)await showCustomers(selected);};
 $('waFunnelMore').onclick=()=>showCustomers(selected,true);
 window.loadWhatsAppFunnel=refresh;
 setInterval(()=>{if(!document.hidden)refresh();},30000);
 window.addEventListener('focus',refresh);
 refresh();
})();
