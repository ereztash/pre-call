/* node assets/guide.test.js — no browser, no deps.

   The conductor's contract is behavioural, not cosmetic: there must always
   be exactly one next action, it must never point somewhere already done,
   and it must never use a word the reader has to already own. A test suite
   that only checked the happy path would let all three rot. */
const G = require('./pc-guide.js');
const assert = require('assert');

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

const FULL = { process: 'הזמנות מוקלדות ידנית', freq: 20, freqUnit: 52, minutes: 7,
               systems: ['וואטסאפ'], errFreq: 3, errCost: 400,
               scopeConfirmed: true, client: 'מאפייה' };
const at = over => G.next(Object.assign({}, FULL, over));

console.log('\nalways exactly one instruction');
test('an empty form still gets a first action', () => {
  const n = G.next({});
  assert.ok(n.cta && n.title && n.anchor);
  assert.strictEqual(n.stepId, 'process');
  assert.strictEqual(n.ready, false);
});
test('a finished form still gets an action rather than an empty screen', () => {
  const n = at({});
  assert.strictEqual(n.ready, true);
  assert.strictEqual(n.stepId, 'send');
  assert.ok(n.cta, 'a screen with nothing to do is where a first-timer closes the tab');
});
test('no state produces a missing instruction', () => {
  const states = [{}, { process: 'x' }, { process: 'x', freq: 1, minutes: 1 },
                  Object.assign({}, FULL, { scopeConfirmed: false }),
                  Object.assign({}, FULL, { client: '' }), FULL];
  states.forEach(s => {
    const n = G.next(s);
    assert.ok(n.title && n.cta && n.anchor, 'no instruction for ' + JSON.stringify(s));
  });
});
test('it never points at a step already finished', () => {
  let s = {};
  const seen = [];
  for (let i = 0; i < 12; i++) {
    const n = G.next(s);
    seen.push(n.stepId);
    // ready can be true while an optional step is still being offered, so the
    // walk ends at the send step, not at the first moment nothing is blocking
    if (n.stepId === 'send') break;
    // satisfy whatever it just asked for
    if (n.stepId === 'process') s.process = 'x';
    else if (n.stepId === 'volume') { s.freq = 20; s.freqUnit = 52; s.minutes = 7; }
    else if (n.stepId === 'systems') s.systems = ['וואטסאפ'];
    else if (n.stepId === 'breaks') { s.errFreq = 3; s.errCost = 400; }
    else if (n.stepId === 'scope') s.scopeConfirmed = true;
    else if (n.stepId === 'client') s.client = 'מאפייה';
    else break;
  }
  assert.strictEqual(new Set(seen).size, seen.length, 'repeated a step: ' + seen.join(' → '));
  assert.ok(seen.includes('send'), 'never reached the end: ' + seen.join(' → '));
});

console.log('\nprogress');
test('progress is finite and honest', () => {
  assert.strictEqual(G.next({}).percent, 0);
  assert.strictEqual(at({}).percent, 100);
  const half = G.next({ process: 'x', freq: 20, freqUnit: 52, minutes: 7, systems: ['א'] });
  assert.ok(half.percent > 0 && half.percent < 100);
  assert.ok(half.index <= half.total);
});
test('an optional step never blocks the finish', () => {
  const n = at({ errFreq: 0, errCost: 0 });
  assert.strictEqual(n.ready, true, 'the price is worse without it, but it is not a gate');
  assert.strictEqual(n.percent, 100);
});
test('an optional step is still offered before the end', () => {
  const s = { process: 'x', freq: 20, freqUnit: 52, minutes: 7, systems: ['א'],
              scopeConfirmed: true, client: 'מאפייה' };
  const n = G.next(s);
  assert.strictEqual(n.stepId, 'breaks');
  assert.strictEqual(n.optional, true, 'offered, marked skippable');
});
test('every step carries its own short label rather than a truncated title', () => {
  G.next({}).steps.forEach(st => {
    assert.ok(st.short && st.short.trim(), st.id + ' has no short label');
    assert.ok(st.short.length <= 16, st.id + ' label too long for the strip: ' + st.short);
    assert.ok(!/ על$| מה$| כשזה$/.test(st.short), st.id + ' reads as a cut-off sentence');
  });
});
test('the step list reports what is done, for a visible checklist', () => {
  const n = G.next({ process: 'x' });
  const p = n.steps.find(x => x.id === 'process');
  assert.strictEqual(p.complete, true);
  assert.strictEqual(n.steps.find(x => x.id === 'client').complete, false);
});

console.log('\nplain language');
const JARGON = ['סקופ', 'ROI', 'טריאנגולציה', 'provenance', 'API', 'מרווח', 'עוגן',
                'בנצ׳מארק', 'payback', 'אינטגרציה', 'ולידציה', 'קונברסיה'];
