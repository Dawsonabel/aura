/* ===== Gas clone — admin dashboard logic ===== */
let adminToken = localStorage.getItem('gasAdminToken') || '';
let SCHOOLS = [];
const GRADES = ['Grade 9','Grade 10','Grade 11','Grade 12','Not in High School','Finished High School'];
const GENDERS = ['boy','girl','nonbinary'];

async function aApi(method, p, body){
  const res = await fetch('/api/admin'+p, { method, headers:{'x-token':adminToken,'Content-Type':'application/json'}, body: body?JSON.stringify(body):undefined });
  if(res.status===401){ adminToken=''; localStorage.removeItem('gasAdminToken'); showGate(); }
  try{ return await res.json(); }catch(e){ return {}; }
}
async function pubApi(p){ const res=await fetch('/api'+p); try{ return await res.json(); }catch(e){ return {}; } }

/* ---------- Auth ---------- */
async function adminLogin(){
  const pass=document.getElementById('passInput').value;
  const errEl=document.getElementById('gateErr'); errEl.textContent='';
  if(location.protocol==='file:'){ errEl.textContent='Open via http://localhost:8777/admin (not the file).'; return; }
  let r;
  try{ r=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({passcode:pass})}); }
  catch(e){ errEl.textContent="Can't reach the server — is 'node server.js' running?"; return; }
  if(r.status!==200){ errEl.textContent='Wrong passcode'; return; }
  const j=await r.json(); adminToken=j.token; localStorage.setItem('gasAdminToken',adminToken); enterAdmin();
}
function adminLogout(){ adminToken=''; localStorage.removeItem('gasAdminToken'); showGate(); }
function showGate(){ document.getElementById('gate').classList.remove('hidden'); document.getElementById('app').classList.remove('on'); }
async function enterAdmin(){
  document.getElementById('gate').classList.add('hidden'); document.getElementById('app').classList.add('on');
  const s=await aApi('GET','/schools'); SCHOOLS=s.schools||[];
  const h=(location.hash||'').replace('#','');
  nav(['overview','schools','users','polls','flames'].includes(h)?h:'overview');
}
window.addEventListener('load', async ()=>{
  // localhost convenience: /admin?pass=... auto-signs in (handy for local demos/screenshots)
  const qp=new URLSearchParams(location.search).get('pass');
  if(qp){ document.getElementById('passInput').value=qp; await adminLogin(); return; }
  if(adminToken){ const s=await aApi('GET','/schools'); if(s.schools){ SCHOOLS=s.schools; enterAdmin(); return; } }
  showGate();
});

