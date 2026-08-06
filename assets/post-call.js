/* ============================================================
   POST-CALL — the inverse of PRE-CALL.
   PRE-CALL asked the operator for their own last deal to anchor a price,
   which is empty for anyone who hasn't closed one yet. Here every number
   comes from the client's own process plus published vertical benchmarks,
   so a first-timer gets a defensible price on their first call.

   This file is the shell: it reads the DOM, holds the selection state, and
   wires events. Everything with rules in it lives elsewhere and is tested
   without a browser —

     model.js       the pricing arithmetic
     deals.js       the ledger's storage and calibration
     pc-catalog.js  systems, scope rows, presets, templates
     pc-proposal.js the document, as a pure function
     pc-gate.js     the paid export
     pc-ledger.js   stage 4 on screen
     pc-dom.js      el/show/esc/guard
   ============================================================ */

const { SYSTEMS, METHODS, SCOPE_ITEMS, SCOPE_LABEL, PRESETS, EXAMPLES, TEMPLATES,
        visibleScope, defaultScopeState, scopeStateFor } = PC.catalog;
const ils = PC.model.ils;

/* ---------- selection state ---------- */
const chosenSystems = new Set();
let scopeState = defaultScopeState();
let activeTemplate = null;

function clearSystems(){
  chosenSystems.clear();
  [...el('sysChips').children].forEach(c => {
    c.classList.remove('on'); c.setAttribute('aria-pressed','false');
  });
}
function selectSystems(names){
  clearSystems();
  [...el('sysChips').children].forEach(c => {
    if (names.indexOf(c.textContent) === -1) return;
    c.classList.add('on'); c.setAttribute('aria-pressed','true');
    chosenSystems.add(c.textContent);
  });
}
function resetScope(){ scopeState = defaultScopeState(); }
function scopeList(state){
  return visibleScope(chosenSystems).filter(i => scopeState[i.id] === state);
}

/* ---------- system chips ---------- */
SYSTEMS.forEach(s => {
  // a real button, not a styled div: a div with a click handler is unreachable
  // by keyboard and announces nothing to a screen reader
  const c = document.createElement('button');
  c.type = 'button'; c.className = 'chip'; c.textContent = s;
  c.setAttribute('aria-pressed', 'false');
  c.onclick = () => {
    c.classList.toggle('on');
    const on = c.classList.contains('on');
    c.setAttribute('aria-pressed', String(on));
    on ? chosenSystems.add(s) : chosenSystems.delete(s);
    renderScope(); // system-conditional scope rows appear and disappear with this
    recompute();
    saveDraftSoon(); // chips fire no input event of their own
  };
  el('sysChips').appendChild(c);
});

/* ---------- templates ----------
   The shortest path from an empty page to a document worth correcting. One
   tap sets the systems, typical numbers, opening text, and — the part that
   matters — the scope decisions for that kind of job, which is where the time
   actually goes. Everything it writes is editable, and the note says why the
   rows that moved, moved. */
const renderTemplates = guard('templates', function (){
  const box = el('tplChips'); if (!box) return;
  box.innerHTML = '';
  TEMPLATES.forEach(t => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tpl' + (activeTemplate === t.id ? ' on' : '');
    b.setAttribute('aria-pressed', String(activeTemplate === t.id));
    b.innerHTML = '<span class="tpl-n">' + esc(t.name) + '</span>' +
                  '<span class="tpl-b">' + esc(t.blurb) + '</span>';
    b.onclick = () => applyTemplate(t.id);
    box.appendChild(b);
  });
});

