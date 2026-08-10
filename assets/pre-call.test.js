/* node assets/pre-call.test.js — no browser, no deps.

   PRE-CALL had zero tests of its own logic — the architecture review's
   sharpest finding, because pre-call.js is not a small file: the paste
   parser, the anchor-sentence builder, and the private/public split between
   `outArea` and `privArea` are all real logic with real ways to be wrong,
   and none of it had a guardrail. Only markup.test.js's CSP/structure checks
   ever touched this file.

   pre-call.js is written for a page, not for import — it queries the DOM at
   load time (document.querySelectorAll('.stepbtn'), document.getElementById
   ('promptBiz').innerText=P_BIZ, ...) and calls loadProfile()/buildDR() as
   its last line. Same situation gate.test.js solved the same way: build a
   fake page, evaluate the real source inside it with Node's vm module, and
   drive it exactly as a browser would — through document.getElementById(id)
   .value and the exported globals, never by reaching into private state. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

const CONTENT_SRC = fs.readFileSync(path.join(__dirname, 'pre-call-content.js'), 'utf8');
/* PRE-CALL now reads the ledger, so the real deals.js is evaluated into the fake
   page rather than the tenure summary being stubbed. Stubbing it would let this
   file pass while the two modules disagreed about what a closed deal is — which
   is the whole reason the summary lives in deals.js and not here. */
const DEALS_SRC = fs.readFileSync(path.join(__dirname, 'deals.js'), 'utf8');
const SRC = fs.readFileSync(path.join(__dirname, 'pre-call.js'), 'utf8');

/* A minimal element: enough surface for this file's DOM calls
   (.value/.textContent/.innerText/.innerHTML/.dataset/.style/.classList),
   auto-created on first getElementById() so nothing has to be pre-declared —
   the real page's HTML always has every id this script asks for, so a
   missing element here would only ever hide a bug in the test, not in the
   product. */
function makeEl(id) {
  const listeners = {};
  return {
    id, value: '', textContent: '', innerText: '', innerHTML: '',
    dataset: {}, style: {},
    classList: {
      _set: new Set(),
      add(...c) { c.forEach(x => this._set.add(x)); },
      remove(...c) { c.forEach(x => this._set.delete(x)); },
      toggle(c, on) { on = on === undefined ? !this._set.has(c) : on;
        if (on) this._set.add(c); else this._set.delete(c); return on; },
      contains(c) { return this._set.has(c); }
    },
    addEventListener(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); },
    focus() {}, select() {}
  };
}

function page() {
  const els = new Map();
  const store = {};
  const getElementById = id => { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); };

  const ctx = {
    console,
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { if (ctx.__blockStorage) throw new Error('blocked'); store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    navigator: { clipboard: null }, // absent on purpose: exercises the execCommand fallback path
    /* The three window methods this file calls. `window` itself is wired to the
       context object below, because in a browser window IS the global — and the
       old shape, a separate literal, was not merely inaccurate: every module in
       this project ends with
         })(typeof window !== 'undefined' ? window : globalThis)
       so a standalone `window` object received PC and nothing looked it up as a
       global. deals.js loaded fine and `typeof PC` was still 'undefined'. That
       hid a real cross-module path rather than a test detail. */
    scrollTo() {}, print() {}, addEventListener() {},
    document: {
      getElementById,
      querySelectorAll: () => [],
      addEventListener() {},
      createElement: () => makeEl('__tmp'),
      execCommand: () => true,
      /* body carries a classList because call mode is a class on it. The
         fake DOM cannot model CSS, so nothing here can tell you what call
         mode *looks* like — that is journey.test.js and a11y.test.js in a
         real browser. What it can tell you is that the class is set and
         cleared where it should be, which is the part that has logic in it. */
      body: Object.assign(makeEl('body'), { appendChild() {}, removeChild() {} })
    },
    setTimeout, clearTimeout
  };
  vm.createContext(ctx);
  ctx.window = ctx;          // as in a browser, and as every module here assumes
  vm.runInContext(DEALS_SRC, ctx);
  vm.runInContext(CONTENT_SRC, ctx);
  vm.runInContext(SRC, ctx);

  return {
    ctx, store, els,
    set(id, v) { getElementById(id).value = v; },
    val(id) { return getElementById(id).value; },
    run(expr) { return vm.runInContext(expr, ctx); },
    call(fn, ...args) { return vm.runInContext(fn, ctx)(...args); }
  };
}

