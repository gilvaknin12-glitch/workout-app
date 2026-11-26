'use strict';
/* ===== תוכנית אימונים — progressive overload tracker ===== */

const KEY = 'workout-app-v1';
const AREAS = ['חזה','גב','כתפיים','כתפיים אחוריות','יד קדמית','יד אחורית','רגליים','ארבע ראשי','המסטרינג','ישבן','תאומים','בטן','גב תחתון','כל הגוף','אחר'];
const AREA_RULES = [
  ['פשיטת גו','גב תחתון'],['היפר','גב תחתון'],['סופרמן','גב תחתון'],['גב תחתון','גב תחתון'],
  ['רומני','המסטרינג'],['כפיפת ברכ','המסטרינג'],['כפיפות ברכ','המסטרינג'],['המסטרינג','המסטרינג'],
  ['פשיטת ברכ','ארבע ראשי'],['פשיטות ברכ','ארבע ראשי'],
  ['סקוואט','רגליים'],['לחיצת רגל','רגליים'],['מכרע','רגליים'],['לאנג','רגליים'],['סטפ','רגליים'],
  ['תאומ','תאומים'],['היפ תראסט','ישבן'],['גשר','ישבן'],['ישבן','ישבן'],['הרחקת רג','ישבן'],['קירוב','רגליים'],
  ['דדליפט','גב'],
  ['פייס פול','כתפיים אחוריות'],['פייספול','כתפיים אחוריות'],['פרפר הפוך','כתפיים אחוריות'],['כתף אחורית','כתפיים אחוריות'],
  ['לחיצת כתפ','כתפיים'],['הרמות צד','כתפיים'],['הרחקת כתפ','כתפיים'],['ארנולד','כתפיים'],['כתפ','כתפיים'],
  ['לחיצת חזה','חזה'],['פרפר','חזה'],['חזה','חזה'],['שכיבות סמיכה','חזה'],['קרוס','חזה'],['פרסים','חזה'],
  ['מקבילים','יד אחורית'],
  ['פולי עליון','גב'],['מתח','גב'],['חתירה','גב'],['משיכ','גב'],['גב','גב'],
  ['יד קדמית','יד קדמית'],['כפיפת מרפק','יד קדמית'],['בייספס','יד קדמית'],['פטיש','יד קדמית'],
  ['יד אחורית','יד אחורית'],['טרייספס','יד אחורית'],['פשיטת מרפק','יד אחורית'],['צרפתי','יד אחורית'],
  ['בטן','בטן'],['פלאנק','בטן'],['קראנץ','בטן'],['כפיפות','בטן'],
  ['squat','רגליים'],['leg press','רגליים'],['lunge','רגליים'],['leg ext','ארבע ראשי'],['leg curl','המסטרינג'],
  ['deadlift','גב'],['row','גב'],['pulldown','גב'],['pull','גב'],['face','כתפיים אחוריות'],
  ['bench','חזה'],['chest','חזה'],['fly','חזה'],['shoulder','כתפיים'],['lateral','כתפיים'],
  ['curl','יד קדמית'],['tricep','יד אחורית'],['dip','יד אחורית'],['abs','בטן'],['crunch','בטן'],['plank','בטן'],
];
function detectArea(name){
  const n = (name||'').toLowerCase();
  for (const [k,a] of AREA_RULES) if (n.includes(k)) return a;
  return '';
}

/* ---------- state ---------- */
let S = load();
let view = 'workout';
let editProgramId = null;
let timer = {end:0, id:null};

function blank(){ return {programs:[], activeId:null, history:[], settings:{rest:90}, session:null}; }
function load(){
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.programs) return Object.assign(blank(), d); } catch(e){}
  return blank();
}
function save(){ localStorage.setItem(KEY, JSON.stringify(S)); }
const uid = () => Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4);
const round = x => Math.round(x*100)/100;
const fmt = x => (Math.round(x*100)/100).toString();
const esc = s => String(s??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $ = s => document.querySelector(s);
const prog = id => S.programs.find(p => p.id === id);
const active = () => prog(S.activeId) || S.programs[0] || null;

function toast(msg){
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast._t); toast._t = setTimeout(()=>t.classList.add('hidden'), 2200);
}

