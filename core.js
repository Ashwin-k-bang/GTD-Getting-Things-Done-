'use strict';
/* GTD Dashboard core: storage, sync, date helpers, tab-rule logic, shared UI */
const G=(()=>{
const COLS=['#2f6fed','#e8590c','#2f9e44','#ae3ec9','#0c8599','#c2255c','#f08c00','#5c7cfa'];
const S={cats:[],tasks:[],rems:[],tabs:[]},K=Object.keys(S);
let db=null,subs=[],tm=null,busy=false;
const G={COLS,S,status:''};
G.uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
G.esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pad=n=>String(n).padStart(2,'0');
G.today=()=>{const d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
G.diff=s=>Math.round((new Date(s+'T00:00')-new Date(G.today()+'T00:00'))/864e5);
G.parseMin=s=>{s=(s||'').toLowerCase().trim();if(!s)return 0;if(/^\d+$/.test(s))return +s;let m=0;const h=s.match(/(\d+(?:\.\d+)?)\s*h/),i=s.match(/(\d+)\s*m/);if(h)m+=Math.round(parseFloat(h[1])*60);if(i)m+=+i[1];return m};
G.fmt=m=>!m?'':m<60?m+'m':Math.floor(m/60)+'h'+(m%60?' '+(m%60)+'m':'');
G.dueLabel=d=>{if(!d)return'No deadline';const n=G.diff(d);return d+(n===0?' · due today':n===1?' · due tomorrow':n>1?' · in '+n+' days':' · '+(-n)+' day'+(n===-1?'':'s')+' overdue')};
const rawCfg=()=>{try{return JSON.parse(localStorage.getItem('gtd.cfg'))||{}}catch(e){return{}}};
G.cfg=()=>{const o={...(window.GTD_DEFAULTS||{})},l=rawCfg();Object.keys(l).forEach(k=>{if(l[k]!==''&&l[k]!=null)o[k]=l[k]});return o};
G.setCfg=o=>localStorage.setItem('gtd.cfg',JSON.stringify({...rawCfg(),...o}));
/* ---------- local storage (IndexedDB) ---------- */
const openDB=()=>new Promise(r=>{try{const q=indexedDB.open('gtd',1);q.onupgradeneeded=()=>q.result.createObjectStore('s');q.onsuccess=()=>{db=q.result;r()};q.onerror=()=>r()}catch(e){r()}});
const load=()=>new Promise(r=>{if(!db)return r();try{const g=db.transaction('s').objectStore('s').get('state');g.onsuccess=()=>{if(g.result)K.forEach(k=>S[k]=g.result[k]||[]);r()};g.onerror=()=>r()}catch(e){r()}});
const persist=()=>{if(db)try{db.transaction('s','readwrite').objectStore('s').put(JSON.parse(JSON.stringify(S)),'state')}catch(e){}};
const emit=()=>subs.forEach(f=>f());
G.onChange=f=>subs.push(f);
const setStatus=s=>{G.status=s;emit()};
/* ---------- records (all carry "updated"; deletes are "deleted" markers) ---------- */
G.list=k=>S[k].filter(r=>!r.deleted);
G.get=(k,id)=>S[k].find(r=>r.id===id&&!r.deleted);
G.put=(k,o)=>{if(!o.id)o.id=G.uid();if(!o.created)o.created=Date.now();o.updated=Date.now();const i=S[k].findIndex(r=>r.id===o.id);if(i<0)S[k].push(o);else S[k][i]=o;persist();emit();queue();return o};
G.del=(k,id)=>{const r=S[k].find(x=>x.id===id);if(!r)return;r.deleted=true;r.updated=Date.now();persist();emit();queue()};
G.delCategory=id=>{const t=Date.now();S.cats.concat(S.tasks.filter(x=>x.cat===id),S.rems.filter(x=>x.cat===id)).forEach(r=>{if(r.id===id||r.cat===id){r.deleted=true;r.updated=t}});persist();emit();queue()};
G.open=()=>G.list('tasks').filter(t=>!t.done);
G.byDue=(a,b)=>{const x=a.dl||'9999',y=b.dl||'9999';if(x!==y)return x<y?-1:1;const c=G.get('cats',a.cat),d=G.get('cats',b.cat);return((c&&c.name)||'').localeCompare((d&&d.name)||'')};
/* ---------- tab rules ---------- */
G.match=(t,b)=>{if(t.done||t.deleted)return false;if(b.rule==='none')return!t.dl;if(!t.dl)return false;const d=G.diff(t.dl);
 if(b.rule==='overdue')return d<0;if(d<0)return false;
 switch(b.rule){case'exact':return d===b.a;case'within':return d<=b.a;case'between':return d>=b.a&&d<=b.b;
 case'month':return t.dl.slice(0,7)===G.today().slice(0,7);
 case'week':{const end=+(G.cfg().weekEnd||0);return d<=((end-new Date().getDay()+7)%7)}}
 return false};
const DEFAULT_TABS=[['def-today','Due Today','exact',0],['def-tomorrow','Due Tomorrow','exact',1],['def-3days','Due in 3 Days','exact',3],['def-week','Due This Week','week',0]];
const seed=()=>{DEFAULT_TABS.forEach(([id,name,rule,a],i)=>{if(!S.tabs.find(t=>t.id===id))S.tabs.push({id,name,rule,a,b:0,order:i,updated:0,created:0})});persist()};
/* ---------- GitHub sync (newest update wins) ---------- */
const b64e=s=>{const b=new TextEncoder().encode(s);let o='';for(let i=0;i<b.length;i+=8192)o+=String.fromCharCode.apply(null,b.subarray(i,i+8192));return btoa(o)};
const b64d=s=>new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g,'')),c=>c.charCodeAt(0)));
const ghUrl=c=>'https://api.github.com/repos/'+c.repo+'/contents/'+(c.path||'data/gtd.json');
const hdr=c=>({'Authorization':'Bearer '+c.token,'Accept':'application/vnd.github+json'});
async function ghGet(c){const r=await fetch(ghUrl(c)+'?ref='+encodeURIComponent(c.branch||'main'),{headers:hdr(c),cache:'no-store'});
 if(r.status===404)return{data:null};if(!r.ok)throw new Error('GitHub '+r.status);const j=await r.json();return{data:JSON.parse(b64d(j.content)),sha:j.sha}}