const FULL_PASTE = `מה אני מוכר: מסדר תהליכי גבייה לעסקים קטנים
למי: משרדי רו"ח עד 10 עובדים
יחידה תחומה: 3 מפגשים, יוצא מהם נוהל גבייה כתוב
מחיר היחידה: 6,500 ₪
עסקה אחרונה: 8,000 ₪
מקור הלקוח האחרון: הפניה מלקוח קודם
מה הלקוח הרוויח: כ-40,000 ₪ תזרים
מה רק אני רואה: הבעיה אף פעם לא בתוכנה.
לדוגמה: לקוח X חשב שהוא צריך מערכת, בפועל היה צריך בעלים אחד לתהליך.
זה מה שחוזר כל פעם.
מה אני לא מוכר: לא מפעיל את התהליך במקומם`;

console.log('\nparsing a pasted profile');
test('extracts every field from a well-formed paste', () => {
  const p = page();
  p.set('pasteBiz', FULL_PASTE);
  p.call('parseBiz');
  assert.strictEqual(p.val('f_what'), 'מסדר תהליכי גבייה לעסקים קטנים');
  assert.strictEqual(p.val('f_who'), 'משרדי רו"ח עד 10 עובדים');
  assert.strictEqual(p.val('f_unit'), '3 מפגשים, יוצא מהם נוהל גבייה כתוב');
  assert.strictEqual(p.val('f_price'), '6,500 ₪');
  assert.strictEqual(p.val('f_last'), '8,000 ₪');
  assert.strictEqual(p.val('f_gain'), 'כ-40,000 ₪ תזרים');
  assert.strictEqual(p.val('f_no'), 'לא מפעיל את התהליך במקומם');
});
test('the edge field runs to the next KNOWN label, not the first colon it meets', () => {
  // this is the exact case the code comment describes: "לדוגמה:" is a colon
  // that is not a field label, and a naive stop-at-any-colon regex cuts the
  // answer off mid-sentence
  const p = page();
  p.set('pasteBiz', FULL_PASTE);
  p.call('parseBiz');
  const edge = p.val('f_edge');
  assert.ok(edge.includes('לדוגמה'), 'stopped before the embedded colon — lost the example');
  assert.ok(edge.includes('זה מה שחוזר כל פעם'), 'stopped before the real end of the answer');
  assert.ok(!edge.includes('מה אני לא מוכר'), 'ran past its own end into the next field');
});
test('maps free-text source to the select value by keyword, not exact match', () => {
  const cases = [
    ['הפניה מלקוח קודם', 'ref'], ['היכרות אישית ותיקה', 'ref'],
    ['תוכן שפרסמתי ברשת', 'content'], ['פנייה יזומה שלי אליו', 'out']
  ];
  for (const [text, want] of cases) {
    const p = page();
    p.set('pasteBiz', 'מה אני מוכר: X\nמקור הלקוח האחרון: ' + text);
    p.call('parseBiz');
    assert.strictEqual(p.val('f_src'), want, text);
  }
});
test('an empty paste is a no-op, not a wipe', () => {
  const p = page();
  p.set('f_what', 'כבר קיים');
  p.set('pasteBiz', '   ');
  p.call('parseBiz');
  assert.strictEqual(p.val('f_what'), 'כבר קיים');
});
test('fields absent from the paste are left untouched, not cleared', () => {
  const p = page();
  p.set('f_price', 'ערך קודם');
  p.set('pasteBiz', 'מה אני מוכר: רק זה');
  p.call('parseBiz');
  assert.strictEqual(p.val('f_what'), 'רק זה');
  assert.strictEqual(p.val('f_price'), 'ערך קודם', 'a missing field must not overwrite what was already there');
});
console.log('\na blank field must stay blank, not swallow the next label');
/* Found by simulating a real archetype: a first-timer with several answers
   genuinely blank — no last deal, no gain to report — pasted the profile
   exactly as the prompt's own template leaves an unanswered field, label
   then a bare newline. \s*(.+) closed over that newline looking for a value
   and found the NEXT field's label instead, so the generated script for a
   real run of this exact paste told the operator to say to the prospect:
   "לקוח שעבדתי איתו... — מה רק אני רואה: <the next field's real answer>." —
   quoting a field label as if it were a client's measurable result. */