function applyTemplate(id){
  const t = TEMPLATES.find(x => x.id === id);
  if (!t) return;
  activeTemplate = t.id;

  selectSystems(t.systems);
  Object.entries(t.fields).forEach(([k, v]) => { const f = el(k); if (f) f.value = v; });
  Object.entries(t.numbers).forEach(([k, v]) => { const f = el(k); if (f) f.value = v; });
  // applied over the defaults, never over whatever the last template left
  scopeState = scopeStateFor(t);

  const note = el('tplNote');
  if (note) {
    note.innerHTML = '<b>' + esc(t.name) + '.</b> ' + esc(t.note) +
      '<span class="tpl-caveat">המספרים כאן טיפוסיים, לא נמדדו אצל הלקוח שלך. ' +
      'תקן אותם מולו — הם קיימים כדי שיהיה מה לתקן, לא כדי להישלח כמו שהם.</span>';
    show('tplNote', true);
  }
  renderTemplates();
  renderScope();
  recompute();
  saveDraft();   // immediately: a template rewrites everything at once
  track('template_used');
  const doc = el('proposal');
  if (doc) doc.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function clearTemplateChoice(){
  activeTemplate = null;
  show('tplNote', false);
  renderTemplates();
}

/* ---------- presets and example fills ---------- */
Object.entries(PRESETS).forEach(([id, vals]) => {
  const input = el(id); if (!input) return;
  const row = document.createElement('div'); row.className = 'presets';
  vals.forEach(v => {
    const c = document.createElement('button');
    c.type = 'button'; c.className = 'chip chip-sm'; c.textContent = v;
    c.setAttribute('aria-pressed', 'false');
    c.onclick = () => {
      input.value = v;
      [...row.children].forEach(x => { const sel = x === c;
        x.classList.toggle('on', sel); x.setAttribute('aria-pressed', String(sel)); });
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    row.appendChild(c);
  });
  input.insertAdjacentElement('afterend', row);
  // typing your own number clears the chip highlight — the chips are a shortcut,
  // never a constraint on what you can enter
  input.addEventListener('input', () => {
    if (![...row.children].some(x => x.textContent === input.value))
      [...row.children].forEach(x => { x.classList.remove('on'); x.setAttribute('aria-pressed','false'); });
  });
});

Object.entries(EXAMPLES).forEach(([id, text]) => {
  const field = el(id); if (!field) return;
  const row = document.createElement('div'); row.className = 'presets';
  const c = document.createElement('button');
  c.type = 'button'; c.className = 'chip chip-sm';
  c.textContent = 'מלא דוגמה ואז ערוך';
  c.onclick = () => {
    field.value = text;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  };
  row.appendChild(c);
  field.insertAdjacentElement('afterend', row);
});

/* ---------- scope on screen ---------- */
const renderScope = guard('scope', function (){
  const box = el('scopeBox');
  box.innerHTML = visibleScope(chosenSystems).map(i => `
    <div class="scope-row">
      <div class="scope-t">${esc(i.t)}${i.why ? `<span class="scope-why">${esc(i.why)}</span>` : ''}</div>
      <div class="scope-btns">
        ${['in','out','extra'].map(s =>
          `<button type="button" class="sbtn s-${s}${scopeState[i.id]===s?' on':''}"
             aria-pressed="${scopeState[i.id]===s}"
             data-i="${i.id}" data-s="${s}">${SCOPE_LABEL[s]}</button>`).join('')}
      </div>
    </div>`).join('');
  box.querySelectorAll('.sbtn').forEach(b => b.onclick = () => {
    scopeState[b.dataset.i] = b.dataset.s;
    renderScope();
    renderProposal();   // the client read does not depend on scope
    renderGuide();
    saveDraftSoon();
  });
});

/* ---------- method selector ----------
   Four chips asking someone to choose between value, market rate, cost-plus
   and a comparable deal is a question only a person who already prices work
   can answer, and answering it wrong costs them money. The tool now decides
   and says why in one sentence; the chips remain for whoever wants to
   override, behind their own explanation. */
let methodPinned = false;
const mc = el('methodChips');
mc.dataset.sel = 'value';
Object.entries(METHODS).forEach(([key, m]) => {
  const c = document.createElement('button');
  c.type = 'button';
  c.className = 'chip' + (key === 'value' ? ' on' : '');
  c.textContent = m.name; c.dataset.k = key;
  c.setAttribute('aria-pressed', String(key === 'value'));
  c.onclick = () => {
    methodPinned = true;   // an explicit choice is never overwritten by the tool
    setMethod(key);
    recompute();
  };
  mc.appendChild(c);
});
function setMethod(key){
  mc.dataset.sel = key;
  [...mc.children].forEach(x => { const sel = x.dataset.k === key;
    x.classList.toggle('on', sel); x.setAttribute('aria-pressed', String(sel)); });
  el('methodHint').textContent = METHODS[key].hint;
  show('m_comparable_in', key === 'comparable');
  show('m_cost_in', key === 'cost');
}

/* Decided from what is on the form, unless the operator has taken over. */
function autoMethod(){
  if (methodPinned) return;
  const p = PC.guide.pickMethod(guideState());
  if (mc.dataset.sel !== p.method) setMethod(p.method);
  const w = el('methodWhy');
  if (w) w.textContent = p.because;
}
setMethod('value');

el('q_role').addEventListener('change', () => {
  show('customRateWrap', el('q_role').value === 'custom');
  recompute();
});

/* ---------- inputs → model ----------
   The only job left here is reading the DOM. Every number and rule lives in
   assets/model.js, which stays free of the document so it can be tested
   directly. */
function readInputs(){
  return {
    freq: num('q_freq'),
    freqUnit: parseFloat(el('q_freq_unit').value),
    minutes: num('q_minutes'),
    rate: el('q_role').value === 'custom' ? num('q_rate_custom') : parseFloat(el('q_role').value),
    capture: parseFloat(el('a_capture').value),
    errFreq: num('q_err_freq'),
    errCost: num('q_err_cost'),
    systemCount: chosenSystems.size,
    integration: parseFloat(el('q_integration').value),
    edge: parseFloat(el('q_edge').value),
    myRate: num('a_myrate'),
    margin: num('c_margin') || undefined,
    maintPct: num('a_maint'),
    method: el('methodChips').dataset.sel || 'value',
    compLast: num('c_last'),
    compScale: parseFloat(el('c_scale').value),
    compScaleLabel: el('c_scale').selectedOptions[0].text,
    deals: parseInt(el('c_deals').value, 10)
  };
}
const model = () => PC.model.compute(readInputs());

/* Where the client's number came from decides what the value figure is worth.
   In documented comparable engagements, clients produced digits only after the
   seller injected the quantification move — meaning a number that appears on
   request may be measuring the question rather than the business. The tool
   cannot resolve that, so it records it and says so instead of averaging it in. */
function provenanceWarning(m){
  if (!m.annualValue) return '';
  const p = el('q_provenance').value;
  if (p === 'unprompted') return '';
  if (p === 'prompted') return '<div class="tri-warn">המספר הגיע אחרי ששאלת. ' +
    'ייתכן שהוא אמיתי, וייתכן שהוא נבנה בשבילך בזמן השיחה. לפני שאתה שולח מחיר שנשען עליו, ' +
    'שאל אותו שאלה אחת: "איך אתה יודע את זה?" — אם אין תשובה, זה אומדן ולא מדידה.</div>';
  if (p === 'mine') return '<div class="tri-warn"><b>המספר הוא שלך, לא שלו.</b> ' +
    'תמחור לפי ערך שנשען על מספר שאתה המצאת הוא תמחור לפי עלות עם שכבת הצדקה. ' +
    'או שתוציא ממנו מספר, או שתתמחר לפי שיטה אחרת ותציג את הערך כהערכה מפורשת.</div>';
  return '';
}

const recompute = guard('recompute', function (){
  autoMethod();          // before the model reads it
  const m = model();
  el('s_hours').textContent   = m.hours   ? Math.round(m.hours).toLocaleString('en-US') : '—';
  el('s_value').textContent   = m.annualValue ? ils(m.annualValue) : '—';
  el('s_effort').textContent  = chosenSystems.size ? m.effort : '—';
  const priceTxt = (m.annualValue || chosenSystems.size) ? ils(m.price) : '—';
  el('s_price').textContent = priceTxt;
  el('s_price_top').textContent = priceTxt; // the headline copy in the document bar
  el('s_payback').textContent = m.payback ? m.payback.toFixed(1) : '—';
  el('s_band').textContent = m.annualValue
    ? ils(m.low) + ' – ' + ils(m.high)
    : 'טווח הגנה';

  // side-by-side of every method that has data, so an inflated input shows up
  // as an outlier instead of quietly setting the price
  const tri = el('triangulate');
  if (m.available.length) {
    tri.innerHTML = '<div class="tri-h">מה כל שיטה אומרת</div>' +
      m.available.map(k => {
        const x = m.M[k], on = k === m.method;
        return '<div class="tri-row' + (on ? ' on' : '') + '">' +
          '<span class="tri-n">' + x.label + (on ? ' · נבחרה' : '') + '</span>' +
          '<span class="tri-v">' + ils(x.value) + '</span>' +
          '<span class="tri-b">' + x.basis +
          (x.raised ? ' · הועלה לרצפת העלות ' + ils(m.costFloor) +
                      ', השיטה עצמה נתנה ' + ils(x.raw) : '') + '</span></div>';
      }).join('') +
      // A big gap between cost and value is the point of value pricing, not an
      // error — warning on it would teach distrust of exactly the case that pays.
      // What deserves a warning is the one input the client invents on the spot.
      (m.errShare > 0.55 ? '<div class="tri-warn">' + Math.round(m.errShare * 100) +
        '% מהערך השנתי מגיע מהערכת התקלות בשאלה 6 — מספר שהלקוח שלף בעל פה. ' +
        'המחיר שלך תלוי בו יותר מאשר בכל השאר. בקש ממנו דוגמה אחת קונקרטית לפני שאתה שולח.</div>' : '') +
      provenanceWarning(m) +
      (m.M.cost && m.M.market && Math.max(m.M.cost.value, m.M.market.value) /
        Math.min(m.M.cost.value, m.M.market.value) >= 2
        ? '<div class="tri-warn">אומדן העלות שלך רחוק מטווח השוק. או שהאומדן שגוי, ' +
          'או שהתעריף שלך לא מתאים לסוג העבודה הזה.</div>' : '');
  } else tri.innerHTML = '';

  /* Which method pays most is a property of THIS deal, not a general truth.
     Value pricing wins when the process is worth a lot relative to the build,
     and loses to plain cost pricing when it isn't. Saying "value always yields
     more" while the screen shows it yielding least is how a tool loses trust. */
  const rec = el('recommend');
  if (!m.best || m.available.length < 2) {
    rec.innerHTML = '';
  } else if (m.best === m.method) {
    rec.innerHTML = '<div class="ok"><b>זו גם השיטה שמניבה הכי הרבה כאן</b> מבין אלה שיש לך נתונים עבורן, ' +
      'בלי לחרוג ממה שניתן להגנה מול הלקוח.</div>';
  } else {
    const gap = m.M[m.best].value - m.price;
    rec.innerHTML = '<div class="ok"><b>' + m.M[m.best].label + ' מניבה כאן ' + ils(gap) + ' יותר</b> ' +
      '(' + ils(m.M[m.best].value) + ' מול ' + ils(m.price) + '), ועדיין בטווח שניתן להגנה. ' +
      (m.best === 'value'
        ? 'תמחור לפי ערך מציב את העוגן על מה שהתהליך עולה ללקוח במקום על התעריף שלך, וזה מה שמזיז את המספר.'
        : 'בעסקה הזאת הערך של התהליך קטן מדי מכדי שתמחור לפי ערך ינצח. זה לא תמיד המצב.') +
      '</div>';
  }
  if (!m.annualValue && m.method !== 'value') {
    rec.innerHTML += '<div class="ok">אין לך עדיין את המספרים לתמחור לפי ערך. ' +
      'שאלות 2, 3, 4 ו-6 הן מה שפותח אותו — ובעסקאות שבהן התהליך יקר, זו השיטה שמזיזה הכי הרבה כסף.</div>';
  }

  const v = el('verdict');
  if (!m.annualValue) {
    v.innerHTML = '<div class="ok">מלא את שאלות 2, 3 ו-4 וקבל את המספר. שאלה 6 מוסיפה לו את ערך התקלות.</div>';
  } else if (m.tooThin) {
    v.innerHTML = '<div class="flag"><b>הבנייה יקרה מהערך שהיא מייצרת.</b> ' +
      'עלות הבנייה מחייבת אותך לגבות לפחות ' + ils(m.price) + ', אבל תהליך ששווה ' +
      ils(m.annualValue) + ' בשנה מצדיק עד ' + ils(m.high) + ' לכל היותר. ' +
      'בסקופ הזה הלקוח לא מחזיר את ההשקעה בזמן סביר. צמצם לחלק אחד של התהליך שבו רוב הזמן נשרף, ' +
      'או אמור לו בשיחה שזה לא משתלם. הצעה שלא מחזירה את עצמה חוזרת אליך כתלונה.</div>';
  } else if (m.payback > 20) {
    v.innerHTML = '<div class="flag"><b>ההחזר איטי, ' + m.payback.toFixed(0) + ' שבועות.</b> ' +
      'רוב פרויקטי האוטומציה מחזירים תוך 4 עד 12 שבועות. צמצם סקופ או הורד מחיר, ' +
      'אחרת הלקוח יגלה את זה בעצמו אחרי החתימה.</div>';
  } else {
    v.innerHTML = '<div class="ok"><b>ההחזר תוך ' + m.payback.toFixed(1) + ' שבועות.</b> ' +
      'המשפט לשיחה: "התהליך הזה עולה לך בערך ' + ils(m.annualValue) +
      ' בשנה. ההשקעה מחזירה את עצמה תוך פחות מ' +
      (m.payback < 4 ? '-חודש' : '-' + Math.ceil(m.payback / 4.3) + ' חודשים') + '."</div>';
  }
  renderClientRead();
  renderProposal();
  renderViz();
  renderGuide();
  if (!el('sendBox').classList.contains('hidden')) renderSend();
});

/* ---------- the guide ----------
   The page no longer expects anyone to know what to do with it. One
   instruction is on screen at all times, it takes you to the exact field it
   is about, and it opens whatever drawer that field is hiding in — because
   "go fill question 6" is only an instruction to someone who already knows
   where question 6 is. */
let scopeConfirmed = false, skipped = new Set();

function guideState(){
  return {
    process: txt('q_process'),
    freq: num('q_freq'),
    freqUnit: parseFloat(el('q_freq_unit').value),
    minutes: num('q_minutes'),
    systems: [...chosenSystems],
    errFreq: num('q_err_freq'),
    errCost: num('q_err_cost'),
    numbersAreMine: el('q_provenance').value === 'mine',
    comparableLast: num('c_last'),
    scopeConfirmed,
    client: txt('q_client'),
    sent: false
  };
}

/* Takes you there, opens what is closed, and puts the cursor in the field.
   Every one of those three is a thing a first-time user would otherwise have
   to work out on their own. */
function goTo(anchor, fields){
  const n = el(anchor); if (!n) return;
  let d = n.closest('details');
  while (d) { d.open = true; d = d.parentElement && d.parentElement.closest('details'); }

  // the first field of this step that is still blank, not simply the first
  const empty = (fields || []).map(el).find(f => f && !String(f.value).trim());
  const target = empty ||
    (/INPUT|TEXTAREA|SELECT/.test(n.tagName) ? n : n.querySelector('input,textarea,button'));

  setTimeout(() => {
    (target || n).scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (target && target.focus) target.focus({ preventScroll: true });
    const glow = target && target.classList ? target : n;
    glow.classList.add('pointed');
    setTimeout(() => glow.classList.remove('pointed'), 2400);
  }, 60);
}

const renderGuide = guard('guide', function (){
  const box = el('guideBar'); if (!box) return;
  let g = PC.guide.next(guideState());

  // a step the user explicitly skipped is not offered again on every keystroke
  if (g.suggestion && skipped.has(g.suggestion.stepId)) g = Object.assign({}, g, { suggestion: null });
  if (skipped.has(g.stepId) && g.optional) {
    g = PC.guide.next(Object.assign(guideState(), { errFreq: 1, errCost: 1 }));
  }

  box.className = 'guide' + (g.ready ? ' ready' : '');
  box.innerHTML =
    '<div class="guide-top">' +
      // an optional step must not claim a number in the sequence — saying
      // "step 5 of 5" over something skippable is a small lie that costs
      // trust exactly where the user has none to spare
      '<span class="guide-step">' + (g.ready && g.stepId === 'send' ? 'הכול מוכן'
        : g.optional ? 'לא חובה, אבל שווה'
        : 'שלב ' + g.index + ' מתוך ' + g.total) + '</span>' +
      '<span class="guide-t">' + esc(g.title) + '</span>' +
    '</div>' +
    '<div class="guide-ask">' + esc(g.ask) + '</div>' +
    (g.why ? '<div class="guide-why">' + esc(g.why) + '</div>' : '') +
    '<div class="guide-acts">' +
      // a step that names an action is dispatched, not navigated to
      (g.act
        ? '<button type="button" class="act" data-act="' + esc(g.act) + '">' + esc(g.cta) + '</button>'
        : '<button type="button" class="act" data-act="goto" data-anchor="' + g.anchor +
          '" data-fields="' + esc(g.fields.join(',')) + '">' + esc(g.cta) + '</button>') +
      (g.optional ? '<button type="button" class="guide-skip" data-act="skip" data-step="' +
        g.stepId + '">לדלג על זה</button>' : '') +
    '</div>' +
    // a suggestion sits under the instruction, never instead of it
    (g.suggestion ? '<div class="guide-sug"><b>אפשר לחדד:</b> ' + esc(g.suggestion.title) + '. ' +
      esc(g.suggestion.why) +
      '<span class="guide-sug-a"><button type="button" class="ghost" data-act="goto" ' +
      'data-anchor="' + g.suggestion.anchor + '" data-fields="' +
      esc(g.suggestion.fields.join(',')) + '">' + esc(g.suggestion.cta) + '</button>' +
      '<button type="button" class="guide-skip" data-act="skip" data-step="' +
      g.suggestion.stepId + '">לא צריך</button></span></div>' : '') +
    g.problems.map(pr =>
      '<div class="guide-prob"><span>' + esc(pr.text) + '</span>' +
      '<button type="button" class="ghost" data-act="goto" data-anchor="' + pr.field + '">' +
      'לתקן</button></div>').join('') +
    '<div class="guide-bar"><div class="guide-fill"></div></div>' +
    '<div class="guide-dots">' + g.steps.map(st =>
      '<span class="guide-dot' + (st.complete ? ' done' : '') +
      (st.id === g.stepId ? ' now' : '') + '">' +
      (st.complete ? '✓ ' : '') + esc(st.short) + '</span>').join('') + '</div>';

  /* The bar's width is set through the CSSOM rather than an inline style
     attribute: style-src 'self' blocks the attribute in parsed markup but not
     a property assignment, and the class-based alternative would be a
     hundred and one width classes. */
  const fill = box.querySelector('.guide-fill');
  if (fill) fill.style.width = g.percent + '%';
});

function confirmScope(){
  confirmScopeSilently();
  saveDraftSoon();
  renderGuide();
  const g = PC.guide.next(guideState());
  if (g.anchor && g.stepId !== 'scope') goTo(g.anchor, g.fields);
}

function skipStep(id){ skipped.add(id); renderGuide(); }

function resetScopeConfirm(){
  scopeConfirmed = false;
  const w = el('scopeConfirmBtn');
  if (w) { w.textContent = 'עברתי על הרשימה, ממשיכים'; w.parentElement.classList.remove('done'); }
}

function resetGuide(){
  resetScopeConfirm();
  skipped.clear(); methodPinned = false;
  show('sendBox', false);
  renderGuide();
}

/* Restoring a draft must bring the confirmation back without jumping the
   page to wherever the next step happens to be — the operator is reading, not
   acting, in the first second after a reload. */
function confirmScopeSilently(){
  scopeConfirmed = true;
  const w = el('scopeConfirmBtn');
  if (w) { w.textContent = '✓ אושר'; w.parentElement.classList.add('done'); }
}

/* ---------- reading the specific client ----------
   Everything here comes off answers already given. The panel exists because
   a document that quietly rewrote its own payment terms is worse than one
   that never adapted: the operator sends it either way, and only a visible
   inference is one they can catch. */
let clientOverride = 'auto';

function clientProfile(){
  return PC.client.applyOverride(PC.client.read({
    systems: [...chosenSystems],
    freq: num('q_freq'),
    freqUnit: parseFloat(el('q_freq_unit').value),
    decider: txt('q_decider'),
    prev: txt('q_prev'),
    trigger: txt('q_trigger'),
    deadline: txt('q_deadline'),
    provenance: el('q_provenance') ? el('q_provenance').value : ''
  }), clientOverride);
}

const SIZE_LABEL = { solo: 'עסק קטן שמנוהל ישירות', small: 'עסק קטן־בינוני',
                     mid: 'ארגון עם תהליך פנימי' };
const DECIDE_LABEL = { single: 'מחליט אחד', shared: 'שניים מחליטים',
                       committee: 'יותר מאדם אחד מחליט', unknown: 'לא ידוע מי מחליט' };

const renderClientRead = guard('client', function (){
  const box = el('clientRead'); if (!box) return;
  const p = clientProfile();
  const a = PC.client.adapt(p);

  /* The focus marks are cleared here rather than after the early return
     below. They used to be cleared only on the path that also re-applied
     them, so once the read went quiet — a template swapped, a field emptied —
     the old markers stayed on screen pointing at questions that no longer
     mattered. Measured: they survived every subsequent edit. */
  document.querySelectorAll('.focus').forEach(n => n.classList.remove('focus'));

  // nothing inferred and nothing changed — an empty panel is just noise
  if (!p.evidence.length && !a.changes.length) { show('clientRead', false); return; }

  box.innerHTML =
    '<div class="cread-h">' +
      '<span class="cread-t">הקריאה על הלקוח הזה</span>' +
      '<span class="cread-c">' + esc(SIZE_LABEL[p.size]) + ' · ' + esc(DECIDE_LABEL[p.decision]) +
        ' · ביטחון ' + Math.round(p.confidence * 100) + '%</span>' +
      '<label class="cread-o" for="clientShape">אם טעיתי</label>' +
      '<select id="clientShape">' +
        [['auto','זהה לבד'],['solo','עסק קטן'],['small','עסק קטן־בינוני'],
         ['mid','ארגון עם רכש']].map(([v, t]) =>
          '<option value="' + v + '"' + (clientOverride === v ? ' selected' : '') + '>' +
          t + '</option>').join('') +
      '</select>' +
    '</div>' +
    (p.evidence.length ? '<ul class="cread-e">' +
      p.evidence.map(e => '<li>' + esc(e) + '</li>').join('') + '</ul>' : '') +
    (a.changes.length
      ? '<div class="cread-ch"><b>מה זה שינה במסמך</b><ul>' +
        a.changes.map(c => '<li>' + esc(c) + '</li>').join('') + '</ul></div>'
      : '<div class="cread-ch cread-none">המסמך לא שונה. הקריאה הזאת לא מצדיקה סטייה מברירת המחדל.</div>');

  el('clientShape').onchange = e => { clientOverride = e.target.value; recompute(); };
  show('clientRead', true);

  // the questions that move this particular client's document, marked where
  // they already sit — moving them between drawers would cost more in lost
  // orientation than it buys in emphasis
  a.focus.forEach(id => {
    const f = el(id); if (!f) return;
    // not every question is wrapped in .qa — the provenance select sits in a
    // plain .box, and marking only .qa dropped it without a word
    const host = f.closest('.qa') || f.closest('.box');
    if (host) host.classList.add('focus');
  });
});

/* ---------- the visuals ----------
   Only what the evidence supports. See the note at the top of pc-viz.js for
   what is deliberately absent and why. */
const renderViz = guard('viz', function (){
  const box = el('vizBox'); if (!box) return;
  const v = PC.viz.forModel(model(), { numbersAreMine: el('q_provenance').value === 'mine' });
  if (!v.payback && !v.share && !v.waiting) { show('vizBox', false); box.innerHTML = ''; return; }

  let html = '';
  if (v.payback) {
    // one cell per week; the verdict is a word first and a hue second, so the
    // meaning survives a colour vision deficiency, glare, or a bad screen
    html += '<div class="viz-b"><div class="viz-h">מתי ההשקעה חוזרת ללקוח' +
      '<span class="viz-tag v-' + v.payback.verdict + '">' + esc(v.payback.verdictText) + '</span></div>' +
      '<div class="wks" role="img" aria-label="' + esc(v.payback.label) + '">' +
      Array.from({ length: v.payback.cells }, (_, i) =>
        '<i class="wk' + (i < v.payback.filled ? ' on' : '') + '"></i>').join('') +
      '</div><div class="viz-c">' + esc(v.payback.label) + '</div>' +
      '<div class="viz-s">' + esc(v.payback.sentence) + '</div></div>';
  }
  if (v.share) {
    html += '<div class="viz-b"><div class="viz-h">המחיר מול מה שזה עולה לו בשנה</div>' +
      '<div class="shr' + (v.share.over ? ' over' : '') + '" role="img" aria-label="' +
      esc(v.share.label) + '"><span class="shr-f"></span>' +
      '<span class="shr-l">' + v.share.percent + '%</span></div>' +
      '<div class="viz-s">' + esc(v.share.sentence) + '</div></div>';
  }
  if (v.waiting) {
    html += '<div class="viz-b"><div class="viz-h">' + esc(v.waiting.label) + '</div>' +
      '<div class="viz-s">' + esc(v.waiting.note) + '</div></div>';
  }
  box.innerHTML = html;
  const f = box.querySelector('.shr-f');
  if (f && v.share) f.style.width = v.share.percent + '%';   // CSSOM, not an inline attribute
  show('vizBox', true);
});

/* ---------- sending it ----------
   A = the call ended. B = the proposal is in the client's inbox. Everything
   before this closed the first half and left the second entirely to the
   operator, which is the most abandonable step in the whole journey. */
const renderSend = guard('send', function (){
  const box = el('sendBox'); if (!box) return;
  const rs = PC.send.routes({
    html: el('proposal').innerHTML,
    client: txt('q_client'), phone: txt('q_phone'), email: txt('q_email')
  });
  box.innerHTML = '<div class="send-h">לשלוח ללקוח</div>' +
    '<div class="send-rows">' + rs.map(r =>
      '<div class="send-row' + (r.ok ? '' : ' off') + '">' +
        '<button type="button" class="' + (r.ok ? 'act' : 'ghost') + '" data-act="sendvia" ' +
          'data-route="' + r.id + '"' + (r.ok ? '' : ' disabled') + '>' + esc(r.label) + '</button>' +
        '<span class="send-n">' + esc(r.note) + '</span>' +
      '</div>').join('') + '</div>' +
    '<div class="send-f">אחרי השליחה ההצעה תסומן אוטומטית כ"נשלחה" בפנקס, כדי שתדע על מה עוד לא ענו.</div>';
});

function openSend(){ show('sendBox', true); renderSend();
  el('sendBox').scrollIntoView({ behavior: 'smooth', block: 'center' }); }

function sendVia(id){
  const rs = PC.send.routes({
    html: el('proposal').innerHTML,
    client: txt('q_client'), phone: txt('q_phone'), email: txt('q_email')
  });
  const r = rs.find(x => x.id === id);
  if (!r || !r.ok) return;
  if (id === 'copy') copyProposal();
  else window.open(r.url, '_blank', 'noopener');
  // marking it sent is the point of the ledger, and asking the operator to
  // remember a second click is how a follow-up list goes stale
  markSent();
}

/* ---------- the document ---------- */
const renderProposal = guard('proposal', function (){
  el('proposal').innerHTML = PC.proposal.build({
    m: model(),
    ils,
    adapt: PC.client.adapt(clientProfile()),
    scope: { in: scopeList('in'), out: scopeList('out'), extra: scopeList('extra') },
    systems: [...chosenSystems],
    f: {
      client:   txt('q_client'),
      process:  txt('q_process'),
      trigger:  txt('q_trigger'),
      prev:     txt('q_prev'),
      decider:  txt('q_decider'),
      deadline: txt('q_deadline'),
      success:  txt('q_success')
    }
  });
});

function copyProposal(){
  const t = el('proposal').innerText;
  const done = ok => { const f = el('cpFlag');
    f.textContent = ok ? 'הועתק' : 'ההעתקה נכשלה, סמן והעתק ידנית';
    f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 2200); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(() => done(true)).catch(() => fallbackCopy(t, done));
  } else fallbackCopy(t, done);
}
function fallbackCopy(t, done){
  const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch(e){}
  document.body.removeChild(ta); done(ok);
}

/* ---------- the unfinished draft ----------
   Separate from the ledger on purpose: the ledger holds what you chose to
   save, this holds what you have not finished. A reload used to cost the
   whole session — measured, not theorised. */
let draftTimer = null, draftWarned = false;

function collectDraft(){
  const fields = {};
  PC.DRAFT_FIELDS.forEach(id => { const f = el(id); if (f) fields[id] = f.value; });
  return { fields, systems: [...chosenSystems], scope: scopeState,
           template: activeTemplate, dealId: currentDealId, override: clientOverride,
           scopeConfirmed };
}

function saveDraft(){
  if (!PC.draft) return;
  if (PC.draft.save(collectDraft())) { draftWarned = false; return; }
  if (draftWarned) return;
  draftWarned = true;
  flashDoc('הדפדפן חוסם שמירה — הטיוטה לא תשרוד רענון');
}
// debounced: one write per pause, not one per keystroke
function saveDraftSoon(){ clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 500); }

