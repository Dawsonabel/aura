/* ===== Gas clone — browser-side backend shim =====
   Mirrors the REST API in server.js entirely inside the page, so the app can run
   as a single static file (hosted demo / phone testing) with no Node server.

   It intercepts fetch() for any /api/... URL and answers from an in-page database
   persisted to localStorage. Semantics follow server.js; differences are marked
   with "DEMO:" comments.
*/
(function(){
  if(window.__gasBrowserBackend) return;
  window.__gasBrowserBackend = true;

  const KEY = 'gasLocalDB_v1';
  const BOOT = Date.now();

  /* ---------- tiny helpers ---------- */
  const hex = n => { let s=''; for(let i=0;i<n;i++) s+=Math.floor(Math.random()*256).toString(16).padStart(2,'0'); return s; };
  const uid = p => (p||'')+hex(6);
  const nowISO = () => new Date().toISOString();
  const normPhone = p => String(p||'').replace(/\D/g,'');
  const genCode = () => String(Math.floor(100000 + Math.random()*900000));
  const str = (v,max) => typeof v==='string' ? v.slice(0,max) : '';
  function shuffle(a){ a=a.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

  /* ---------- poll question library (same as server.js) ---------- */
  const POLL_LIB = [
    ['💎','Cooler than anyone knows','#A31CEE'],
    ['🥦','Thinks about Lil Yachty every time they eat broccoli','#5E7A8A'],
    ['🤟','Could rock a sleeve of tattoos','#2E5D52'],
    ['🤴','Most likely to have a Disney prince or princess made in their image','#A31CEE'],
    ['👩‍🎓','Most likely to be valedictorian','#22C63E'],
    ['😍','The girl every guy wants to date & the guy every girl wants to date','#EF5350'],
    ['😁','Best smile in the whole grade','#FF2E93'],
    ['🔥','Most likely to be famous','#FF6A1A'],
    ['🎤','Would win a talent show','#5B4BE0'],
    ['🛏️','Rolls out of bed looking on point','#8A6A5E'],
    ['🧠','Smartest in the room, always','#12B886'],
    ['✨','Glows different, no cap','#D01E8E'],
    ['🎨','Most creative person I know','#EF5350'],
    ['😂','Funniest person alive','#2AA9E0'],
    ['🍀','Luckiest person to know','#12B886'],
    ['🌟','Lights up every room they walk in','#2E5D52']
  ];

  /* ---------- storage ---------- */
  let db = null;
  function loadDB(){
    try{ const raw = localStorage.getItem(KEY); if(raw){ const d=JSON.parse(raw); if(d && d.users && d.users.length) return d; } }catch(e){}
    return null;
  }
  let saveTimer=null;
  function save(){ clearTimeout(saveTimer); saveTimer=setTimeout(saveNow,60); }
  function saveNow(){ try{ localStorage.setItem(KEY, JSON.stringify(db)); }catch(e){ /* private mode / quota — stay in memory */ } }

  function seed(){
    const school = { id:uid('sch_'), name:'Lincoln High School', city:'Springfield', createdAt:nowISO() };
    const school2 = { id:uid('sch_'), name:'Riverside High School', city:'Shelbyville', createdAt:nowISO() };
    const first=['Ava','Liam','Maya','Noah','Sofia','Ethan','Zoe','Lucas','Mia','Jack','Emma','Leo','Chloe','Owen','Isla','Kai'];
    const last=['Martinez','Chen','Patel','Kim','Rossi','Brooks','Nguyen','Silva','Johnson','Turner','Davis','Garcia','Adams','Wright','Moore','Robinson'];
    const genders=['girl','boy','girl','boy','girl','boy','girl','boy','girl','boy','girl','boy','girl','boy','girl','boy'];
    const grades=['Grade 9','Grade 10','Grade 11','Grade 12'];
    const users = first.map((f,i)=>({
      id:uid('usr_'), schoolId:school.id, firstName:f, lastName:last[i],
      username:(f+last[i]).toLowerCase(), gender:genders[i], grade:grades[i%4],
      age:15+(i%4), phone:'', coins:2, godMode:false, friendIds:[], onboarded:true, createdAt:nowISO(), photo:null
    }));
    users.forEach((u,i)=>{ u.friendIds=[users[(i+1)%users.length].id, users[(i+2)%users.length].id, users[(i+3)%users.length].id]; });
    const polls = POLL_LIB.map(([emoji,text,color])=>({ id:uid('pol_'), emoji, text, color, enabled:true, schoolId:null, createdAt:nowISO() }));
    db = { schools:[school,school2], users, polls, votes:[], sessions:{}, rounds:{}, boosts:[], reports:[], meta:{createdAt:nowISO()} };
    seedVote(users[2], users[0], polls[6]);
    seedVote(users[5], users[0], polls[0]);
    seedVote(users[1], users[3], polls[7]);
    save();
  }
  function seedVote(voter,target,poll){
    db.votes.push({ id:uid('vote_'), voterId:voter.id, targetId:target.id, questionId:poll.id,
      emoji:poll.emoji, text:poll.text, color:poll.color, revealed:false, unread:true, ts:nowISO() });
  }

  db = loadDB(); if(!db) seed();
  db.boosts = db.boosts || []; db.reports = db.reports || []; db.rounds = db.rounds || {}; db.sessions = db.sessions || {};

  /* ---------- helpers over db ---------- */
  const U = id => db.users.find(u=>u.id===id);
  const publicUser = u => { if(!u) return null; const {phone, ...rest}=u; return rest; };
  const schoolMates = u => db.users.filter(x=>x.schoolId===u.schoolId && x.id!==u.id);
  const initial = u => (u.firstName||'?').charAt(0).toUpperCase();
  function tokenFor(userId){ const t=uid('tok_'); db.sessions[t]={userId}; save(); return t; }
  function enforceEntitlement(u){ if(u.godMode && u.godModeExpires && Date.parse(u.godModeExpires)<=Date.now()){ u.godMode=false; save(); } }
  function sessionUser(tok){ const s=tok&&db.sessions[tok]; const u=s&&s.userId?U(s.userId):null; if(u) enforceEntitlement(u); return u; }
  function notBlocked(a,b){ return !((a.blocked||[]).includes(b.id)) && !((b.blocked||[]).includes(a.id)); }
  function notify(user,text,emoji){ if(!user) return; user.notifications=user.notifications||[];
    user.notifications.unshift({ id:uid('ntf_'), text, emoji:emoji||'🔔', ts:nowISO(), read:false });
    if(user.notifications.length>30) user.notifications.length=30; }

  function flamesFor(user){
    const revealedVoters = user.revealedVoters||[];
    return db.votes.filter(v=>v.targetId===user.id).sort((a,b)=>b.ts.localeCompare(a.ts)).map(v=>{
      const voter=U(v.voterId); const gm=user.godMode;
      const anonymous=!!(voter && voter.godMode);
      const hintShown=v.revealed||gm;
      const pickCount=db.votes.filter(x=>x.voterId===v.voterId && x.targetId===user.id).length;
      const nameShown=revealedVoters.includes(v.voterId) && voter;
      return {
        id:v.id, emoji:v.emoji, q:v.text, color:v.color,
        gender: voter?voter.gender:'nonbinary',
        grade: voter?voter.grade:'your grade',
        revealed:v.revealed, godMode:gm, unread:v.unread, anonymous,
        initial: (hintShown && voter && !anonymous) ? initial(voter) : null,
        name: (nameShown && !anonymous) ? (voter.firstName+' '+voter.lastName) : null,
        repeatAdmirer: (pickCount>=2 && !anonymous), pickCount,
        ts:v.ts
      };
    });
  }

  function buildRound(user){
    const mates=schoolMates(user).filter(m=>notBlocked(user,m));
    const friends=mates.filter(m=>user.friendIds.includes(m.id));
    const pool=friends.length>=4?friends:mates;
    const enabled=db.polls.filter(p=>p.enabled && (p.schoolId===null||p.schoolId===user.schoolId));
    const qs=shuffle(enabled).slice(0,12);
    const roundId=uid('rnd_');
    const applicable=db.boosts.filter(b=>b.remaining>0 && b.byUserId!==user.id && U(b.byUserId) && notBlocked(user,U(b.byUserId))
      && (b.targetId===user.id || (b.targetId===null && U(b.byUserId).schoolId===user.schoolId)));
    let boostedInserts=0; const MAX_BOOST_PER_ROUND=4; const boosters=new Set();
    const polls=qs.map(q=>{
      let choices=shuffle(pool).slice(0,4).map(c=>({id:c.id,name:c.firstName+' '+c.lastName}));
      if(boostedInserts<MAX_BOOST_PER_ROUND){
        const b=applicable.find(x=>x.remaining>0);
        if(b){ const bu=U(b.byUserId);
          if(bu && !choices.some(c=>c.id===bu.id)){
            choices[Math.floor(Math.random()*4)]={ id:bu.id, name:bu.firstName+' '+bu.lastName, boosted:true };
            b.remaining--; boostedInserts++; boosters.add(bu.id);
          }
        }
      }
      return { questionId:q.id, emoji:q.emoji, text:q.text, color:q.color, choices };
    });
    if(boostedInserts>0 && user.godMode){ const n=boosters.size; notify(user, n>1?`${n} people added themselves to your polls 👀`:'Someone added themselves to your polls 👀','👑'); }
    db.rounds[roundId]={ userId:user.id, ts:nowISO(), answered:0, votedQ:[], claimed:false };
    const cutoff=Date.now()-6*3600*1000;
    for(const rid of Object.keys(db.rounds)){ if(Date.parse(db.rounds[rid].ts)<cutoff) delete db.rounds[rid]; }
    save();
    return { roundId, polls, canPlay: pool.length>=1, boostedInserts };
  }

  /* DEMO: with no other real players on the device, classmates gas you back so the
     inbox behaves like a live network. Server-side this happens from real users. */
  function simulateIncoming(user, n){
    const mates=schoolMates(user).filter(m=>notBlocked(user,m));
    if(!mates.length) return 0;
    const enabled=db.polls.filter(p=>p.enabled && (p.schoolId===null||p.schoolId===user.schoolId));
    if(!enabled.length) return 0;
    const voters=shuffle(mates);
    let made=0;
    for(let i=0;i<n;i++){
      const voter=voters[i%voters.length];
      const q=enabled[Math.floor(Math.random()*enabled.length)];
      db.votes.push({ id:uid('vote_'), voterId:voter.id, targetId:user.id, questionId:q.id,
        emoji:q.emoji, text:q.text, color:q.color, revealed:false, unread:true, ts:nowISO() });
      made++;
    }
    if(made) save();
    return made;
  }

  /* ---------- verification codes ---------- */
  const codes = new Map(); // phoneDigits -> {code, expires, attempts}

  /* ---------- router ---------- */
  const ok   = obj => ({status:200, body:obj});
  const err  = (code,message) => ({status:code, body:{error:message}});

  function route(method, path, body, tok){
    const seg = path.split('/').filter(Boolean); // ['api', ...]

    if(path==='/api/health' && method==='GET')
      return ok({ ok:true, service:'gas', ts:nowISO(), uptime:Math.round((Date.now()-BOOT)/1000), sms:'dev', mode:'browser-demo' });

    /* ---- auth ---- */
    if(path==='/api/auth/request-code' && method==='POST'){
      const digits=normPhone(body.phone);
      if(digits.length<10 || digits.length>15) return err(400,'Enter a valid 10-digit phone number');
      const code=genCode();
      codes.set(digits,{ code, expires:Date.now()+10*60*1000, attempts:0 });
      return ok({ sent:true, sms:false, devCode:code });   // DEMO: no SMS provider, code shows on screen
    }
    if(path==='/api/auth/login' && method==='POST'){
      const digits=normPhone(body.phone);
      if(digits.length<10) return err(400,'Invalid phone number');
      const rec=codes.get(digits);
      if(!rec) return err(400,'Request a code first');
      if(Date.now()>rec.expires){ codes.delete(digits); return err(400,'Code expired — tap Resend'); }
      if(rec.attempts>=5){ codes.delete(digits); return err(429,'Too many tries — tap Resend'); }
      if(String(body.code||'')!==rec.code){ rec.attempts++; return err(401,'Incorrect code'); }
      codes.delete(digits);
      let u=db.users.find(x=>normPhone(x.phone)===digits && x.phone);
      if(!u){ u={ id:uid('usr_'), schoolId:null, firstName:'', lastName:'', username:'', gender:'boy', grade:'', age:null,
        phone:body.phone, coins:2, godMode:false, friendIds:[], onboarded:false, createdAt:nowISO(), photo:null }; db.users.push(u); save(); }
      return ok({ token:tokenFor(u.id), user:publicUser(u) });
    }
    if(path==='/api/auth/demo' && method==='POST'){
      const u=db.users.find(x=>x.onboarded && x.schoolId) || db.users[0];
      return ok({ token:tokenFor(u.id), user:publicUser(u) });
    }
    if(path==='/api/schools' && method==='GET') return ok({schools:db.schools});

    if(path.indexOf('/api/admin/')===0) return err(404,'Admin dashboard is not part of the web demo');

    /* ---- everything below needs a user ---- */
    const me=sessionUser(tok);
    if(!me) return err(401,'Not logged in');

    if(path==='/api/me' && method==='GET') return ok({user:me});
    if(path==='/api/me' && method==='PATCH'){
      const wasOnboarded = !!me.onboarded;
      if('firstName' in body) me.firstName = str(body.firstName,40).trim();
      if('lastName'  in body) me.lastName  = str(body.lastName,40).trim();
      if('username'  in body) me.username  = str(body.username,30).replace(/[^a-zA-Z0-9_.]/g,'');
      if('gender'    in body) me.gender    = ['boy','girl','nonbinary'].includes(body.gender)?body.gender:me.gender;
      if('grade'     in body) me.grade     = str(body.grade,30);
      if('age'       in body){ const a=parseInt(body.age,10); me.age=(a>=10&&a<=99)?a:me.age; }
      if('schoolId'  in body) me.schoolId  = str(body.schoolId,60) || null;
      if('photo'     in body) me.photo     = body.photo==null?null:str(body.photo,500000);
      if('onboarded' in body) me.onboarded = !!body.onboarded;
      if('hideTopFlames' in body) me.hideTopFlames = !!body.hideTopFlames;
      if(!wasOnboarded && me.onboarded && me.schoolId) simulateIncoming(me, 3); // DEMO: welcome flames
      save(); return ok({user:publicUser(me)});
    }
    if(path==='/api/me' && method==='DELETE'){
      const id=me.id;
      db.users=db.users.filter(u=>u.id!==id);
      db.votes=db.votes.filter(v=>v.voterId!==id && v.targetId!==id);
      db.users.forEach(u=>{ u.friendIds=(u.friendIds||[]).filter(f=>f!==id); u.blocked=(u.blocked||[]).filter(b=>b!==id); u.revealedVoters=(u.revealedVoters||[]).filter(r=>r!==id); });
      db.boosts=db.boosts.filter(b=>b.byUserId!==id && b.targetId!==id);
      Object.keys(db.sessions).forEach(t=>{ if(db.sessions[t].userId===id) delete db.sessions[t]; });
      save(); return ok({ok:true,deleted:true});
    }
    if(path==='/api/me/logout' && method==='POST'){ if(tok) delete db.sessions[tok]; save(); return ok({ok:true}); }

    /* ---- safety ---- */
    if(path==='/api/block' && method==='POST'){ const {userId}=body; me.blocked=me.blocked||[];
      if(U(userId)&&userId!==me.id&&!me.blocked.includes(userId)){ me.blocked.push(userId);
        me.friendIds=me.friendIds.filter(id=>id!==userId); const o=U(userId); if(o) o.friendIds=o.friendIds.filter(id=>id!==me.id); save(); }
      return ok({blocked:me.blocked}); }
    if(path==='/api/block' && method==='DELETE'){ const {userId}=body; me.blocked=(me.blocked||[]).filter(id=>id!==userId); save(); return ok({blocked:me.blocked}); }
    if(path==='/api/blocked' && method==='GET') return ok({blocked:(me.blocked||[]).map(id=>publicUser(U(id))).filter(Boolean)});
    if(path==='/api/report' && method==='POST'){ const {userId,reason}=body;
      db.reports.push({ id:uid('rep_'), byUserId:me.id, targetId:userId||null, reason:(reason||'').slice(0,300), ts:nowISO(), status:'open' }); save();
      return ok({ok:true}); }

    /* ---- social ---- */
    if(path==='/api/suggestions' && method==='GET'){
      if(!me.schoolId) return ok({contacts:[],fof:[]});
      const mates=schoolMates(me).filter(u=>!me.friendIds.includes(u.id) && notBlocked(me,u));
      const contacts=mates.slice(0,Math.ceil(mates.length/2)).map(publicUser);
      const fof=mates.slice(Math.ceil(mates.length/2)).map(u=>({...publicUser(u), mutual:Math.max(0,me.friendIds.filter(f=>u.friendIds.includes(f)).length)}));
      return ok({contacts,fof});
    }
    if(path==='/api/friends' && method==='GET') return ok({friends:me.friendIds.map(id=>publicUser(U(id))).filter(Boolean)});
    if(path==='/api/friends' && method==='POST'){ const {userId}=body;
      if(U(userId)&&!me.friendIds.includes(userId)){ me.friendIds.push(userId); const other=U(userId); if(other && !other.friendIds.includes(me.id)) other.friendIds.push(me.id); save(); }
      return ok({friends:me.friendIds}); }
    if(path==='/api/friends' && method==='DELETE'){ const {userId}=body;
      me.friendIds=me.friendIds.filter(id=>id!==userId); const other=U(userId); if(other) other.friendIds=other.friendIds.filter(id=>id!==me.id); save();
      return ok({friends:me.friendIds}); }

    /* ---- coin boosts ---- */
    if(path==='/api/boost/random' && method==='POST'){ const COST=100;
      if(me.coins<COST) return err(402,'You need 100 coins');
      me.coins-=COST; db.boosts.push({ id:uid('bst_'), byUserId:me.id, targetId:null, remaining:3, ts:nowISO() }); save();
      return ok({coins:me.coins, message:"You'll appear in 3 random polls 🔥"}); }
    if(path==='/api/boost/crush' && method==='POST'){ const COST=300; const t=U(body.targetId);
      if(!t||t.id===me.id) return err(400,'Pick a valid crush');
      if(me.coins<COST) return err(402,'You need 300 coins');
      me.coins-=COST; db.boosts.push({ id:uid('bst_'), byUserId:me.id, targetId:t.id, remaining:6, ts:nowISO() }); save();
      return ok({coins:me.coins, message:`You'll show up in ${t.firstName}'s polls 💘`}); }

    /* ---- notifications ---- */
    if(path==='/api/notifications' && method==='GET') return ok({ notifications: me.notifications||[] });
    if(path==='/api/notifications/read' && method==='POST'){ (me.notifications||[]).forEach(n=>n.read=true); save(); return ok({ok:true}); }

    /* ---- polls / votes ---- */
    if(path==='/api/polls/round' && method==='GET') return ok(buildRound(me));
    if(path==='/api/vote' && method==='POST'){
      const {questionId,targetId,roundId}=body;
      const q=db.polls.find(x=>x.id===questionId && x.enabled); const target=U(targetId);
      if(!q||!target) return err(400,'bad vote');
      if(target.id===me.id) return err(400,'cannot vote for yourself');
      const eligible = target.schoolId===me.schoolId || db.boosts.some(b=>b.remaining>=0 && b.byUserId===target.id && (b.targetId===me.id||b.targetId===null));
      if(!eligible || !notBlocked(me,target)) return err(400,'not eligible');
      const round = roundId && db.rounds[roundId];
      if(round){
        if(round.userId!==me.id) return err(403,'not your round');
        round.votedQ = round.votedQ || [];
        if(round.votedQ.includes(questionId)) return ok({ok:true, dup:true});
        if(round.votedQ.length>=12) return err(429,'round full');
        round.votedQ.push(questionId); round.answered=round.votedQ.length;
      }
      db.votes.push({ id:uid('vote_'), voterId:me.id, targetId, questionId, emoji:q.emoji, text:q.text, color:q.color, revealed:false, unread:true, ts:nowISO() });
      save(); return ok({ok:true});
    }
    if(path==='/api/round/complete' && method==='POST'){
      const round = body.roundId && db.rounds[body.roundId];
      if(!round || round.userId!==me.id) return err(400,'no active round');
      if(round.claimed) return ok({coins:me.coins, earned:0, already:true});
      if((round.answered||0)<1) return err(400,'answer at least one poll first');
      round.claimed=true;
      const earned = me.godMode?4:2; me.coins+=earned;
      simulateIncoming(me, 1+Math.floor(Math.random()*3)); // DEMO: classmates gas you back
      save(); return ok({coins:me.coins, earned});
    }

    /* ---- flames ---- */
    if(path==='/api/flames' && method==='GET')
      return ok({ flames:flamesFor(me), coins:me.coins, godMode:me.godMode, bonusRevealsLeft: me.godMode?(2-(me.bonusRevealsUsed||0)):0 });
    if(path==='/api/flames/read' && method==='POST'){ db.votes.forEach(v=>{ if(v.targetId===me.id) v.unread=false; }); save(); return ok({ok:true}); }
    if(seg[1]==='flames' && seg[3]==='reveal' && method==='POST'){
      const v=db.votes.find(x=>x.id===seg[2] && x.targetId===me.id);
      if(!v) return err(404,'no flame');
      const rv=U(v.voterId); if(rv&&rv.godMode) return err(400,'This admirer is anonymous 🔒');
      if(me.godMode){ v.revealed=true; save(); return ok({ok:true,coins:me.coins}); }
      if(me.coins<1) return err(402,'no coins');
      me.coins-=1; v.revealed=true; save(); return ok({ok:true,coins:me.coins});
    }
    if(seg[1]==='flames' && seg[3]==='reveal-name' && method==='POST'){
      const v=db.votes.find(x=>x.id===seg[2] && x.targetId===me.id);
      if(!v) return err(404,'no flame');
      if(!me.godMode) return err(402,'God Mode required');
      const voter=U(v.voterId); if(!voter) return err(404,'voter gone');
      if(voter.godMode) return err(400,'This admirer is anonymous 🔒');
      const pickCount=db.votes.filter(x=>x.voterId===v.voterId && x.targetId===me.id).length;
      if(pickCount<2) return err(400,'Only works for someone who picked you twice');
      me.revealedVoters=me.revealedVoters||[];
      if(!me.revealedVoters.includes(v.voterId)){
        if((me.bonusRevealsUsed||0)>=2) return err(402,'No bonus reveals left');
        me.bonusRevealsUsed=(me.bonusRevealsUsed||0)+1; me.revealedVoters.push(v.voterId); save();
      }
      return ok({ name:voter.firstName+' '+voter.lastName, bonusRevealsLeft:2-(me.bonusRevealsUsed||0) });
    }

    /* ---- shop / god mode ---- */
    if(path==='/api/shop/boost' && method==='POST'){ const cost=body.cost|0; if(me.coins<cost) return err(402,'not enough coins'); me.coins-=cost; save(); return ok({coins:me.coins}); }
    if(path==='/api/godmode' && method==='POST'){ me.godMode=true; me.godModeExpires=null; save(); return ok({godMode:true}); }
    if(path==='/api/iap/validate' && method==='POST') return err(400,'App Store purchases only work in the iOS build'); // DEMO

    return err(404,'unknown endpoint '+path);
  }

  /* ---------- fetch interception ---------- */
  const origFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function(input, init){
    const raw = typeof input==='string' ? input : (input && input.url) || '';
    const i = raw.indexOf('/api/');
    if(i<0) return origFetch ? origFetch(input, init) : Promise.reject(new Error('offline'));
    const rest = raw.slice(i);
    const qIdx = rest.indexOf('?');
    const path = qIdx<0 ? rest : rest.slice(0,qIdx);
    const query = new URLSearchParams(qIdx<0 ? '' : rest.slice(qIdx+1));
    const opts = init || {};
    const method = (opts.method || (typeof input==='object'&&input.method) || 'GET').toUpperCase();
    let headers = opts.headers || {};
    if(headers instanceof Headers){ const h={}; headers.forEach((v,k)=>h[k.toLowerCase()]=v); headers=h; }
    else { const h={}; Object.keys(headers).forEach(k=>h[k.toLowerCase()]=headers[k]); headers=h; }
    const tok = headers['x-token'] || query.get('token') || '';
    let body = {};
    if(opts.body){ try{ body = JSON.parse(opts.body); }catch(e){ body = {}; } }

    let out;
    try{ out = route(method, path, body, tok); }
    catch(e){ console.error('[gas backend]', e); out = {status:500, body:{error:e.message}}; }

    // a touch of latency so loading states behave like they do against the real server
    return new Promise(resolve=>setTimeout(()=>{
      resolve(new Response(JSON.stringify(out.body), { status:out.status, headers:{'Content-Type':'application/json'} }));
    }, 45));
  };

  /* ---------- dev handle: window.gasDemo.reset() wipes the local network ---------- */
  window.gasDemo = {
    reset(){ try{ localStorage.removeItem(KEY); localStorage.removeItem('gasToken'); }catch(e){} location.reload(); },
    db(){ return db; }
  };
})();