const BLANK_MID = `מה אני מוכר: X
למי: Y
יחידה תחומה: Z
מחיר היחידה:
עסקה אחרונה:
מקור הלקוח האחרון:
מה הלקוח הרוויח:
מה רק אני רואה: התובנה האמיתית שלי
מה אני לא מוכר: לא עושה A`;
test('three single-line fields left blank in a row do not adopt the next label as their value', () => {
  const p = page();
  p.set('pasteBiz', BLANK_MID);
  p.call('parseBiz');
  assert.strictEqual(p.val('f_price'), '', 'took on the next label instead of staying blank');
  assert.strictEqual(p.val('f_last'), '');
  assert.strictEqual(p.val('f_gain'), '',
    'this is the one that reached the rendered script — a blank gain must not become the edge field\'s answer');
});
test('the multi-line field still gets its own real content after the blank run', () => {
  const p = page();
  p.set('pasteBiz', BLANK_MID);
  p.call('parseBiz');
  assert.strictEqual(p.val('f_edge'), 'התובנה האמיתית שלי');
});
test('the field after a blank multi-line field is not swallowed by it either', () => {
  // the more severe latent version: if the MULTI-line field is the blank
  // one, [\s\S]+? has nothing stopping it from crossing the first newline
  // and reading all the way to the end of the paste looking for content
  const p = page();
  p.set('pasteBiz', 'מה אני מוכר: X\nמה רק אני רואה:\nמה אני לא מוכר: לא בונה אתרים');
  p.call('parseBiz');
  assert.strictEqual(p.val('f_edge'), '', 'a blank edge field must not absorb everything after it');
  assert.strictEqual(p.val('f_no'), 'לא בונה אתרים',
    'the field after a blank multi-line field lost its own real answer');
});
test('a value that happens to equal another field\'s label verbatim is still discarded', () => {
  // belt-and-suspenders on the same guard: not just "blank bled into the
  // next label", but any captured value that IS one of the known labels
  const p = page();
  p.set('pasteBiz', 'מה אני מוכר: X\nעסקה אחרונה: מקור הלקוח האחרון:\nמה אני לא מוכר: Y');
  p.call('parseBiz');
  assert.strictEqual(p.val('f_last'), '',
    'the captured "value" was itself just another field\'s label, not an answer');
});

test('parsing saves the profile immediately, not only on the next keystroke', () => {
  const p = page();
  p.set('pasteBiz', 'מה אני מוכר: נבדק');
  p.call('parseBiz');
  const saved = JSON.parse(p.store['precall_profile_v1']);
  assert.strictEqual(saved.f_what, 'נבדק');
});

console.log('\nprofile persistence');
test('round-trips through localStorage', () => {
  const p = page();
  p.set('f_what', 'א'); p.set('f_who', 'ב');
  p.call('saveProfile');
  const p2 = page();
  p2.store['precall_profile_v1'] = p.store['precall_profile_v1'];
  p2.call('loadProfile');
  assert.strictEqual(p2.val('f_what'), 'א');
  assert.strictEqual(p2.val('f_who'), 'ב');
});
test('the prospect (step 3) is never part of what gets saved', () => {
  const p = page();
  p.set('f_what', 'עסק'); p.set('p_name', 'לקוח פרטי');
  p.call('saveProfile');
  const saved = JSON.parse(p.store['precall_profile_v1']);
  assert.strictEqual(saved.p_name, undefined,
    'a prospect’s name has no business surviving a page reload');
});
test('clearProfile empties every profile field and removes the storage key', () => {
  const p = page();
  p.set('f_what', 'X');
  p.call('saveProfile');
  p.call('clearProfile');
  assert.strictEqual(p.val('f_what'), '');
  assert.strictEqual(p.store['precall_profile_v1'], undefined);
});
test('a blocked localStorage warns once and does not throw', () => {
  const p = page();
  p.ctx.__blockStorage = true;
  assert.doesNotThrow(() => p.call('saveProfile'));
  // profileSaved is a status span, not a field — the code writes to its
  // textContent, same as flash() does everywhere else in this file
  const warned = p.run("document.getElementById('profileSaved').textContent");
  assert.ok(/לא יישמר/.test(warned), 'no warning shown when storage is blocked');
});