/* ---------- progression logic ----------
   Reps go up one at a time: set 1 climbs to max, then set 2, etc.
   When every set is at max, the NEXT finished workout raises the weight and resets reps to min.
   If you logged fewer reps than the target on any set, the exercise stays as is. */
function nextState(ex, actual){
  const reps = ex.reps.slice();
  if (actual && actual.some((a,i) => a < reps[i])) return {weight:ex.weight, reps, kind:'hold'};
  if (reps.every(r => r >= ex.max)){
    if (ex.bodyweight || !ex.inc) return {weight:ex.weight, reps, kind:'maxed'};
    return {weight: round(ex.weight + ex.inc), reps: reps.map(()=>ex.min), kind:'weight'};
  }
  const i = reps.findIndex(r => r < ex.max);
  reps[i] = Math.max(ex.min, reps[i] + 1);
  return {weight:ex.weight, reps, kind:'reps'};
}
function weightLabel(ex, w = ex.weight){
  if (ex.bodyweight) return 'משקל גוף';
  return fmt(w) + ' ק״ג' + (ex.perSide ? ' לצד' : '');
}
function upcomingTag(ex){
  const allMax = ex.reps.every(r => r >= ex.max);
  if (allMax && !ex.bodyweight && ex.inc) return `<span class="tag up">בסיום: עולים ל־${fmt(round(ex.weight+ex.inc))}</span>`;
  if (allMax) return `<span class="tag max">בשיא הטווח</span>`;
  return '';
}

/* ---------- session (current workout) ---------- */
function ensureSession(p){
  if (!p) return null;
  if (!S.session || S.session.programId !== p.id) S.session = {programId:p.id, done:{}, actual:{}, skipped:{}, started:Date.now()};
  const s = S.session;
  p.exercises.forEach(ex => {
    if (!s.actual[ex.id] || s.actual[ex.id].length !== ex.reps.length) s.actual[ex.id] = ex.reps.slice();
    if (!s.done[ex.id] || s.done[ex.id].length !== ex.reps.length) s.done[ex.id] = ex.reps.map(()=>false);
  });
  return s;
}

/* ---------- rendering ---------- */
function render(){
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === view || (view==='program-edit' && b.dataset.view==='programs')));
  const titles = {workout:'אימון', programs:'תוכניות', 'program-edit':'עריכת תוכנית', history:'היסטוריה', settings:'הגדרות'};
  $('#title').textContent = titles[view];
  const m = $('#main');
  if (view === 'workout') m.innerHTML = vWorkout();
  else if (view === 'programs') m.innerHTML = vPrograms();
  else if (view === 'program-edit') m.innerHTML = vProgramEdit();
  else if (view === 'history') m.innerHTML = vHistory();
  else if (view === 'settings') m.innerHTML = vSettings();
}