/* ---------- Nav + refresh ---------- */
let view='overview';
const VIEWS={overview:renderOverview,schools:renderSchools,users:renderUsers,polls:renderPolls,flames:renderFlames};
function nav(v){ view=v; document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.view===v)); VIEWS[v](); stamp(); }
function refreshView(){ VIEWS[view](); stamp(); toast('Refreshed'); }
function stamp(){ const el=document.getElementById('lastSync'); if(el){ const d=new Date(); el.textContent='updated '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0'); } }
// auto-refresh read-only views only (never clobbers inline edits on users/polls)
setInterval(()=>{ if(document.getElementById('app').classList.contains('on') && (view==='overview'||view==='flames')){ VIEWS[view](); stamp(); } }, 8000);

/* ---------- Overview ---------- */
async function renderOverview(){
  const st=await aApi('GET','/stats'); const m=document.getElementById('main');
  m.innerHTML=`<div class="page-title">Overview</div><div class="page-sub">Live snapshot of the Gas network.</div>
    <div class="stats">
      ${stat(st.schools,'Schools')}${stat(st.users,'Users')}${stat(st.polls,'Poll questions')}${stat(st.votes,'Votes cast')}${stat(st.godMode,'God Mode users')}
    </div>
    <div class="panel"><div class="panel-head"><h3>Quick actions</h3></div>
      <div class="addform">
        <button class="btn orange" onclick="nav('schools')">🏫 Manage schools</button>
        <button class="btn orange" onclick="nav('users')">👥 Add / manage users</button>
        <button class="btn orange" onclick="nav('polls')">🗳️ Edit poll questions</button>
        <button class="btn ghost" onclick="openApp()">📱 Open the phone app</button>
      </div></div>`;
}
function stat(n,l){ return `<div class="stat"><div class="s-num">${n??0}</div><div class="s-lab">${l}</div></div>`; }
function openApp(){ window.open('/','_blank'); }

/* ---------- Schools ---------- */
async function renderSchools(){
  const r=await aApi('GET','/schools'); SCHOOLS=r.schools||[]; const m=document.getElementById('main');
  m.innerHTML=`<div class="page-title">Schools</div><div class="page-sub">Create and manage high schools.</div>
    <div class="panel">
      <div class="panel-head"><h3>${SCHOOLS.length} school(s)</h3></div>
      <table><thead><tr><th>Name</th><th>City</th><th>Students</th><th></th></tr></thead><tbody>
      ${SCHOOLS.map(s=>`<tr>
        <td>${esc(s.name)}</td><td>${esc(s.city||'—')}</td><td>${s.userCount}</td>
        <td class="row-actions">
          <button class="btn ghost" onclick="editSchool('${s.id}')">Edit</button>
          <button class="btn ghost" onclick="nav('users');setTimeout(()=>{document.getElementById('userSchoolFilter').value='${s.id}';renderUserRows();},200)">View students</button>
          <button class="btn red" onclick="delSchool('${s.id}')">Delete</button>
        </td></tr>`).join('')||`<tr><td colspan="4" class="empty">No schools yet</td></tr>`}
      </tbody></table>
      <div class="addform">
        <input id="schName" placeholder="School name" style="width:200px" />
        <input id="schCity" placeholder="City" />
        <button class="btn orange" onclick="addSchool()">+ Add school</button>
      </div>
    </div>`;
}
async function addSchool(){ const name=val('schName'); if(!name){toast('Name required');return;} await aApi('POST','/schools',{name,city:val('schCity')}); toast('School added'); renderSchools(); }
async function editSchool(id){ const s=SCHOOLS.find(x=>x.id===id); const name=prompt('School name:',s.name); if(name===null)return; const city=prompt('City:',s.city||''); await aApi('PATCH','/schools/'+id,{name,city:city||''}); toast('Saved'); renderSchools(); }
async function delSchool(id){ if(!confirm('Delete this school? Students will be unassigned.'))return; await aApi('DELETE','/schools/'+id); toast('Deleted'); renderSchools(); }

/* ---------- Users ---------- */
async function renderUsers(){
  const m=document.getElementById('main');
  m.innerHTML=`<div class="page-title">Users</div><div class="page-sub">Add students, assign them to schools & grades, or preview their app.</div>
    <div class="filterbar">
      <label style="font-weight:800">School:</label>
      <select id="userSchoolFilter" onchange="renderUserRows()">
        <option value="">All schools</option>
        ${SCHOOLS.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}
        <option value="__none">(no school)</option>
      </select>
      <input id="userSearch" placeholder="Search name…" oninput="renderUserRows()" />
    </div>
    <div class="panel">
      <div class="panel-head"><h3 id="userCount">Users</h3></div>
      <div id="userRows"></div>
      <div class="addform">
        <input id="uFirst" placeholder="First name" />
        <input id="uLast" placeholder="Last name" />
        <select id="uSchool">${SCHOOLS.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
        <select id="uGrade">${GRADES.map(g=>`<option>${g}</option>`).join('')}</select>
        <select id="uGender">${GENDERS.map(g=>`<option value="${g}">${cap(g)}</option>`).join('')}</select>
        <button class="btn orange" onclick="addUser()">+ Add student</button>
      </div>
    </div>`;
  renderUserRows();
}
async function renderUserRows(){
  const sid=val('userSchoolFilter'); const q=(val('userSearch')||'').toLowerCase();
  const r=await aApi('GET','/users'+(sid&&sid!=='__none'?`?schoolId=${sid}`:'')); let users=r.users||[];
  if(sid==='__none') users=users.filter(u=>!u.schoolId);
  if(q) users=users.filter(u=>(u.firstName+' '+u.lastName+' '+(u.username||'')).toLowerCase().includes(q));
  document.getElementById('userCount').textContent=`${users.length} user(s)`;
  document.getElementById('userRows').innerHTML=`<table>
    <thead><tr><th>Name</th><th>Username</th><th>Gender</th><th>School</th><th>Grade</th><th>Coins</th><th>Flames</th><th>God</th><th></th></tr></thead>
    <tbody>${users.map(u=>userRow(u)).join('')||`<tr><td colspan="9" class="empty">No users</td></tr>`}</tbody></table>`;
}
function userRow(u){
  const nm=`${u.firstName} ${u.lastName}`.trim()||'(no name)';
  return `<tr>
    <td><span class="avatar-sm">${esc(ini(nm))}</span>${esc(nm)}</td>
    <td>@${esc(u.username||'')}</td>
    <td><span class="chip ${u.gender}">${cap(u.gender)}</span></td>
    <td><select class="inline" onchange="patchUser('${u.id}',{schoolId:this.value||null})">
      <option value="">— none —</option>
      ${SCHOOLS.map(s=>`<option value="${s.id}" ${s.id===u.schoolId?'selected':''}>${esc(s.name)}</option>`).join('')}
    </select></td>
    <td><select class="inline" onchange="patchUser('${u.id}',{grade:this.value})">
      ${GRADES.map(g=>`<option ${g===u.grade?'selected':''}>${g}</option>`).join('')}
    </select></td>
    <td><input class="inline" style="width:64px" type="number" value="${u.coins}" onchange="patchUser('${u.id}',{coins:+this.value})" /></td>
    <td>${u.flames}</td>
    <td><input class="tgl2" type="checkbox" ${u.godMode?'checked':''} onchange="patchUser('${u.id}',{godMode:this.checked})" /></td>
    <td class="row-actions">
      <button class="btn blue" onclick="loginAs('${u.id}')" title="Open this user's app">Log in as ↗</button>
      <button class="btn ghost" onclick="renameUser('${u.id}','${esc(u.firstName)}','${esc(u.lastName)}','${esc(u.username||'')}')">Edit</button>
      <button class="btn red" onclick="delUser('${u.id}')">✕</button>
    </td></tr>`;
}
async function addUser(){ const firstName=val('uFirst'),lastName=val('uLast'); if(!firstName){toast('First name required');return;}
  await aApi('POST','/users',{firstName,lastName,schoolId:val('uSchool'),grade:val('uGrade'),gender:val('uGender')});
  document.getElementById('uFirst').value='';document.getElementById('uLast').value=''; toast('Student added'); renderUserRows(); }
async function patchUser(id,fields){ await aApi('PATCH','/users/'+id,fields); toast('Saved'); if('godMode'in fields||'schoolId'in fields) renderUserRows(); }
async function renameUser(id,f,l,un){ const firstName=prompt('First name:',f); if(firstName===null)return; const lastName=prompt('Last name:',l)||''; const username=prompt('Username:',un)||''; await aApi('PATCH','/users/'+id,{firstName,lastName,username}); toast('Saved'); renderUserRows(); }
async function delUser(id){ if(!confirm('Delete this user and their votes?'))return; await aApi('DELETE','/users/'+id); toast('Deleted'); renderUserRows(); }
async function loginAs(id){ const r=await aApi('POST','/users/'+id+'/token'); if(r.token) window.open('/?token='+r.token,'_blank'); }

/* ---------- Polls ---------- */
async function renderPolls(){
  const r=await aApi('GET','/polls'); const polls=r.polls||[]; const m=document.getElementById('main');
  m.innerHTML=`<div class="page-title">Poll Questions</div><div class="page-sub">The compliment prompts students answer. Toggle, edit, or add your own.</div>
    <div class="panel">
      <div class="panel-head"><h3>${polls.length} question(s)</h3></div>
      <table><thead><tr><th>Emoji</th><th>Prompt</th><th>Color</th><th>Scope</th><th>Enabled</th><th></th></tr></thead>
      <tbody>${polls.map(p=>`<tr>
        <td style="font-size:24px">${p.emoji}</td>
        <td>${esc(p.text)}</td>
        <td><span class="swatch" style="background:${p.color}"></span>${p.color}</td>
        <td>${p.schoolId?(schoolName(p.schoolId)):'All schools'}</td>
        <td><input class="tgl2" type="checkbox" ${p.enabled?'checked':''} onchange="patchPoll('${p.id}',{enabled:this.checked})" /></td>
        <td class="row-actions"><button class="btn ghost" onclick="editPoll('${p.id}','${esc(p.emoji)}','${escq(p.text)}','${p.color}')">Edit</button><button class="btn red" onclick="delPoll('${p.id}')">✕</button></td>
      </tr>`).join('')}</tbody></table>
      <div class="addform">
        <input id="pEmoji" placeholder="💎" style="width:70px" />
        <input id="pText" placeholder="Prompt text" style="width:320px" />
        <input id="pColor" type="color" value="#A31CEE" style="width:54px;padding:4px" />
        <select id="pSchool"><option value="">All schools</option>${SCHOOLS.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
        <button class="btn orange" onclick="addPoll()">+ Add prompt</button>
      </div>
    </div>`;
}
async function addPoll(){ const text=val('pText'); if(!text){toast('Prompt text required');return;} await aApi('POST','/polls',{emoji:val('pEmoji')||'🔥',text,color:val('pColor'),schoolId:val('pSchool')||null}); document.getElementById('pText').value=''; toast('Prompt added'); renderPolls(); }
async function patchPoll(id,f){ await aApi('PATCH','/polls/'+id,f); toast('Saved'); }
async function editPoll(id,emoji,text,color){ const e=prompt('Emoji:',emoji); if(e===null)return; const t=prompt('Prompt:',text)||text; await aApi('PATCH','/polls/'+id,{emoji:e,text:t}); toast('Saved'); renderPolls(); }
async function delPoll(id){ if(!confirm('Delete this prompt?'))return; await aApi('DELETE','/polls/'+id); toast('Deleted'); renderPolls(); }

/* ---------- Flames / activity ---------- */
async function renderFlames(){
  const r=await aApi('GET','/votes'); const votes=r.votes||[]; const m=document.getElementById('main');
  m.innerHTML=`<div class="page-title">Flames / Activity</div><div class="page-sub">Every vote cast across the network (most recent first). Delete to moderate.</div>
    <div class="panel"><div class="panel-head"><h3>${votes.length} recent vote(s)</h3></div>
      <table><thead><tr><th>Voter</th><th></th><th>Received by</th><th>Prompt</th><th>When</th><th></th></tr></thead>
      <tbody>${votes.map(v=>`<tr>
        <td>${esc(v.voter)}</td><td style="text-align:center">${v.emoji} →</td><td>${esc(v.target)}</td>
        <td>${esc(v.text)}</td><td style="color:var(--muted)">${timeAgo(v.ts)}</td>
        <td class="row-actions"><button class="btn red" onclick="delVote('${v.id}')">Delete</button></td>
      </tr>`).join('')||`<tr><td colspan="6" class="empty">No votes yet — answer some polls in the app!</td></tr>`}</tbody></table>
    </div>`;
}
async function delVote(id){ await aApi('DELETE','/votes/'+id); toast('Removed'); renderFlames(); }

/* ---------- helpers ---------- */
function val(id){ const e=document.getElementById(id); return e?e.value.trim():''; }
function cap(g){ return g==='nonbinary'?'Non-binary':(g||'').charAt(0).toUpperCase()+(g||'').slice(1); }
function ini(n){ return (n||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase(); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function escq(s){ return esc(s).replace(/'/g,"\\'"); }
function schoolName(id){ const s=SCHOOLS.find(x=>x.id===id); return s?esc(s.name):'—'; }
function timeAgo(iso){ const d=(Date.now()-new Date(iso).getTime())/1000; if(d<60)return'just now'; if(d<3600)return Math.floor(d/60)+'m ago'; if(d<86400)return Math.floor(d/3600)+'h ago'; return Math.floor(d/86400)+'d ago'; }
let tt; function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(tt); tt=setTimeout(()=>t.classList.remove('show'),1600); }