console.log('\nnewProspect');
test('clears the prospect fields but leaves the business profile alone', () => {
  const p = page();
  p.set('f_what', 'עסק קבוע');
  p.set('p_name', 'שם ישן'); p.set('p_co', 'חברה ישנה'); p.set('p_paste', 'טקסט ישן');
  p.call('newProspect');
  assert.strictEqual(p.val('p_name'), '');
  assert.strictEqual(p.val('p_co'), '');
  assert.strictEqual(p.val('p_paste'), '');
  assert.strictEqual(p.val('p_pair'), '1', 'the pair toggle must reset to its default, not stay on 2');
  assert.strictEqual(p.val('f_what'), 'עסק קבוע', 'the business profile is not prospect-specific data');
});
test('resets the output — otherwise the previous prospect’s script rides along', () => {
  const p = page();
  p.set('f_what', 'X'); p.set('p_name', 'הראשון');
  p.call('build');
  const before = p.run("document.getElementById('outArea').innerHTML");
  assert.ok(before.includes('הראשון'), 'setup: the first script did not actually render');
  p.call('newProspect');
  const after = p.run("document.getElementById('outArea').innerHTML");
  assert.ok(!after.includes('הראשון'), 'the old prospect’s name survived into the reset output');
});

console.log('\nbuild() and its guard');
test('refuses to build without the one required field, and says why', () => {
  const p = page();
  p.call('build');
  const errText = p.run("document.getElementById('err2').innerText");
  assert.ok(/מה אתם מוכרים/.test(errText), 'no explanation shown for the rejected build');
  assert.ok(!p.run("document.getElementById('err2').classList.contains('hidden')"),
    'show() toggles the "hidden" class — the error box must not still be hidden');
  const out = p.run("document.getElementById('outArea').innerHTML");
  assert.ok(!out.includes('תסריט שיחת אפיון'),
    'a rejected build must not silently render the script anyway — ' +
    'outArea should still show the untouched empty state');
});
test('a filled f_what is enough to build', () => {
  const p = page();
  p.set('f_what', 'שירות כלשהו');
  p.call('build');
  const out = p.run("document.getElementById('outArea').innerHTML");
  assert.ok(out.includes('שירות כלשהו'));
});

console.log('\nthe anchor sentence — calibrating the client’s number, three ways');
test('a gain that opens with a figure gets the direct phrasing', () => {
  const p = page();
  p.set('f_what', 'X'); p.set('f_gain', '40,000 ₪ תזרים');
  p.call('build');
  const out = p.run("document.getElementById('outArea').innerHTML");
  assert.ok(out.includes('הפער הזה היה שווה בערך 40,000 ₪ תזרים'));
});
test('a narrative gain makes the client the subject instead of breaking grammatically', () => {
  const p = page();
  p.set('f_what', 'X'); p.set('f_gain', 'חסך שבוע עבודה בחודש');
  p.call('build');
  const out = p.run("document.getElementById('outArea').innerHTML");
  assert.ok(out.includes('לקוח שעבדתי איתו במצב דומה — חסך שבוע עבודה בחודש'));
  assert.ok(!out.includes('הפער הזה היה שווה בערך חסך'), 'the direct phrasing does not fit a narrative answer');
});
test('no gain at all falls back to the placeholder, not an empty sentence', () => {
  const p = page();
  p.set('f_what', 'X');
  p.call('build');
  const out = p.run("document.getElementById('outArea').innerHTML");
  assert.ok(out.includes('כאן נכנס המספר מהעסקה האחרונה'));
});

