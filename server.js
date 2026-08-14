/* ===== Aura — Node backend =====
   Static hosting + REST API + Neon Postgres store + demo auth.
   Run:  node server.js      then open http://localhost:8777

   Persistence is split two ways:
   - polls/votes/boosts/reports/sessions/rounds/meta: one in-memory snapshot,
     debounced-saved to a generic kv table (see store.ts).
   - schools/users: real relational tables, queried directly per request —
     no in-memory snapshot, real foreign key (users.school_id -> schools.id
     ON DELETE SET NULL), real index. See store.ts for the schema/queries.
*/
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const DATABASE_URL = process.env.DATABASE_URL;
const PORT = process.env.PORT || 8777;
const MIN_AGE = 13; // COPPA-safe floor — under-13 accounts are refused outright, not just under-collected
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || 'aura-admin';
const IS_PROD = process.env.NODE_ENV === 'production';
const ALLOW_DEMO = process.env.ALLOW_DEMO === '1' || !IS_PROD; // demo login: on in dev, off in prod unless forced
if(IS_PROD && ADMIN_PASSCODE === 'aura-admin'){
  console.error('\n🛑 REFUSING TO START: NODE_ENV=production with the default admin passcode. Set ADMIN_PASSCODE to a strong secret.\n');
  process.exit(1);
}
if(!DATABASE_URL){
  console.error('\n🛑 REFUSING TO START: DATABASE_URL is not set. Point it at your Neon connection string (see README).\n');
  process.exit(1);
}

/* ---------- SMS verification ---------- */
const TWILIO = {
  account: process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_SID, // AC… — used in the request URL
  authUser: process.env.TWILIO_SID,     // AC… (Account SID) or SK… (API Key SID) — auth username
  authPass: process.env.TWILIO_TOKEN,   // Auth Token or API Key secret — auth password
  from: process.env.TWILIO_FROM
};
const SMS_ON = !!(TWILIO.account && String(TWILIO.account).startsWith('AC') && TWILIO.authUser && TWILIO.authPass && TWILIO.from);
const codes = new Map(); // phoneDigits -> { code, expires, attempts }
function genCode(){ return String(Math.floor(100000 + Math.random()*900000)); }
function normPhone(p){ return String(p||'').replace(/\D/g,''); }
function sendSMS(digits, bodyText){
  return new Promise(resolve=>{
    if(!SMS_ON){ console.log(`\n📱 [SMS dev mode] → ${digits}: "${bodyText}"\n`); return resolve({dev:true}); }
    const to = digits.length===10 ? '+1'+digits : '+'+digits;
    const payload = new URLSearchParams({ To:to, From:TWILIO.from, Body:bodyText }).toString();
    const req = https.request({ hostname:'api.twilio.com', path:`/2010-04-01/Accounts/${TWILIO.account}/Messages.json`, method:'POST',
      headers:{ 'Content-Type':'application/x-www-form-urlencoded', 'Authorization':'Basic '+Buffer.from(TWILIO.authUser+':'+TWILIO.authPass).toString('base64'), 'Content-Length':Buffer.byteLength(payload) } },
      resp=>{ let d=''; resp.on('data',c=>d+=c); resp.on('end',()=>{ if(resp.statusCode>=400) console.error('Twilio error',resp.statusCode,d); resolve({status:resp.statusCode}); }); });
    req.on('error',e=>{ console.error('SMS send failed:',e.message); resolve({error:e.message}); });
    req.write(payload); req.end();
  });
}

/* ---------- Poll question library ---------- */
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

/* ---------- DB ---------- */
let db; // polls/votes/boosts/reports/sessions/rounds/meta only — schools/users are queried live, see store.ts
function uid(p){ return (p||'')+crypto.randomBytes(6).toString('hex'); }
function nowISO(){ return new Date().toISOString(); }
function isFKViolation(e){ return e && e.code === '23503'; }