/* The form exactly as it comes up, read off the page before anything is
   restored into it. Everything compares against this instead of against a
   hand-written list of defaults, which would go stale the first time a
   select's initial value changed. */
const PRISTINE = (() => {
  const o = {};
  PC.DRAFT_FIELDS.forEach(id => { const f = el(id); if (f) o[id] = f.value; });
  return o;
})();

/* One place that puts a saved shape back on the form. Both the draft restore
   and reopening a saved deal go through it, so the two cannot drift into
   restoring different subsets of the same state. */
function applyDraft(d){
  if (!d) return;
  Object.entries(d.fields || {}).forEach(([id, v]) => { const f = el(id); if (f) f.value = v; });
  selectSystems(d.systems || []);
  scopeState = Object.assign(defaultScopeState(), d.scope || {});
  activeTemplate = d.template || null;
  clientOverride = d.override || 'auto';
  methodPinned = false;
  skipped.clear();
  show('customRateWrap', el('q_role').value === 'custom');
  if (d.scopeConfirmed) confirmScopeSilently(); else resetScopeConfirm();
}

function restoreDraft(){
  if (!PC.draft) return;
  const d = PC.draft.load();
  if (PC.draft.isEmpty(d, PRISTINE)) return;

  applyDraft(d);
  currentDealId = d.dealId || null;

  /* Announced, never silent. A form that fills itself on load with no
     explanation is indistinguishable from a form showing the wrong client —
     and the operator is about to send whatever is on it. */
  const bar = el('draftNote');
  if (bar) {
    bar.innerHTML = 'שוחזרה טיוטה שלא הסתיימה' +
      (PC.draft.age(d) ? ' · נשמרה ' + esc(PC.draft.age(d)) : '') +
      ' <button type="button" class="ghost" data-act="discard">התחל מחדש</button>';
    show('draftNote', true);
  }
}