function vWorkout(){
  const p = active();
  if (!p) return `<div class="empty"><div class="big">🏋️</div><p>עוד אין תוכנית אימונים.</p>
    <button class="btn primary" data-action="new-program">בנה תוכנית חדשה</button>
    <p class="small" style="margin-top:22px">או התחל מהתוכנית שבפתק:</p>
    <button class="btn ghost" data-action="seed">טען את "פול באדי" מהפתק</button></div>`;
  const s = ensureSession(p);
  const chips = S.programs.length > 1 ? `<div class="chips">${S.programs.map(x =>
    `<button class="chip ${x.id===p.id?'on':''}" data-action="switch" data-id="${x.id}">${esc(x.name)}</button>`).join('')}</div>` : '';
  if (!p.exercises.length) return chips + `<div class="empty"><p>אין תרגילים בתוכנית "${esc(p.name)}".</p>
    <button class="btn primary" data-action="edit-program" data-id="${p.id}">הוסף תרגילים</button></div>`;
  const total = p.exercises.length;
  const doneCount = p.exercises.filter(ex => s.skipped[ex.id] || s.done[ex.id].every(Boolean)).length;
  const cards = p.exercises.map((ex, idx) => {
    const done = s.done[ex.id], act = s.actual[ex.id], skipped = !!s.skipped[ex.id];
    const allDone = done.every(Boolean);
    const sets = ex.reps.map((r,i) => {
      const a = act[i], cls = done[i] ? (a < r ? 'less' : 'ok') : '';
      return `<div class="set ${cls}" data-action="tick" data-ex="${ex.id}" data-i="${i}">
        <span class="lbl">סט ${i+1}</span><span class="n">${a}</span>
        <span class="lbl">${a!==r ? 'יעד '+r : 'חזרות'}</span>
        <div class="adj"><button data-action="adj" data-ex="${ex.id}" data-i="${i}" data-d="-1">−</button><button data-action="adj" data-ex="${ex.id}" data-i="${i}" data-d="1">+</button></div>
      </div>`;
    }).join('');
    return `<div class="card ${allDone?'done':''} ${skipped?'skipped':''}">
      <div class="row between">
        <div class="grow"><div class="ex-name">${idx+1}. ${esc(ex.name)}</div>
          <div class="row wrap" style="margin-top:5px">${ex.area?`<span class="tag">${esc(ex.area)}</span>`:''}
          <span class="tag">${ex.min===ex.max?ex.min:ex.min+'–'+ex.max} חזרות · ${ex.reps.length} סטים</span>${upcomingTag(ex)}</div></div>
        <div style="text-align:left"><div class="weight">${ex.bodyweight?'<small>משקל גוף</small>':fmt(ex.weight)+(ex.perSide?' <small>לצד</small>':' <small>ק״ג</small>')}</div></div>
      </div>
      ${ex.note?`<div class="small muted" style="margin-top:6px">${esc(ex.note)}</div>`:''}
      <div class="sets">${sets}</div>
      <div class="row" style="margin-top:10px;gap:6px">
        <button class="btn sm ghost" data-action="all-sets" data-ex="${ex.id}">${allDone?'בטל סימון':'✓ כל הסטים'}</button>
        <button class="btn sm ghost" data-action="skip" data-ex="${ex.id}">${skipped?'החזר':'דלג'}</button>
      </div>
    </div>`;
  }).join('');
  return chips + `<div class="row between small muted"><span>${esc(p.name)} · אימון מס׳ ${(p.count||0)+1}</span><span>${doneCount}/${total} תרגילים</span></div>
    <div class="progress"><i style="width:${Math.round(doneCount/total*100)}%"></i></div>
    <p class="small muted" style="margin:0 4px 10px">הקש על סט לסימון ✓ · ‏−/+ אם עשית חזרות אחרות מהיעד</p>
    ${cards}
    <button class="btn primary block finish" data-action="finish">סיימתי את האימון ✓</button>`;
}

function vPrograms(){
  const items = S.programs.map(p => `<div class="list-item">
      <div class="grow" data-action="edit-program" data-id="${p.id}">
        <div style="font-weight:700">${esc(p.name)} ${p.id===active()?.id?'<span class="tag max">פעילה</span>':''}</div>
        <div class="small muted">${p.exercises.length} תרגילים · ${p.count||0} אימונים הושלמו</div></div>
      ${p.id!==active()?.id?`<button class="btn sm ghost" data-action="switch" data-id="${p.id}">הפעל</button>`:''}
      <button class="mini" data-action="edit-program" data-id="${p.id}">✎</button>
    </div>`).join('');
  return `${S.programs.length?`<div class="card" style="padding:0">${items}</div>`:`<div class="empty"><p>אין עדיין תוכניות.</p></div>`}
    <button class="btn primary block" data-action="new-program">+ תוכנית חדשה</button>
    ${!S.programs.some(p=>p.seed)?`<button class="btn ghost block" style="margin-top:10px" data-action="seed">טען את "פול באדי" מהפתק</button>`:''}`;
}

