/* ============================================================
   The Hanna House — scroll rig
   Native scroll drives a virtual camera; the model smooths it.
   No libraries. See WORKLOG.md D-3/D-4 for why.
   ============================================================ */
(function(){
'use strict';

const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
/* ?shot=<chapter>:<p01> — deterministic pose for screenshot tooling:
   jump scroll there, snap the camera, skip every transition. */
const SHOT = (()=>{ const m=/[?&]shot=([\w-]+):([\d.]+)/.exec(location.search);
  return m ? {ch:m[1], p:+m[2]} : null; })();
const SNAP = RM || !!SHOT;
const modelFrame = document.getElementById('model');
const post = m => { try{ modelFrame.contentWindow.postMessage(m,'*'); }catch(e){} };

/* ---------- model handshake ---------- */
let TOUR = null;            // {total, marks:[{i,at,settled,...}]}
let BOTTLES = {niche:259, max:399};
let FINS = ['Walnut','Natural oak','Espresso','Knotty alder'];
let modelReady = false;

/* ---------- veil ---------- */
const veil = document.getElementById('veil');
const veilFill = document.querySelector('.veil-fill');
setTimeout(()=>{ veilFill.style.height='72%'; }, 120);
const veilDone = ()=>{
  if(veil.classList.contains('gone') || veil.dataset.lifting) return;
  veil.dataset.lifting = '1';
  veilFill.style.height='100%';
  document.body.classList.add('model-up');
  setTimeout(()=>veil.classList.add('gone'), 420);
};
setTimeout(()=>{ if(!modelReady) veilDone(); }, 12000);   // never trap the page

addEventListener('message', ev => {
  const d = ev.data; if(!d || typeof d !== 'object') return;
  if(d.t === 'ready'){
    TOUR = d.tour; BOTTLES = d.bottles; FINS = d.fins;
    modelReady = true;
    buildSegments();
    syncModel();
    requestAnimationFrame(()=>requestAnimationFrame(veilDone));
  }
  if(d.t === 'walk' && !d.on) exitExplore();
});

/* ---------- state the page owns ---------- */
let finIx = 0, nicheOn = true, doorsOpen = false, showingExisting = false;

function dip(fn){                     // soft blink around a hard change
  if(SNAP){ fn(); return; }
  const el = document.getElementById('dip');
  el.classList.add('on');
  setTimeout(()=>{ fn(); setTimeout(()=>el.classList.remove('on'), 50); }, RM?0:160);
}
function setState(existing){
  showingExisting = existing;
  post({t:'state', v: existing ? 'existing' : 'proposed'});
}
/* wantState survives the load race: messages sent before the model's listener
   exists are dropped, so anything requested pre-ready is replayed on ready */
function wantState(existing){
  if(!modelReady){ showingExisting = existing; return; }
  if(existing !== showingExisting) dip(()=>setState(existing));
}
function portraitFov(){ return innerHeight > innerWidth ? 88 : 72; }
function syncModel(){                 // called on ready — replay page-owned state
  post({t:'fov', v:portraitFov()});
  post({t:'state', v: showingExisting ? 'existing' : 'proposed'});
  if(finIx) post({t:'fin', i:finIx});
  if(!nicheOn) post({t:'niche', on:false});
  lastProg = -1; lastWarm = -1;
}
addEventListener('resize', ()=>{ if(modelReady) post({t:'fov', v:portraitFov()}); });

/* ---------- chapters ---------- */
/* cam types:
   pose  — fixed pose (optionally a function of p and time, for drift)
   tour  — progress along the model's tour path between two time marks
   hold  — leave the camera where it is                                     */
const CH = [
  /* hero/before cameras sit a touch east with tighter fov so the hallway's red
     accent wall stays out of frame at wide aspects (review finding) */
  { id:'hero',
    cam:(p,t)=>({t:'pose', x:87.5+Math.sin(t*.00037)*1.6, z:142-6*p, eye:62,
                 yaw:Math.sin(t*.00023)*.015, pitch:-.084, fov:61, door:0}),
    warm:[.35,.35] },
  { id:'before',
    enter(){ wantState(true); },
    exit(){ wantState(false); },
    cam:(p)=>({t:'pose', x:72.5, z:134-6*p, eye:61, yaw:0, pitch:-.105, fov:58, door:0}),
    /* portrait: pull back and pitch down so the counter sits in the lower half
       and the copy owns clean wall — the shared pose kept striking the copy
       with the rail line at 390 (failed twice in review) */
    camPortrait:(p)=>({t:'pose', x:72.5, z:155-6*p, eye:62, yaw:0, pitch:-.02, fov:74, door:0}),
    warm:[.2,.2] },
  /* walk ends exactly on arrival; reveal owns the settle-hold, the slide, and
     the open-door hold — its pin gets a calm beat before the door moves */
  { id:'walk',  tour:['start','wp3'], warm:[.2,.85] },
  /* wp3s not wp3: the settle-hold is the same pose, so starting at settled
     removes ~560px of dead scroll before the door moves (UX drive-through) */
  { id:'reveal',tour:['wp3s','wp4s'],  warm:[.85,1],
    /* portrait can't see the opening from the tour's frontal pose — its narrow
       horizontal field holds only the door. Dolly on the bay instead and drive
       the door directly: settle beat, slide, open hold. */
    camPortrait:(p)=>{
      const u = Math.min(1, Math.max(0, (p-.18)/.64));
      const door = 84*(u*u*(3-2*u));
      return {t:'pose', x:54, z:66-4*p, eye:60, yaw:.08, pitch:.02, fov:88, door};
    } },
  { id:'inside',tour:['wp4s','wp5s'], warm:[1,1] },
  /* coffee ends composed on the bay (wp6 three-quarter view). The materials
     chapter is gone — the piece ships in the chosen walnut (Jake). */
  { id:'coffee',tour:['wp5s','wp6'],  warm:[1,.75] },
  { id:'house', tour:['wp6','wp11s'], warm:[.75,0] },   // include the finale hold — settled last frame
  /* no door in this pose — the Doors chip owns the door here, and a pose-owned
     door silently overrode the chip every frame (Jake: "Doors does nothing") */
  { id:'explore',
    cam:()=>({t:'pose', x:-40, z:30, eye:62, yaw:-1.08, pitch:-.02, fov:68}),
    warm:[.3,.3] },
];
const secOf = {}; CH.forEach(c => secOf[c.id] = document.getElementById('ch-'+c.id));

function markTime(name){
  if(name === 'start') return 0;
  const m = /wp(\d+)(s?)/.exec(name);
  const w = TOUR.marks[+m[1]];
  return m[2] ? w.settled : w.at;
}
function buildSegments(){
  CH.forEach(c => { if(c.tour) c.seg = [markTime(c.tour[0])/TOUR.total,
                                        markTime(c.tour[1])/TOUR.total]; });
}

/* ---------- geometry + element caches (never query the DOM per frame) ---------- */
let tops = [], heights = [];
const copiesOf = {};                       // chapter id → [{el, at, on}]
CH.forEach(c => {
  copiesOf[c.id] = [...secOf[c.id].querySelectorAll('.copy')]
    .map(el => ({el, at: el.dataset.at !== undefined ? +el.dataset.at : null, on: false}));
});
function measure(){
  tops = CH.map(c => secOf[c.id].offsetTop);
  heights = CH.map(c => secOf[c.id].offsetHeight);
}
addEventListener('resize', measure);

/* ---------- scroll driver ---------- */
let lastProg = -1, lastWarm = -1, lastPose = '', activeIx = -1, exploring = false;
let insideT0 = 0, movedCls = false;
const counterEl = document.getElementById('bottle-count');

/* ---------- chapter progress rail ---------- */
const RAIL_NAMES = {hero:'The Wall', before:'Before', walk:'The Walk',
  reveal:'The Reveal', inside:'Inside', coffee:'Coffee',
  house:'The House', explore:'Explore', details:'Details'};
const railEl = document.getElementById('rail');
const railIds = CH.map(c=>c.id).concat('details');
railIds.forEach(id => {
  const b = document.createElement('button');
  b.className = 'rail-dot';
  b.setAttribute('aria-label', RAIL_NAMES[id]);
  b.innerHTML = '<span class="rail-label">'+RAIL_NAMES[id]+'</span>';
  b.addEventListener('click', ()=>{
    const el = document.getElementById('ch-'+id);
    scrollTo({top: el.offsetTop + (id==='details'?0:2), behavior: RM?'auto':'smooth'});
  });
  railEl.appendChild(b);
});
const railDots = [...railEl.children];
let railIx = -1;
function railSync(ix, y, vh){
  const det = document.getElementById('ch-details');
  const i = SHOT ? (SHOT.ch==='details' ? railDots.length-1 : ix)
                 : (y >= det.offsetTop - vh*0.5 ? railDots.length-1 : ix);
  if(i === railIx) return;
  railIx = i;
  railDots.forEach((d,k)=>d.classList.toggle('on', k===i));
}

function sendPose(pose){               // skip identical repeats (static poses)
  const s = JSON.stringify(pose);
  if(s === lastPose) return;
  lastPose = s;
  post(Object.assign(pose, SNAP?{jump:true}:null));
  lastProg = -1;
}
function drive(t){
  requestAnimationFrame(drive);
  if(document.body.classList.contains('on-still')) return;
  const y = scrollY, vh = innerHeight;
  const mv = y > vh*0.25;                 // fade the scroll cue once moving
  if(mv !== movedCls){ movedCls = mv; document.body.classList.toggle('moved', mv); }

  let ix = 0, p;
  if(SHOT){
    ix = Math.max(0, CH.findIndex(c=>c.id===SHOT.ch));
    p = Math.min(1, Math.max(0, SHOT.p));
  }else{
    for(let i=0;i<CH.length;i++){ if(y >= tops[i]-vh*0.5) ix = i; }
    const span = Math.max(1, heights[ix]-vh);
    p = Math.min(1, Math.max(0, (y-tops[ix])/span));
  }
  const c = CH[ix];

  if(ix !== activeIx){
    const prev = CH[activeIx];
    if(prev && prev.exit) prev.exit();
    activeIx = ix;
    if(c.enter) c.enter();
  }
  railSync(ix, y, vh);

  const portrait = innerHeight > innerWidth;
  if(!exploring && modelReady){
    if(portrait && c.camPortrait){
      sendPose(c.camPortrait(p,t));
    }else if(c.tour){
      const v = c.seg[0] + (c.seg[1]-c.seg[0])*p;
      if(Math.abs(v-lastProg) > 0.0004){ post({t:'progress', v, jump:SNAP}); lastProg = v; }
    }else if(c.cam){
      const pose = c.cam(p,t);
      if(portrait && pose.fov) pose.fov = Math.min(92, pose.fov+20);
      sendPose(pose);
    }
    if(c.warm){
      const w = c.warm[0]+(c.warm[1]-c.warm[0])*p;
      if(Math.abs(w-lastWarm) > .02){ post({t:'warm', v:w}); lastWarm = w; }
    }
  }

  // copy visibility — write to the DOM only on state change
  CH.forEach((o,i)=>{
    copiesOf[o.id].forEach(cc => {
      const on = i===ix && (cc.at !== null ? Math.abs(p-cc.at) < .27 && p < .97 : p < .93);
      if(on !== cc.on){ cc.on = on; cc.el.classList.toggle('in', on); }
    });
  });

  // bottle counter — completes by mid-chapter OR ~1.1s after entry, whichever
  // comes first, so pausing at the chapter's edge never shows "0 bottles"
  if(c.id === 'inside'){
    const n = nicheOn ? BOTTLES.niche : BOTTLES.max;
    if(!insideT0) insideT0 = t;
    const e = SHOT ? Math.min(1, p*2.2)
                   : Math.min(1, Math.max(p*2.2, (t-insideT0)/1100));
    const k = 1-Math.pow(1-e,3);
    counterEl.textContent = Math.round(n*k);
  } else insideT0 = 0;
}

/* ---------- explore / walk ---------- */
const chipWalk = document.getElementById('chip-walk');
function enterExplore(){
  exploring = true;
  document.body.classList.add('exploring');
  chipWalk.textContent = 'Walking — Esc to end';
  chipWalk.classList.add('on');
  post({t:'walk', on:true});
  modelFrame.focus();
}
function exitExplore(){
  if(!exploring) return;
  exploring = false;
  document.body.classList.remove('exploring');
  chipWalk.textContent = 'Walk through';
  chipWalk.classList.remove('on');
  lastProg = -1;                       // re-send camera on next frame
}
chipWalk.addEventListener('click', ()=> exploring ? (post({t:'walk',on:false})) : enterExplore());
/* forward movement keys to the model — walking works regardless of which
   document owns keyboard focus (Jake: "you can't move anything") */
const KEYS = ['w','a','s','d','W','A','S','D','ArrowUp','ArrowDown','ArrowLeft',
              'ArrowRight',' ','Shift','Escape'];
function forwardKey(e){
  if(!exploring || !KEYS.includes(e.key)) return;
  post({t:'key', k:e.key, down:e.type==='keydown'});
  if(e.key !== 'Escape') e.preventDefault();
}
addEventListener('keydown', forwardKey);
addEventListener('keyup', forwardKey);
/* touch drive chips (visible while exploring on coarse pointers) */
[['drive-fwd',1],['drive-back',-1]].forEach(([id,v])=>{
  const b = document.getElementById(id);
  const go = e=>{ e.preventDefault(); post({t:'drive', v}); };
  const stop = ()=>post({t:'drive', v:0});
  b.addEventListener('pointerdown', go);
  b.addEventListener('pointerup', stop);
  b.addEventListener('pointerleave', stop);
  b.addEventListener('pointercancel', stop);
});
document.getElementById('chip-doors').addEventListener('click', function(){
  doorsOpen = !doorsOpen; this.classList.toggle('on', doorsOpen);
  post({t:'door', v: doorsOpen?1:0});
});
document.getElementById('chip-state').addEventListener('click', function(){
  dip(()=>setState(!showingExisting));
  this.classList.toggle('on', !showingExisting);
});

/* ---------- hold-to-compare: press and hold the scene to see the house today ----------
   The stage iframe is pointer-events:none during the scroll, so presses land on
   the section elements above it. A held press (not on a control) soft-blinks to
   the EXISTING house at the same camera; release returns to the remodel. */
(function(){
  const chip = document.getElementById('compare-chip');
  const dipEl = document.getElementById('dip');
  let timer = null, held = false;
  const soft = fn => {
    dipEl.classList.add('on');
    setTimeout(()=>{ fn(); dipEl.classList.remove('on'); }, RM?0:140);
  };
  const isControl = t => t.closest('button, a, .ba, .tabs, input, [role="slider"], .copy');
  let x0 = 0, y0 = 0;
  document.getElementById('page-wine-wall').addEventListener('pointerdown', e=>{
    if(exploring || e.button !== 0 || isControl(e.target)) return;
    if(CH[activeIx] && CH[activeIx].id === 'before') return;   // already the past
    x0 = e.clientX; y0 = e.clientY;
    timer = setTimeout(()=>{
      held = true;
      soft(()=>setState(true));
      chip.classList.add('on');
    }, 340);
  });
  addEventListener('pointermove', e=>{      // a drag is a scroll, not a hold
    if(timer && !held && Math.hypot(e.clientX-x0, e.clientY-y0) > 9){
      clearTimeout(timer); timer = null;
    }
  });
  const release = ()=>{
    clearTimeout(timer); timer = null;
    if(!held) return;
    held = false;
    soft(()=>setState(false));
    chip.classList.remove('on');
  };
  addEventListener('pointerup', release);
  addEventListener('pointercancel', release);
})();

/* ---------- inside-chapter layout chips ---------- */
function syncLayoutChips(){
  document.querySelectorAll('#layout-chips .chip').forEach(ch =>
    ch.classList.toggle('on', (ch.dataset.niche==='1') === nicheOn));
}
document.querySelectorAll('#layout-chips .chip').forEach(ch =>
  ch.addEventListener('click', ()=>{
    nicheOn = ch.dataset.niche==='1';
    post({t:'niche', on:nicheOn});
    syncLayoutChips();
  }));

/* ---------- tabs / pages ---------- */
const pages = ['wine-wall','kitchen','bathroom','review'];
const tabs = [...document.querySelectorAll('.tab')];
const glider = document.querySelector('.tab-glider');
const savedScroll = {};
let page = 'wine-wall';
function placeGlider(){
  const b = tabs.find(t=>t.classList.contains('on'));
  glider.style.width = b.offsetWidth+'px';
  glider.style.left = b.offsetLeft+'px';
}
function setPage(name){
  if(!pages.includes(name) || name===page) return;
  savedScroll[page] = scrollY;
  page = name;
  pages.forEach(pg => document.getElementById('page-'+pg).hidden = pg!==name);
  tabs.forEach(tb => {
    const on = tb.dataset.page===name;
    tb.classList.toggle('on', on); tb.setAttribute('aria-selected', on);
  });
  document.body.classList.toggle('on-still', name!=='wine-wall');
  /* Review / Kitchen / Bathroom never show the model — drop the veil at once
     instead of holding the page hostage to a load he has no use for. */
  if(name!=='wine-wall') veilDone();
  history.replaceState(null,'','#'+name);
  scrollTo(0, savedScroll[name]||0);
  if(name==='wine-wall'){ measure(); lastProg=-1; }
  placeGlider();
}
tabs.forEach(tb => tb.addEventListener('click', ()=>setPage(tb.dataset.page)));
/* roving arrow-key navigation on the segmented control */
document.querySelector('.tabs').addEventListener('keydown', e=>{
  const i = tabs.findIndex(t=>t===document.activeElement);
  if(i<0) return;
  let j = null;
  if(e.key==='ArrowRight') j = (i+1)%tabs.length;
  if(e.key==='ArrowLeft')  j = (i+tabs.length-1)%tabs.length;
  if(e.key==='Home') j = 0;
  if(e.key==='End')  j = tabs.length-1;
  if(j===null) return;
  e.preventDefault(); tabs[j].focus(); setPage(tabs[j].dataset.page);
});

/* ---------- before / after slider ---------- */
(function(){
  const ba = document.getElementById('ba');
  if(!ba) return;
  let v = 50;
  const apply = ()=>{ ba.style.setProperty('--ba', v+'%');
    ba.setAttribute('aria-valuenow', Math.round(v)); };
  const fromX = x=>{
    const r = ba.getBoundingClientRect();
    v = Math.min(100, Math.max(0, (x-r.left)/r.width*100)); apply();
  };
  let dragging = false;
  ba.addEventListener('pointerdown', e=>{ dragging=true; ba.setPointerCapture(e.pointerId); fromX(e.clientX); });
  ba.addEventListener('pointermove', e=>{ if(dragging) fromX(e.clientX); });
  addEventListener('pointerup', ()=>dragging=false);
  ba.addEventListener('keydown', e=>{
    if(e.key==='ArrowLeft'){ v=Math.max(0,v-4); apply(); e.preventDefault(); }
    if(e.key==='ArrowRight'){ v=Math.min(100,v+4); apply(); e.preventDefault(); }
  });
  apply();
})();
document.getElementById('to-kitchen').addEventListener('click', ()=>setPage('kitchen'));
document.querySelector('.wordmark').addEventListener('click', e=>{
  e.preventDefault();
  if(page!=='wine-wall') setPage('wine-wall'); else scrollTo({top:0, behavior:RM?'auto':'smooth'});
});
if(location.hash){ const h=location.hash.slice(1); if(pages.includes(h)&&h!=='wine-wall') setPage(h); }

/* ---------- review page ----------
   Two areas (kitchen / wine closet), four views each. Every view can carry
   1..3 VERSIONS of the same frame — 'today' (his photo), 'render' (the 3D
   design), 'concept' (the finished look) — declared in REVIEW below. A card
   with one version shows no switcher; adding one later is one line here plus
   one image file, no markup change. Circles are stored PER VERSION, so the
   submission carries exactly the image he drew on. Everything saves to
   localStorage as he goes; Send posts to Netlify Forms (form name
   design-review — do not rename it, dashboard notifications are wired). */
(function(){
  const galleryEl = document.getElementById('review-gallery');
  if(!galleryEl) return;
  const countEl  = document.getElementById('review-count');
  const emailEl  = document.getElementById('review-email');
  const copyEl   = document.getElementById('review-copy');
  const sendEl   = document.getElementById('review-send');
  const statusEl = document.getElementById('review-status');
  const nameEl   = document.getElementById('review-name');
  const summaryEl= document.getElementById('review-summary');
  const pageEl   = document.querySelector('.review-page');
  const KEY = id => 'hh-review2:'+id;      // v2 namespace: marks keyed by version

  const VLABEL = {today:'Today', render:'The design', concept:'Finished look'};
  const srcOf = (area, n, vk) => 'assets/review-'+area+'-'+n+'-'+vk+'.jpg';
  /* image keys are 'today' | 'render' | 'concept-2' … — a versioned key
     names the exact iteration, so "which image did he mean" is never lost */
  const labelOf = k => {
    const m = /^(.+)-(\d+)$/.exec(k);
    return m && VLABEL[m[1]] ? VLABEL[m[1]]+' · option '+m[2] : (VLABEL[k]||k);
  };

  /* ==== the one place photos and versions are declared ====
     Photos are his walk order (IMG_3590–93 kitchen, IMG_3586–89 wine),
     all portrait 1350×1800. When a render or finished-look lands, add its
     key to v and drop the file in assets/ — nothing else changes.
     A version with ITERATIONS (Jake: "multiple iterations… he can decide
     what looks good… stacked") is declared {k:'concept', n:3} instead of
     'concept' — files review-<area>-<n>-concept-1.jpg …-2 …-3. A card whose
     versions are all single still renders exactly as it always has. */
  const REVIEW = [
    {area:'kitchen', label:'Kitchen', cards:[
      {n:1, title:'The sink window',   desc:'Across the island to the window and the pantry door.', ar:'3 / 4', v:['today']},
      {n:2, title:'The range wall',    desc:'Cooktop, the tile medallion, and the uppers.',         ar:'3 / 4', v:['today']},
      {n:3, title:'The whole kitchen', desc:'Range, ovens and the island in one look.',             ar:'3 / 4', v:['today']},
      {n:4, title:'Toward the hallway',desc:'Past the island to the hallway and the red wall.',     ar:'3 / 4', v:['today']}
    ]},
    {area:'wine', label:'Wine closet', cards:[
      {n:1, title:'The wall, straight on', desc:'The drop counter that becomes the wine closet — tape marks the new footprint.', ar:'3 / 4', v:['today']},
      {n:2, title:'The uppers today',      desc:'The cabinet above the counter, and the tape line.', ar:'3 / 4', v:['today']},
      {n:3, title:'The whole span',        desc:'The full run, tape measure across the floor.',      ar:'3 / 4', v:['today']},
      {n:4, title:'The pantry corner',     desc:'Where the run meets the pantry door.',              ar:'3 / 4', v:['today']}
    ]}
  ];

  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  const entries = [];
  function anyMarks(s){ return Object.values(s.marks).some(a=>a&&a.length); }
  const isFlagged = e => e.s.note.trim() || anyMarks(e.s);

  /* pill reservation — measured, not guessed */
  function reserve(){
    const h = summaryEl.getBoundingClientRect().height;
    if(!h) return;
    pageEl.style.paddingBottom = Math.round(h + 40) + 'px';
  }
  if(window.ResizeObserver) new ResizeObserver(reserve).observe(summaryEl);
  addEventListener('resize', reserve);

  try{ nameEl.value = localStorage.getItem('hh-review:name') || ''; }catch(e){}
  nameEl.addEventListener('input', ()=>{
    try{ localStorage.setItem('hh-review:name', nameEl.value); }catch(e){}
  });

  /* ==== build the cards ==== */
  REVIEW.forEach(A => A.cards.forEach(c => {
    const id = A.area+'-'+c.n;
    /* every version expands to image KEYS: 'today' → ['today'],
       {k:'concept',n:3} → ['concept-1','concept-2','concept-3'].
       Circles and the favorite are stored under the FULL key, so a mark on
       option 2 can never be read as option 1. */
    const vers = c.v.map(x => typeof x==='string' ? {k:x, n:1} : x);
    const keysFor = ver => ver.n>1
      ? Array.from({length:ver.n}, (_,i)=>ver.k+'-'+(i+1)) : [ver.k];
    const allKeys = vers.flatMap(keysFor);
    const card = document.createElement('article');
    card.className = 'review-card';
    card.dataset.still = id; card.dataset.area = A.area;
    card.innerHTML =
      '<div class="r-stage" style="aspect-ratio:'+c.ar+'">'+
        allKeys.map((k,i)=>'<img class="r-img'+(i?'':' on')+'" data-k="'+k+
          '" src="'+srcOf(A.area,c.n,k)+'" alt="'+esc(c.title)+' — '+labelOf(k)+
          '" loading="lazy" draggable="false">').join('')+
        '<canvas class="r-draw" aria-hidden="true"></canvas>'+
      '</div>'+
      (vers.length>1 ? '<div class="r-variants" role="group" aria-label="Version of '+
        esc(c.title)+'">'+
        vers.map((v,i)=>'<button class="v-btn'+(i?'':' on')+'" data-v="'+v.k+
          '" aria-pressed="'+(!i)+'">'+VLABEL[v.k]+'</button>').join('')+'</div>' : '')+
      (vers.some(v=>v.n>1) ? '<div class="r-iters" role="group" aria-label="Options for '+
        esc(c.title)+'" hidden></div>' : '')+
      '<h3>'+esc(c.title)+'</h3><p class="desc">'+esc(c.desc)+'</p>'+
      '<div class="r-buttons">'+
        '<button class="r-ok" aria-pressed="false">This one looks good</button>'+
        '<button class="r-draw-btn" aria-pressed="false">Circle on the photo</button>'+
        '<button class="r-clear" hidden>erase circles</button>'+
      '</div>'+
      '<label class="r-note"><span>Want something changed? Circle it above, or type it here.</span>'+
      '<textarea rows="3" aria-label="Changes for '+esc(c.title)+'"></textarea></label>';
    galleryEl.appendChild(card);

    const s = {ok:false, note:'', marks:{}, fav:null};
    try{ Object.assign(s, JSON.parse(localStorage.getItem(KEY(id)) || '{}')); }catch(e){}
    if(!s.marks || typeof s.marks !== 'object' || Array.isArray(s.marks)) s.marks = {};
    if(typeof s.fav !== 'string') s.fav = null;
    entries.push({id, title:c.title, area:A.area, areaLabel:A.label, n:c.n, s});

    const ok  = card.querySelector('.r-ok');
    const ta  = card.querySelector('textarea');
    const stage = card.querySelector('.r-stage');
    const imgs = {}; card.querySelectorAll('.r-img').forEach(im=>imgs[im.dataset.k]=im);
    const itersEl = card.querySelector('.r-iters');
    const cv  = card.querySelector('canvas.r-draw');
    const drawBtn = card.querySelector('.r-draw-btn');
    const clrBtn  = card.querySelector('.r-clear');
    let curVer = vers[0];
    let curKey = keysFor(curVer)[0];
    const lastIter = {};                 // version k → last viewed key
    ta.value = s.note || '';

    /* ---- circle-on-photo, per image key ----
       Strokes are fractions of the stage box, so they replay at any size and
       survive a reload. s.marks = { today:[…], 'concept-2':[…], … } */
    const ctx = cv.getContext('2d');
    const strokes = ()=> s.marks[curKey] || [];
    function fit(){
      const r = stage.getBoundingClientRect();
      if(!r.width) return;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      cv.width = Math.round(r.width*dpr); cv.height = Math.round(r.height*dpr);
      cv.style.width = r.width+'px'; cv.style.height = r.height+'px';
      ctx.setTransform(dpr,0,0,dpr,0,0);
      redraw();
    }
    function redraw(){
      const r = cv.getBoundingClientRect();
      ctx.clearRect(0,0,r.width,r.height);
      ctx.strokeStyle='#d2452c'; ctx.lineWidth=4; ctx.lineCap='round'; ctx.lineJoin='round';
      strokes().forEach(st=>{
        if(st.length<2) return;
        ctx.beginPath();
        st.forEach((p,i)=>{ const x=p[0]*r.width, y=p[1]*r.height;
          i?ctx.lineTo(x,y):ctx.moveTo(x,y); });
        ctx.stroke();
      });
      card.classList.toggle('marked', anyMarks(s));
      clrBtn.hidden = !strokes().length;
      clrBtn.textContent = allKeys.length>1
        ? 'erase circles on “'+labelOf(curKey)+'”' : 'erase circles';
    }
    let drawing=false, cur=null;
    const pt = e => { const r=cv.getBoundingClientRect();
      return [(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height]; };
    cv.addEventListener('pointerdown', e=>{
      if(!card.classList.contains('drawing')) return;
      drawing=true; cur=[pt(e)];
      (s.marks[curKey] = s.marks[curKey] || []).push(cur);
      try{ cv.setPointerCapture(e.pointerId); }catch(err){}
      e.preventDefault();
    });
    cv.addEventListener('pointermove', e=>{
      if(!drawing) return; cur.push(pt(e)); redraw(); e.preventDefault();
    });
    const endStroke = ()=>{ if(!drawing) return; drawing=false; save(); };
    cv.addEventListener('pointerup', endStroke);
    cv.addEventListener('pointercancel', endStroke);

    /* Switching is TWO gestures. A version pill (Today ↔ Finished look) is
       "show me the other thing"; an option pill (option 1 ↔ 2) is "show me
       the other choice" — that one snaps (.fast) because it is a comparison.
       The canvas follows either way: each image shows only its own circles. */
    function syncIters(){
      if(!itersEl) return;
      const ks = keysFor(curVer);
      if(ks.length < 2){ itersEl.hidden = true; itersEl.innerHTML = ''; return; }
      itersEl.hidden = false;
      itersEl.innerHTML = ks.map(k=>
        '<button class="i-btn'+(k===curKey?' on':'')+'" data-k="'+k+
        '" aria-pressed="'+(k===curKey)+'">Option '+k.split('-').pop()+'</button>').join('')+
        '<button class="r-fav'+(s.fav===curKey?' on':'')+'" aria-pressed="'+(s.fav===curKey)+
        '">'+(s.fav===curKey?'★ My favorite':'☆ My favorite')+'</button>';
      itersEl.querySelectorAll('.i-btn').forEach(b=>
        b.addEventListener('click', ()=>setKey(b.dataset.k, true)));
      itersEl.querySelector('.r-fav').addEventListener('click', ()=>{
        s.fav = (s.fav===curKey ? null : curKey);
        save(); syncIters();
      });
    }
    function setKey(k, fast){
      curKey = k; lastIter[curVer.k] = k;
      stage.classList.toggle('fast', !!fast);
      Object.entries(imgs).forEach(([kk,im])=>im.classList.toggle('on', kk===k));
      card.querySelectorAll('.v-btn').forEach(b=>{
        const on = b.dataset.v===curVer.k;
        b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
      });
      syncIters(); redraw();
    }
    card.querySelectorAll('.v-btn').forEach(b=>
      b.addEventListener('click', ()=>{
        const ver = vers.find(v=>v.k===b.dataset.v);
        if(!ver) return;
        curVer = ver;
        setKey(lastIter[ver.k] || keysFor(ver)[0], false);
      }));

    drawBtn.addEventListener('click', ()=>{
      const on = !card.classList.contains('drawing');
      card.classList.toggle('drawing', on);
      drawBtn.setAttribute('aria-pressed', on);
      drawBtn.textContent = on ? 'Done circling' : 'Circle on the photo';
      if(on) fit();
    });
    clrBtn.addEventListener('click', ()=>{ delete s.marks[curKey]; save(); });

    const paint = ()=>{
      ok.classList.toggle('on', !!s.ok);
      ok.setAttribute('aria-pressed', !!s.ok);
      ok.textContent = s.ok ? '✓ Looks good' : 'This one looks good';
      card.classList.toggle('noted', !!s.note.trim());
    };
    function save(){
      try{ localStorage.setItem(KEY(id), JSON.stringify(s)); }catch(e){}
      paint(); redraw(); sync();
    }
    ok.addEventListener('click', ()=>{ s.ok=!s.ok; save(); });
    ta.addEventListener('input', ()=>{ s.note=ta.value; save(); });
    ta.addEventListener('focus', ()=>document.body.classList.add('typing'));
    ta.addEventListener('blur',  ()=>document.body.classList.remove('typing'));
    Object.values(imgs).forEach(im=>{
      if(im.complete) fit();
      else im.addEventListener('load', ()=>{ if(im.dataset.k===curKey) fit(); });
    });
    addEventListener('resize', fit);
    syncIters(); paint(); redraw();
  }));

  /* ==== area tabs ==== */
  const areaTabs = [...document.querySelectorAll('.area-tab')];
  function setArea(key){
    galleryEl.dataset.area = key;
    areaTabs.forEach(t=>{
      const on = t.dataset.area===key;
      t.classList.toggle('on', on); t.setAttribute('aria-selected', on);
    });
    try{ localStorage.setItem('hh-review2:area', key); }catch(e){}
  }
  areaTabs.forEach(t=>t.addEventListener('click', ()=>setArea(t.dataset.area)));
  try{ const a = localStorage.getItem('hh-review2:area');
       if(a && areaTabs.some(t=>t.dataset.area===a)) setArea(a); }catch(e){}

  function summary(){
    const flagged = entries.filter(isFlagged);
    const oks = entries.filter(e => e.s.ok && !isFlagged(e));
    const date = new Date().toLocaleDateString(undefined,
      {year:'numeric', month:'long', day:'numeric'});
    const who = (nameEl.value || '').trim();
    let body = 'Design review'+(who?' from '+who:'')+' — '+date+'\n';
    if(flagged.length){
      body += '\nCHANGES ASKED FOR:\n';
      flagged.forEach(e=>{
        body += '\n* ['+e.areaLabel+'] '+e.title+'\n';
        if(e.s.note.trim()) body += '  '+e.s.note.trim()+'\n';
        Object.entries(e.s.marks).forEach(([vk,st])=>{
          if(!st || !st.length) return;
          body += '  [circled '+st.length+' spot'+(st.length>1?'s':'')+
                  ' on the “'+labelOf(vk)+'” image — see attached]\n';
        });
        if(e.s.fav) body += '  FAVORITE: '+labelOf(e.s.fav)+'\n';
      });
    }
    if(oks.length){
      body += '\nLOOKS GOOD:\n';
      oks.forEach(e=>{ body += '- ['+e.areaLabel+'] '+e.title+
        (e.s.fav ? ' — favorite: '+labelOf(e.s.fav) : '')+'\n'; });
    }
    /* a favorite alone is real feedback — never let it vanish from the email */
    const favOnly = entries.filter(e=>e.s.fav && !e.s.ok && !isFlagged(e));
    if(favOnly.length){
      body += '\nFAVORITES PICKED:\n';
      favOnly.forEach(e=>{ body += '- ['+e.areaLabel+'] '+e.title+
        ' — '+labelOf(e.s.fav)+'\n'; });
    }
    if(!flagged.length && !oks.length && !favOnly.length) body += '\n(nothing marked yet)\n';
    return {flagged, oks, date, body, who};
  }

  /* Flatten photo + circles into one real image per (view, version) drawn on —
     the submission carries exactly the image he circled, named for it:
     circled-<area>-<n>-<version>.jpg */
  function markedBlobs(){
    const jobs = [];
    entries.forEach(e=>{
      Object.entries(e.s.marks).forEach(([vk,st])=>{
        if(st && st.length) jobs.push({e, vk, st});
      });
    });
    return Promise.all(jobs.map(j=>new Promise(res=>{
      const img = new Image();
      const done = ok=>{
        if(!ok || !img.naturalWidth) return res(null);
        const W=1200, H=Math.round(W*(img.naturalHeight/img.naturalWidth||0.75));
        const cnv=document.createElement('canvas'); cnv.width=W; cnv.height=H;
        const x=cnv.getContext('2d');
        try{ x.drawImage(img,0,0,W,H); }catch(err){ return res(null); }
        x.strokeStyle='#d2452c'; x.lineWidth=6; x.lineCap='round'; x.lineJoin='round';
        j.st.forEach(stk=>{
          if(stk.length<2) return;
          x.beginPath();
          stk.forEach((p,k)=>k?x.lineTo(p[0]*W,p[1]*H):x.moveTo(p[0]*W,p[1]*H));
          x.stroke();
        });
        const name='circled-'+j.e.id+'-'+j.vk+'.jpg';
        if(cnv.toBlob) cnv.toBlob(b=>res(b?new File([b],name,{type:'image/jpeg'}):null),
                                  'image/jpeg', 0.82);
        else res(null);
      };
      img.onload=()=>done(true); img.onerror=()=>done(false);
      img.src = srcOf(j.e.area, j.e.n, j.vk);
      setTimeout(()=>done(img.complete), 8000);
    }))).then(a=>a.filter(Boolean));
  }

  function sync(){
    const {flagged, oks, date, body} = summary();
    const favs = entries.filter(e=>e.s.fav).length;
    const untouched = REVIEW.filter(A =>
      entries.filter(e=>e.area===A.area)
             .every(e=>!e.s.ok && !isFlagged(e) && !e.s.fav))
      .map(A=>A.label);
    let t;
    if(!flagged.length && !oks.length && !favs){
      t = 'Mark the pictures, then send';
    }else{
      t = [flagged.length ? flagged.length+(flagged.length===1?' change':' changes') : '',
           oks.length ? oks.length+' approved' : '',
           favs ? favs+(favs===1?' favorite':' favorites') : '']
          .filter(Boolean).join(' · ');
      if(untouched.length) t += ' · '+untouched.join(' & ')+' still to look at';
    }
    countEl.textContent = t;
    emailEl.href = 'mailto:iwantagoodchannal@gmail.com'+
      '?subject='+encodeURIComponent('Design review — '+date)+
      '&body='+encodeURIComponent(body);
  }

  sendEl.addEventListener('click', ()=>{
    const {flagged, oks, date, body, who} = summary();
    const say=(msg,cls)=>{ statusEl.textContent=msg;
      statusEl.className='review-status '+(cls||''); };
    sendEl.disabled=true; sendEl.textContent='Sending…'; say('');
    markedBlobs().then(files=>{
      const fd = new FormData();
      fd.append('form-name','design-review');
      fd.append('reviewer', who || 'not given');
      fd.append('submitted', date);
      fd.append('approved', String(oks.length));
      fd.append('changes', String(flagged.length));
      fd.append('review', body);
      files.forEach(f=>fd.append('circled', f, f.name));
      return fetch('/', {method:'POST', body:fd}).then(r=>{
        if(!r.ok) throw new Error(r.status);
        sendEl.textContent='✓ Sent';
        say('Thank you — Jake has your notes'+
            (files.length?' and your circled photos.':'.'), 'ok');
      });
    })
    .catch(()=>{ sendEl.disabled=false; sendEl.textContent='Send to Jake';
      /* only now do the fallbacks earn their place on screen */
      summaryEl.classList.add('failed');
      say('That didn’t go through. Tap “or send as an email” below.', 'err');
      reserve();
    });
  });

  copyEl.addEventListener('click', ()=>{
    const t = summary().body;
    const done=()=>{ copyEl.textContent='copied';
      setTimeout(()=>{ copyEl.textContent='copy my notes'; },1600); };
    if(navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(t).then(done,done);
    else done();
  });
  sync(); reserve();
})();


/* ---------- specs count-up: numbers ≥ 10 tick up as the sheet enters ---------- */
(function(){
  if(SHOT || RM) return;                 // deterministic captures, calm motion
  const dds = [...document.querySelectorAll('.specs dd')];
  dds.forEach(dd => {
    dd.innerHTML = dd.textContent.replace(/\d{2,}/g,
      m => '<span class="cnt" data-n="'+m+'">'+m+'</span>');
  });
  const spans = [...document.querySelectorAll('.specs .cnt')];
  if(!spans.length) return;
  let done = false;
  const io = new IntersectionObserver(es => {
    if(done || !es.some(e=>e.isIntersecting)) return;
    done = true; io.disconnect();
    const t0 = performance.now(), DUR = 1100;
    (function tick(){
      const u = Math.min(1, (performance.now()-t0)/DUR);
      const k = 1 - Math.pow(1-u, 3);
      spans.forEach(s => { s.textContent = Math.round(+s.dataset.n * k); });
      if(u < 1) requestAnimationFrame(tick);
    })();
  }, {threshold: .4});
  io.observe(document.querySelector('.specs'));
})();

/* ---------- shot mode ---------- */
/* Screenshot tooling never scrolls (headless captures drop fixed layers at
   scroll offsets). Instead: show only the target chapter's pin, fixed to the
   viewport, and force the driver's (chapter, p). */
if(SHOT){
  document.body.classList.add('shot');
  veil.style.transition='none';
  document.getElementById('model').style.transition='none';
  document.querySelectorAll('#page-wine-wall > section').forEach(s=>{
    if(s.id !== 'ch-'+SHOT.ch && !(SHOT.ch==='details' && s.id==='ch-details'))
      s.style.display='none';
  });
  const pin = document.querySelector('#ch-'+SHOT.ch+' .pin');
  if(pin){ pin.style.position='fixed'; pin.style.inset='0'; pin.style.height='100vh'; }
  addEventListener('message', ev=>{
    if(ev.data && ev.data.t==='ready')
      setTimeout(()=>{ document.title='SHOT-READY'; }, 1000);
  });
}

/* ---------- go ---------- */
measure(); placeGlider();
addEventListener('load', ()=>{ measure(); placeGlider(); });
requestAnimationFrame(drive);
})();
