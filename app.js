/* ===== Gas clone — front-end wired to the real API (server.js) ===== */

/* ---------- API helper + client cache ---------- */
let token = localStorage.getItem('gasToken') || '';
let me = null;                                   // logged-in user (from server)
let cache = { flames:[], friends:[], schools:[] };
let onboard = {};                                // fields collected during signup

const API_BASE = (typeof window!=='undefined' && window.GAS_API_BASE) || ''; // '' = same-origin (web); native sets a remote URL
async function api(method, p, body){
  const res = await fetch(API_BASE+'/api'+p, { method, headers:{'x-token':token,'Content-Type':'application/json'}, body: body?JSON.stringify(body):undefined });
  if(res.status===401){ token=''; localStorage.removeItem('gasToken'); }
  try{ return await res.json(); }catch(e){ return {}; }
}
function setToken(t){ token=t; localStorage.setItem('gasToken',t); }

/* ---------- Chrome ---------- */
const LIGHT_BG = new Set(['grade','welcome']);
function setChrome(el){
  const dark = el && (el.classList.contains('theme-light') || (el.dataset.screen && LIGHT_BG.has(el.dataset.screen)));
  document.getElementById('statusbar').classList.toggle('ink', !!dark);
  document.getElementById('homeIndicator').classList.toggle('ink', !!dark);
}

/* ---------- Onboarding router ---------- */
let current='splash';
function go(name){
  const next=document.querySelector(`[data-screen="${name}"]`); if(!next) return;
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  next.classList.add('active'); current=name; setChrome(next);
  if(name==='code'){ document.getElementById('sentChip').textContent = onboard.phone||'•••• ••••'; document.getElementById('codeErr').textContent=''; setCodeHint(); startResend(); }
  if(name==='school') renderSchoolPicker();
  if(name==='gender') document.getElementById('genderSheet').classList.remove('show');
  setTimeout(()=>{ const inp=next.querySelector('input.text-input'); if(inp) inp.focus(); },50);
}

/* ---------- Pager ---------- */
const PAGES=['add','inbox','gas','profile','about'];
const HEADERS={ add:[null,'Add+','Inbox'], inbox:['Add+','Inbox','Gas'], gas:['Inbox','Gas','Profile'], profile:['Gas','Profile','About'], about:['Profile','About',null] };
let currentPage='gas';
function buildHeaders(){
  PAGES.forEach(p=>{ const head=document.querySelector(`[data-head="${p}"]`); if(!head) return;
    const [l,c,r]=HEADERS[p]; head.innerHTML=''; head.appendChild(slot(l,'left',true)); head.appendChild(slot(c,'center',false)); head.appendChild(slot(r,'right',true)); });
}
function slot(label,pos,side){
  const b=document.createElement('button'); b.className='ph-slot '+pos+(side?' side':'');
  if(!label){ b.style.visibility='hidden'; b.textContent='·'; return b; }
  const badge=(label==='Inbox' && unreadCount()>0)?` <span class="ph-badge">${unreadCount()}</span>`:'';
  b.innerHTML=label+badge;
  if(!side){ const u=document.createElement('div'); u.className='ph-under'; b.appendChild(u); }
  else b.onclick=()=>openPage(label==='Add+'?'add':label.toLowerCase());
  return b;
}
function openPage(page){
  if(!PAGES.includes(page)) return;
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  const el=document.querySelector(`[data-page="${page}"]`);
  const from=PAGES.indexOf(currentPage), to=PAGES.indexOf(page);
  el.style.setProperty('--dir',(to>from?'40px':'-40px')); el.classList.add('active');
  currentPage=page; setChrome(el);
  if(page==='inbox') renderInbox();
  if(page==='add') renderAdd();
  if(page==='profile') renderProfile();
  if(page==='gas') renderGas();
  buildHeaders();
}
async function enterApp(page){
  if(!me){ const r=await api('GET','/me'); me=r.user; }
  await refreshFlames();
  const r=await api('GET','/friends'); cache.friends=r.friends||[];
  buildHeaders(); openPage(page||'gas'); if((page||'gas')==='gas') startRound();
  if(/autoflame/.test(location.hash)){ setTimeout(async()=>{ openPage('inbox'); await new Promise(r=>setTimeout(r,400)); const rf=cache.flames.find(f=>f.repeatAdmirer&&!f.name)||cache.flames.find(f=>!f.name); if(rf) openFlameDetail(rf.id); },500); }
}
async function refreshFlames(){ const r=await api('GET','/flames'); cache.flames=r.flames||[]; cache.bonusRevealsLeft=r.bonusRevealsLeft||0; if(r.coins!=null&&me) me.coins=r.coins; if(me&&r.godMode!=null) me.godMode=r.godMode; }
function unreadCount(){ return cache.flames.filter(f=>f.unread).length; }

/* ---------- Boot ---------- */
window.addEventListener('load', async ()=>{
  buildAgeWheel(); buildKeypad('keypadPhone',onPhoneKey); buildKeypad('keypadCode',onCodeKey);
  bindInputs(); buildHeaders(); enableSwipe();
  if(/still/.test(location.hash)) document.body.classList.add('no-anim');
  // admin impersonation: /?token=... or #token=...
  const urlTok = new URLSearchParams(location.search).get('token') || (location.hash.match(/token=([a-z0-9_]+)/)||[])[1];
  if(urlTok){ setToken(urlTok); history.replaceState(null,'',location.pathname+location.hash); }

  const m=location.hash.match(/(?:screen|page)=([a-zA-Z]+)/);
  const mo=location.hash.match(/modal=([a-zA-Z]+)/);
  setChrome(document.querySelector('.screen.active'));

  // deep-links (screenshots/testing) auto-login as a demo student
  if(m||mo){ if(!token){ await demoLogin(); } if(!me){ const r=await api('GET','/me'); me=r.user; }
    if(m && PAGES.includes(m[1])){ await enterApp(m[1]); if(m[1]==='gas'&&/still/.test(location.hash)){ poll.mode='poll'; renderPoll(); } }
    else if(m){ go(m[1]); }
    if(mo) setTimeout(()=>openHashModal(mo[1]),60);
    return; }

  if(token){ const r=await api('GET','/me'); if(r.user){ me=r.user; if(me.onboarded){ enterApp('gas'); return; } } }
  setTimeout(()=>{ if(current==='splash') go('age'); },1500);
});
async function demoLogin(){ const r=await api('POST','/auth/demo'); if(r.token){ setToken(r.token); me=r.user; } }

