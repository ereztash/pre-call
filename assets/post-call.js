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

var tr = (typeof PC !== 'undefined' && PC.i18n) ? PC.i18n.tr
  : function (s, p) { if (p) for (var k in p) s = s.split('{' + k + '}').join(p[k]); return s; };

const { SYSTEMS, METHODS, SCOPE_ITEMS, SCOPE_LABEL, PRESETS, EXAMPLES, TEMPLATES,
        visibleScope, defaultScopeState, scopeStateFor } = PC.catalog;
const ils = PC.model.ils;

/* ---------- selection state ---------- */
const chosenSystems = new Set();
let scopeState = defaultScopeState();

/* Twelve of the nineteen scope rows carry a `why` — a sentence teaching the
   seller why the default is what it is. That teaching is the product's whole
   differentiation and none of it is deleted. It is just no longer all on
   screen at once.

   Every row arrives already decided, and the instruction for this step is
   "change only what does not fit". So at rest the reader needs nineteen short
   labels to skim, not nineteen labels plus a hundred and fifty words of
   argument — and this is the step where the median user leaves, measured in
   docs/words.md. The reasons appear on one button, for whoever is deciding
   rather than confirming.

   One control for all of them rather than a disclosure per row: nineteen
   triangles would replace the words with the same amount of chrome, which is
   the trade docs/design-persona.md exists to refuse. */
let scopeWhy = false;
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

/* One row of the note: what moved, where it landed, and why — the label read
   out of SCOPE_ITEMS rather than retyped, so renaming a row cannot leave the
   note describing a name that no longer exists. */
function noteRow(id, state, why, kind){
  const item = SCOPE_ITEMS.find(x => x.id === id);
  return '<li class="tpl-move tpl-move-' + kind + '">' +
    '<span class="tpl-move-t">' + esc(item ? item.t : id) + '</span>' +
    '<span class="tpl-move-s tpl-s-' + esc(state) + '">' + esc(SCOPE_LABEL[state] || state) + '</span>' +
    '<span class="tpl-move-w">' + esc(why) + '</span></li>';
}

function templateNote(t){
  const n = t.note || {};
  const moves = Object.entries(n.moves || {})
    .map(([id, why]) => noteRow(id, t.scope[id], why, 'moved'));
  /* rows that did NOT move and are worth a second look anyway — the premium
     surcharge, the policy change a client will try to call a bug */
  const watch = Object.entries(n.watch || {})
    .map(([id, why]) => {
      const item = SCOPE_ITEMS.find(x => x.id === id);
      return noteRow(id, item ? item.d : '', why, 'watch');
    });
  return '<b class="tpl-note-h">' + esc(t.name) + '</b>' +
    (moves.length ? '<ul class="tpl-moves">' + moves.join('') + '</ul>' : '') +
    (watch.length ? '<ul class="tpl-moves tpl-watch">' + watch.join('') + '</ul>' : '') +
    (n.tip ? '<p class="tpl-tip">' + esc(n.tip) + '</p>' : '');
}

function applyTemplate(id){
  const t = TEMPLATES.find(x => x.id === id);
  if (!t) return;
  activeTemplate = t.id;

  selectSystems(t.systems);
  Object.entries(t.fields).forEach(([k, v]) => { const f = el(k); if (f) f.value = v; });
  Object.entries(t.numbers).forEach(([k, v]) => { const f = el(k); if (f) f.value = v; });
  // applied over the defaults, never over whatever the last template left
  scopeState = scopeStateFor(t);

  /* The template note used to be one paragraph of 48-70 words explaining two
     or three scope decisions in prose. Every one of them opened by naming the
     row it was about — "מקרי קצה עברו לבתוספת" — which is a sentence spent
     restating something the row itself already says, and which drifts the
     first time a row is renamed in SCOPE_ITEMS.

     It is now the same decisions as a list keyed by scope id: the label comes
     from SCOPE_ITEMS, the destination comes from the template's own scope
     object, and the note carries only the reasoning. Half the words, none of
     the reasoning lost, and catalog.test.js can now assert that the note
     explains exactly the moves the template actually makes — which the old
     `note.length > 60` could never do. */
  const note = el('tplNote');
  if (note) {
    note.innerHTML = templateNote(t) +
      '<span class="tpl-caveat">' +
      tr('המספרים כאן טיפוסיים, לא נמדדו אצל הלקוח שלך. תקן אותם מולו — הם קיימים כדי שיהיה מה לתקן, לא כדי להישלח כמו שהם.') +
      '</span>';
    show('tplNote', true);
  }
  renderTemplates();
  renderScope();
  recompute();
  saveDraft();   // immediately: a template rewrites everything at once
  track('template_used');
  const doc = el('proposal');
  if (doc) scrollToEl(doc, 'start');
}

function clearTemplateChoice(){
  activeTemplate = null;
  show('tplNote', false);
  renderTemplates();
}

/* ---------- the call itself ----------
   The language model lives wherever the operator already has one. The tool
   writes the prompt and reads the answer, which keeps this feature free of a
   backend, of a key, and of any claim about where the transcript went — the
   operator decides that. See the note at the top of pc-transcript.js for why
   nothing here applies itself. */
let trCandidates = [], trRejected = new Set();

function trText(){ const t = el('trIn'); return t ? t.value : ''; }

function showPrompt(){
  const t = trText().trim();
  if (!t) { flashDoc(tr('קודם הדבק את התמלול')); goTo('trIn'); return; }
  const box = el('trPrompt');
  box.innerHTML =
    '<div class="tr-h">' + tr('1 · העתק את זה והרץ ב-Claude או ב-ChatGPT') + '</div>' +
    '<pre class="tr-p" id="trPromptText"></pre>' +
    '<div class="tr-acts"><button type="button" class="act" data-act="trcopy">' + tr('העתק את הפרומפט') + '</button>' +
    '<span class="copied" id="trFlag">' + tr('הועתק') + '</span></div>' +
    '<div class="tr-h mt14">' + tr('2 · הדבק כאן את מה שחזר') + '</div>' +
    '<textarea id="trOut" aria-label="' + tr('הפלט מהחילוץ') + '" placeholder="' + tr('הדבק כאן את התשובה...') + '"></textarea>' +
    '<div class="tr-acts"><button type="button" class="act" data-act="trparse">' + tr('הצג מה נמצא') + '</button></div>';
  // textContent, never innerHTML: the prompt contains the transcript verbatim
  el('trPromptText').textContent = PC.transcript.buildPrompt(t);
  show('trPrompt', true);
  scrollToEl('trPrompt', 'nearest');
}