console.log('\nthe ownership move — the edge field is a pattern, not a fact about him');
test('a set edge is quoted whole and framed as your general observation', () => {
  const p = page();
  p.set('f_what', 'X'); p.set('f_edge', 'שורה ראשונה\nשורה שנייה');
  p.call('build');
  const out = p.run("document.getElementById('outArea').innerHTML");
  assert.ok(out.includes('שורה ראשונה שורה שנייה'), 'multi-line edge text must survive whole, joined');
  assert.ok(out.includes('זו אבחנה כללית שלכם, לא עובדה עליו'));
});
test('no edge falls back to the generic instruction', () => {
  const p = page();
  p.set('f_what', 'X');
  p.call('build');
  const out = p.run("document.getElementById('outArea').innerHTML");
  assert.ok(out.includes('נסחו לו את הצוואר שלו במשפט אחד'));
});

console.log('\nthe sentence for question 10 — prepared, not composed in the room');
/* The change these protect: the script used to hand over a multi-line
   observation and ask the operator to turn it into one sentence about this
   person, live, mid-call. That is the only place in the document that asks for
   authoring rather than reading, at the moment there is no capacity for it. */
test('a prepared sentence is handed over finished, and the composing instruction is gone', () => {
  const p = page();
  p.set('f_what', 'X');
  p.set('f_gain', '40,000 ₪'); // otherwise the anchor gap fires and this test is about the other one
  p.set('f_edge', 'אף אחד לא מוגדר כאחראי על המעקב');
  p.set('p_own', 'אני מנחש שאצלכם זה חוזר אליך בסוף כל חודש');
  p.call('build');
  const out = p.run("document.getElementById('outArea').innerHTML");
  assert.ok(out.includes('אני מנחש שאצלכם זה חוזר אליך בסוף כל חודש'),
    'the prepared sentence never reached the script');
  assert.ok(/class="say"/.test(out), 'it must render as the line you say out loud, not as prose');
  assert.ok(!out.includes('נסחו ממנה משפט אחד עליו'),
    'the live-composition instruction survived alongside the finished sentence');
  assert.ok(!/class="gap"/.test(out), 'nothing is missing, so nothing should be flagged as missing');
});
test('an unprepared sentence is named as a gap instead of quietly asking for it live', () => {
  const p = page();
  p.set('f_what', 'X');
  p.set('f_edge', 'אף אחד לא מוגדר כאחראי על המעקב');
  p.call('build');
  const out = p.run("document.getElementById('outArea').innerHTML");
  assert.ok(/class="gap"/.test(out), 'no gap flagged for the sentence that was never written');
  assert.ok(out.includes('המשפט שתגידו בשאלה 10'),
    'the gap must name the field that fixes it, not just report a problem');
});
test('the prospect sentence is never persisted, and a new prospect clears it', () => {
  const p = page();
  p.set('f_what', 'עסק קבוע');
  p.set('p_own', 'משפט על הלקוח הקודם');
  p.call('saveProfile');
  assert.strictEqual(JSON.parse(p.store['precall_profile_v1']).p_own, undefined,
    'a sentence written about one specific person has no business surviving a reload');
  p.call('newProspect');
  assert.strictEqual(p.val('p_own'), '',
    'the previous prospect’s sentence would otherwise be said to the next one');
});
test('a missing anchor number is named as a gap, not left as brackets to fill live', () => {
  const p = page();
  p.set('f_what', 'X'); p.set('p_own', 'משפט מוכן'); // so the only gap is the anchor
  p.call('build');
  const out = p.run("document.getElementById('outArea').innerHTML");
  assert.ok(out.includes('כאן נכנס המספר מהעסקה האחרונה'), 'setup: the placeholder should still be there');
  assert.ok(out.includes('אין לכם מספר לעוגן'),
    'question 11 carries brackets instead of a number and the script says nothing about it');
});
test('with both prepared, the script flags nothing', () => {
  const p = page();
  p.set('f_what', 'X'); p.set('f_gain', '40,000 ₪'); p.set('p_own', 'משפט מוכן');
  p.call('build');
  const out = p.run("document.getElementById('outArea').innerHTML");
  assert.ok(!/class="gap"/.test(out), 'a fully prepared script must be free of warnings');
});

