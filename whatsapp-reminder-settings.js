(()=>{
 const box=document.getElementById('waReminderSettings');if(!box)return;
 const details=document.createElement('details');
 const label=document.createElement('summary');label.textContent='30-minute order reminder — View settings';label.style.cssText='cursor:pointer;font-weight:700;color:#08796b;padding:10px 0';
 const state=document.createElement('p');state.setAttribute('role','status');state.textContent='Loading reminder setting...';
 const button=document.createElement('button');button.type='button';button.disabled=true;
 const note=document.createElement('p');note.textContent='Product select karne ke baad customer 30 minute tak aage na barhe to ek reminder. Order complete/cancel, paused bot aur Representative chats par nahi. Timing customer ke aakhri message se hai. Naye checkout par lagu hoga.';
 const preview=document.createElement('p');preview.dir='rtl';preview.lang='ur';preview.style.whiteSpace='pre-wrap';preview.textContent='السلام علیکم!\nکیا آپ کو آرڈر کرنے میں کوئی مشکل پیش آ رہی ہے، یا آپ کسی اور پروڈکٹ کے بارے میں معلومات چاہتے ہیں؟ براہِ کرم ہمیں بتائیں، ہم آپ کی مدد کے لیے حاضر ہیں۔\n\nRushGlow Beauty & Skin Care';
 const check=document.createElement('button');check.type='button';check.textContent='Check reminder scheduler';check.style.marginLeft='8px';
 const health=document.createElement('p');health.setAttribute('role','status');
 details.append(label,state,button,check,health,note,preview);box.append(details);let enabled=false;
 async function refresh(){try{const r=await fetch('/api/whatsapp?action=status',{credentials:'same-origin',cache:'no-store'});if(!r.ok)return;const d=await r.json();enabled=d.reminderEnabled===true;health.textContent=d.reminderLastCheck?'Scheduler last verified: '+new Date(d.reminderLastCheck).toLocaleString():'Scheduler verification pending';state.textContent='Reminder '+(enabled?'ON':'OFF')+(d.enabled?'':' · Bot OFF, reminders will not be sent')+(d.reminderErrors?' · Scheduling error: '+d.reminderErrors+' reminder(s). Contact admin.':'');button.textContent=enabled?'Turn reminder OFF':'Turn reminder ON';button.disabled=false;}catch{state.textContent='Reminder setting could not load. Refresh to retry.'}}
 button.onclick=async()=>{button.disabled=true;try{const r=await fetch('/api/whatsapp?action=reminder_setting',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:!enabled})});if(!r.ok)throw new Error();await refresh()}catch{state.textContent='Reminder setting could not be saved. Try again.';button.disabled=false}};
 check.onclick=async()=>{check.disabled=true;health.textContent='Testing scheduler; no customer message will be sent.';try{const r=await fetch('/api/whatsapp?action=reminder_check',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'});if(!r.ok)throw new Error();for(let i=0;i<6;i++){await new Promise(resolve=>setTimeout(resolve,5000));await refresh()}}catch{health.textContent='Scheduler check failed. Contact admin.'}finally{check.disabled=false}};
 window.refreshRushGlowReminder=refresh;refresh();window.addEventListener('focus',refresh);
})();