function copyPrompt(){
  const txt = el('trPromptText') ? el('trPromptText').textContent : '';
  const done = ok => { const f = el('trFlag'); if (!f) return;
    f.textContent = ok ? tr('הועתק') : tr('ההעתקה נכשלה, סמן והעתק ידנית');
    f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 2200); };
  if (navigator.clipboard && navigator.clipboard.writeText)
    navigator.clipboard.writeText(txt).then(() => done(true)).catch(() => fallbackCopy(txt, done));
  else fallbackCopy(txt, done);
}

function parseExtraction(){
  const out = el('trOut') ? el('trOut').value : '';
  const fields = PC.transcript.parseExtraction(out);
  if (!fields) { flashDoc(tr('לא הצלחתי לקרוא את הפלט. ודא שהעתקת את כל התשובה.')); return; }
  trCandidates = PC.transcript.candidates(fields, trText());
  trRejected.clear();
  if (!trCandidates.length) { flashDoc(tr('לא נמצא שום ערך עם ציטוט')); return; }
  renderReview();
  track('transcript_parsed');
}

function localExtraction(){
  const t = trText().trim();
  if (!t) { flashDoc(tr('קודם הדבק את התמלול')); goTo('trIn'); return; }
  trCandidates = PC.transcript.heuristics(t);
  trRejected.clear();
  if (!trCandidates.length) {
    flashDoc(tr('לא נמצאו מספרים ברורים. עדיף דרך הפרומפט.')); showPrompt(); return;
  }
  renderReview();
}

function loadDemo(){
  el('trIn').value = PC.example.TRANSCRIPT;
  const fields = PC.transcript.parseExtraction(PC.example.EXTRACTION);
  trCandidates = PC.transcript.candidates(fields, PC.example.TRANSCRIPT);
  trRejected.clear();
  renderReview();
  track('example_loaded');
}

const SPEAKER = { client: tr('הלקוח אמר'), seller: tr('אתם אמרתם'), unknown: tr('לא ידוע מי אמר') };

/* Every row shows the sentence it came from. That is the whole point: a
   number you cannot trace is the thing this tool exists to keep out of a
   price, and an extraction step is the easiest way to let one back in. */
const renderReview = guard('transcript', function (){
  const box = el('trReview'); if (!box) return;
  if (!trCandidates.length) { show('trReview', false); box.innerHTML = ''; return; }
  const prov = PC.transcript.provenance(
    trCandidates.filter(c => !trRejected.has(c.key)), trText());

  box.innerHTML =
    '<div class="tr-h">' + tr('3 · עבור על מה שנמצא ואשר') + '</div>' +
    '<p class="hint-p">' + tr('כל שורה עם המשפט שממנו היא נלקחה. מה שלא מתאים — הסר, ומה שחסר תמלא ידנית אחר כך.') + '</p>' +
    trCandidates.map(c => {
      const off = trRejected.has(c.key);
      return '<div class="tr-row' + (off ? ' off' : '') + '">' +
        '<div class="tr-v"><b>' + esc(c.label) + ':</b> ' +
          esc(c.kind === 'list' ? c.value.join(', ') : String(c.value)) +
          (c.guessed ? '<span class="tr-tag t-guess">' + tr('ניחוש מקומי') + '</span>' : '') +
          (!c.verified ? '<span class="tr-tag t-unver">' + tr('הציטוט לא נמצא בתמלול — קרא בעצמך') + '</span>' : '') +
        '</div>' +
        '<div class="tr-q">«' + esc(c.quote) + '»<span class="tr-s">' +
          esc(SPEAKER[c.speaker]) + '</span></div>' +
        '<button type="button" class="ghost tr-x" data-act="trtoggle" data-key="' +
          esc(c.key) + '">' + (off ? tr('להחזיר') : tr('להסיר')) + '</button>' +
      '</div>';
    }).join('') +
    '<div class="tr-prov"><b>' + tr('מאיפה הגיעו המספרים:') + '</b> ' + esc(prov.why) + '. ' +
      esc(prov.value === 'unprompted'
        ? tr('זה המצב החזק ביותר — המחיר יישען על מה שהוא עצמו אמר.')
        : prov.value === 'prompted'
        ? tr('הכלי יסמן את זה, כי מספר שנאמר אחרי שאלה עשוי למדוד את השאלה ולא את העסק.')
        : tr('הכלי לא ייתן למספר הזה להיכנס למסמך כהצדקה.')) + '</div>' +
    '<div class="tr-acts"><button type="button" class="act" data-act="trapply">' + tr('מלא את הטופס') + '</button>' +
    '<span class="hint-p">' + tr('אפשר לשנות הכול אחר כך.') + '</span></div>';
  show('trReview', true);
});

function toggleRow(key){
  trRejected.has(key) ? trRejected.delete(key) : trRejected.add(key);
  renderReview();
}

function applyExtraction(){
  const keep = trCandidates.filter(c => !trRejected.has(c.key));
  if (!keep.length) { flashDoc(tr('לא נשאר מה למלא')); return; }
  const st = PC.transcript.toState(keep);
  appliedCites = keep;   // the evidence outlives the confirmation
  Object.entries(st.fields).forEach(([id, v]) => { const f = el(id); if (f) f.value = v; });
  if (st.systems.length) selectSystems(matchSystems(st.systems));

  // the one field the transcript answers better than the operator can
  const prov = PC.transcript.provenance(keep, trText());
  if (el('q_provenance')) el('q_provenance').value = prov.value;

  show('customRateWrap', el('q_role').value === 'custom');
  renderScope(); recompute(); renderGuide(); saveDraft();
  track('transcript_applied');
  flashDoc(tr('הטופס מולא מהשיחה'));
  scrollToEl('proposal', 'start');
}