async function seed(){
  const school = await store.createSchool({ id:uid('sch_'), name:'Lincoln High School', city:'Springfield' });
  const first=['Ava','Liam','Maya','Noah','Sofia','Ethan','Zoe','Lucas','Mia','Jack','Emma','Leo','Chloe','Owen','Isla','Kai'];
  const last=['Martinez','Chen','Patel','Kim','Rossi','Brooks','Nguyen','Silva','Johnson','Turner','Davis','Garcia','Adams','Wright','Moore','Robinson'];
  const genders=['girl','boy','girl','boy','girl','boy','girl','boy','girl','boy','girl','boy','girl','boy','girl','boy'];
  const grades=['Grade 9','Grade 10','Grade 11','Grade 12'];
  const userSeeds = first.map((f,i)=>({
    id:uid('usr_'), schoolId:school.id, firstName:f, lastName:last[i],
    username:(f+last[i]).toLowerCase(), gender:genders[i], grade:grades[i%4],
    age:15+(i%4), phone:'', coins:2, godMode:false, friendIds:[], onboarded:true, createdAt:nowISO(), photo:null
  }));
  // everyone friends with a few others
  userSeeds.forEach((u,i)=>{ u.friendIds=[userSeeds[(i+1)%userSeeds.length].id, userSeeds[(i+2)%userSeeds.length].id, userSeeds[(i+3)%userSeeds.length].id]; });
  const users = await Promise.all(userSeeds.map(u=>store.createUser(u))); // school already committed above, so this is FK-safe
  db.polls = POLL_LIB.map(([emoji,text,color])=>({ id:uid('pol_'), emoji, text, color, enabled:true, schoolId:null, createdAt:nowISO() }));
  db.votes = [];
  db.meta = { createdAt: nowISO() };
  // a couple of seed votes so inboxes aren't empty (targets: first two users)
  seedVote(users[2], users[0], db.polls[6]); // Best smile -> Ava
  seedVote(users[5], users[0], db.polls[0]); // Cooler -> Ava
  seedVote(users[1], users[3], db.polls[7]); // Famous -> Noah
  save();
}
function seedVote(voter, target, poll){
  db.votes.push({ id:uid('vote_'), voterId:voter.id, targetId:target.id, questionId:poll.id,
    emoji:poll.emoji, text:poll.text, color:poll.color, revealed:false, unread:true, ts:nowISO() });
}
const { Store } = require('./store');
const { verifySignedTransaction, DEV_TRUST } = require('./iap');
const GODMODE_PRODUCTS = (process.env.GODMODE_PRODUCT_IDS || 'aura.godmode.weekly,aura.godmode.lifetime').split(',');
let store;
async function load(){
  store = new Store(DATABASE_URL);
  await store.init();
  db = await store.loadInto(); // polls/votes/etc — empty shape if this is a fresh kv table
  if((await store.schoolsCount()) === 0) await seed(); // schools/users live outside kv, so isEmpty() alone can't signal "fresh boot"
}
let saveTimer=null;
// Serializes persist() calls: with more `await`s now sitting between a mutation and its save(),
// a slow in-flight persist() can still be running when the next debounced one fires — two
// concurrent wipe-and-reinsert transactions race and collide (duplicate key on kv_pkey). Chaining
// onto this promise means the next persist() always waits for the previous one to finish first.
let saveChain=Promise.resolve();
function save(){ clearTimeout(saveTimer); saveTimer=setTimeout(()=>{ saveChain = saveChain.then(saveNow, saveNow); }, 50); }
async function saveNow(){ try{ await store.persist(db); }catch(e){ console.error('save failed', e.message); } }
/** Cancel any pending debounce and wait for the save chain to fully drain — used on shutdown. */
async function flushSave(){ clearTimeout(saveTimer); saveChain = saveChain.then(saveNow, saveNow); await saveChain; }

/* ---------- helpers ---------- */
async function U(id){ return id ? await store.getUserById(id) : null; }
function publicUser(u){ if(!u) return null; const {phone, ...rest}=u; return rest; }
async function schoolMates(u){ return await store.getUsersBySchool(u.schoolId, u.id); }
function initial(u){ return (u.firstName||'?').charAt(0).toUpperCase(); }
function tokenFor(userId){ const t=uid('tok_'); db.sessions[t]={userId}; save(); return t; }
function adminToken(){ const t=uid('adm_'); db.sessions[t]={admin:true}; save(); return t; }
async function sessionUser(req){ const t=getToken(req); const s=t&&db.sessions[t]; const u=s&&s.userId?await U(s.userId):null; if(u) await enforceEntitlement(u); return u; }
// Auto-downgrade God Mode when an Apple subscription lapses (expiresDate in the past).
async function enforceEntitlement(u){ if(u.godMode && u.godModeExpires && Date.parse(u.godModeExpires) <= Date.now()){ u.godMode=false; await store.updateUser(u.id, {godMode:false}); } }
function isAdmin(req){ const t=getToken(req); const s=t&&db.sessions[t]; return !!(s&&s.admin); }
function getToken(req){ return (req.headers['x-token']) || (req._url.searchParams.get('token')) || ''; }

/** Batch-fetch a set of user ids once, then hand back a synchronous lookup — avoids N+1 queries
    and, for anything used inside .filter()/.map(), avoids the "async predicate is always truthy" bug. */
async function usersById(ids){
  const uniq = [...new Set(ids.filter(Boolean))];
  const list = await store.getUsersByIds(uniq);
  const map = new Map(list.map(u=>[u.id,u]));
  return id => map.get(id) || null;
}