function discardDraft(){
  PC.draft && PC.draft.clear();
  show('draftNote', false);
  newDeal();
}

/* ---------- optional telemetry ----------
   The page is fully functional with no network at all — this is additive and
   silent on failure. Buckets only: no client names, no proposal text, no exact
   prices. If the endpoint is absent (opened from file://, or deployed without
   the function) nothing happens and nothing breaks. */
function track(event, extra){
  try {
    if (location.protocol === 'file:') return;
    const m = model();
    fetch('/api/event', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(Object.assign({
        event, method: m.method, systems: chosenSystems.size,
        price: m.price, provenance: el('q_provenance') ? el('q_provenance').value : null
      }, extra || {}))
    }).catch(() => {});
  } catch (e) {}
}

/* ---------- event wiring ----------
   Inline onclick attributes are blocked by the shipped Content Security Policy
   (script-src 'self'), which would have left every button in the document bar
   dead in production. Delegation from one listener also survives the ledger and
   scope re-rendering their own markup. */
const ACTIONS = {
  copy:    () => requireKey(copyProposal),
  print:   () => requireKey(() => window.print()),
  save:    saveCurrentDeal,
  sent:    markSent,
  unlock:  tryUnlock,
  newdeal: newDeal,
  discard: discardDraft,
  confirmscope: confirmScope,
  send:    () => requireKey(openSend)
};
document.addEventListener('click', e => {
  // the guide's own buttons carry where to go, so they are handled first
  const g = e.target.closest('[data-anchor]');
  if (g) { e.preventDefault();
    goTo(g.dataset.anchor, (g.dataset.fields || '').split(',').filter(Boolean)); return; }
  const sk = e.target.closest('[data-step]');
  if (sk && sk.dataset.act === 'skip') { e.preventDefault(); skipStep(sk.dataset.step); return; }
  const sv = e.target.closest('[data-route]');
  if (sv) { e.preventDefault(); sendVia(sv.dataset.route); return; }

  const d = e.target.closest('[data-deal]');
  if (d) {
    e.preventDefault();
    const id = d.dataset.deal, st = d.dataset.status;
    if (st === '__remove') removeDeal(id);
    else if (st === '__outcome') saveOutcome(id);
    else if (st === '__open') loadDeal(id);
    else setDealStatus(id, st);
    return;
  }
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const fn = ACTIONS[t.dataset.act];
  if (fn) { e.preventDefault(); fn(); }
});

document.querySelectorAll('input,select,textarea').forEach(n => {
  n.addEventListener('input', recompute);
  n.addEventListener('input', saveDraftSoon);
});

/* ---------- start ----------
   Every module is loaded by now, so first render happens here rather than at
   the bottom of whichever file happened to define the function. */
mountGate();
renderTemplates();
restoreDraft();   // before the first render, so the page comes up as it was left
renderScope();
recompute();   // recompute drives the method, the client read and the document
renderGuide();
renderLedger();
track('opened');