/* A transcript says "מורנינג"; the chip says "חשבונית ירוקה / מורנינג". Match
   on any word in common rather than on equality, or every system the call
   actually named would be silently dropped. */
function matchSystems(names){
  const norm = s => String(s).toLowerCase().replace(/[^\wא-ת ]/g, ' ').split(/\s+/).filter(w => w.length > 2);
  return SYSTEMS.filter(sys => {
    const a = norm(sys);
    return names.some(n => norm(n).some(w => a.includes(w)));
  });
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
  c.textContent = tr('מלא דוגמה ואז ערוך');
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
/* ---------- what is in, and what is out ----------

   This section used to be seventeen rows of three buttons — fifty-one
   controls, 37% of every interactive element on the page, more than the
   entry page and PRE-CALL and the privacy page have between them.

   The argument against that is not the count. It is that the section's
   own copy already said the opposite of what the layout did: "כל שורה
   כבר מסומנת ... משנים רק מה שלא מתאים", and under the list, "רוב הפעמים
   אין מה לשנות". A step the product describes as a review was rendered as
   seventeen open questions, with every answer given equal weight and the
   current state legible only by decoding which of three chips was lit.

   Two things follow from taking the copy seriously. The state belongs in
   the structure rather than in a highlight — group the items and you can
   see at a glance what you are committing to. And the shape should be the
   shape of the artefact: the proposal prints exactly these three lists,
   so editing them in three lists means the operator is looking at the
   document while they work rather than at a control panel that produces
   one.

   Each row now carries only the moves that are actually available to it —
   two rather than three, because the state it is already in is not a
   move. Fifty-one controls become thirty-four, and the ones that remain
   read as actions on an item instead of as a choice between three equals. */
const SCOPE_GROUPS = [
  { s: 'in',    mark: '✓', h: tr('כלול במחיר') },
  { s: 'out',   mark: '—', h: tr('לא כלול') },
  { s: 'extra', mark: '+', h: tr('בתוספת תשלום') }
];

const renderScope = guard('scope', function (){
  const box = el('scopeBox');
  const items = visibleScope(chosenSystems);

  const withWhy = items.filter(i => i.why).length;
  const toggle = withWhy
    ? `<button type="button" class="scope-whyt" id="scopeWhyT"
         aria-pressed="${scopeWhy}" aria-controls="scopeBox"
       >${scopeWhy ? tr('הסתר נימוקים') : tr('למה ההמלצות האלה')}<span class="scope-n">${withWhy}</span></button>`
    : '';

  box.classList.toggle('show-why', scopeWhy);
  box.innerHTML = toggle + SCOPE_GROUPS.map(g => {
    const rows = items.filter(i => scopeState[i.id] === g.s);
    if (!rows.length) return '';
    return `<section class="scope-g scope-g-${g.s}" aria-labelledby="sg-${g.s}">
      <h3 class="scope-g-h" id="sg-${g.s}">
        <span class="scope-mark" aria-hidden="true">${g.mark}</span>${esc(g.h)}
        <span class="scope-n">${rows.length}</span>
      </h3>
      <ul class="scope-l">${rows.map(i => `
        <li class="scope-row">
          <div class="scope-t">${esc(i.t)}${
            i.why ? `<span class="scope-why">${esc(i.why)}</span>` : ''}</div>
          <div class="scope-btns">${
            /* only the states this item is not already in — the one it is
               in is where it lives now, not somewhere it can be sent */
            SCOPE_GROUPS.filter(o => o.s !== g.s).map(o =>
              `<button type="button" class="smove smove-${o.s}"
                 data-i="${esc(i.id)}" data-s="${o.s}"
                 aria-label="${esc(tr('{item} — העבר ל{state}', { item: i.t, state: SCOPE_LABEL[o.s] }))}"
               >${esc(SCOPE_LABEL[o.s])}</button>`).join('')
          }</div>
        </li>`).join('')}</ul>
    </section>`;
  }).join('') ||
    '<p class="lead nomargin">' + tr('אין עדיין פריטי סקופ — בחר את המערכות למעלה.') + '</p>';

  const wt = el('scopeWhyT');
  if (wt) wt.onclick = () => {
    scopeWhy = !scopeWhy;
    renderScope();
    /* focus follows the control across the re-render, or the keyboard user is
       returned to the top of the document by their own button press */
    const again = el('scopeWhyT');
    if (again) again.focus();
  };

  box.querySelectorAll('.smove').forEach(b => b.onclick = () => {
    const id = b.dataset.i, to = b.dataset.s;
    const item = items.find(i => i.id === id);
    scopeState[id] = to;
    renderScope();
    renderProposal();   // the client read does not depend on scope
    renderGuide();
    saveDraftSoon();
    announceScopeMove(item, to);
  });
});

/* Grouping the list made a move a structural change rather than a chip
   lighting up, and that quietly cost two things that the old three-button
   row had for free.

   Measured rather than reasoned about: press Enter on a move and focus
   landed on <body>. A keyboard operator lost their place completely, and
   the row they were on had meanwhile moved to a different group, so there
   was nothing to tab back to. And where the old row toggled aria-pressed
   — which a screen reader announces — nothing now said anything at all.

   Neither is visible to axe, which reads markup rather than what happens
   after an interaction, and neither breaks a rule. Both are what the
   grouping is worth minus what it took away, so both are given back:
   focus follows the item into its new group, and the move is spoken. */
function announceScopeMove(item, to){
  const box = el('scopeBox'); if (!box) return;

  /* The moved row's first control, which is the one that would send it
     back — the natural next action after a move you did not mean. Its
     accessible name carries the item and its new home, so focusing it
     also says where the row went. */
  const back = box.querySelector('.smove[data-i="' + (window.CSS && CSS.escape
    ? CSS.escape(item && item.id) : (item && item.id)) + '"]');
  if (back) back.focus();

  const say = el('scopeLive');
  if (say && item) say.textContent =
    tr('{item} — הועבר ל{state}.', { item: item.t, state: SCOPE_LABEL[to] });
}

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
    /* selectedOptions is EMPTY, not a one-element list, whenever a select holds a
       value none of its options carry — selectedIndex goes to -1 and .value goes
       to ''. Reading [0].text then throws, and it throws inside readInputs, which
       feeds model(), which feeds the price, the document, the guide and the save.
       One stale string in one dropdown produced no price, a zero-character
       document and a save button that silently did nothing, on every load.

       Nothing needs to be corrupt for that. applyDraft restores whatever a draft
       holds, so it is enough for this option list to change in a future version,
       or for a backup from an older one to be restored. The guard below is the
       local fix; the general one is in applyDraft, which now refuses a value an
       element cannot hold. */
    compScaleLabel: (el('c_scale').selectedOptions[0] || {}).text || '',
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
  /* The case that used to fall off the end of this function and return ''. The
     form's default was one of the answers, so an untouched question produced
     the 'prompted' warning — wrong, but at least a warning. With an explicit
     unanswered default it would have produced silence on the one field that
     decides whether the number may be quoted, which is worse than either. */
  if (p === 'unset') return '<div class="tri-warn"><b>' + tr('לא סימנת מאיפה הגיע המספר.') + '</b> ' +
    tr('זו השאלה שקובעת אם אפשר לצטט אותו ללקוח כמספר שלו, ועד שתסמן פסקת ההחזר לא נכנסת למסמך. העדר הסימון לא שינה את המחיר — רק את מה שנכנס למסמך.') + '</div>';
  if (p === 'prompted') return '<div class="tri-warn">' +
    tr('המספר הגיע אחרי ששאלת. ייתכן שהוא אמיתי, וייתכן שהוא נבנה בשבילך בזמן השיחה. לפני שאתה שולח מחיר שנשען עליו, שאל אותו שאלה אחת: "איך אתה יודע את זה?" — אם אין תשובה, זה אומדן ולא מדידה.') + '</div>';
  if (p === 'mine') return '<div class="tri-warn"><b>' + tr('המספר הוא שלך, לא שלו.') + '</b> ' +
    tr('תמחור לפי ערך שנשען על מספר שאתה המצאת הוא תמחור לפי עלות עם שכבת הצדקה. או שתוציא ממנו מספר, או שתתמחר לפי שיטה אחרת ותציג את הערך כהערכה מפורשת.') + '</div>';
  return '';
}