function vProgramEdit(){
  const p = prog(editProgramId);
  if (!p){ view='programs'; return vPrograms(); }
  const exs = p.exercises.map((ex,i) => `<div class="list-item">
      <div class="grow" data-action="edit-ex" data-id="${ex.id}">
        <div style="font-weight:700">${i+1}. ${esc(ex.name)}</div>
        <div class="small muted">${weightLabel(ex)} · ${ex.reps.join('·')} (${ex.min}–${ex.max}) ${ex.area?'· '+esc(ex.area):''}</div></div>
      <button class="mini" data-action="move" data-id="${ex.id}" data-d="-1" ${i===0?'disabled style="opacity:.25"':''}>▲</button>
      <button class="mini" data-action="move" data-id="${ex.id}" data-d="1" ${i===p.exercises.length-1?'disabled style="opacity:.25"':''}>▼</button>
    </div>`).join('');
  return `<div class="field"><label>שם התוכנית</label>
      <input type="text" id="pname" value="${esc(p.name)}" data-change="rename"></div>
    <h3>תרגילים</h3>
    ${p.exercises.length?`<div class="card" style="padding:0">${exs}</div>`:'<p class="muted small">אין תרגילים עדיין.</p>'}
    <button class="btn primary block" data-action="new-ex">+ הוסף תרגיל</button>
    <div class="row" style="margin-top:22px;gap:8px">
      <button class="btn ghost grow" data-action="nav" data-view="programs">← חזרה</button>
      <button class="btn ghost" data-action="dup-program">שכפל</button>
      <button class="btn danger" data-action="del-program">מחק תוכנית</button>
    </div>`;
}

function vHistory(){
  if (!S.history.length) return `<div class="empty"><div class="big">📅</div><p>עוד לא נשמרו אימונים.</p></div>`;
  return S.history.slice().reverse().map(h => {
    const d = new Date(h.date);
    const lastForProg = S.history.filter(x => x.programId === h.programId).pop() === h;
    return `<details class="card"><summary class="row between" style="list-style:none;cursor:pointer">
        <div><div style="font-weight:700">${esc(h.programName)}</div>
        <div class="small muted">${d.toLocaleDateString('he-IL',{weekday:'long',day:'numeric',month:'numeric',year:'2-digit'})} · ${d.toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'})}</div></div>
        <span class="muted">▾</span></summary>
      <div style="margin-top:10px">${h.entries.map(e => `<div class="change"><b>${esc(e.name)}</b> — ${e.skipped?'<span class="muted">דולג</span>':`${esc(e.weightLabel)} · ${e.reps.join('·')}`}</div>`).join('')}</div>
      <div class="row" style="margin-top:10px;gap:8px">
        ${lastForProg && h.snapshot && prog(h.programId)?`<button class="btn sm ghost" data-action="undo" data-id="${h.id}">↺ בטל אימון (החזר תוכנית)</button>`:''}
        <button class="btn sm danger" data-action="del-hist" data-id="${h.id}">מחק</button>
      </div></details>`;
  }).join('');
}

function vSettings(){
  return `<div class="card">
      <div class="field"><label>טיימר מנוחה בין סטים (שניות, 0 = כבוי)</label>
      <input type="number" inputmode="numeric" id="rest" value="${S.settings.rest}" data-change="rest"></div>
    </div>
    <h3>גיבוי</h3>
    <div class="card">
      <p class="small muted" style="margin-top:0">הנתונים נשמרים בדפדפן במכשיר הזה. כדאי לייצא גיבוי מדי פעם, או כדי להעביר למכשיר אחר.</p>
      <button class="btn block" data-action="export">⬇ ייצוא גיבוי (JSON)</button>
      <label class="btn block ghost" style="margin-top:8px;text-align:center">⬆ ייבוא מגיבוי<input type="file" accept=".json,application/json" id="importFile" hidden></label>
    </div>
    <h3>איך ההתקדמות עובדת</h3>
    <div class="card small muted" style="line-height:1.6">
      בכל אימון שמסומן כ"סיימתי", סט אחד עולה בחזרה אחת: קודם הסט הראשון עד המקסימום של הטווח, אחר כך השני, וכן הלאה.
      כשכל הסטים במקסימום — האימון הבא נעשה כך, ובסיומו המשקל עולה בקפיצה שהגדרת והחזרות חוזרות למינימום.
      אם עשית פחות חזרות מהיעד בסט כלשהו (סימנת ב־−), התרגיל נשאר כמו שהוא לאימון הבא. תרגיל שדילגת עליו לא משתנה.
    </div>
    <button class="btn danger block" style="margin-top:20px" data-action="reset">מחיקת כל הנתונים</button>`;
}