async function ghPut(c,sha){const body={message:'GTD sync',content:b64e(JSON.stringify(Object.assign({version:1},S),null,1)),branch:c.branch||'main'};if(sha)body.sha=sha;
 const r=await fetch(ghUrl(c),{method:'PUT',headers:Object.assign({'Content-Type':'application/json'},hdr(c)),body:JSON.stringify(body)});
 if(r.status===409||r.status===422)throw new Error('conflict');if(!r.ok)throw new Error('GitHub '+r.status)}
G.merge=remote=>{let push=false;K.forEach(k=>{const rm=new Map((remote[k]||[]).map(r=>[r.id,r])),out=new Map(rm);
 S[k].forEach(l=>{const r=rm.get(l.id);if(!r||(l.updated||0)>(r.updated||0)){out.set(l.id,l);push=true}});
 S[k]=[...out.values()]});return push};
const queue=()=>{const c=G.cfg();if(!c.token||!c.repo)return;clearTimeout(tm);tm=setTimeout(()=>G.sync(),2500)};
G.sync=async quiet=>{const c=G.cfg();if(!c.token||!c.repo){setStatus('Sync is off (add GitHub details in ⚙)');return}
 if(busy)return;busy=true;const before=JSON.stringify(S);if(!quiet)setStatus('Syncing…');
 try{for(let n=0;n<2;n++){const r=await ghGet(c);let push=true;if(r.data)push=G.merge(r.data);seed();persist();
   try{if(push)await ghPut(c,r.sha);const t='Synced '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    if(quiet&&JSON.stringify(S)===before){G.status=t;document.querySelectorAll('#status,#sstat').forEach(e=>e.textContent=t)}else setStatus(t);break}
   catch(e){if(e.message!=='conflict'||n)throw e}}}
 catch(e){const code=(e.message.match(/GitHub (\d+)/)||[])[1],M={401:'token rejected, make a new one',403:'token needs Contents: Read and write on that repo',404:'repo not found, or the token has no access to it',conflict:'could not save; make sure the repo has a README so the main branch exists'};
  setStatus('Sync error: '+(M[code]||M[e.message]||e.message))}finally{busy=false}};
/* one-link setup: index.html#setup=... carries the sync details to a new device */
G.setupLink=()=>{const c=G.cfg(),p={repo:c.repo,branch:c.branch||'',path:c.path||'',token:c.token,weekEnd:c.weekEnd||0};
 return location.origin+location.pathname.replace(/[^/]*$/,'')+'index.html#setup='+encodeURIComponent(b64e(JSON.stringify(p)))};