const recompute = guard('recompute', function (){
  autoMethod();          // before the model reads it
  const m = model();
  el('s_hours').textContent   = m.hours   ? Math.round(m.hours).toLocaleString('en-US') : '—';
  el('s_value').textContent   = m.annualValue ? ils(m.annualValue) : '—';
  el('s_effort').textContent  = chosenSystems.size ? m.effort : '—';
  /* Found by simulating a real archetype this gate had never been checked
     against: a repeat client, priced by a comparable past deal alone. That
     method needs neither an annual value nor a system chip — c_last ×
     c_scale is the whole basis — so the price it computes is completely
     real (verified directly against model.js) while this line still showed
     "—", the same dash a truly empty form shows. The proposal document
     itself was never wrong; only the one number the operator actually looks
     at while still on the call was. */
  const priceTxt = (m.annualValue || chosenSystems.size ||
    (m.method === 'comparable' && num('c_last'))) ? ils(m.price) : '—';
  el('s_price').textContent = priceTxt;
  /* The one micro-interaction worth having. The whole premise of the tool is
     that what you say in the room moves the number, and a figure that
     changes silently three sections above where you are typing does not
     teach that — it just quietly differs the next time you look. A brief
     beat on change makes the causal link visible, once, without a sound and
     without blocking anything. Honoured by prefers-reduced-motion. */
  const top = el('s_price_top');
  if (top.textContent !== priceTxt) {
    top.textContent = priceTxt;
    if (priceTxt !== '—') {
      top.classList.remove('bumped');
      void top.offsetWidth;              // restart the animation on a rapid edit
      top.classList.add('bumped');
    }
  }
  /* A real price is also the signal that there is something worth exporting,
     which is the only state in which telling somebody they will need a key is
     information rather than an advert. See renderKeyAhead() in pc-gate.js. */
  renderKeyAhead(priceTxt !== '—');
  el('s_payback').textContent = m.payback ? m.payback.toFixed(1) : '—';
  el('s_band').textContent = m.annualValue
    ? ils(m.low) + ' – ' + ils(m.high)
    : tr('טווח הגנה');

  /* The three checks the chain and the verdict box already compute, as a row
     next to the price that reads in the second before the operator opens
     their mouth — not after they have read a paragraph. See the comment on
     PC.flow.guardrails() for where this idea came from. */
  const guardBox = el('guardBox');
  if (guardBox) {
    const rails = PC.flow ? PC.flow.guardrails(m) : [];
    guardBox.innerHTML = rails.map(r =>
      '<span class="guard-chip ' + (r.ok ? 'ok' : 'warn') + '">' +
        (r.ok ? '✓' : '⚠') + ' ' + esc(r.label) + '</span>').join('');
    show('guardBox', rails.length > 0);
  }

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
  renderFlow();
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
/* Set when the operator arrived specifically to review proposals they have
   already sent. See applyEntryRoute() for why the guide has to know. */
let reviewingLedger = false;
// which steps were already complete last render, so only a fresh one animates
let doneSteps = new Set();

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
    /* Separate from numbersAreMine on purpose. That flag decides the pricing
       METHOD in pc-guide.js, and an unanswered question must never change the
       price — only what the tool is willing to claim. */
    numbersUnset: el('q_provenance').value === 'unset',
    comparableLast: num('c_last'),
    scopeConfirmed,
    client: txt('q_client'),
    sent: false,
    /* What this operator has actually held, so the guide can notice a price far
       above anything they have ever closed. Read here rather than inside
       pc-guide.js, which is pure and has no storage — the same arrangement the
       whole module already uses.

       `price` is the model's current number. bestClosed is the largest closing
       price on record, not the largest quote: the question the warning asks is
       "have you held a number like this", and a quote nobody accepted is not
       evidence that you have. */
    price: model().price,
    bestClosed: bestClosedPrice(),
    closedCount: closedDealCount()
  };
}

/* The two figures above, kept together because they answer one question and must
   agree about which deals count. A won deal with a recorded closing price is the
   only kind that proves anything here — a win with no outcome recorded says the
   client agreed, not what they paid. */