/* ---------- exercise form ---------- */
function openExForm(ex){
  const isNew = !ex;
  ex = ex || {name:'', area:'', bodyweight:false, perSide:false, weight:'', inc:2.5, min:10, max:12, reps:[10,10,10], note:''};
  const areaOpts = ['<option value="">— בחר —</option>'].concat(AREAS.map(a => `<option ${a===ex.area?'selected':''}>${a}</option>`)).join('');
  $('#sheet').innerHTML = `<h2>${isNew?'תרגיל חדש':'עריכת תרגיל'}</h2>
    <form id="exForm" autocomplete="off">
      <div class="field"><label>שם התרגיל</label><input type="text" name="name" required value="${esc(ex.name)}" placeholder="למשל: סקוואט עם מוט חופשי"></div>
      <div class="field"><label>אזור (מתמלא אוטומטית לפי השם)</label><select name="area">${areaOpts}</select></div>
      <label class="check"><input type="checkbox" name="bodyweight" ${ex.bodyweight?'checked':''}> ללא משקל (משקל גוף)</label>
      <div id="wFields" class="${ex.bodyweight?'hidden':''}">
        <div class="grid2">
          <div class="field"><label>משקל נוכחי (ק״ג)</label><input type="number" step="0.25" inputmode="decimal" name="weight" value="${ex.weight}"></div>
          <div class="field"><label>קפיצת משקל (ק״ג)</label><input type="number" step="0.25" inputmode="decimal" name="inc" value="${ex.inc}"></div>
        </div>
        <label class="check"><input type="checkbox" name="perSide" ${ex.perSide?'checked':''}> המשקל הוא לכל צד</label>
      </div>
      <div class="grid3">
        <div class="field"><label>חזרות מינ׳</label><input type="number" inputmode="numeric" name="min" value="${ex.min}" min="1"></div>
        <div class="field"><label>חזרות מקס׳</label><input type="number" inputmode="numeric" name="max" value="${ex.max}" min="1"></div>
        <div class="field"><label>סטים</label><input type="number" inputmode="numeric" name="sets" value="${ex.reps.length}" min="1" max="10"></div>
      </div>
      <div class="field"><label>חזרות נוכחיות בכל סט (מאיפה מתחילים)</label><div class="reps-edit" id="repsEdit"></div></div>
      <div class="field"><label>הערה (לא חובה)</label><input type="text" name="note" value="${esc(ex.note||'')}" placeholder="למשל: כיסא בדרגה 4"></div>
      <div class="row" style="gap:8px;margin-top:6px">
        <button type="submit" class="btn primary grow">שמור</button>
        <button type="button" class="btn ghost" data-action="close">ביטול</button>
        ${isNew?'':`<button type="button" class="btn danger" data-action="del-ex" data-id="${ex.id}">מחק</button>`}
      </div>
    </form>`;
  const f = $('#exForm');
  let reps = ex.reps.slice();
  let areaTouched = !!ex.area;
  const drawReps = () => {
    const n = Math.max(1, Math.min(10, +f.sets.value || 1)), min = +f.min.value || 1, max = Math.max(min, +f.max.value || min);
    while (reps.length < n) reps.push(min);
    reps.length = n;
    $('#repsEdit').innerHTML = reps.map((r,i) => `<input type="number" inputmode="numeric" data-ri="${i}" value="${r}">`).join('')
      + `<button type="button" class="btn sm ghost" data-action="reps-min">איפוס למינ׳</button>`;
  };
  drawReps();
  f.addEventListener('input', e => {
    const t = e.target;
    if (t.name === 'name' && !areaTouched){ const a = detectArea(t.value); f.area.value = a; }
    if (t.name === 'area') areaTouched = true;
    if (t.name === 'bodyweight') $('#wFields').classList.toggle('hidden', t.checked);
    if (t.name === 'sets') drawReps();
    if (t.dataset.ri !== undefined) reps[+t.dataset.ri] = +t.value;
  });
  f.addEventListener('click', e => { if (e.target.dataset.action === 'reps-min'){ reps = reps.map(()=> +f.min.value || 1); drawReps(); }});
  f.addEventListener('submit', e => {
    e.preventDefault();
    const min = Math.max(1, +f.min.value || 1), max = Math.max(min, +f.max.value || min);
    const data = {
      name: f.name.value.trim(), area: f.area.value || detectArea(f.name.value),
      bodyweight: f.bodyweight.checked, perSide: f.perSide.checked,
      weight: f.bodyweight.checked ? 0 : (+f.weight.value || 0), inc: f.bodyweight.checked ? 0 : (+f.inc.value || 0),
      min, max, reps: reps.map(r => Math.min(max, Math.max(min, Math.round(+r) || min))), note: f.note.value.trim(),
    };
    if (!data.name) return;
    const p = prog(editProgramId);
    if (isNew) p.exercises.push(Object.assign({id:uid()}, data));
    else Object.assign(p.exercises.find(x => x.id === ex.id), data);
    if (S.session && S.session.programId === p.id){ const id = isNew ? null : ex.id; if (id){ delete S.session.actual[id]; delete S.session.done[id]; } }
    save(); closeModal(); render(); toast('נשמר');
  });
  openModal();
  if (isNew) setTimeout(()=>f.name.focus(), 50);
}
function openModal(){ $('#modal').classList.remove('hidden'); }
function closeModal(){ $('#modal').classList.add('hidden'); }