/* ---------- Age wheel ---------- */
let ageState;
function buildAgeWheel(){ const wheel=document.getElementById('ageWheel'); const list=document.createElement('div'); list.className='w-list';
  const ages=[]; for(let a=10;a<=40;a++) ages.push(a);
  ages.forEach((a,i)=>{ const d=document.createElement('div'); d.className='w-item'; d.textContent=a; d.onclick=()=>selectAge(i,a); list.appendChild(d); });
  wheel.appendChild(list); ageState={list,ages,sel:0}; positionWheel(0); }
function positionWheel(i){ ageState.list.style.transform=`translateY(${82-i*46}px)`; ageState.list.querySelectorAll('.w-item').forEach((el,idx)=>el.classList.toggle('sel',idx===i)); }
function selectAge(i,val){ ageState.sel=i; positionWheel(i); document.getElementById('ageLabel').textContent=val; fillLogo(Math.min(100,34+(val-10)*2.2)); onboard.age=val; document.getElementById('ageStart').classList.remove('hidden'); }
function fillLogo(pct){ let s=document.getElementById('fillStyle'); if(!s){s=document.createElement('style');s.id='fillStyle';document.head.appendChild(s);} s.textContent=`[data-screen="age"] .logo-fill::after{width:${pct}%!important}`; }

/* ---------- Permissions / grade ---------- */
function enableLoc(b){ b.classList.add('dim'); }
function setGrade(g){ onboard.grade=g; go('school'); }
async function renderSchoolPicker(){
  const r=await api('GET','/schools'); cache.schools=r.schools||[];
  const q=(document.getElementById('schoolSearch').value||'').toLowerCase();
  const list=cache.schools.filter(s=>s.name.toLowerCase().includes(q));
  const el=document.getElementById('schoolList');
  el.innerHTML = list.map(s=>`<button class="grade-row" onclick="setSchool('${s.id}')"><b>${s.name}</b><span class="classof">${s.city||''}</span></button>`).join('')
    || `<div class="empty" style="padding:30px;text-align:center;color:#aaa;font-weight:700">No schools found.<br>Ask your admin to add one.</div>`;
}
function setSchool(id){ onboard.schoolId=id; go('phone'); }

/* ---------- Keypad ---------- */
function buildKeypad(id,handler){ const pad=document.getElementById(id);
  [['1',''],['2','ABC'],['3','DEF'],['4','GHI'],['5','JKL'],['6','MNO'],['7','PQRS'],['8','TUV'],['9','WXYZ'],['*',''],['0',''],['del','']]
  .forEach(([k,sub])=>{ const b=document.createElement('button'); if(k==='*')b.innerHTML='+ * #'; else if(k==='del')b.innerHTML='&#9003;'; else b.innerHTML=`${k}${sub?`<small>${sub}</small>`:''}`; b.onclick=()=>handler(k); pad.appendChild(b); }); }
let phoneDigits='';
function onPhoneKey(k){ if(k==='del') phoneDigits=phoneDigits.slice(0,-1); else if(k!=='*'&&phoneDigits.length<10) phoneDigits+=k;
  const el=document.getElementById('phNum'); el.textContent=formatPhone(phoneDigits)||'Phone Number'; el.classList.toggle('filled',phoneDigits.length>0);
  document.getElementById('phNext').classList.toggle('dim',phoneDigits.length<10); }
function formatPhone(d){ if(!d)return''; if(d.length<=3)return'('+d; if(d.length<=6)return`(${d.slice(0,3)}) ${d.slice(3)}`; return`(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`; }
async function phoneNext(){
  if(phoneDigits.length<10) return;
  onboard.phone=formatPhone(phoneDigits); onboard.phoneDigits=phoneDigits;
  const btn=document.getElementById('phNext'); btn.textContent='Sending…'; btn.classList.add('dim');
  const r=await api('POST','/auth/request-code',{phone:onboard.phone});
  btn.textContent='Next'; btn.classList.remove('dim');
  if(r.error){ toast(r.error,'warn'); return; }
  onboard.devCode=r.devCode; onboard.smsOn=r.sms; codeDigits='';
  document.getElementById('codeNum').textContent='Code'; document.getElementById('codeNum').classList.remove('filled');
  go('code');
}
function setCodeHint(){ const h=document.getElementById('codeHint'); if(!h) return;
  if(onboard.smsOn){ h.innerHTML='We texted a code to your number'; h.style.cursor='default'; h.onclick=null; }
  else { h.innerHTML=`Testing mode — your code is <b>${onboard.devCode||'······'}</b> · tap to fill`; h.style.cursor='pointer'; h.onclick=autofillDevCode; } }
function autofillDevCode(){ if(!onboard.devCode) return; codeDigits=onboard.devCode;
  const el=document.getElementById('codeNum'); el.textContent=codeDigits.split('').join(' '); el.classList.add('filled');
  document.getElementById('codeNext').classList.remove('dim'); document.getElementById('codeErr').textContent=''; }
let codeDigits='';
function onCodeKey(k){ if(k==='del') codeDigits=codeDigits.slice(0,-1); else if(k!=='*'&&codeDigits.length<6) codeDigits+=k;
  const el=document.getElementById('codeNum'); el.textContent=codeDigits?codeDigits.split('').join(' '):'Code'; el.classList.toggle('filled',codeDigits.length>0);
  document.getElementById('codeNext').classList.toggle('dim',codeDigits.length<4); }
async function codeNext(){ if(codeDigits.length<4) return;
  const errEl=document.getElementById('codeErr'); errEl.textContent='';
  const r=await api('POST','/auth/login',{phone:onboard.phone, code:codeDigits});
  if(r.error){ errEl.textContent=r.error; codeDigits=''; document.getElementById('codeNum').textContent='Code'; document.getElementById('codeNum').classList.remove('filled'); document.getElementById('codeNext').classList.add('dim'); return; }
  if(r.token){ setToken(r.token); me=r.user;
    const pr=await api('PATCH','/me',{age:onboard.age||null, grade:onboard.grade||''}); if(pr.user) me=pr.user;
    if(me.onboarded){ enterApp('gas'); return; }
    go('firstName');
  } else errEl.textContent='Something went wrong'; }