function closedDeals(){
  return PC.deals.list().filter(d =>
    d.status === 'won' && d.outcome && d.outcome.closedPrice > 0);
}
function bestClosedPrice(){
  const xs = closedDeals().map(d => +d.outcome.closedPrice);
  return xs.length ? Math.max.apply(null, xs) : null;
}
function closedDealCount(){ return closedDeals().length; }

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
    scrollToEl(target || n, 'center');
    if (target && target.focus) target.focus({ preventScroll: true });
    const glow = target && target.classList ? target : n;
    glow.classList.add('pointed');
    setTimeout(() => glow.classList.remove('pointed'), 2400);
  }, 60);
}

const renderGuide = guard('guide', function (){
  const box = el('guideBar'); if (!box) return;

  /* Someone who arrived to check what happened to proposals they already
     sent is not building one. Found by simulating that exact arrival: the
     ledger scrolled into view correctly, and the guide above it said
     "step 1 of 5 — describe the process" — an instruction to start a new
     proposal, stuck to the top of the screen the whole time they read the
     old ones, because the bar is position:sticky. The entry page exists to
     stop the product from answering a question nobody asked; leaving this
     in would have reintroduced exactly that one layer down.

     The moment they touch anything the flag clears and the guide returns,
     so this hides an irrelevant instruction rather than removing a
     feature. */
  if (reviewingLedger && PC.draft && PC.draft.isEmpty(collectDraft(), PRISTINE)) {
    box.innerHTML = ''; box.classList.add('hidden');
    return;
  }
  box.classList.remove('hidden');

  let g = PC.guide.next(guideState());

  // a step the user explicitly skipped is not offered again on every keystroke
  if (g.suggestion && skipped.has(g.suggestion.stepId)) g = Object.assign({}, g, { suggestion: null });
  if (skipped.has(g.stepId) && g.optional) {
    g = PC.guide.next(Object.assign(guideState(), { errFreq: 1, errCost: 1 }));
  }

  box.className = 'guide' + (g.ready ? ' ready' : '') + (guidePinned ? ' stuck' : '');
  /* Re-measure whenever the guide is in the flow and its content changed,
     so the slot keeps reserving the right amount for the next collapse. */
  if (!guidePinned) setTimeout(freezeGuideSlot, 0);
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
      (st.id === g.stepId ? ' now' : '') +
      // only a step that just flipped gets the beat; re-rendering the strip
      // on every keystroke would otherwise make the whole row twitch
      (st.complete && !doneSteps.has(st.id) ? ' just' : '') + '">' +
      (st.complete ? '✓ ' : '') + esc(st.short) + '</span>').join('') + '</div>';
  doneSteps = new Set(g.steps.filter(st => st.complete).map(st => st.id));

  /* The bar's width is set through the CSSOM rather than an inline style
     attribute: style-src 'self' blocks the attribute in parsed markup but not
     a property assignment, and the class-based alternative would be a
     hundred and one width classes. */
  const fill = box.querySelector('.guide-fill');
  if (fill) fill.style.width = g.percent + '%';
});

/* Watches the zero-height marker sitting at the guide's resting position.
   While it is visible the guide is at rest; once it leaves the top of the
   viewport the guide is pinned, and .stuck collapses it to one line — see
   the note on .guide.stuck in post-call.css for what that is worth on a
   phone. An observer rather than a scroll handler, so this costs nothing
   per frame. Browsers without IntersectionObserver simply never collapse
   it, which is exactly the behaviour they have today. */
/* Held in a variable, not only on the element. renderGuide() rebuilds the
   bar's className from scratch on every keystroke, which wiped the class
   the observer had set — and because an IntersectionObserver only fires
   when the intersection *changes*, nothing ever put it back. The result
   was worse than the problem it was meant to solve: collapsed to 66px on
   scroll, then 349px again — 52% of an iPhone SE — the moment the
   operator typed anything, and stuck there for the rest of the session.

   Found by an external reviewer reading the interaction between two
   functions. The journey test had walked the scroll and checked the
   collapse, and never typed afterwards; it does now. */
let guidePinned = false;

/* The pinned bar is position:fixed, so it leaves the flow and the slot
   has to hold its place. The slot's height is not a constant that could
   live in CSS — the guide is as tall as whatever step it is showing, and
   that changes as the operator works — so it is frozen from the real
   rendered height at the last moment the bar was in the flow.

   This is the whole fix for the bounce: collapse used to remove ~240px of
   document height, which moved every scroll target on the page while a
   scroll animation was running. Now the document is exactly as tall
   pinned as unpinned, so there is nothing for the loop to feed on. */
function freezeGuideSlot(){
  const slot = el('guideSlot'), bar = el('guideBar');
  if (!slot || !bar || guidePinned) return;
  const h = bar.getBoundingClientRect().height;
  if (h > 0) slot.style.height = h + 'px';
}

function watchGuidePin(){
  const sentinel = el('guideSentinel'), bar = el('guideBar');
  if (!sentinel || !bar || typeof IntersectionObserver === 'undefined') return;
  freezeGuideSlot();
  new IntersectionObserver(([e]) => {
    const pinning = !e.isIntersecting;
    // measure before the class lands, while the bar is still in the flow
    if (pinning && !guidePinned) freezeGuideSlot();
    guidePinned = pinning;
    bar.classList.toggle('stuck', guidePinned);
  }, { threshold: 0 }).observe(sentinel);
}

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
  appliedCites = [];
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

/* ---------- where the price came from ----------
   The citations used to evaporate at confirmation: the transcript step knew
   which sentence produced every number, the operator confirmed, and what
   remained on screen was a bare price — the exact shape of thing this tool
   argues against. They are kept now, and the chain is shown. */
let appliedCites = [];