console.log('\ncall mode');
test('entering call mode sets the class and shows the bar; leaving reverses both', () => {
  const p = page();
  p.call('callMode', true);
  assert.ok(p.run("document.body.classList.contains('callmode')"));
  assert.ok(!p.run("document.getElementById('callbar').classList.contains('hidden')"),
    'the exit bar is the only chrome call mode keeps — it cannot be the thing that is hidden');
  p.call('callMode', false);
  assert.ok(!p.run("document.body.classList.contains('callmode')"));
  assert.ok(p.run("document.getElementById('callbar').classList.contains('hidden')"));
});
test('leaving step 4 always leaves call mode — the step buttons are hidden by it', () => {
  const p = page();
  p.call('callMode', true);
  p.call('go', 2);
  assert.ok(!p.run("document.body.classList.contains('callmode')"),
    'step 2 with the header and the step buttons hidden is a page with no way off it');
});
test('going to step 4 does not turn call mode on by itself', () => {
  const p = page();
  p.call('go', 4);
  assert.ok(!p.run("document.body.classList.contains('callmode')"),
    'call mode is a state the operator enters on purpose, not a side effect of finishing a script');
});
test('resetting the output leaves call mode, so it is never a blank focused page', () => {
  const p = page();
  p.set('f_what', 'X');
  p.call('build');
  p.call('callMode', true);
  p.call('newProspect');
  assert.ok(!p.run("document.body.classList.contains('callmode')"));
});
test('the reading card is reachable from inside call mode, which is also the way out', () => {
  const p = page();
  p.call('callMode', true);
  p.call('toReadingCard');
  assert.ok(!p.run("document.body.classList.contains('callmode')"),
    'the card is hidden by call mode, so reaching it has to leave it');
});

console.log('\nstep 3 shows the observation the sentence is derived from');
test('the reference line quotes the edge field, joined across lines', () => {
  const p = page();
  p.set('f_edge', 'שורה ראשונה\nשורה שנייה');
  p.call('refreshEdgeRef');
  const ref = p.run("document.getElementById('edgeRef').textContent");
  assert.ok(ref.includes('שורה ראשונה שורה שנייה'),
    'the operator would have to remember what they wrote on a screen they left');
});
test('an empty edge field says what is missing and where', () => {
  const p = page();
  p.call('refreshEdgeRef');
  const ref = p.run("document.getElementById('edgeRef').textContent");
  assert.ok(/שלב 2/.test(ref), 'a blank reference line is just a blank line');
});

console.log('\ncontextual openers — each condition is independent');
const openerCases = [
  { field: { p_how: 'in' }, must: 'הוא פנה אליכם' },
  { field: { p_how: 'out' }, must: 'אתם פניתם אליו' },
  { field: { p_how: 'ref' }, must: 'הגעתם דרך הפניה' },
  { field: { p_trig: 'איבד לקוח' }, must: 'יש טריגר ידוע: איבד לקוח' },
  { field: { p_pair: '2' }, must: 'שניים בשיחה' },
  { field: { p_paste: 'משהו' }, must: 'יש לכם טקסט ציבורי עליו' },
  { field: { f_unit: '' }, must: 'אין לכם יחידה תחומה' }
];
openerCases.forEach(({ field, must }) => {
  const [k, v] = Object.entries(field)[0];
  test('shows the right hint for ' + k + '=' + JSON.stringify(v), () => {
    const p = page();
    p.set('f_what', 'X');
    Object.entries(field).forEach(([k, v]) => p.set(k, v));
    p.call('build');
    const out = p.run("document.getElementById('outArea').innerHTML");
    assert.ok(out.includes(must), 'missing: ' + must);
  });
});
test('none of the optional hints appear when none of their triggers are set', () => {
  const p = page();
  p.set('f_what', 'X'); p.set('f_unit', 'משהו קבוע'); // the only always-on default is f_unit being empty
  p.call('build');
  const out = p.run("document.getElementById('outArea').innerHTML");
  assert.ok(!/לפני שמתחילים/.test(out), 'an empty openers list must not render its own heading');
});