test('no step uses a word the reader has to already own', () => {
  G.STEPS.forEach(st => {
    const text = [st.title, st.ask, st.why, st.cta].join(' ');
    JARGON.forEach(w => assert.ok(!text.includes(w),
      st.id + ' uses "' + w + '" — if it needs a glossary it needs a rewrite'));
  });
});
test('no warning uses jargon either', () => {
  const all = G.sanity({ freq: 100, freqUnit: 365, minutes: 45, errCost: 50000,
                         numbersAreMine: true }).map(p => p.text).join(' ');
  JARGON.forEach(w => assert.ok(!all.includes(w), 'warning uses "' + w + '"'));
});
test('every step says what answering it buys the user', () => {
  G.STEPS.filter(s => !s.terminal).forEach(st =>
    assert.ok(st.why && st.why.length > 40,
      st.id + ' has no reason a first-timer would accept'));
});
test('every step points somewhere concrete on the page', () => {
  G.STEPS.forEach(st => assert.ok(st.anchor, st.id + ' has nowhere to send you'));
});
test('a step needing two answers names both of them', () => {
  // otherwise the cursor lands on the first box, the user fills it, and the
  // same instruction comes back as if nothing happened
  const two = G.STEPS.filter(st => /שני מספרים|וכמה/.test(st.ask || ''));
  assert.ok(two.length, 'no multi-field step found — has the wording changed?');
  two.forEach(st => assert.ok((st.fields || []).length >= 2,
    st.id + ' asks for two things and points at one'));
});
test('every named field belongs to the step that names it', () => {
  const all = G.STEPS.flatMap(st => st.fields || []);
  assert.strictEqual(new Set(all).size, all.length, 'a field claimed by two steps');
});

console.log('\nimpossible numbers');
test('catches a process that would need more than a full-time person', () => {
  const p = G.sanity({ freq: 100, freqUnit: 365, minutes: 45 });
  const hit = p.find(x => x.id === 'toomuch');
  assert.ok(hit, 'no warning for 27,000 hours a year');
  assert.ok(/שעות בשנה/.test(hit.text));
  assert.ok(hit.field, 'a warning with nowhere to go is a dead end');
});
test('catches a process too small to be worth automating', () => {
  const p = G.sanity({ freq: 1, freqUnit: 12, minutes: 5 });
  assert.ok(p.find(x => x.id === 'toolittle'));
});
test('a normal deal produces no warnings at all', () => {
  assert.deepStrictEqual(G.sanity({ freq: 20, freqUnit: 52, minutes: 7, errCost: 400 }), []);
});
test('a very large error cost is questioned, not rejected', () => {
  const p = G.sanity({ freq: 20, freqUnit: 52, minutes: 7, errCost: 50000 });
  const hit = p.find(x => x.id === 'bigerr');
  assert.ok(hit);
  assert.ok(/בקש/.test(hit.text), 'it should tell them what to do about it');
});
test('warnings never replace the instruction', () => {
  const n = G.next({ freq: 100, freqUnit: 365, minutes: 45 });
  assert.ok(n.problems.length, 'the numbers are impossible');
  assert.ok(n.cta, 'and there is still exactly one thing to do');
});

console.log('\nchoosing the pricing method for them');
test('the client gave numbers — price on what it costs him', () => {
  const p = G.pickMethod({ freq: 20, minutes: 7 });
  assert.strictEqual(p.method, 'value');
  assert.ok(/הכסף שלו|עולה ללקוח/.test(p.because));
});
test('the numbers are the operator\'s own — do not price on them', () => {
  const p = G.pickMethod({ freq: 20, minutes: 7, numbersAreMine: true });
  assert.strictEqual(p.method, 'market');
  assert.ok(/הערכה שלך/.test(p.because));
});
test('nothing entered yet still yields a usable method and a reason', () => {
  const p = G.pickMethod({});
  assert.strictEqual(p.method, 'market');
  assert.ok(p.because.length > 40);
});
test('a past comparable deal is used when there are no client numbers', () => {
  assert.strictEqual(G.pickMethod({ comparableLast: 8000 }).method, 'comparable');
});
test('every reason is a sentence, never a label', () => {
  [{}, { freq: 1, minutes: 1 }, { numbersAreMine: true }, { comparableLast: 5000 }]
    .forEach(s => {
      const p = G.pickMethod(s);
      assert.ok(p.because.length > 40, 'too terse to teach anything: ' + p.because);
      JARGON.forEach(w => assert.ok(!p.because.includes(w), 'jargon in the reason: ' + w));
    });
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