let resendTimer;
function startResend(){ clearInterval(resendTimer); let n=29; const el=document.getElementById('resend'); el.onclick=null; el.style.cursor='default'; el.textContent=`Resend in ${n}`;
  resendTimer=setInterval(()=>{ n--; if(n<=0){ el.textContent='Resend Code'; el.style.cursor='pointer'; el.onclick=resendCode; clearInterval(resendTimer);} else el.textContent=`Resend in ${n}`; },1000); }
async function resendCode(){ const r=await api('POST','/auth/request-code',{phone:onboard.phone}); if(r.error){ toast(r.error,'warn'); return; } onboard.devCode=r.devCode; onboard.smsOn=r.sms; setCodeHint(); document.getElementById('codeErr').textContent=''; toast(r.sms?'Code re-sent 📲':'New dev code generated'); startResend(); }

/* ---------- Names / username / gender / photo ---------- */
function bindInputs(){ ['firstInput','lastInput','userInput'].forEach(id=>{ const el=document.getElementById(id); if(el) el.addEventListener('input',()=>{ onboard[id]=el.value; }); }); }
async function nameNext(which,next){
  const id=which==='first'?'firstInput':which==='last'?'lastInput':'userInput';
  const val=(document.getElementById(id).value||'').trim(); if(!val){ toast('Please enter something'); return; }
  const key={first:'firstName',last:'lastName',user:'username'}[which];
  await api('PATCH','/me',{[key]:val}); go(next);
}
async function pickGender(g,emoji){ onboard.gender=g; await api('PATCH','/me',{gender:g}); document.getElementById('genderSheet').classList.add('show'); }
function changePhoto(){ toast('Photo picker (demo)'); }
async function finishOnboarding(){
  // use the school the user chose during onboarding (fall back to the first one)
  let sid=onboard.schoolId;
  if(!sid){ const s=await api('GET','/schools'); sid=((s.schools||[])[0]||{}).id||null; }
  await api('PATCH','/me',{ schoolId: sid, onboarded:true });
  const r=await api('GET','/me'); me=r.user; go('welcome');
}
async function skipOnboarding(){ await demoLogin(); if(me){ enterApp('gas'); } }

/* ---------- Gas page: loading / poll / congrats / playagain ---------- */
let poll={ round:null, index:0, answered:false, shuffleUsed:false, mode:'loading' };
function renderGas(){ if(poll.mode==='loading') renderLoading(); else if(poll.mode==='poll') renderPoll(); else if(poll.mode==='congrats') renderCongrats(poll.earned); else if(poll.mode==='playagain') renderPlayAgain(); }
async function startRound(){ poll.mode='loading'; if(currentPage!=='gas') openPage('gas'); else renderLoading();
  const r=await api('GET','/polls/round'); poll.round=r; poll.index=0; poll.answered=false; poll.shuffleUsed=false;
  poll.mode='poll'; if(currentPage==='gas') renderPoll();
  if(/autopick/.test(location.hash)) setTimeout(()=>{ const b=document.querySelectorAll('#pollGrid .name-btn')[2]; if(b) pickName(curPoll().choices[2].id,b,2); },100); }
function setGasBg(color,light){ const el=document.querySelector('[data-page="gas"]'); el.classList.toggle('theme-light',!!light); el.style.background=light?'':color; el.style.color=light?'#111':'#fff'; if(currentPage==='gas') setChrome(el); }
function renderLoading(){ setGasBg(null,true); document.getElementById('gasInner').innerHTML=`<div class="loading-wrap"><div class="logo-rainbow">GAS</div><div class="loading-label">Loading Polls</div></div>`; buildHeaders(); }
function curPoll(){ return poll.round && poll.round.polls[poll.index]; }
function renderPoll(){
  const p=curPoll(); if(!p){ finishRound(); return; }
  setGasBg(p.color,false);
  const total=poll.round.polls.length;
  document.getElementById('gasInner').innerHTML=`
    <div class="poll-count">${poll.index+1} of ${total}</div>
    <div class="poll-body">
      <div class="poll-emoji">${p.emoji}</div>
      <div class="poll-q">${p.text}</div>
      <div class="grow"></div>
      <div class="poll-grid" id="pollGrid"></div>
      <div class="grow-sm"></div>
      <div id="pollFooter"></div>
    </div>`;
  drawNames(); drawFooter();
}
function drawNames(){ const grid=document.getElementById('pollGrid'); grid.innerHTML=''; curPoll().choices.forEach((c,i)=>{ const b=document.createElement('button'); b.className='name-btn'; b.innerHTML=`<span class="nb-fill"></span><span class="nb-name">${c.name}</span>`; b.onclick=()=>pickName(c.id,b,i); grid.appendChild(b); }); }
function drawFooter(){ const f=document.getElementById('pollFooter');
  if(poll.answered){ f.className='tap-continue'; f.textContent='Tap to continue'; f.onclick=advancePoll; }
  else { f.className='poll-actions'; f.onclick=null; f.innerHTML=`<button class="poll-act${poll.shuffleUsed?' used':''}" id="shufBtn">⇄ Shuffle</button><button class="poll-act" id="skipBtn">⏩ Skip</button>`;
    document.getElementById('shufBtn').onclick=shuffleNames; document.getElementById('skipBtn').onclick=advancePoll; } }
async function pickName(targetId,btn,idx){ if(poll.answered) return; poll.answered=true;
  const btns=[...document.querySelectorAll('#pollGrid .name-btn')];
  const color=curPoll().color; const pcts=computePcts(idx, btns.length);
  btns.forEach((b,j)=>{ b.disabled=true; b.classList.add('voted'); if(j===idx) b.classList.add('picked');
    const fill=b.querySelector('.nb-fill');
    fill.style.background=hexA(color, j===idx?0.34:0.15);
    fill.style.width=pcts[j]+'%'; // CSS transition animates 0 → target
  });
  drawFooter();
  api('POST','/vote',{ questionId:curPoll().questionId, targetId, roundId:poll.round.roundId });
}
function computePcts(picked,n){ const raw=[]; for(let i=0;i<n;i++) raw.push(12+Math.random()*38); raw[picked]+=28;
  const s=raw.reduce((a,b)=>a+b,0); const p=raw.map(x=>Math.round(x/s*100)); p[picked]+=100-p.reduce((a,b)=>a+b,0); return p; }