/* ---------- flames view ---------- */
async function flamesFor(user){
  const revealedVoters = user.revealedVoters||[];
  const votes = db.votes.filter(v=>v.targetId===user.id).sort((a,b)=>b.ts.localeCompare(a.ts));
  const voterOf = await usersById(votes.map(v=>v.voterId));
  return votes.map(v=>{
    const voter=voterOf(v.voterId); const gm=user.godMode;
    const anonymous=!!(voter && voter.godMode);   // Anonymous Mode: God Mode voters can't be unmasked
    const hintShown=v.revealed||gm;               // first-initial hint (coin reveal or God Mode)
    const pickCount=db.votes.filter(x=>x.voterId===v.voterId && x.targetId===user.id).length;
    const nameShown=revealedVoters.includes(v.voterId) && voter; // full-name bonus reveal
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

/* ---------- build a poll round ---------- */
async function notify(user, text, emoji){
  if(!user) return;
  const notifications = [{ id:uid('ntf_'), text, emoji:emoji||'🔔', ts:nowISO(), read:false }, ...(user.notifications||[])].slice(0,30);
  user.notifications = notifications;
  await store.updateUser(user.id, {notifications});
}

function notBlocked(a,b){ return !((a.blocked||[]).includes(b.id)) && !((b.blocked||[]).includes(a.id)); }
async function buildRound(user){
  const mates=(await schoolMates(user)).filter(m=>notBlocked(user,m));
  const friends=mates.filter(m=>user.friendIds.includes(m.id));
  const pool=friends.length>=4?friends:mates; // prefer friends, else all schoolmates
  const enabled=db.polls.filter(p=>p.enabled && (p.schoolId===null||p.schoolId===user.schoolId));
  const qs=shuffle(enabled).slice(0,12);
  const roundId=uid('rnd_');
  // --- coin boosts: people who paid to appear in this user's polls ---
  db.boosts=db.boosts||[];
  const candidateBoosts=db.boosts.filter(b=>b.remaining>0 && b.byUserId!==user.id && (b.targetId===user.id || b.targetId===null));
  const boosterOf = await usersById(candidateBoosts.map(b=>b.byUserId));
  const applicable=candidateBoosts.filter(b=>{
    const bu=boosterOf(b.byUserId);
    return bu && notBlocked(user,bu) && (b.targetId===user.id || (b.targetId===null && bu.schoolId===user.schoolId));
  });
  let boostedInserts=0; const MAX_BOOST_PER_ROUND=4; const boosters=new Set();
  const polls=qs.map(q=>{
    let choices=shuffle(pool).slice(0,4).map(c=>({id:c.id,name:c.firstName+' '+c.lastName}));
    if(boostedInserts<MAX_BOOST_PER_ROUND){
      const b=applicable.find(x=>x.remaining>0);
      if(b){ const bu=boosterOf(b.byUserId);
        if(bu && !choices.some(c=>c.id===bu.id)){
          choices[Math.floor(Math.random()*4)]={ id:bu.id, name:bu.firstName+' '+bu.lastName, boosted:true };
          b.remaining--; boostedInserts++; boosters.add(bu.id);
        }
      }
    }
    return { questionId:q.id, emoji:q.emoji, text:q.text, color:q.color, choices };
  });
  if(boostedInserts>0 && user.godMode){ const n=boosters.size; await notify(user, n>1?`${n} people added themselves to your polls 👀`:'Someone added themselves to your polls 👀', '👑'); }
  db.rounds[roundId]={ userId:user.id, ts:nowISO(), answered:0, votedQ:[], claimed:false };
  // prune rounds older than 6h so db.rounds can't grow unbounded
  const cutoff = Date.now() - 6*3600*1000;
  for(const rid of Object.keys(db.rounds)){ if(Date.parse(db.rounds[rid].ts) < cutoff) delete db.rounds[rid]; }
  save();
  return { roundId, polls, canPlay: pool.length>=1, boostedInserts };
}
function shuffle(a){ a=a.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

/* ---------- HTTP ---------- */
const MIME={'.html':'text/html;charset=utf-8','.css':'text/css','.js':'text/javascript','.woff2':'font/woff2','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'};

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
function setCors(req,res){
  const origin = req.headers.origin;
  // auth uses the x-token header (not cookies), so a wildcard is safe; restrict via ALLOWED_ORIGINS in prod
  const allow = ALLOWED_ORIGINS.length ? (ALLOWED_ORIGINS.includes(origin)?origin:ALLOWED_ORIGINS[0]) : '*';
  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-token');
  res.setHeader('Vary', 'Origin');
}
const server=http.createServer(async (req,res)=>{
  const url=new URL(req.url, `http://localhost:${PORT}`);
  req._url=url;
  const p=url.pathname;
  try{
    if(p.startsWith('/api/')){
      setCors(req,res);
      if(req.method==='OPTIONS'){ res.writeHead(204); return res.end(); } // preflight
      return await handleApi(req,res,p); // awaited: DB errors inside must hit this catch, not become unhandled rejections
    }
    return serveStatic(req,res,p);
  }catch(e){ console.error(e); json(res,500,{error:e.message}); }
});

// Only these web assets are publicly served — never source (.js backend), the DB, or docs.
const PUBLIC_FILES = new Set(['/index.html','/styles.css','/app.js','/config.js','/admin.html','/admin.js','/favicon.ico','/privacy.html','/terms.html']);
function isPublicAsset(rel){ return PUBLIC_FILES.has(rel) || rel.startsWith('/fonts/'); }
function serveStatic(req,res,p){
  let rel = p==='/'?'/index.html':p;
  if(p==='/admin'||p==='/admin/') rel='/admin.html';
  if(p==='/privacy') rel='/privacy.html';
  if(p==='/terms') rel='/terms.html';
  if(!isPublicAsset(rel)) return notFound(res);
  const fp=path.join(ROOT, decodeURIComponent(rel));
  if(!fp.startsWith(ROOT)) return notFound(res);
  fs.readFile(fp,(err,data)=>{
    if(err) return notFound(res);
    res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'});
    res.end(data);
  });
}
function notFound(res){ res.writeHead(404); res.end('Not found'); }
function json(res,code,obj){ res.writeHead(code,{'Content-Type':'application/json'}); res.end(JSON.stringify(obj)); }
const MAX_BODY = 64 * 1024; // 64 KB request cap — reject oversized payloads
function readBody(req){ return new Promise(r=>{ let b=''; let over=false;
  req.on('data',c=>{ if(over) return; b+=c; if(b.length>MAX_BODY){ over=true; b=''; } });
  req.on('end',()=>{ if(over) return r({__tooLarge:true}); try{ r(b?JSON.parse(b):{});}catch(e){ r({}); } }); }); }
function clientIp(req){ return (req.headers['x-forwarded-for']||'').split(',')[0].trim() || req.socket.remoteAddress || 'unknown'; }

/* ---------- simple in-memory rate limiter (sliding window) ---------- */
const rlBuckets = new Map(); // key -> [timestamps]
function rateLimit(key, max, windowMs){
  const now = Date.now();
  const arr = (rlBuckets.get(key) || []).filter(t => now - t < windowMs);
  if(arr.length >= max){ rlBuckets.set(key, arr); return false; }
  arr.push(now); rlBuckets.set(key, arr); return true;
}
setInterval(()=>{ const now=Date.now(); for(const [k,v] of rlBuckets){ const f=v.filter(t=>now-t<3600000); if(f.length) rlBuckets.set(k,f); else rlBuckets.delete(k); } }, 600000).unref?.();
function str(v, max){ return typeof v==='string' ? v.slice(0, max) : ''; }

/* ---------- API ---------- */
async function handleApi(req,res,p){
  const m=req.method;
  const body = (m==='POST'||m==='PATCH'||m==='PUT'||m==='DELETE') ? await readBody(req) : {};
  if(body.__tooLarge) return json(res,413,{error:'Payload too large'});
  const ip = clientIp(req);
  const seg = p.split('/').filter(Boolean); // ['api', ...]

  // ---- health check (public, unauthenticated) ----
  if(p==='/api/health' && m==='GET'){
    return json(res,200,{ ok:true, service:'aura', ts:nowISO(), uptime:Math.round(process.uptime()), sms: SMS_ON?'live':'dev' });
  }

  // ---- public / user auth ----
  if(p==='/api/auth/request-code' && m==='POST'){
    const digits=normPhone(body.phone);
    if(digits.length<10 || digits.length>15) return json(res,400,{error:'Enter a valid 10-digit phone number'});
    // anti-SMS-bombing: cap per phone and per IP
    if(!rateLimit('code:'+digits, 5, 15*60*1000)) return json(res,429,{error:'Too many code requests. Try again later.'});
    if(!rateLimit('codeip:'+ip, 20, 60*60*1000)) return json(res,429,{error:'Too many requests from this network.'});
    const code=genCode();
    codes.set(digits,{ code, expires:Date.now()+10*60*1000, attempts:0 });
    await sendSMS(digits, `Your Aura verification code is ${code}`);
    return json(res,200,{ sent:true, sms:SMS_ON, devCode: SMS_ON?undefined:code });
  }
  if(p==='/api/auth/login' && m==='POST'){
    const digits=normPhone(body.phone);
    if(digits.length<10) return json(res,400,{error:'Invalid phone number'});
    const rec=codes.get(digits);
    if(!rec) return json(res,400,{error:'Request a code first'});
    if(Date.now()>rec.expires){ codes.delete(digits); return json(res,400,{error:'Code expired — tap Resend'}); }
    if(rec.attempts>=5){ codes.delete(digits); return json(res,429,{error:'Too many tries — tap Resend'}); }
    if(String(body.code||'')!==rec.code){ rec.attempts++; return json(res,401,{error:'Incorrect code'}); }
    codes.delete(digits); // one-time use
    let u = await store.getUserByPhone(digits);
    if(!u){
      u = await store.createUser({ id:uid('usr_'), schoolId:null, firstName:'', lastName:'', username:'', gender:'boy', grade:'', age:null, phone:body.phone, coins:2, godMode:false, friendIds:[], onboarded:false, createdAt:nowISO(), photo:null });
    }
    return json(res,200,{ token:tokenFor(u.id), user:publicUser(u) });
  }
  if(p==='/api/auth/demo' && m==='POST'){ // quick "log in as a seeded student" — DEV ONLY
    if(!ALLOW_DEMO) return json(res,403,{error:'Disabled'});
    const u = await store.getDemoUser();
    if(!u) return json(res,404,{error:'No users to demo login as'});
    return json(res,200,{ token:tokenFor(u.id), user:publicUser(u) });
  }
  if(p==='/api/schools' && m==='GET') return json(res,200,{schools: await store.getSchools()}); // public (for onboarding)

  // ---- admin ----
  if(p==='/api/admin/login' && m==='POST'){
    if(!rateLimit('admin:'+ip, 10, 15*60*1000)) return json(res,429,{error:'Too many attempts. Try again later.'});
    if((body.passcode||'')!==ADMIN_PASSCODE) return json(res,401,{error:'Wrong passcode'});
    return json(res,200,{ token:adminToken() });
  }
  if(p.startsWith('/api/admin/')){
    if(!isAdmin(req)) return json(res,401,{error:'Admin only'});
    return await handleAdmin(req,res,p,m,body);
  }

  // ---- everything below needs a user ----
  const me=await sessionUser(req);
  if(!me) return json(res,401,{error:'Not logged in'});

  if(p==='/api/me' && m==='GET') return json(res,200,{user:me}); // own record incl. phone
  if(p==='/api/me' && m==='PATCH'){
    const fields={};
    if('firstName' in body) fields.firstName = str(body.firstName, 40).trim();
    if('lastName'  in body) fields.lastName  = str(body.lastName, 40).trim();
    if('username'  in body) fields.username  = str(body.username, 30).replace(/[^a-zA-Z0-9_.]/g,'');
    if('gender'    in body && ['boy','girl','nonbinary'].includes(body.gender)) fields.gender = body.gender;
    if('grade'     in body) fields.grade = str(body.grade, 30);
    if('age'       in body){
      const a=parseInt(body.age,10);
      if(!(a>=MIN_AGE&&a<=99)) return json(res,400,{error:`You must be at least ${MIN_AGE} to use Aura.`});
      fields.age = a;
    }
    if('schoolId'  in body) fields.schoolId = str(body.schoolId, 60) || null;
    if('photo'     in body) fields.photo = body.photo==null?null:str(body.photo, 500000); // data-URI cap ~500KB
    if('onboarded' in body){
      const willBeOnboarded = !!body.onboarded;
      // Enforced here, not just on the age field itself: onboarded gets set in a separate call
      // from age in the real onboarding flow, so this is the actual chokepoint — a valid age must
      // already be on file (or set in this same request) before onboarding can complete.
      if(willBeOnboarded){
        const effectiveAge = ('age' in fields) ? fields.age : me.age;
        if(!(effectiveAge>=MIN_AGE)) return json(res,400,{error:`Set your age (${MIN_AGE}+) before finishing onboarding.`});
      }
      fields.onboarded = willBeOnboarded;
    }
    if('hideTopFlames' in body) fields.hideTopFlames = !!body.hideTopFlames;
    try{
      const updated = await store.updateUser(me.id, fields);
      return json(res,200,{user:publicUser(updated)});
    }catch(e){ if(isFKViolation(e)) return json(res,400,{error:'Unknown school'}); throw e; }
  }
  if(p==='/api/me' && m==='DELETE'){ // delete account / opt out entirely
    const id=me.id;
    await store.deleteUser(id); // strips id from other users' friendIds/blocked/revealedVoters, then removes the row
    db.votes=db.votes.filter(v=>v.voterId!==id && v.targetId!==id);
    db.boosts=(db.boosts||[]).filter(b=>b.byUserId!==id && b.targetId!==id);
    Object.keys(db.sessions).forEach(t=>{ if(db.sessions[t].userId===id) delete db.sessions[t]; });
    save(); return json(res,200,{ok:true,deleted:true});
  }
  // ---- safety: block / report ----
  if(p==='/api/block' && m==='POST'){
    const {userId}=body;
    const target = userId ? await U(userId) : null;
    if(target && userId!==me.id && !(me.blocked||[]).includes(userId)){
      const blocked=[...(me.blocked||[]), userId];
      const friendIds=(me.friendIds||[]).filter(id=>id!==userId);
      await store.updateUser(me.id, {blocked, friendIds});
      if((target.friendIds||[]).includes(me.id)){
        await store.updateUser(target.id, {friendIds:(target.friendIds||[]).filter(id=>id!==me.id)});
      }
      return json(res,200,{blocked});
    }
    return json(res,200,{blocked:me.blocked||[]});
  }
  if(p==='/api/block' && m==='DELETE'){
    const {userId}=body;
    const blocked=(me.blocked||[]).filter(id=>id!==userId);
    await store.updateUser(me.id, {blocked});
    return json(res,200,{blocked});
  }
  if(p==='/api/blocked' && m==='GET'){
    const blocked = await store.getUsersByIds(me.blocked||[]);
    return json(res,200,{blocked: blocked.map(publicUser)});
  }
  if(p==='/api/report' && m==='POST'){ const {userId,reason}=body; db.reports=db.reports||[];
    db.reports.push({ id:uid('rep_'), byUserId:me.id, targetId:userId||null, reason:(reason||'').slice(0,300), ts:nowISO(), status:'open' }); save();
    return json(res,200,{ok:true}); }
  if(p==='/api/suggestions' && m==='GET'){
    if(!me.schoolId) return json(res,200,{contacts:[],fof:[]});
    const mates=(await schoolMates(me)).filter(u=>!me.friendIds.includes(u.id) && notBlocked(me,u));
    const contacts=mates.slice(0,Math.ceil(mates.length/2)).map(publicUser);
    const fof=mates.slice(Math.ceil(mates.length/2)).map(u=>({...publicUser(u), mutual:Math.max(0,me.friendIds.filter(f=>u.friendIds.includes(f)).length)}));
    return json(res,200,{contacts,fof});
  }
  if(p==='/api/friends' && m==='GET'){
    const friends = await store.getUsersByIds(me.friendIds||[]);
    return json(res,200,{friends: friends.map(publicUser)});
  }
  if(p==='/api/friends' && m==='POST'){
    const {userId}=body;
    const other = userId ? await U(userId) : null;
    if(other && !(me.friendIds||[]).includes(userId)){
      const friendIds=[...(me.friendIds||[]), userId];
      await store.updateUser(me.id, {friendIds});
      if(!(other.friendIds||[]).includes(me.id)){
        await store.updateUser(other.id, {friendIds:[...(other.friendIds||[]), me.id]});
      }
      return json(res,200,{friends:friendIds});
    }
    return json(res,200,{friends:me.friendIds||[]});
  }
  if(p==='/api/friends' && m==='DELETE'){
    const {userId}=body;
    const friendIds=(me.friendIds||[]).filter(id=>id!==userId);
    await store.updateUser(me.id, {friendIds});
    const other = userId ? await U(userId) : null;
    if(other) await store.updateUser(other.id, {friendIds:(other.friendIds||[]).filter(id=>id!==me.id)});
    return json(res,200,{friends:friendIds});
  }

  // ---- coin boosts: add yourself to polls ----
  if(p==='/api/boost/random' && m==='POST'){
    const COST=100;
    const newCoins = await store.adjustCoins(me.id, -COST);
    if(newCoins===null) return json(res,402,{error:'You need 100 coins'});
    db.boosts=db.boosts||[]; db.boosts.push({ id:uid('bst_'), byUserId:me.id, targetId:null, remaining:3, ts:nowISO() });
    save(); return json(res,200,{coins:newCoins, message:"You'll appear in 3 random polls 🔥"});
  }
  if(p==='/api/boost/crush' && m==='POST'){
    const COST=300; const {targetId}=body;
    const t = targetId ? await U(targetId) : null;
    if(!t||t.id===me.id) return json(res,400,{error:'Pick a valid crush'});
    const newCoins = await store.adjustCoins(me.id, -COST);
    if(newCoins===null) return json(res,402,{error:'You need 300 coins'});
    db.boosts=db.boosts||[]; db.boosts.push({ id:uid('bst_'), byUserId:me.id, targetId:t.id, remaining:6, ts:nowISO() });
    save(); return json(res,200,{coins:newCoins, message:`You'll show up in ${t.firstName}'s polls 💘`});
  }

  // ---- notifications ----
  if(p==='/api/notifications' && m==='GET'){ return json(res,200,{ notifications: me.notifications||[] }); }
  if(p==='/api/notifications/read' && m==='POST'){
    const notifications=(me.notifications||[]).map(n=>({...n, read:true}));
    await store.updateUser(me.id, {notifications});
    return json(res,200,{ok:true});
  }

  if(p==='/api/polls/round' && m==='GET') return json(res,200, await buildRound(me));
  if(p==='/api/vote' && m==='POST'){
    const {questionId,targetId,roundId}=body;
    const q=db.polls.find(x=>x.id===questionId && x.enabled);
    const target = targetId ? await U(targetId) : null;
    if(!q||!target) return json(res,400,{error:'bad vote'});
    if(target.id===me.id) return json(res,400,{error:'cannot vote for yourself'});
    // integrity: target must be an eligible schoolmate (or someone boosted into your polls) and not blocked
    const eligible = target.schoolId===me.schoolId || (db.boosts||[]).some(b=>b.remaining>=0 && b.byUserId===target.id && (b.targetId===me.id||b.targetId===null));
    if(!eligible || !notBlocked(me,target)) return json(res,400,{error:'not eligible'});
    const round = roundId && db.rounds[roundId];
    if(round){
      if(round.userId!==me.id) return json(res,403,{error:'not your round'});
      round.votedQ = round.votedQ || [];
      if(round.votedQ.includes(questionId)) return json(res,200,{ok:true, dup:true}); // one answer per question
      if(round.votedQ.length>=12) return json(res,429,{error:'round full'});
      round.votedQ.push(questionId); round.answered=round.votedQ.length;
    }
    db.votes.push({ id:uid('vote_'), voterId:me.id, targetId, questionId, emoji:q.emoji, text:q.text, color:q.color, revealed:false, unread:true, ts:nowISO() });
    save(); return json(res,200,{ok:true});
  }
  if(p==='/api/round/complete' && m==='POST'){
    const round = body.roundId && db.rounds[body.roundId];
    if(!round || round.userId!==me.id) return json(res,400,{error:'no active round'});
    if(round.claimed) return json(res,200,{coins:me.coins, earned:0, already:true}); // no double-claim
    if((round.answered||0) < 1) return json(res,400,{error:'answer at least one poll first'});
    round.claimed = true; save();
    const earned = me.godMode?4:2;
    const newCoins = await store.adjustCoins(me.id, earned);
    return json(res,200,{coins:newCoins, earned});
  }

  if(p==='/api/flames' && m==='GET'){
    const list = await flamesFor(me);
    return json(res,200,{flames:list, coins:me.coins, godMode:me.godMode, bonusRevealsLeft: me.godMode?(2-(me.bonusRevealsUsed||0)):0});
  }
  if(p==='/api/flames/read' && m==='POST'){ db.votes.forEach(v=>{ if(v.targetId===me.id) v.unread=false; }); save(); return json(res,200,{ok:true}); }
  if(seg[1]==='flames' && seg[3]==='reveal' && m==='POST'){
    const v=db.votes.find(x=>x.id===seg[2] && x.targetId===me.id);
    if(!v) return json(res,404,{error:'no flame'});
    const rv = await U(v.voterId);
    if(rv&&rv.godMode) return json(res,400,{error:'This admirer is anonymous 🔒'});
    if(me.godMode){ v.revealed=true; save(); return json(res,200,{ok:true,coins:me.coins}); }
    const newCoins = await store.adjustCoins(me.id, -1);
    if(newCoins===null) return json(res,402,{error:'no coins'});
    v.revealed=true; save();
    return json(res,200,{ok:true,coins:newCoins});
  }
  if(seg[1]==='flames' && seg[3]==='reveal-name' && m==='POST'){
    const v=db.votes.find(x=>x.id===seg[2] && x.targetId===me.id);
    if(!v) return json(res,404,{error:'no flame'});
    if(!me.godMode) return json(res,402,{error:'God Mode required'});
    const voter = await U(v.voterId);
    if(!voter) return json(res,404,{error:'voter gone'});
    if(voter.godMode) return json(res,400,{error:'This admirer is anonymous 🔒'});
    const pickCount=db.votes.filter(x=>x.voterId===v.voterId && x.targetId===me.id).length;
    if(pickCount<2) return json(res,400,{error:'Only works for someone who picked you twice'});
    let bonusRevealsUsed = me.bonusRevealsUsed||0;
    const revealedVoters = me.revealedVoters||[];
    if(!revealedVoters.includes(v.voterId)){
      if(bonusRevealsUsed>=2) return json(res,402,{error:'No bonus reveals left'});
      bonusRevealsUsed += 1;
      await store.updateUser(me.id, {revealedVoters:[...revealedVoters, v.voterId], bonusRevealsUsed});
    }
    return json(res,200,{ name:voter.firstName+' '+voter.lastName, bonusRevealsLeft:2-bonusRevealsUsed });
  }

  if(p==='/api/shop/boost' && m==='POST'){
    const cost=body.cost|0;
    const newCoins = await store.adjustCoins(me.id, -cost);
    if(newCoins===null) return json(res,402,{error:'not enough coins'});
    return json(res,200,{coins:newCoins});
  }
  // Legacy/dev instant unlock — kept for the web demo. Real iOS uses /api/iap/validate.
  if(p==='/api/godmode' && m==='POST'){
    await store.updateUser(me.id, {godMode:true, godModeExpires:null});
    return json(res,200,{godMode:true});
  }
  // Real Apple In-App Purchase: verify the StoreKit2 signed transaction, then grant God Mode.
  if(p==='/api/iap/validate' && m==='POST'){
    const jws = body.signedTransaction;
    let tx; try{ tx = verifySignedTransaction(jws); }
    catch(e){ return json(res,400,{error:'Invalid receipt: '+e.message}); }
    if(!GODMODE_PRODUCTS.includes(tx.productId)) return json(res,400,{error:'Unknown product '+tx.productId});
    // replay protection: each StoreKit transactionId is single-use (renewals get new ids)
    const iapTransactions = me.iapTransactions || [];
    const txId = String(tx.transactionId);
    const already = iapTransactions.includes(txId);
    const newIapTransactions = already ? iapTransactions : [...iapTransactions, txId];
    // subscription expiry (StoreKit dates are epoch ms); lifetime products have no expiresDate
    const expMs = tx.expiresDate ? Number(tx.expiresDate) : null;
    if(expMs && expMs <= Date.now()){
      await store.updateUser(me.id, {iapTransactions:newIapTransactions});
      return json(res,200,{ godMode:false, expired:true, expires:new Date(expMs).toISOString() });
    }
    const godModeExpires = expMs ? new Date(expMs).toISOString() : null;
    await store.updateUser(me.id, {iapTransactions:newIapTransactions, godModeExpires, godMode:true});
    return json(res,200,{ godMode:true, expires:godModeExpires, environment:tx.environment||null, renewed:!already && newIapTransactions.length>1 });
  }

  return json(res,404,{error:'unknown endpoint '+p});
}

/* ---------- Admin API ---------- */
async function handleAdmin(req,res,p,m,body){
  const seg=p.split('/').filter(Boolean); // ['api','admin', coll, id?, action?]
  const coll=seg[2], id=seg[3];

  if(p==='/api/admin/stats' && m==='GET'){
    const [schools, users, godMode] = await Promise.all([store.schoolsCount(), store.countUsers(), store.countGodModeUsers()]);
    return json(res,200,{ schools, users, polls:db.polls.length, votes:db.votes.length, godMode, reports:(db.reports||[]).filter(r=>r.status==='open').length });
  }
  if(p==='/api/admin/reports' && m==='GET'){
    const reports=(db.reports||[]).slice().reverse();
    const userOf = await usersById(reports.flatMap(r=>[r.byUserId, r.targetId]));
    const rows=reports.map(r=>{ const b=userOf(r.byUserId), t=userOf(r.targetId);
      return {...r, byName:b?`${b.firstName} ${b.lastName}`:'—', targetName:t?`${t.firstName} ${t.lastName}`:'(deleted)'} });
    return json(res,200,{reports:rows});
  }
  if(coll==='reports' && seg[4]==='resolve' && m==='POST'){ const r=(db.reports||[]).find(x=>x.id===id); if(r){ r.status='resolved'; save(); } return json(res,200,{ok:true}); }

  // Schools
  if(coll==='schools'){
    if(m==='GET') return json(res,200,{schools: await store.getSchoolsWithUserCounts()});
    if(m==='POST'){ const school = await store.createSchool({id:uid('sch_'), name:body.name||'New School', city:body.city||''}); return json(res,200,{school}); }
    if(m==='PATCH'){ const school = await store.updateSchool(id, {name:body.name, city:body.city}); if(!school) return json(res,404,{error:'nf'}); return json(res,200,{school}); }
    if(m==='DELETE'){ await store.deleteSchool(id); return json(res,200,{ok:true}); } // ON DELETE SET NULL handles the user cascade
  }
  // Users
  if(coll==='users'){
    if(id && seg[4]==='token' && m==='POST'){ const u=await U(id); if(!u)return json(res,404,{error:'nf'}); return json(res,200,{token:tokenFor(u.id)}); }
    if(m==='GET'){
      const sid=req._url.searchParams.get('schoolId');
      const list = await store.getAllUsers(sid || undefined);
      return json(res,200,{users:list.map(u=>({...publicUser(u), phone:u.phone, flames:db.votes.filter(v=>v.targetId===u.id).length}))});
    }
    if(m==='POST' && !id){
      const age = 'age' in body ? parseInt(body.age,10) : 15;
      if(!(age>=MIN_AGE&&age<=99)) return json(res,400,{error:`Users must be at least ${MIN_AGE}.`});
      const u={ id:uid('usr_'), schoolId:body.schoolId||null, firstName:body.firstName||'', lastName:body.lastName||'', username:(body.username||((body.firstName||'')+(body.lastName||''))).toLowerCase(), gender:body.gender||'boy', grade:body.grade||'Grade 9', age, phone:body.phone||'', coins:2, godMode:!!body.godMode, friendIds:[], onboarded:true, createdAt:nowISO(), photo:null };
      try{ const created = await store.createUser(u); return json(res,200,{user:publicUser(created)}); }
      catch(e){ if(isFKViolation(e)) return json(res,400,{error:'Unknown school'}); throw e; }
    }
    if(m==='PATCH'){
      const fields={}; ['schoolId','firstName','lastName','username','gender','grade','age','coins','godMode','godModeExpires','onboarded'].forEach(k=>{if(k in body)fields[k]=body[k];});
      if('age' in fields){
        const a=parseInt(fields.age,10);
        if(!(a>=MIN_AGE&&a<=99)) return json(res,400,{error:`Users must be at least ${MIN_AGE}.`});
        fields.age = a;
      }
      try{ const u = await store.updateUser(id, fields); if(!u)return json(res,404,{error:'nf'}); return json(res,200,{user:publicUser(u)}); }
      catch(e){ if(isFKViolation(e)) return json(res,400,{error:'Unknown school'}); throw e; }
    }
    if(m==='DELETE'){
      await store.deleteUser(id); // strips id from other users' friendIds/blocked/revealedVoters, then removes the row
      db.votes=db.votes.filter(v=>v.voterId!==id&&v.targetId!==id);
      db.boosts=(db.boosts||[]).filter(b=>b.byUserId!==id && b.targetId!==id);
      Object.keys(db.sessions).forEach(t=>{ if(db.sessions[t].userId===id) delete db.sessions[t]; });
      save();
      return json(res,200,{ok:true});
    }
  }
  // Polls
  if(coll==='polls'){
    if(m==='GET') return json(res,200,{polls:db.polls, lib:POLL_LIB});
    if(m==='POST'){ const q={id:uid('pol_'),emoji:body.emoji||'🔥',text:body.text||'New poll',color:body.color||'#A31CEE',enabled:body.enabled!==false,schoolId:body.schoolId||null,createdAt:nowISO()}; db.polls.push(q); save(); return json(res,200,{poll:q}); }
    if(m==='PATCH'){ const q=db.polls.find(x=>x.id===id); if(!q)return json(res,404,{error:'nf'}); ['emoji','text','color','enabled','schoolId'].forEach(k=>{if(k in body)q[k]=body[k];}); save(); return json(res,200,{poll:q}); }
    if(m==='DELETE'){ db.polls=db.polls.filter(x=>x.id!==id); save(); return json(res,200,{ok:true}); }
  }
  // Votes / flames moderation
  if(coll==='votes'){
    if(m==='GET'){
      const votes = db.votes.slice().reverse().slice(0,300);
      const userOf = await usersById(votes.flatMap(v=>[v.voterId,v.targetId]));
      const nameOf = id => { const u=userOf(id); return u?`${u.firstName} ${u.lastName}`:'(deleted)'; };
      return json(res,200,{votes:votes.map(v=>({...v, voter:nameOf(v.voterId), target:nameOf(v.targetId)}))});
    }
    if(m==='DELETE'){ db.votes=db.votes.filter(x=>x.id!==id); save(); return json(res,200,{ok:true}); }
  }
  return json(res,404,{error:'unknown admin endpoint'});
}

/* ---------- boot ---------- */
// port=0 lets the OS pick a free port — used by the test suite to run many servers in parallel.
function start(port = PORT){
  return load().then(()=>new Promise((resolve,reject)=>{
    server.once('error', reject);
    server.listen(port, ()=>{
      const boundPort = server.address().port;
      console.log(`Aura server on http://localhost:${boundPort}  (admin: /admin, passcode "${ADMIN_PASSCODE}")`);
      console.log(`🗄️  DB: Neon Postgres`);
      console.log(SMS_ON ? `📲 SMS: LIVE via Twilio (from ${TWILIO.from})` : `📱 SMS: dev mode (codes printed here + shown on screen). Set TWILIO_ACCOUNT_SID / TWILIO_SID / TWILIO_TOKEN / TWILIO_FROM for real texts.`);
      console.log(`🔐 IAP: ${DEV_TRUST ? 'dev trust (set APPLE_ROOT_CA for production receipt validation)' : 'production (Apple root trusted)'}`);
      if(!IS_PROD && ADMIN_PASSCODE==='aura-admin') console.log(`⚠️  Admin passcode is the default "aura-admin" — set ADMIN_PASSCODE before exposing this server.`);
      resolve(server);
    });
  }));
}
async function stop(){
  await new Promise(resolve=>server.close(resolve));
  if(store){ await flushSave(); await store.close(); } // wait for the save chain to fully drain before closing the pool
}

// flush any pending debounced save on shutdown so nothing is lost
let _shuttingDown=false;
async function gracefulExit(){ if(_shuttingDown) return; _shuttingDown=true; try{ if(store) await flushSave(); }catch(e){} process.exit(0); }

if(require.main === module){
  start().catch(e=>{ console.error('🛑 Failed to start (could not connect/init Neon):', e.message); process.exit(1); });
  process.on('SIGINT', gracefulExit);
  process.on('SIGTERM', gracefulExit);
}

module.exports = { server, start, stop };