/* ---------- finish workout ---------- */
function finishPreview(){
  const p = active(), s = ensureSession(p);
  const changes = p.exercises.map(ex => {
    if (s.skipped[ex.id]) return `<div class="change"><b>${esc(ex.name)}</b> <span class="muted">— דולג, נשאר כמו שהוא</span></div>`;
    const n = nextState(ex, s.actual[ex.id]);
    let txt;
    if (n.kind === 'weight') txt = `<span class="tag up">משקל עולה</span> ${weightLabel(ex)} <span class="arrow">←</span> ${weightLabel(ex, n.weight)}, חזרות ${n.reps.join('·')}`;
    else if (n.kind === 'reps') txt = `${ex.reps.join('·')} <span class="arrow">←</span> ${n.reps.join('·')}`;
    else if (n.kind === 'hold') txt = `<span class="tag hold">נשאר</span> פחות חזרות מהיעד — חוזרים על ${ex.reps.join('·')}`;
    else txt = `<span class="tag max">בשיא</span> כל הסטים במקסימום — אפשר להגדיל טווח/סטים בעריכה`;
    return `<div class="change"><b>${esc(ex.name)}</b><br>${txt}</div>`;
  }).join('');
  $('#sheet').innerHTML = `<h2>סיום אימון — מה ישתנה לאימון הבא</h2>${changes}
    <div class="row" style="gap:8px;margin-top:16px">
      <button class="btn primary grow" data-action="confirm-finish">שמור ועדכן תוכנית</button>
      <button class="btn ghost" data-action="close">ביטול</button></div>`;
  openModal();
}
function finishWorkout(){
  const p = active(), s = ensureSession(p);
  const snapshot = JSON.parse(JSON.stringify(p.exercises));
  const entries = p.exercises.map(ex => ({
    name: ex.name, skipped: !!s.skipped[ex.id], weightLabel: weightLabel(ex),
    weight: ex.weight, reps: s.actual[ex.id].slice(), target: ex.reps.slice(),
  }));
  p.exercises.forEach(ex => {
    if (s.skipped[ex.id]) return;
    const n = nextState(ex, s.actual[ex.id]);
    ex.weight = n.weight; ex.reps = n.reps;
  });
  p.count = (p.count||0) + 1;
  S.history.push({id:uid(), date:Date.now(), programId:p.id, programName:p.name, entries, snapshot, prevCount:p.count-1});
  S.session = null; stopTimer();
  save(); closeModal(); render(); window.scrollTo(0,0);
  toast('האימון נשמר! התוכנית עודכנה לאימון הבא 💪');
}

