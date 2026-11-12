'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
const root=path.join(__dirname,'..');
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let history=[];
try{history=cp.execFileSync('git',['log','-8','--format=%cI%x09%s'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim().split('\n').filter(Boolean).map(line=>{const i=line.indexOf('\t');return {date:line.slice(0,i),summary:line.slice(i+1).slice(0,1000)}})}catch{}
const message=String(process.env.VERCEL_GIT_COMMIT_MESSAGE||history[0]?.summary||'Website deployment updated').trim().slice(0,2000);
const deployedAt=new Date().toISOString();
const baseline=JSON.parse(fs.readFileSync(path.join(root,'lib/update-history.json'),'utf8'));
const seen=new Set();const recent=[{date:deployedAt,summary:message},...history,...baseline].filter(x=>{if(!x.summary||seen.has(x.summary))return false;seen.add(x.summary);return true}).slice(0,12);
const metadata={deployed_at:deployedAt,commit:process.env.VERCEL_GIT_COMMIT_SHA||'',summary:message,recent_updates:recent};
fs.writeFileSync(path.join(root,'lib/deployment-updates.json'),JSON.stringify(metadata,null,2)+'\n');
const date=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Karachi',day:'numeric',month:'long',year:'numeric'}).format(new Date(deployedAt));
let html=fs.readFileSync(path.join(root,'admin.html'),'utf8');
html=html.replace(/(<summary id="emailUpdatesHeading"[^>]*>)[\s\S]*?(<\/summary>)/,(_,a,b)=>a+'Email Latest Updates — '+escape(date)+b);
html=html.replace(/(<p id="emailUpdatesDescription">)[\s\S]*?(<\/p>)/,(_,a,b)=>a+'Latest deployed update: '+escape(message)+b);
fs.writeFileSync(path.join(root,'admin.html'),html);
console.log('Generated deployment update summary for '+date);