const renderFlow = guard('flow', function (){
  const box = el('flowBox'); if (!box) return;
  const m = model();
  const rows = PC.flow.build(m, readInputs(), appliedCites);
  if (!rows.length) { show('flowBox', false); box.innerHTML = ''; return; }

  const weak = PC.flow.weakest(m);
  const head = PC.flow.headline(m, rows);
  box.innerHTML =
    '<summary>מאיפה יצא המחיר הזה' +
      (appliedCites.length ? '<span class="flow-tag">' + appliedCites.length +
        ' מספרים עם ציטוט מהשיחה</span>' : '') + '</summary>' +
    '<div class="flow-body">' +
      (head ? '<p class="flow-head">' + esc(head) + '</p>' : '') +
      rows.map((r, ix) => {
        const soft = weak && weak.id === r.id;
        return '<div class="flow-step' + (r.emphasis ? ' big' : '') + (soft ? ' soft' : '') + '">' +
          '<span class="flow-n">' + (ix + 1) + '</span>' +
          '<div class="flow-c">' +
            '<div class="flow-t">' + esc(r.title) + '</div>' +
            '<div class="flow-f">' + esc(r.formula) + '</div>' +
            '<div class="flow-o">' + esc(r.out) + '</div>' +
            (r.note ? '<div class="flow-note">' + esc(r.note) + '</div>' : '') +
            (soft ? '<div class="flow-weak">' + weak.share +
              '% מהערך נשען על הצעד הזה. אם מספר אחד כאן לא מדויק, המחיר זז איתו.</div>' : '') +
            (r.said.length ? '<div class="flow-said">' + r.said.map(q =>
              '«' + esc(q.quote) + '»<span class="flow-who">' +
              (q.speaker === 'client' ? 'הלקוח אמר' : q.speaker === 'seller' ? 'אתם אמרתם' : '') +
              '</span>').join('') + '</div>' : '') +
          '</div></div>';
      }).join('') +
    '</div>';
  show('flowBox', true);
});

/* ---------- the visuals ----------
   Only what the evidence supports. See the note at the top of pc-viz.js for
   what is deliberately absent and why. */
const renderViz = guard('viz', function (){
  const box = el('vizBox'); if (!box) return;
  const v = PC.viz.forModel(model(), {
    numbersAreMine: el('q_provenance').value === 'mine',
    numbersUnset:   el('q_provenance').value === 'unset' });
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
  /* An external review asked for this to block copy, print and send
     outright. The concern is right — the document can go out with nobody's
     name on it — but blocking is the wrong instrument here twice over.
     This product warns and never blocks, deliberately and consistently:
     implausible numbers, a price under the cost floor, a figure the
     operator invented themselves, all of them say so and let the operator
     proceed, because they are the one who knows. And there is a real case
     for exporting without a letterhead — pasting the text into a template
     that already has one.

     So senderMissing() is used, which it was not before, at the moment it
     matters: the click before it leaves. Loud, unmissable, one tap away
     from fixing, and still the operator's decision. */
  const anonymous = PC.senderMissing(readSender());

  box.innerHTML = '<div class="send-h">לשלוח ללקוח</div>' +
    (anonymous ? '<div class="send-anon"><b>אין שם על ההצעה.</b> ' +
      'הלקוח יקבל מסמך בלי מי שולח אותו ובלי דרך לחזור אליך. ' +
      '<button type="button" class="ghost" data-act="goto" data-anchor="s_name" ' +
      'data-fields="s_name,s_phone">להוסיף את השם שלי</button></div>' : '') +
    '<div class="send-rows">' + rs.map(r =>
      '<div class="send-row' + (r.ok ? '' : ' off') + '">' +
        '<button type="button" class="' + (r.ok ? 'act' : 'ghost') + '" data-act="sendvia" ' +
          'data-route="' + r.id + '"' + (r.ok ? '' : ' disabled') + '>' + esc(r.label) + '</button>' +
        '<span class="send-n">' + esc(r.note) + '</span>' +
      '</div>').join('') + '</div>' +
    '<div class="send-f">אחרי השליחה ההצעה תסומן אוטומטית כ"נשלחה" בפנקס, כדי שתדע על מה עוד לא ענו.</div>';
});

function openSend(){ show('sendBox', true); renderSend();
  scrollToEl('sendBox', 'center'); }

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

/* ---------- who is sending ----------
   Operator-level and saved once, not per deal — see pc-sender.js. Kept
   out of the draft on purpose: a draft is one unfinished proposal, this
   is who you are, and discarding the former must never clear the latter. */
function readSender(){
  const s = {};
  PC.SENDER_FIELDS.forEach(id => { const f = el(id); if (f) s[id] = f.value.trim(); });
  s.attribution = el('s_attr') ? el('s_attr').checked : true;
  return s;
}
let senderTimer = null;
function saveSenderSoon(){
  clearTimeout(senderTimer);
  senderTimer = setTimeout(() => { PC.sender && PC.sender.save(readSender()); }, 500);
}
function restoreSender(){
  const s = PC.sender && PC.sender.load();
  if (!s) return;
  PC.SENDER_FIELDS.forEach(id => { const f = el(id); if (f && s[id]) f.value = s[id]; });
  if (el('s_attr')) el('s_attr').checked = s.attribution !== false;
}