/* ---------- rest timer ---------- */
function startTimer(){
  const sec = +S.settings.rest; if (!sec) return;
  timer.end = Date.now() + sec*1000;
  clearInterval(timer.id); timer.id = setInterval(tickTimer, 250); tickTimer();
}
function tickTimer(){
  const el = $('#timer'), left = Math.ceil((timer.end - Date.now())/1000);
  if (left <= 0){ stopTimer(); navigator.vibrate && navigator.vibrate([200,100,200]); toast('המנוחה נגמרה — סט הבא!'); return; }
  el.classList.remove('hidden');
  el.innerHTML = `⏱ ${Math.floor(left/60)}:${String(left%60).padStart(2,'0')} <button data-action="timer-add">+30</button><button data-action="timer-stop">✕</button>`;
}
function stopTimer(){ clearInterval(timer.id); $('#timer').classList.add('hidden'); }

/* ---------- seed from the note ---------- */
function seedProgram(){
  const E = (name, weight, inc, min, max, reps, o={}) => Object.assign({id:uid(), name, area:detectArea(name), bodyweight:false, perSide:false, weight, inc, min, max, reps, note:''}, o);
  const p = {id:uid(), name:'פול באדי', seed:true, count:0, exercises:[
    E('סקוואט עם מוט חופשי', 15, 2.5, 10, 12, [12,12,10], {perSide:true}),
    E('פשיטת ברכיים במכונה', 32, 2.5, 10, 12, [12,11,10]),
    E('פולי עליון באחיזה רחבה', 50, 2.5, 10, 12, [12,12,10]),
    E('חתירה בפולי תחתון', 22.5, 2.5, 10, 12, [11,10], {perSide:true}),
    E('לחיצת חזה בזווית', 15, 2.5, 8, 10, [10,10,10,8], {perSide:true}),
    E('פרפר', 29, 2.5, 8, 10, [10,9,10]),
    E('לחיצת כתפיים בישיבה עם משקולות יד', 7.5, 1, 10, 12, [12,11], {note:'בטבלה רשום 7–8 ק״ג — עדכן לפי המשקולות'}),
    E('פשיטת גו בכיסא רומי', 0, 0, 10, 12, [12,12,12], {bodyweight:true}),
    E('סט בטן (כפיפות בטן + סופרמן)', 0, 0, 10, 20, [10,10,10], {bodyweight:true, area:'בטן'}),
  ]};
  S.programs.push(p); S.activeId = p.id; S.session = null; save();
  toast('התוכנית נטענה — בדוק את קפיצות המשקל בעריכה');
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]'); if (!el) return;
  const a = el.dataset.action, id = el.dataset.id;
  if (el.closest('#exForm') && a === 'reps-min') return;
  const p = active();
  switch (a){
    case 'nav': view = el.dataset.view; render(); window.scrollTo(0,0); break;
    case 'switch':
      if (S.session && p && S.session.programId !== id && Object.values(S.session.done).some(d => d.some(Boolean)) && !confirm('יש אימון פתוח עם סטים מסומנים. לעבור תוכנית ולאפס אותו?')) return;
      S.activeId = id; S.session = null; save(); view = 'workout'; render(); break;
    case 'new-program': {
      const name = prompt('שם התוכנית:', 'תוכנית ' + (S.programs.length+1)); if (!name) return;
      const np = {id:uid(), name:name.trim(), exercises:[], count:0}; S.programs.push(np);
      if (!S.activeId) S.activeId = np.id;
      editProgramId = np.id; view = 'program-edit'; save(); render(); break; }
    case 'seed': seedProgram(); view = 'workout'; render(); break;
    case 'edit-program': editProgramId = id; view = 'program-edit'; render(); window.scrollTo(0,0); break;
    case 'dup-program': {
      const src = prog(editProgramId), cp = JSON.parse(JSON.stringify(src));
      cp.id = uid(); cp.name = src.name + ' (עותק)'; cp.count = 0; delete cp.seed; cp.exercises.forEach(x => x.id = uid());
      S.programs.push(cp); editProgramId = cp.id; save(); render(); toast('שוכפל'); break; }
    case 'del-program':
      if (!confirm('למחוק את התוכנית? ההיסטוריה שלה תישאר.')) return;
      S.programs = S.programs.filter(x => x.id !== editProgramId);
      if (S.activeId === editProgramId) { S.activeId = S.programs[0]?.id || null; S.session = null; }
      view = 'programs'; save(); render(); break;
    case 'new-ex': openExForm(null); break;
    case 'edit-ex': openExForm(prog(editProgramId).exercises.find(x => x.id === id)); break;
    case 'del-ex': {
      if (!confirm('למחוק את התרגיל?')) return;
      const pp = prog(editProgramId); pp.exercises = pp.exercises.filter(x => x.id !== id);
      save(); closeModal(); render(); break; }
    case 'move': {
      const arr = prog(editProgramId).exercises, i = arr.findIndex(x => x.id === id), j = i + (+el.dataset.d);
      if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; save(); render(); break; }
    case 'close': closeModal(); break;
    case 'tick': {
      if (e.target.closest('.adj')) return;
      const s = ensureSession(p), i = +el.dataset.i, d = s.done[el.dataset.ex];
      d[i] = !d[i]; if (d[i]) { delete s.skipped[el.dataset.ex]; startTimer(); }
      save(); render(); break; }
    case 'adj': {
      const s = ensureSession(p), i = +el.dataset.i, act = s.actual[el.dataset.ex];
      act[i] = Math.max(0, act[i] + (+el.dataset.d)); s.done[el.dataset.ex][i] = true;
      save(); render(); break; }
    case 'all-sets': {
      const s = ensureSession(p), d = s.done[el.dataset.ex], val = !d.every(Boolean);
      d.fill(val); if (val) delete s.skipped[el.dataset.ex]; save(); render(); break; }
    case 'skip': {
      const s = ensureSession(p), k = el.dataset.ex;
      if (s.skipped[k]) delete s.skipped[k]; else { s.skipped[k] = true; s.done[k].fill(false); }
      save(); render(); break; }
    case 'finish': finishPreview(); break;
    case 'confirm-finish': finishWorkout(); break;
    case 'timer-add': timer.end += 30000; tickTimer(); break;
    case 'timer-stop': stopTimer(); break;
    case 'undo': {
      const h = S.history.find(x => x.id === id), pp = prog(h.programId);
      if (!confirm('לבטל את האימון הזה ולהחזיר את התוכנית למצב שלפניו?')) return;
      pp.exercises = h.snapshot; pp.count = h.prevCount ?? Math.max(0,(pp.count||1)-1);
      S.history = S.history.filter(x => x.id !== id); S.session = null; save(); render(); toast('בוטל — התוכנית הוחזרה'); break; }
    case 'del-hist':
      if (!confirm('למחוק את האימון מההיסטוריה? (התוכנית לא תשתנה)')) return;
      S.history = S.history.filter(x => x.id !== id); save(); render(); break;
    case 'export': {
      const blob = new Blob([JSON.stringify(S, null, 2)], {type:'application/json'});
      const aEl = document.createElement('a'); aEl.href = URL.createObjectURL(blob);
      aEl.download = 'workout-backup-' + new Date().toISOString().slice(0,10) + '.json'; aEl.click(); break; }
    case 'reset':
      if (!confirm('למחוק את כל התוכניות וההיסטוריה? אי אפשר לבטל.')) return;
      S = blank(); save(); view = 'workout'; render(); break;
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.change === 'rename'){ const p = prog(editProgramId); p.name = t.value.trim() || p.name; save(); }
  if (t.dataset.change === 'rest'){ S.settings.rest = Math.max(0, +t.value || 0); save(); toast('נשמר'); }
  if (t.id === 'importFile' && t.files[0]){
    const r = new FileReader();
    r.onload = () => { try { const d = JSON.parse(r.result); if (!d.programs) throw 0;
      if (!confirm('הייבוא יחליף את כל הנתונים הנוכחיים. להמשיך?')) return;
      S = Object.assign(blank(), d); save(); view='workout'; render(); toast('הגיבוי יובא'); } catch(_) { alert('קובץ לא תקין'); } };
    r.readAsText(t.files[0]);
  }
});
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(()=>{}));
if (typeof module !== 'undefined') module.exports = {nextState, detectArea};
render();