function hexA(hex,a){ const m=/#?([0-9a-f]{6})/i.exec(hex||'#A31CEE'); const n=parseInt(m?m[1]:'A31CEE',16); return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`; }
function shuffleNames(){ if(poll.answered||poll.shuffleUsed) return; poll.shuffleUsed=true; const c=curPoll().choices; for(let i=c.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[c[i],c[j]]=[c[j],c[i]];} drawNames(); drawFooter(); }
function advancePoll(){ poll.index++; poll.answered=false; poll.shuffleUsed=false; if(poll.index>=poll.round.polls.length) finishRound(); else renderPoll(); }
async function finishRound(){ const r=await api('POST','/round/complete',{roundId:poll.round&&poll.round.roundId}); if(me&&r.coins!=null) me.coins=r.coins; poll.earned=r.earned||0; poll.mode='congrats'; renderCongrats(poll.earned); refreshFlames(); }
function renderCongrats(earned){ setGasBg(null,true);
  document.getElementById('gasInner').innerHTML=`
    <div class="result-wrap">
      <h1 class="big-black">Congrats</h1>
      <div class="coin-icon">🪙</div>
      <p class="earned">You earned <b>${earned||2}</b> coins${me&&me.godMode?' <span style="color:#8a1fd0">⚡2×</span>':''}</p>
      <div class="result-actions">
        <button class="btn snap-cta" onclick="openSnapShareResult()"><span class="snap-ghost">👻</span> Post on Snap</button>
        <button class="pill-white shadow" style="margin-top:10px" onclick="poll.mode='playagain';renderGas()"><span class="emoji">🤑</span> Cash Out</button>
      </div>
      <div class="grow"></div>
    </div><div class="heart-band"></div>`;
  buildHeaders(); }
let cdTimer;
function renderPlayAgain(){ setGasBg(null,true);
  document.getElementById('gasInner').innerHTML=`
    <div class="result-wrap">
      <h1 class="big-black">Play Again</h1>
      <div class="lock-icon">🔒</div>
      <p class="newpolls">New Polls in <span id="countdown">29:53</span></p>
      <div class="or-row"><span class="squig"></span>OR<span class="squig"></span></div>
      <p class="skipwait">Skip the wait ↘</p>
      <div class="result-actions">
      <button class="btn snap-cta" onclick="openSnapShareResult()"><span class="snap-ghost">👻</span> Post on Snap</button>
      <button class="pill-white shadow" style="margin-top:10px" onclick="inviteFriendPrompt()"><span class="emoji">💬</span> Invite a friend</button>
      <button class="btn btn-orange" style="margin-top:10px" onclick="startRound()">Play Again Now</button></div>
      <div class="grow"></div>
    </div><div class="heart-band"></div>`;
  startCountdown(); buildHeaders(); }
function startCountdown(){ clearInterval(cdTimer); let t=29*60+53; const tick=()=>{ const el=document.getElementById('countdown'); if(!el){clearInterval(cdTimer);return;} el.textContent=`${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`; if(t<=0){clearInterval(cdTimer);return;} t--; }; tick(); cdTimer=setInterval(tick,1000); }
function inviteFriendPrompt(){ toast('Invite sent! Skipping the wait…'); setTimeout(startRound,700); }

/* ---------- Inbox ---------- */
const GENDER_COLOR={boy:'#28b3f2',girl:'#ff2f9a',nonbinary:'#a04bf0'};
function flameSVG(color){ return `<svg viewBox="0 0 24 30" fill="${color}"><path d="M12 0c1 5-3 6-3 11 0 2 1 3 2 3 2 0 2-2 1-4 3 1 5 4 5 8 0 5-3 9-8 9S1 22 4 15c1 3 3 3 3 1 0-4 5-6 5-16z"/></svg>`; }
function flameSVGbig(color){ return `<svg viewBox="0 0 24 30" width="64" height="80" fill="${color}"><path d="M12 0c1 5-3 6-3 11 0 2 1 3 2 3 2 0 2-2 1-4 3 1 5 4 5 8 0 5-3 9-8 9S1 22 4 15c1 3 3 3 3 1 0-4 5-6 5-16z"/></svg>`; }
async function renderInbox(){
  await refreshFlames(); api('POST','/flames/read'); cache.flames.forEach(f=>f.unread=false);
  const list=document.getElementById('inboxList');
  const banner = me&&me.godMode ? `<div class="gm-active-badge">👑 God Mode active — hints unlocked</div>`
    : `<button class="swy-banner" onclick="openModal('godMode')">👀 See Who Likes You<span class="swy-r">›</span></button>`;
  const secret = cache.flames.some(f=>f.repeatAdmirer && !f.name);
  const nudge = !secret ? '' : (me&&me.godMode
    ? `<div class="secret-nudge">🔥 <b>You have a secret admirer!</b><span>Someone picked you more than once — open their flame to use a bonus name reveal.</span></div>`
    : `<button class="secret-nudge tap" onclick="openModal('godMode')">🔥 <b>You have a secret admirer!</b><span>Someone's gassed you up more than once. Unlock God Mode to reveal them ›</span></button>`);
  let notifHTML='';
  try{ const nr=await api('GET','/notifications'); const notes=(nr.notifications||[]).filter(n=>!n.read);
    if(notes.length){ notifHTML=notes.map(n=>`<div class="notif-card"><span class="notif-ico">${n.emoji||'🔔'}</span><span>${n.text}</span></div>`).join('');
      api('POST','/notifications/read'); }
  }catch(e){}
  let h=banner+nudge+notifHTML;
  cache.flames.forEach(f=>{
    const color=GENDER_COLOR[f.gender]||'#a04bf0'; const who=f.gender==='nonbinary'?'non-binary friend':`a ${f.gender}`;
    const shown=f.revealed||f.godMode;
    const right=f.anonymous?`<span class="flame-lock">🔒</span>`:(shown?`<span class="flame-lock">›</span>`:`<button class="reveal-btn" onclick="event.stopPropagation();revealFlame('${f.id}')">🔒 Reveal</button>`);
    const secretPill = (f.repeatAdmirer && !f.name)?`<span class="secret-pill">🔥 secret admirer</span>`:'';
    const sub = f.anonymous?`🔒 Anonymous · ${f.grade}`
      :(f.name?`From ${f.name} · ${f.grade}`
      :(f.initial?`From <b>${f.initial}•••</b> · ${f.grade}`
      :`Someone in ${f.grade} picked you`)
      + (f.repeatAdmirer?` · 🔥×${f.pickCount}`:''));
    h+=`<div class="flame-card" onclick="openFlameDetail('${f.id}')"><div class="flame-ico">${flameSVG(color)}</div><div class="flame-body"><div class="flame-q">${f.q}${secretPill}</div><div class="flame-sub">${sub}</div></div>${right}</div>`;
  });
  // Gas Team welcome flame always at bottom
  h+=`<div class="flame-card"><div class="flame-ico">${flameSVG('#ff2f9a')}</div><div class="flame-body"><div class="flame-q">From Gas Team</div><div class="flame-sub">Welcome to Gas! 🔥</div></div><span class="flame-time">40d</span></div>`;
  if(!cache.flames.length) h=banner+`<div class="inbox-empty">No flames yet.<br>Answer polls so friends can gas you up! 🔥</div>`+h.slice(banner.length);
  list.innerHTML=h; buildHeaders();
}
async function revealFlame(id){
  const r=await api('POST',`/flames/${id}/reveal`);
  if(r.error){ openModal('shop'); toast('You need coins to reveal','warn'); return; }
  if(r.coins!=null&&me) me.coins=r.coins; toast('Hint revealed! 🔥'); renderInbox();
}
function openFlameDetail(id){
  const f=cache.flames.find(x=>x.id===id); if(!f) return;
  const modal=document.querySelector('[data-modal="flameDetail"]'); modal.style.background=f.color||'#A31CEE';
  const g=f.gender==='nonbinary'?'Non-binary':f.gender.charAt(0).toUpperCase()+f.gender.slice(1);
  const shown=f.revealed||f.godMode;
  let actions='';
  if(f.anonymous){
    actions=`<div class="gm-active-badge" style="background:rgba(255,255,255,.18);color:#fff">🔒 This admirer is anonymous (God Mode)</div>`;
  } else if(!shown){
    actions=`<button class="btn btn-white full" onclick="revealFlame('${f.id}');closeModal();setTimeout(()=>openFlameDetail('${f.id}'),200)">Reveal a hint · 🪙 1</button>
      <button class="link-muted" style="color:rgba(255,255,255,.85)" onclick="closeModal();openModal('godMode')">or unlock everyone with ⚡ God Mode</button>`;
  } else if(f.godMode){
    if(f.name) actions=`<div class="gm-active-badge" style="background:rgba(255,255,255,.18);color:#fff">✅ It's ${f.name}</div>`;
    else if(f.repeatAdmirer){ const left=cache.bonusRevealsLeft||0;
      actions = left>0
        ? `<button class="btn btn-white full" onclick="revealName('${f.id}')">🔓 Reveal their full name · Bonus (${left} left)</button>`
        : `<div class="gm-active-badge" style="background:rgba(255,255,255,.18);color:#fff">No bonus reveals left</div>`;
    } else actions=`<div class="gm-active-badge" style="background:rgba(255,255,255,.18);color:#fff">👑 First-initial hint unlocked</div>`;
  }
  const repeatBadge = f.repeatAdmirer?`<div class="fd-repeat">🔥 This person gassed you up ${f.pickCount}×</div>`:'';
  document.getElementById('flameDetailBody').innerHTML=`
    <div class="fd-emoji">${f.emoji||'🔥'}</div>
    <div class="fd-q">${f.q}</div>
    ${repeatBadge}
    <div class="fd-flame">${flameSVGbig(GENDER_COLOR[f.gender]||'#a04bf0')}</div>
    <div class="fd-hints">
      <div class="fd-hint"><span>Gender</span><span>${g}</span></div>
      <div class="fd-hint"><span>Grade</span><span>${f.grade}</span></div>
      <div class="fd-hint ${(shown&&!f.anonymous)?'':'locked'}"><span>First initial</span><span>${f.anonymous?'🔒':(shown?(f.initial||'?'):'X')}</span></div>
      ${f.name?`<div class="fd-hint"><span>Name</span><span>${f.name}</span></div>`:''}
    </div>
    ${actions}
    <button class="btn snap-cta full" style="margin-top:14px" onclick="openSnapReply('${f.id}')"><span class="snap-ghost">👻</span> Reply on Snapchat</button>`;
  openModal('flameDetail');
}

/* ---------- Add+ ---------- */
async function renderAdd(){
  const r=await api('GET','/suggestions'); const q=(document.getElementById('addSearch').value||'').toLowerCase();
  const filt=u=>((u.firstName+' '+u.lastName).toLowerCase().includes(q));
  const contacts=(r.contacts||[]).filter(filt), fof=(r.fof||[]).filter(filt);
  let h='';
  if(contacts.length){ h+=`<div class="add-section">CONTACTS ON GAS</div>`; contacts.forEach(c=>h+=addRow(c,true)); }
  if(fof.length){ h+=`<div class="add-section">FRIENDS OF FRIENDS</div>`; fof.forEach(c=>h+=addRow(c,false)); }
  h+=`<div class="add-section">INVITATIONS LEFT<span>10/10</span></div>`;
  [['Dana Diaz','DD','76 friends on Gas'],['Robin Ray','RR','13 friends on Gas'],['Chris Moss','CM','Work · 7 friends on Gas']].forEach(([n,ini,sub])=>{ h+=`<div class="add-row"><div class="add-av" style="background:#e6e6e6;color:#9a9a9a">${ini}</div><div class="add-info"><div class="add-name">${n}</div><div class="add-sub">${sub}</div></div><button class="invite-btn" onclick="toast('Invited ${n.split(' ')[0]}')">INVITE</button></div>`; });
  document.getElementById('addList').innerHTML=h||`<div class="inbox-empty">No one to add right now</div>`;
}
function initials(n){ return (n||'').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase(); }
function addRow(u,onContacts){
  const name=u.firstName+' '+u.lastName; const sub=onContacts?(u.grade||''):`${u.mutual||0} mutual friends`;
  return `<div class="add-row${onContacts?' oncontacts':''}"><div class="add-av">${initials(name)}</div><div class="add-info"><div class="add-name">${name}</div>${sub?`<div class="add-sub">${sub}</div>`:''}</div><button class="add-hide" onclick="this.closest('.add-row').remove()">HIDE</button><button class="add-btn" onclick="addFriend('${u.id}','${name.replace(/'/g,'')}')">ADD</button></div>`;
}
async function addFriend(id,name){ await api('POST','/friends',{userId:id}); const r=await api('GET','/friends'); cache.friends=r.friends||[]; toast(`Added ${(name||'').split(' ')[0]} 🎉`); renderAdd(); }

/* ---------- Profile ---------- */
async function renderProfile(){
  if(!me){ const r=await api('GET','/me'); me=r.user; }
  const fr=await api('GET','/friends'); cache.friends=fr.friends||[];
  await refreshFlames();
  const name=`${me.firstName||'Your'} ${me.lastName||'Name'}`.trim(); const av=initials(name)||'YOU';
  const friendsHTML = cache.friends.length
    ? cache.friends.map(f=>{const nm=(f.firstName+' '+f.lastName).replace(/'/g,'');return `<div class="friend-row" onclick="openUserActions('${f.id}','${nm}',true)"><div class="add-av">${initials(f.firstName+' '+f.lastName)}</div><div class="friend-name">${f.firstName} ${f.lastName}</div><button class="friend-x" onclick="event.stopPropagation();removeFriend('${f.id}','${nm}')" title="Remove friend">✕</button></div>`}).join('')
    : `<div class="no-friends"><p>You have no friends</p><button class="btn btn-orange narrow" onclick="openPage('add')">Add Friends</button></div>`;
  document.getElementById('profileScroll').innerHTML=`
    <div class="prof-head"><div class="avatar">${av}</div>
      <div class="prof-stats"><div class="stat-row"><span><b>${cache.friends.length}</b> friends</span><span><b>${cache.flames.length}</b> flames</span></div>
        <button class="ghost-btn" onclick="openEdit()">EDIT PROFILE</button></div></div>
    <div class="prof-namebars"><div class="prof-realname">${name}</div><div class="prof-username">@${me.username||'username'}</div></div>
    <div class="prof-actions">
      <button class="ghost-wide" onclick="shareProfile()">Share Profile <span>↗</span></button>
      <div class="coins-box" onclick="openModal('shop')"><div class="coins-cap">COINS</div><div class="coins-val"><span class="ghost0">${String(me.coins).padStart(5,'0').slice(0,-String(me.coins).length)}</span>${me.coins}</div><button class="shop-btn">SHOP</button></div>
    </div>
    ${me.godMode?`<div class="gm-active-badge" style="margin-top:16px">👑 God Mode active</div>`:`<button class="swy-banner" style="margin-top:16px" onclick="openModal('godMode')">👑 Unlock God Mode<span class="swy-r">›</span></button>`}
    ${topFlamesHTML()}
    <h3 class="section-h">Friends</h3>${friendsHTML}`;
}
function topFlamesHTML(){
  if(me&&me.hideTopFlames) return '';
  const groups={};
  cache.flames.forEach(f=>{ const k=f.q; if(!groups[k]) groups[k]={q:f.q,emoji:f.emoji,count:0}; groups[k].count++; });
  const top=Object.values(groups).sort((a,b)=>b.count-a.count).slice(0,8);
  if(!top.length) return '';
  return `<h3 class="section-h">Top Flames 🔥</h3><div class="topflames">${top.map(t=>`<div class="tf-card"><div class="tf-emoji">${t.emoji||'🔥'}</div><div class="tf-q">${t.q}</div><div class="tf-count">${flameSVG('#ff6a1a')} ${t.count}</div></div>`).join('')}</div>`;
}
function shareProfile(){ openSnapShareResult(); }

/* ---------- Modals ---------- */
function openModal(id){ const root=document.getElementById('modalRoot'); root.classList.add('open'); root.querySelectorAll('.modal').forEach(m=>m.classList.remove('show'));
  const m=root.querySelector(`[data-modal="${id}"]`); m.classList.add('show');
  if(id==='shop') document.getElementById('shopCoins').textContent=me?me.coins:0;
  if(id==='manage'){ const t=document.querySelector('.tgl[data-key="hideTopFlames"]'); if(t&&me) t.checked=!!me.hideTopFlames; }
  document.getElementById('statusbar').classList.toggle('ink', m.classList.contains('theme-light')); }
function closeModal(){ const root=document.getElementById('modalRoot'); root.classList.remove('open'); root.querySelectorAll('.modal').forEach(m=>m.classList.remove('show')); setChrome(document.querySelector('.screen.active')); }
function openHashModal(id){ if(id==='editProfile') openEdit(); else if(id==='flameDetail'){ const f=cache.flames[0]; if(f) openFlameDetail(f.id); } else if(id==='snapShare') openSnapShareResult(); else if(id==='crushPicker') openCrushPicker(); else openModal(id); }

function revealName(id){ (async()=>{ const r=await api('POST',`/flames/${id}/reveal-name`); if(r.error){ toast(r.error,'warn'); return; } await refreshFlames(); toast('Bonus reveal! 🎉'); openFlameDetail(id); })(); }

/* ---------- Post on Snap / Reply on Snapchat ---------- */
let currentShare={emoji:'🔥',badge:'',title:'',sub:'',cta:'Post to Snapchat'};
function openSnapShareResult(){ const n=cache.flames.length;
  currentShare={ emoji:'🔥', badge:'I\'m on Gas 🔥', title:(n>0?`I've got ${n} flame${n===1?'':'s'}`:'See who likes me'), sub:'Answer polls to gas me up', cta:'Post to Snapchat' };
  buildSnapCard(); openModal('snapShare'); }
function openSnapReply(id){ const f=cache.flames.find(x=>x.id===id)||{};
  const who=f.name?`Was it you, ${f.name.split(' ')[0]}? 👀`:'Slide up if it was you 👀';
  currentShare={ emoji:f.emoji||'🔥', badge:'Someone gassed me up 🔥', title:`"${f.q||'I got picked'}"`, sub:who, cta:'Reply on Snapchat' };
  buildSnapCard(); closeModal(); setTimeout(()=>openModal('snapShare'),180); }
function buildSnapCard(){ const c=document.getElementById('snapCard'); const s=currentShare;
  c.innerHTML=`<div class="sc-badge">${s.badge}</div><div class="sc-emoji">${s.emoji}</div><div class="sc-title">${s.title}</div><div class="sc-sub">${s.sub}</div>
    <div class="sc-foot"><div class="sc-logo">GAS</div><div class="sc-url">See who likes you 👀 gas.app</div></div>`;
  const btn=document.getElementById('snapPostBtn'); if(btn) btn.innerHTML=`<span class="snap-ghost">👻</span> ${s.cta||'Post to Snapchat'}`; }
function stripTags(s){ return String(s).replace(/<[^>]*>/g,''); }
async function postToSnap(){
  const isReply=(currentShare.cta||'').toLowerCase().includes('reply');
  const text=`${stripTags(currentShare.title)} — see who likes you on Gas 👀`;
  if(navigator.share){ try{ await navigator.share({title:'Gas',text,url:'https://gas.app'}); closeModal(); return; }catch(e){ if(e&&e.name==='AbortError') return; } }
  toast(isReply?'Opening Snapchat to reply… 👻 (demo)':'Posted to your Snap story! 👻 (demo)'); closeModal();
}
function copyShareLink(){ try{ navigator.clipboard.writeText('https://gas.app'); }catch(e){} toast('Link copied 🔗'); }
function saveSnapImage(){ const s=currentShare;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8a1e"/><stop offset="0.55" stop-color="#ff531a"/><stop offset="1" stop-color="#e0290a"/></linearGradient></defs><rect width="1080" height="1920" fill="url(#g)"/><text x="540" y="820" font-size="320" text-anchor="middle">${s.emoji}</text><text x="540" y="1040" font-family="Arial" font-weight="bold" font-size="84" fill="#fff" text-anchor="middle">${escSvg(stripTags(s.title))}</text><text x="540" y="1120" font-family="Arial" font-weight="bold" font-size="50" fill="#ffeede" text-anchor="middle">${escSvg(s.sub)}</text><text x="540" y="1770" font-family="Arial" font-weight="bold" font-size="130" fill="#fff" text-anchor="middle">GAS</text><text x="540" y="1840" font-family="Arial" font-weight="bold" font-size="44" fill="#ffeede" text-anchor="middle">See who likes you · gas.app</text></svg>`;
  const blob=new Blob([svg],{type:'image/svg+xml'}); const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download='gas-snap.svg'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); toast('Saved 📸'); }
function escSvg(s){ return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
async function buyBoost(cost){
  if(cost===300){ openCrushPicker(); return; }
  const r=await api('POST','/boost/random'); if(r.error){ toast(r.error||"Not enough coins",'warn'); return; }
  if(me&&r.coins!=null)me.coins=r.coins; syncCoins(); toast(r.message||'Your name will appear in polls! 🔥');
}
function syncCoins(){ const s=document.getElementById('shopCoins'); if(s)s.textContent=me.coins; const cv=document.querySelector('.coins-val'); if(cv&&me)cv.innerHTML=`<span class="ghost0">${'0'.repeat(Math.max(0,5-String(me.coins).length))}</span>${me.coins}`; }
async function openCrushPicker(){
  const r=await api('GET','/suggestions'); const people=[...(r.contacts||[]),...(r.fof||[])];
  const list=people.map(u=>`<button class="crush-row" onclick="pickCrush('${u.id}','${(u.firstName+' '+u.lastName).replace(/'/g,"")}')"><span class="crush-av">${(u.firstName||'?')[0]}${(u.lastName||'')[0]||''}</span><span>${u.firstName} ${u.lastName}</span><span class="crush-go">›</span></button>`).join('');
  document.getElementById('crushList').innerHTML = list||'<p class="muted-c">No schoolmates found yet.</p>';
  openModal('crushPicker');
}
async function pickCrush(id,name){
  const r=await api('POST','/boost/crush',{targetId:id}); if(r.error){ toast(r.error,'warn'); return; }
  if(me&&r.coins!=null)me.coins=r.coins; syncCoins(); closeModal(); setTimeout(()=>{openModal('shop');},150); toast(r.message||`You'll show up in ${name.split(' ')[0]}'s polls 💘`);
}
async function removeFriend(id,name){
  await api('DELETE','/friends',{userId:id}); const r=await api('GET','/friends'); cache.friends=r.friends||[];
  toast(`Removed ${(name||'').split(' ')[0]}`); renderProfile();
}
const GODMODE_PRODUCT_ID = 'aura.godmode.weekly';
function isNative(){ return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); }
async function activateGodMode(){
  if(isNative()){ return purchaseGodModeNative(); }
  // Web demo: instant unlock (no real payment on the web build)
  await api('POST','/godmode'); if(me) me.godMode=true; closeModal();
  toast('👑 God Mode activated — hints unlocked!');
  if(currentPage==='inbox') renderInbox(); if(currentPage==='profile') renderProfile();
}
// Native iOS: run the StoreKit purchase, then hand the signed transaction to the
// server for verification. Requires a StoreKit plugin (see BUILD_IOS.md); guarded
// so a missing plugin degrades gracefully instead of throwing.
async function purchaseGodModeNative(){
  try{
    const IAP = window.Capacitor?.Plugins?.InAppPurchase || window.CdvPurchase || null;
    if(!IAP){ toast('In-app purchases unavailable on this build'); return; }
    const result = await IAP.purchase({ productId: GODMODE_PRODUCT_ID });      // plugin-specific
    const signedTransaction = result?.signedTransaction || result?.jws || result?.transactionReceipt;
    if(!signedTransaction){ toast('Purchase not completed'); return; }
    const r = await api('POST','/iap/validate', { signedTransaction });
    if(r.godMode){ if(me){ me.godMode=true; me.godModeExpires=r.expires; } closeModal();
      toast('👑 God Mode unlocked!'); if(currentPage==='inbox') renderInbox(); if(currentPage==='profile') renderProfile(); }
    else toast(r.error || 'Could not verify purchase');
  }catch(e){ toast('Purchase cancelled'); }
}

/* Edit profile */
function openEdit(){ document.getElementById('edFirst').value=me.firstName||''; document.getElementById('edLast').value=me.lastName||''; document.getElementById('edUser').value=me.username||''; document.getElementById('edGender').textContent=cap(me.gender); document.getElementById('signedPhone').textContent=me.phone||'(demo user)';
  ['edFirst','edLast','edUser'].forEach(id=>{ const key={edFirst:'firstName',edLast:'lastName',edUser:'username'}[id]; const el=document.getElementById(id); el.oninput=()=>{ me[key]=el.value; api('PATCH','/me',{[key]:el.value}); }; });
  openModal('editProfile'); }
function cap(g){ return g==='nonbinary'?'Non-binary':(g||'boy').charAt(0).toUpperCase()+(g||'boy').slice(1); }
function cycleGender(){ const o=['boy','girl','nonbinary']; let i=o.indexOf(me.gender); i=(i+1)%3; me.gender=o[i]; api('PATCH','/me',{gender:o[i]}); document.getElementById('edGender').textContent=cap(o[i]); }
function logout(){ toast('Logging out…'); api('POST','/me/logout'); setTimeout(resetApp,500); }
let settings={reduceNotifs:false,hideTopFlames:false,takeBreak:false,namesInPolls:'Everyone'};
async function toggleSetting(el){ const k=el.dataset.key; settings[k]=el.checked;
  if(k==='hideTopFlames'){ const r=await api('PATCH','/me',{hideTopFlames:el.checked}); if(r.user) me=r.user; toast(el.checked?'Top Flames hidden':'Top Flames visible'); }
}
function cycleNamesInPolls(){ const o=['Everyone','Friends Only','Same Grade']; let i=o.indexOf(settings.namesInPolls); i=(i+1)%3; settings.namesInPolls=o[i]; document.getElementById('namesInPolls').textContent=o[i]; }
async function deleteAccount(){ if(!confirm('Delete your account? This removes your profile, flames, and votes. This cannot be undone.')) return;
  await api('DELETE','/me'); toast('Account deleted'); setTimeout(resetApp,300); }

/* ---------- Safety: block / report ---------- */
function openUserActions(id,name,isFriend){
  window._ua={id,name,isFriend};
  document.getElementById('uaName').textContent=name;
  document.getElementById('uaFriendBtn').style.display=isFriend?'block':'none';
  openModal('userActions');
}
async function uaBlock(){ const {id,name}=window._ua||{}; if(!id) return;
  if(!confirm(`Block ${name}? They won't appear in your polls and you won't appear in theirs.`)) return;
  await api('POST','/block',{userId:id}); closeModal(); toast(`Blocked ${(name||'').split(' ')[0]} 🚫`);
  const fr=await api('GET','/friends'); cache.friends=fr.friends||[]; if(document.querySelector('[data-page="profile"]').classList.contains('active')) renderProfile(); }
async function uaReport(){ const {id,name}=window._ua||{}; if(!id) return;
  const reason=prompt(`Report ${name} — what's wrong? (optional)`); if(reason===null) return;
  await api('POST','/report',{userId:id,reason}); closeModal(); toast('Report sent. Thanks for keeping Gas safe 🙏'); }
async function uaRemoveFriend(){ const {id,name}=window._ua||{}; closeModal(); removeFriend(id,name); }
async function openBlockedList(){
  const r=await api('GET','/blocked'); const b=r.blocked||[];
  document.getElementById('blockedList').innerHTML = b.length
    ? b.map(u=>`<div class="friend-row"><div class="add-av">${initials(u.firstName+' '+u.lastName)}</div><div class="friend-name">${u.firstName} ${u.lastName}</div><button class="unblock-btn" onclick="unblock('${u.id}','${(u.firstName+' '+u.lastName).replace(/'/g,'')}')">Unblock</button></div>`).join('')
    : '<p class="muted-c" style="color:#999">No blocked users.</p>';
  openModal('blockedList');
}
async function unblock(id,name){ await api('DELETE','/block',{userId:id}); toast(`Unblocked ${(name||'').split(' ')[0]}`); openBlockedList(); }

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg,cls){ const t=document.getElementById('toast'); t.textContent=msg; t.className='toast show'+(cls?' '+cls:''); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),1800); }