/* ---------- the document ---------- */
const renderProposal = guard('proposal', function (){
  /* Nothing entered yet means no document — not a document with the blanks
     showing. See PC.proposal.blank for why that distinction matters. */
  if (!txt('q_process') && !num('q_freq') && !chosenSystems.size) {
    const g = PC.guide.next(guideState());
    el('proposal').innerHTML = PC.proposal.blank(g.title);
    return;
  }
  el('proposal').innerHTML = PC.proposal.build({
    m: model(),
    ils,
    sender: readSender(),
    /* The same descriptions the numbers panel draws for the operator, handed to
       the document so the client gets the picture too. pc-viz.js returns
       descriptions rather than markup, which is exactly what lets it be drawn
       twice for two audiences without a second implementation.
       The document only uses `payback`; the cost-of-waiting line stays on this
       side, because a division of the client's own number is ammunition for a
       conversation, not a paragraph to put in front of them. */
    viz: PC.viz.forModel(model(), {
      numbersAreMine: el('q_provenance').value === 'mine',
      numbersUnset: el('q_provenance').value === 'unset'
    }),
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
           scopeConfirmed,
           /* Whether somebody actually answered where the number came from, as a
              sibling flag in the same shape as scopeConfirmed. It exists because
              of one irreducible ambiguity: 'prompted' used to be the form's
              default, so a stored 'prompted' cannot be told apart from an
              untouched question by looking at the value. The other three answers
              were never a default and need no flag.
              Records written before this flag existed simply lack it, which is
              exactly the reading we want — unconfirmed. */
           provenanceAnswered: el('q_provenance')
             ? el('q_provenance').value !== 'unset' : false };
}

function saveDraft(){
  if (!PC.draft) return;
  /* The emptiness verdict is stamped here rather than recomputed by whoever
     reads the draft later. The rule lives in pc-draft.js and needs PRISTINE
     — the untouched form — to tell a real answer from a select's default,
     and this page is the only place that has it. The entry page was
     re-deriving it from two fields and disagreeing with this one; an
     external review caught the divergence. One owner, one answer. */
  const state = collectDraft();
  state.hasContent = !PC.draft.isEmpty(state, PRISTINE);
  if (PC.draft.save(state)) { draftWarned = false; return; }
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
  /* A stored value is only applied if the element can actually hold it. For an
     input that is always true; for a <select> it is not, and assigning a value
     none of the options carry leaves selectedIndex at -1 with an empty
     selectedOptions — a state the reading code did not survive.

     The draft is restored at boot with no button and no confirmation, so a value
     that cannot be held would poison the first render of every visit. The option
     list changing in a future version is enough to cause it, as is a backup file
     written by an older one, and the operator would meet a page with no price and
     no document.

     Skipped rather than coerced: falling back to the first option would put a
     number in front of the operator that they never chose, on a form they are
     about to send. The default the markup already carries is the honest answer. */
  Object.entries(d.fields || {}).forEach(([id, v]) => {
    const f = el(id);
    if (!f) return;
    if (f.tagName === 'SELECT' && ![...f.options].some(o => o.value === String(v))) return;
    f.value = v;
  });
  /* Reopening a draft or a saved deal used to restore the old default verbatim,
     so the ROI paragraph went back into a client-facing document on the strength
     of a question nobody had answered — the exact thing the new default exists
     to stop, surviving in every record written before it. Raised in review.

     Only the ambiguous value is downgraded, and only when the flag is absent.
     'unprompted', 'mine' and 'none' were never a default, so restoring them
     verbatim is safe; a 'prompted' that was genuinely chosen carries the flag
     and is left alone. Nothing is rewritten in storage — this is the value on
     the form, and answering it again saves it stamped. */
  const prov = el('q_provenance');
  if (prov && !d.provenanceAnswered && prov.value === 'prompted') prov.value = 'unset';
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

/* "הצעה חדשה" in the toolbar is one click from mid-work to a blank page, with
   nothing to undo it. That is not true of the identical-looking reset in
   discardDraft() above: that one only ever fires after the draft-recovered
   banner has already told the operator a draft exists, which is its own
   warning. This button gets no such notice first, so it gets its own —
   but only when there is something real to lose. An empty or pristine form
   starts over exactly as before, with no interruption. */
function confirmNewDeal(){
  if (PC.draft && !PC.draft.isEmpty(collectDraft(), PRISTINE)) {
    if (!confirm('להתחיל הצעה חדשה? הטופס הנוכחי והטיוטה שנשמרה יימחקו.')) return;
  }
  newDeal();
}

/* ---------- backup / restore ----------
   Everything above — the deal ledger, its calibration history, the
   unfinished draft, and separately the profile in PRE-CALL — lives only in
   this browser's localStorage. See pc-backup.js for why that stops being
   acceptable once this holds a paying customer's history. Download writes
   a file the operator keeps themselves; restore shows exactly what it is
   about to overwrite before it does, and never touches the license key. */
function downloadBackup(){
  const text = PC.backup.serialize(localStorage);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'precall-postcall-backup-' + new Date().toISOString().slice(0,10) + '.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function pickBackupFile(){
  const input = el('backupFile');
  if (input) input.click();
}
function backupFlash(msg, warn){
  const box = el('backupMsg'); if (!box) return;
  box.textContent = msg;
  box.classList.toggle('u-warn', !!warn);
  box.classList.add('on');
  setTimeout(() => box.classList.remove('on'), warn ? 4000 : 2200);
}
function handleBackupFile(e){
  const file = e.target.files && e.target.files[0];
  e.target.value = ''; // choosing the same file twice must still fire 'change'
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => restoreBackup(reader.result);
  reader.onerror = () => backupFlash('לא הצלחתי לקרוא את הקובץ', true);
  reader.readAsText(file);
}
function restoreBackup(text){
  const p = PC.backup.preview(text, localStorage);
  if (!p.ok) { backupFlash('הקובץ לא נראה כמו גיבוי תקין מהכלי הזה', true); return; }
  const overwriting = p.willOverwrite.length ? '\n\nזה ידרוס: ' + p.willOverwrite.join(', ') : '';
  const at = p.at ? new Date(p.at).toLocaleDateString('he-IL') : 'תאריך לא ידוע';
  if (!confirm('לשחזר גיבוי מ-' + at + '?' + overwriting)) return;
  PC.backup.importAll(text, localStorage);
  backupFlash('שוחזר. טוען מחדש...');
  setTimeout(() => location.reload(), 600);
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
  askkey:  askForKeyAhead,
  laterkey: dismissKeyAhead,
  newdeal: confirmNewDeal,
  discard: discardDraft,
  confirmscope: confirmScope,
  send:    () => requireKey(openSend),
  trprompt: showPrompt,
  trcopy:   copyPrompt,
  trparse:  parseExtraction,
  trlocal:  localExtraction,
  trdemo:   loadDemo,
  trapply:  applyExtraction,
  retroadd:  () => addPastDeal(false),
  retrolost: () => addPastDeal(true),
  'backup-export': downloadBackup,
  'backup-import': pickBackupFile
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
  const tk = e.target.closest('[data-key]');
  if (tk && tk.dataset.act === 'trtoggle') { e.preventDefault(); toggleRow(tk.dataset.key); return; }

  const d = e.target.closest('[data-deal]');
  if (d) {
    e.preventDefault();
    const id = d.dataset.deal, st = d.dataset.status;
    if (st === '__remove') removeDeal(id);
    else if (st === '__outcome') saveOutcome(id);
    else if (st === '__ics') downloadFollowup(id);
    else if (st === '__open') loadDeal(id);
    else setDealStatus(id, st);
    return;
  }
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const fn = ACTIONS[t.dataset.act];
  if (fn) { e.preventDefault(); fn(); }
});

/* ---------- when the number is allowed to move ----------

   Every keystroke used to rebuild everything, and the cost was never the
   problem: 14.8ms median on a 4x-throttled phone, one dropped frame at worst.
   What it produced was. Typing "120" into "how often" showed, in order:

     after "1"    ₪7,390
     after "12"   ₪9,930
     after "120"  ₪99,280

   and typing "45" into "minutes each" showed ₪49,640 and then ₪558,450. Not a
   loading state and not a blank — three confident, fully formatted, wrong
   prices, each with the document rebuilt around it. For an audience this
   product describes as having low numerical literacy, half a million shekels
   flashing past is worse than nothing at all.

   Debounced for numbers only, and that distinction is the whole design: a
   truncated number is a DIFFERENT number, while a truncated sentence is only a
   shorter sentence. "הזמנות מגי" in the document is incomplete and honest;
   ₪558,450 is complete and false.

   `change` stays immediate, on every field. It fires when a text input loses
   focus and when a select is picked, so moving on always settles the number at
   once — the timer can only ever be felt by someone staring at the price while
   typing into the field that sets it.

   And it makes the bump above mean something. That animation fires on a real
   change in the price text, which during "120" meant three bumps for two
   garbage values. One settled value, one beat. */
const SETTLE_MS = 400;
let settleTimer = null;
const recomputeSoon = () => {
  clearTimeout(settleTimer);
  settleTimer = setTimeout(recompute, SETTLE_MS);
};
const NUMERIC = n => n.tagName === 'INPUT' && (n.type === 'number' || n.inputMode === 'numeric');

document.querySelectorAll('input,select,textarea').forEach(n => {
  // typing anything means they are building a proposal after all, so the
  // guide stops standing down — see reviewingLedger in renderGuide()
  n.addEventListener('input', () => { reviewingLedger = false; });
  n.addEventListener('input', NUMERIC(n) ? recomputeSoon : recompute);
  // leaving the field, or picking from a list, settles it with no wait
  n.addEventListener('change', () => { clearTimeout(settleTimer); recompute(); });
  n.addEventListener('input', saveDraftSoon);
});
// the sender's own details persist separately from the draft, and a
// checkbox fires 'change' rather than 'input'
[...PC.SENDER_FIELDS, 's_attr'].forEach(id => {
  const f = el(id); if (!f) return;
  f.addEventListener('input', saveSenderSoon);
  f.addEventListener('change', () => { PC.sender && PC.sender.save(readSender()); recompute(); });
});
const backupFileInput = el('backupFile');
if (backupFileInput) backupFileInput.addEventListener('change', handleBackupFile);

/* ---------- arriving from the entry page ----------
   The entry page asks which situation you are in, not which tool you want,
   so two of its four answers land on THIS page needing it to open in a
   particular state rather than at the top. Without this the routing is a
   lie: "see what happened to your proposals" and "show me an example"
   would both drop you at question 1 of a blank form.

   Runs after the first render, so what it scrolls to or fills is already
   on the page. */
function applyEntryRoute(){
  const wantsDemo = /(?:^|[?&])demo=1(?:&|$)/.test(location.search);
  const wantsLedger = location.hash === '#ledger';
  if (!wantsDemo && !wantsLedger) return;

  if (wantsDemo) {
    /* Never silently over an existing session — but never silently refuse
       either. Found by walking the journey in a real browser: the first
       version just declined and flashed a small notice, so somebody who
       clicked "show me an example" landed on their own half-finished
       proposal with no example and no explanation of why. Asking is the
       only version where both answers are what the person meant. */
    const busy = PC.draft && !PC.draft.isEmpty(collectDraft(), PRISTINE);
    if (busy && !confirm('יש כאן הצעה שלא סיימת. לטעון את שיחת הדוגמה במקומה?\n\nההצעה הנוכחית תוחלף.')) {
      flashDoc('הדוגמה לא נטענה. ההצעה שלך נשארה כמו שהיא.');
      return;
    }
    loadDemo();
    const box = el('trReview');
    if (box) scrollToEl(box, 'start');
    return;
  }

  /* 'auto', not 'smooth'. Arriving from a deep link is not an in-page
     navigation — the person asked to be AT the ledger, so animating them
     there means the page visibly lurches a beat after it settles. It was
     also measurably unreliable: the smooth version landed in Firefox and
     WebKit and silently did not in Chromium, found by running the journey
     in all three rather than in the one that happened to be installed. */
  reviewingLedger = true;   // renderGuide reads this — see the note there
  renderGuide();
  const box = el('ledgerBox');
  if (box) box.scrollIntoView({ block: 'start' });
}

/* ---------- start ----------
   Every module is loaded by now, so first render happens here rather than at
   the bottom of whichever file happened to define the function. */
mountGate();
renderTemplates();
/* One line per visit, before any render rather than after. track('opened')
   leaves the machine and comes back as a count from everybody; this stays here
   and gives the operator's own sequence — the second visit, the fourth — which
   no count can.

   It was written after the renders at first, on the theory that a write on the
   way in must never delay the page. That was the wrong trade and a browser
   showed it: the panel that reads this counted the visit before the current one,
   so it was permanently one behind and said "once" on the second visit. A single
   localStorage write costs microseconds, PC.journal swallows its own failures,
   and a number that is visibly wrong costs more than either. */
if (PC.journal) PC.journal.append({ what: 'session', to: 'post-call' });
restoreSender();  // before the first render, so the document has a letterhead
restoreDraft();   // before the first render, so the page comes up as it was left
renderScope();
recompute();   // recompute drives the method, the client read and the document
renderGuide();
renderLedger();
watchGuidePin();     // after the guide exists, before any scrolling happens
applyEntryRoute();   // after the renders above, so there is something to land on
/* Arriving at #ledger from another page reloads and runs the line above.
   Arriving at it from this page changes only the fragment, so nothing
   reloads and nothing re-runs — the route would silently do nothing.
   Caught by driving the navigation in a browser rather than by reading
   the code, where it looks like one path. */
window.addEventListener('hashchange', applyEntryRoute);
track('opened');