console.log('\nprivate notes never enter the copyable/printable document');
test('last deal and gain together produce the calibration note, held out of outArea', () => {
  const p = page();
  p.set('f_what', 'X'); p.set('f_last', '8,000 ₪'); p.set('f_gain', '40,000 ₪');
  p.call('build');
  const out = p.run("document.getElementById('outArea').innerHTML");
  const priv = p.run("document.getElementById('privArea').innerHTML");
  assert.ok(!out.includes('8,000 ₪') || !out.includes('הכיול שלכם'),
    'the calibration note leaked into the document that gets copied and printed');
  assert.ok(priv.includes('8,000 ₪') && priv.includes('40,000 ₪'));
});
test('the internal price floor never enters outArea either', () => {
  const p = page();
  p.set('f_what', 'X'); p.set('f_price', '6,500 ₪');
  p.call('build');
  const out = p.run("document.getElementById('outArea').innerHTML");
  const priv = p.run("document.getElementById('privArea').innerHTML");
  assert.ok(!out.includes('רצפה פנימית'));
  assert.ok(priv.includes('6,500 ₪') && priv.includes('רצפה פנימית'));
});
test('no private numbers at all means the private panel stays empty and hidden', () => {
  const p = page();
  p.set('f_what', 'X');
  p.call('build');
  const priv = p.run("document.getElementById('privArea').innerHTML");
  assert.strictEqual(priv, '');
  assert.ok(p.run("document.getElementById('privArea').classList.contains('hidden')"));
});

console.log('\nescaping');
test('a business field containing markup is escaped, not injected', () => {
  const p = page();
  p.set('f_what', '<script>alert(1)</script> & co');
  p.call('build');
  const out = p.run("document.getElementById('outArea').innerHTML");
  assert.ok(!out.includes('<script>alert'), 'unescaped markup from a form field reached innerHTML');
  assert.ok(out.includes('&lt;script&gt;'));
});

console.log('\nthe closing boundary');
test('the declared boundary only appears when actually set', () => {
  const withB = page(); withB.set('f_what', 'X'); withB.set('f_no', 'לא ליווי חודשי');
  withB.call('build');
  assert.ok(withB.run("document.getElementById('outArea').innerHTML").includes('לא ליווי חודשי'));

  const withoutB = page(); withoutB.set('f_what', 'X');
  withoutB.call('build');
  assert.ok(!withoutB.run("document.getElementById('outArea').innerHTML").includes('הגבול שהגדרתם'));
});

console.log('\nerror boundary — a throw fails one action, not the page');
test('a throwing build reports failure through errBoundary instead of dying silently', () => {
  const p = page();
  p.set('f_what', 'X');
  const orig = p.ctx.document.getElementById;
  // breaks exactly one field build() reads, deep inside the render chain —
  // everything else in the fake DOM still works, same as a real page where
  // one bad line does not take the whole document down
  p.ctx.document.getElementById = id => { if (id === 'f_price') throw new Error('boom'); return orig(id); };
  p.call('build'); // must not throw out to the caller
  const box = orig('errBoundary');
  assert.ok(!box.classList.contains('hidden'), 'the boundary should be visible after a throw');
  assert.ok(box.innerHTML.includes('בניית התסריט'), 'should name what failed, in plain words');
});
test('a later successful call clears the boundary', () => {
  const p = page();
  p.set('f_what', 'X');
  const orig = p.ctx.document.getElementById;
  p.ctx.document.getElementById = id => { if (id === 'f_price') throw new Error('boom'); return orig(id); };
  p.call('build');
  assert.ok(!orig('errBoundary').classList.contains('hidden'));
  p.ctx.document.getElementById = orig; // the field works again
  p.call('build');
  assert.ok(orig('errBoundary').classList.contains('hidden'), 'a later success should clear the notice');
});
test('a throwing parseBiz is caught the same way', () => {
  const p = page();
  p.set('pasteBiz', FULL_PASTE);
  const orig = p.ctx.document.getElementById;
  p.ctx.document.getElementById = id => { if (id === 'f_what') throw new Error('boom'); return orig(id); };
  p.call('parseBiz');
  assert.ok(!orig('errBoundary').classList.contains('hidden'));
  assert.ok(orig('errBoundary').innerHTML.includes('חילוץ השדות'));
});