/* ---------- Swipe ---------- */
function enableSwipe(){ let x0=null; const dev=document.getElementById('device');
  dev.addEventListener('touchstart',e=>{ if(document.getElementById('modalRoot').classList.contains('open'))return; const a=document.querySelector('.screen.active'); if(!a||!a.classList.contains('page'))return; x0=e.touches[0].clientX; },{passive:true});
  dev.addEventListener('touchend',e=>{ if(x0===null)return; const dx=e.changedTouches[0].clientX-x0; x0=null; if(Math.abs(dx)<60)return; const i=PAGES.indexOf(currentPage); if(dx<0&&i<PAGES.length-1) openPage(PAGES[i+1]); else if(dx>0&&i>0) openPage(PAGES[i-1]); }); }

/* ---------- Reset ---------- */
function resetApp(){ localStorage.removeItem('gasToken'); token=''; me=null; cache={flames:[],friends:[],schools:[]}; onboard={}; phoneDigits=''; codeDigits='';
  poll={round:null,index:0,answered:false,shuffleUsed:false,mode:'loading'}; closeModal();
  document.getElementById('phNum').textContent='Phone Number'; document.getElementById('phNum').classList.remove('filled');
  document.getElementById('codeNum').textContent='Code'; document.getElementById('codeNum').classList.remove('filled');
  document.getElementById('ageLabel').textContent='Enter your age'; document.getElementById('ageStart').classList.add('hidden');
  ['firstInput','lastInput','userInput'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  go('splash'); setTimeout(()=>{ if(current==='splash') go('age'); },1200); }