const applySetup=()=>{const m=/[#&]setup=([^&]+)/.exec(location.hash);if(!m)return;
 try{const o=JSON.parse(b64d(decodeURIComponent(m[1])));if(o&&o.repo&&o.token)G.setCfg({repo:o.repo,branch:o.branch||'',path:o.path||'',token:o.token,weekEnd:+o.weekEnd||0})}catch(e){}
 history.replaceState(null,'',location.pathname+location.search)};
/* ---------- shared UI ---------- */
G.catBar=active=>{const o=G.open();return'<a class="pill'+(active==='dash'?' on':'')+'" href="index.html">⌂ Dashboard</a>'+
 G.list('cats').sort((a,b)=>a.created-b.created).map(c=>{const n=o.filter(t=>t.cat===c.id),od=n.filter(t=>t.dl&&G.diff(t.dl)<0).length;
 return'<a class="pill cat'+(active===c.id?' on':'')+'" style="background:'+c.color+';border-color:'+c.color+'" href="category.html?c='+c.id+'">'+G.esc(c.name)+'<span class="badge">'+n.length+'</span>'+(od?'<span class="red" title="Overdue"> ●</span>':'')+'</a>'}).join('')+
 '<button class="pill" data-newcat>+ New category</button>'};
G.taskRow=(t,o)=>{o=o||{};const c=G.get('cats',t.cat)||{name:'?',color:'#999'},late=t.dl&&!t.done&&G.diff(t.dl)<0;
 return'<div class="task'+(t.done?' done':'')+'"><input type="checkbox" data-done="'+t.id+'"'+(t.done?' checked':'')+' aria-label="Done"><div class="b">'+
 (o.cat?'<a class="nm" href="category.html?c='+t.cat+'">'+G.esc(t.name)+'</a>':'<span class="nm">'+G.esc(t.name)+'</span>')+
 '<div class="mut">'+(o.cat?'<span class="dot" style="background:'+c.color+'"></span>'+G.esc(c.name)+' · ':'')+'<span class="'+(late?'red':'')+'">'+G.esc(G.dueLabel(t.dl))+'</span>'+(t.min?' · '+G.fmt(t.min):'')+'</div>'+
 (t.notes?'<div class="mut">'+G.esc(t.notes)+'</div>':'')+'</div>'+
 (o.actions?'<button class="s" data-edit="'+t.id+'" aria-label="Edit">✎</button><button class="s" data-del="'+t.id+'" aria-label="Delete">✕</button>':'')+'</div>'};
G.dueShort=d=>{if(!d)return'No deadline';const n=G.diff(d);if(n===0)return'Today';if(n===1)return'Tomorrow';
 const ds=new Date(d+'T00:00').toLocaleDateString([],{day:'numeric',month:'short'});return n>1?ds+' · '+n+'d':ds+' · '+(-n)+'d late'};
G.compactRow=t=>{const c=G.get('cats',t.cat)||{name:'?',color:'#999'},late=t.dl&&G.diff(t.dl)<0;
 return'<div class="crow" style="background:'+c.color+'" title="'+G.esc(c.name)+'"><input type="checkbox" data-done="'+t.id+'" aria-label="Done"><a class="cn" href="category.html?c='+t.cat+'">'+G.esc(t.name)+'</a>'+
 '<span class="cd'+(late?' late':'')+'">'+G.esc(G.dueShort(t.dl))+(t.min?' · '+G.fmt(t.min):'')+'</span></div>'};
G.newCategory=()=>{let n=prompt('New category name');if(n==null)return;n=n.trim();if(!n)return;
 if(G.list('cats').some(c=>c.name.toLowerCase()===n.toLowerCase())){alert('A category with that name already exists.');return}
 const c=G.put('cats',{name:n,color:COLS[G.list('cats').length%COLS.length]});location.href='category.html?c='+c.id};
G.init=async()=>{await openDB();await load();seed();applySetup();
 document.addEventListener('click',e=>{if(e.target.closest('[data-newcat]'))G.newCategory()});
 document.addEventListener('change',e=>{const id=e.target.dataset&&e.target.dataset.done;if(!id)return;const t=G.get('tasks',id);if(t)G.put('tasks',Object.assign({},t,{done:e.target.checked,doneAt:e.target.checked?Date.now():0}))});
 let day=G.today();setInterval(()=>{if(G.today()!==day){day=G.today();emit()}},30000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(G.today()!==day){day=G.today();emit()}G.sync(1)}});
 window.addEventListener('online',()=>G.sync(1));setInterval(()=>{if(!document.hidden)G.sync(1)},45000);
 if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
 G.sync()};
return G})();