console.log('\nthe script leans on what the operator has actually done');
/* A beginner and a veteran need opposite things from the same twelve questions.
   The beginner has no number of their own, so the anchor in question 11 rests on
   an estimate; the veteran has one and gives it away before being asked. Neither
   is knowable by asking "how experienced are you" — years in business say nothing
   about whether somebody can hold a price. The ledger already knows, so the
   emphasis is derived from it, the same rule the rest of the product follows.

   One line, by priority, never three. The script's whole design is that it is
   read aloud under pressure. */
const withLedger = deals => {
  const p = page();
  p.store['postcall_deals_v1'] = JSON.stringify(deals);
  p.set('f_what', 'מסדר תהליכי גבייה לעסקים קטנים');
  p.set('f_gain', 'כ-40,000 ₪');
  p.call('build');
  return p.run("document.getElementById('outArea').innerHTML");
};
const past = (over = {}) => Object.assign({
  id: 'd' + Math.random().toString(36).slice(2), status: 'won', priceQuoted: 10000,
  outcome: { closedPrice: 10000, concession: 'unknown' }
}, over);

test('a discount the operator offered unasked is named before the call, not after', () => {
  /* The ledger records this after delivery, when nothing can be done about it.
     Prep is the only moment it can change behaviour. */
  const out = withLedger([
    past({ outcome: { closedPrice: 8000, concession: 'i_offered' } }),
    past({ outcome: { closedPrice: 9000, concession: 'i_offered' } }),
    past()
  ]);
  assert.ok(/ירדתם.{0,4}במחיר/.test(out),
    'two self-offered discounts on record and the prep says nothing: ' + out.slice(0, 300));
});
test('a price that has never moved is reported as untested, not as a good record', () => {
  const out = withLedger([past(), past(), past()]);
  assert.ok(/לא בדקתם|לא נבדק/.test(out),
    'three full-price closes and no line about never having tested the ceiling');
  assert.ok(!/מצוין|כל הכבוד/.test(out), 'this is not praise');
});
test('proposals with nothing closed yet point at his numbers, not at an estimate', () => {
  const out = withLedger([
    { id: 's1', status: 'sent', priceQuoted: 9000 },
    { id: 's2', status: 'lost', priceQuoted: 9000 }
  ]);
  assert.ok(/אין לכם מספר משלכם/.test(out),
    'a ledger with no close in it gives no orientation at all');
});
test('no ledger at all says nothing, rather than naming the other tool', () => {
  /* Somebody who has never opened POST-CALL is the likeliest person holding this
     script. Telling them what their ledger does not contain is a line about a tool
     they may not know exists — and it would also put a heading over a prep list
     that should have stayed empty, which this file has protected all along. */
  const out = withLedger([]);
  assert.ok(!/פנקס/.test(out), 'mentioned a ledger to somebody who has no ledger');
});
test('only one tenure line appears, whatever the ledger holds', () => {
  const out = withLedger([
    past({ outcome: { closedPrice: 8000, concession: 'i_offered' } }), past(), past()
  ]);
  const hits = ['ירדתם', 'לא בדקתם', 'אין לכם מספר משלכם']
    .filter(s => out.includes(s));
  assert.strictEqual(hits.length, 1, 'the script is read aloud — it gets one line: ' + hits);
});
test('a broken or absent ledger never stops a script from building', () => {
  /* PRE-CALL worked with no ledger at all for its whole life, and must keep
     working: somebody who has never opened POST-CALL is the likeliest user of it. */
  const p = page();
  p.store['postcall_deals_v1'] = 'not json at all';
  p.set('f_what', 'מסדר תהליכי גבייה');
  p.call('build');
  assert.ok(p.run("document.getElementById('outArea').innerHTML").includes('מסדר תהליכי גבייה'),
    'a corrupt ledger took the script down with it');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
