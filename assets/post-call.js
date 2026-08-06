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
    renderProposal();
  });
});

/* ---------- method selector ---------- */
const mc = el('methodChips');
mc.dataset.sel = 'value';
Object.entries(METHODS).forEach(([key, m]) => {
  const c = document.createElement('button');
  c.type = 'button';
  c.className = 'chip' + (key === 'value' ? ' on' : '');
  c.textContent = m.name; c.dataset.k = key;
  c.setAttribute('aria-pressed', String(key === 'value'));
  c.onclick = () => {
    mc.dataset.sel = key;
    [...mc.children].forEach(x => { const sel = x.dataset.k === key;
      x.classList.toggle('on', sel); x.setAttribute('aria-pressed', String(sel)); });
    el('methodHint').textContent = m.hint;
    show('m_comparable_in', key === 'comparable');
    show('m_cost_in', key === 'cost');
    recompute();
  };
  mc.appendChild(c);
});
el('methodHint').textContent = METHODS.value.hint;

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
  renderProposal();
});

/* ---------- the document ---------- */
const renderProposal = guard('proposal', function (){
  el('proposal').innerHTML = PC.proposal.build({
    m: model(),
    ils,
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
  newdeal: newDeal
};
document.addEventListener('click', e => {
  const d = e.target.closest('[data-deal]');
  if (d) {
    e.preventDefault();
    const id = d.dataset.deal, st = d.dataset.status;
    if (st === '__remove') removeDeal(id);
    else if (st === '__outcome') saveOutcome(id);
    else setDealStatus(id, st);
    return;
  }
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const fn = ACTIONS[t.dataset.act];
  if (fn) { e.preventDefault(); fn(); }
});

document.querySelectorAll('input,select,textarea').forEach(n =>
  n.addEventListener('input', recompute));

/* ---------- start ----------
   Every module is loaded by now, so first render happens here rather than at
   the bottom of whichever file happened to define the function. */
mountGate();
renderTemplates();
renderScope();
recompute();
renderLedger();
track('opened');
