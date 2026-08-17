/* node assets/ladder.test.js — no browser, no deps.

   The ladder exists because of one transcript. A real discovery call, the
   first anybody ran through this product, selling positioning rather than
   automation: no systems, no process, nothing recurring. The tool read
   "300 שקל לפגישה" — the fee being agreed in the room — as errCost, the cost
   of an incident, and would have computed a year of the client's losses out of
   the seller's own price. Nothing flagged it, because the cue for incident
   cost is a number beside a currency word and that is the whole of it.

   So most of what is below is about refusal: which calls may not reach which
   rung, and what a rung is not allowed to read. The happy path is one test. */
const L = require('./pc-ladder.js');
const T = require('./pc-transcript.js');
const assert = require('assert');

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

/* The call itself, cut to the two exchanges that matter: no process anywhere,
   and a fee stated near the end. */
const CONSULTING =
  'איך זה עובד אצלך היום כשאתה משיג לקוחות חדשים?\n' +
  'כרגע זה לא באמת עובד. יש לי לקוח אחד ואני מלמד תלמידות עיצוב.\n' +
  'כמה זה שווה לך לדעתך?\n' +
  'אני לא יודע.\n' +
  'כרגע אני רואה את זה קצת כמו פגישת פסיכולוג, בשביל שזה 300 שקל לפגישה.';

const AUTOMATION =
  'לקוח: היום ההזמנות נכנסות בוואטסאפ, בערך 40 הזמנות ביום.\n' +
  'לקוח: מישהו מעתיק כל אחת ל-Priority, זה 8 דקות להזמנה.\n' +
  'לקוח: כל טעות עולה בערך 1800 ₪.';

console.log('\nthe rung a call can carry');

test('a call with a recurring quantity of work reaches the value rung', () => {
  const v = L.assess({ text: AUTOMATION, systems: ['WhatsApp', 'Priority'] });
  assert.strictEqual(v.rung, 'value');
  assert.deepStrictEqual(v.skipped, [], 'it climbed past something on the way up');
});

test('a call with no process in it does not', () => {
  const v = L.assess({ text: CONSULTING });
  assert.notStrictEqual(v.rung, 'value',
    'a consulting call with nothing recurring in it is about to be priced on the client\'s losses');
});

test('the bottom rung always holds, so there is always a price', () => {
  [undefined, null, {}, { text: '' }, { text: CONSULTING }].forEach(input => {
    const v = L.assess(input);
    assert.ok(v.method, 'no method for ' + JSON.stringify(input));
    assert.strictEqual(L.RUNGS[L.RUNGS.length - 1].holds(input || {}), true);
  });
});

test('every rung that was passed over says why, in order', () => {
  const v = L.assess({ text: CONSULTING });
  assert.deepStrictEqual(v.skipped.map(s => s.rung), ['value', 'comparable', 'market']);
  v.skipped.forEach(s => assert.ok(s.missing && s.missing.length > 20,
    s.rung + ' was skipped without saying what was absent'));
});

test('your own closed deal outranks a published range', () => {
  /* comparable sits above market on purpose: a job you actually did and were
     paid for is better evidence than a table converted from someone else's
     market. */
  const withHistory = L.assess({ text: CONSULTING, systems: ['CRM'], comparableLast: 4000 });
  assert.strictEqual(withHistory.rung, 'comparable');
  const without = L.assess({ text: CONSULTING, systems: ['CRM'] });
  assert.strictEqual(without.rung, 'market');
});

test('a count with no period is not a rate of work, and neither is a period with no count', () => {
  assert.notStrictEqual(L.assess({ text: 'יש לנו 40 הזמנות שממתינות' }).rung, 'value',
    'a backlog was read as a rate');
  assert.notStrictEqual(L.assess({ text: 'אנחנו מעלים פוסט בשבוע' }).rung, 'value',
    'a habit with no quantity was read as a rate');
});

console.log('\nwhat a rung is allowed to read');

test('the fee agreed in the room is not read as the cost of an incident', () => {
  /* The whole reason this file exists. Under the ladder the incident cue is
     not merely unused on this call — it is never looked for. */
  const v = L.assess({ text: CONSULTING });
  const rows = T.heuristics(CONSULTING, v.licence);
  assert.deepStrictEqual(rows, [],
    'a number was extracted from a call with no process: ' +
    rows.map(r => r.key + '=' + r.value).join(', '));
});

test('without the ladder the same call still misreads it, which is the bug', () => {
  /* Pinned deliberately. If this ever comes back empty the licence has stopped
     being what protects the call and something else is, and this file should
     be the thing that notices. */
  const unlicensed = T.heuristics(CONSULTING);
  assert.ok(unlicensed.some(r => r.key === 'errCost' && r.value === 300),
    'the unguarded reading changed — the ladder may no longer be what prevents this');
});

test('the value rung licenses exactly the three cues its formula needs', () => {
  const v = L.assess({ text: AUTOMATION, systems: ['WhatsApp'] });
  assert.deepStrictEqual([...v.licence].sort(), ['errCost', 'freq', 'minutes']);
  const rows = T.heuristics(AUTOMATION, v.licence);
  assert.deepStrictEqual([...new Set(rows.map(r => r.key))].sort(),
    ['errCost', 'freq', 'minutes'], 'the rung licensed cues it did not read, or read cues it did not license');
});

test('no rung below value licenses a quantitative cue', () => {
  ['comparable', 'market', 'cost'].forEach(id =>
    assert.deepStrictEqual(L.LICENCE[id], [],
      id + ' may read a number, and a number on those calls means something else'));
});

test('an omitted licence still reads everything, so nothing that worked stopped working', () => {
  assert.ok(T.heuristics(AUTOMATION).length >= 3, 'the default reading narrowed');
  assert.ok(L.licences(null, 'freq'), 'a caller with no ladder was refused');
  assert.ok(!L.licences([], 'freq'), 'an empty licence permitted a cue');
});

console.log('\nwhat the ladder does not decide');

test('it names a method and never a price', () => {
  const v = L.assess({ text: AUTOMATION, systems: ['WhatsApp'] });
  assert.ok(v.method, 'no method named');
  Object.keys(v).forEach(k => assert.ok(!/price|amount|₪/i.test(k),
    'the ladder is carrying a price, and the engine is the only thing allowed to'));
});

test('every rung states whether it needs a vertical behind it', () => {
  /* Two of the four do, and they are not the two you would guess: market looks
     generic and is keyed on how many systems connect, with ranges converted
     from automation projects. Reading complexity for other work needs a
     different metric, not a translation of this one. */
  L.RUNGS.forEach(r => assert.strictEqual(typeof r.vertical, 'boolean', r.id));
  assert.strictEqual(L.RUNGS.find(r => r.id === 'market').vertical, true);
  assert.strictEqual(L.RUNGS.find(r => r.id === 'comparable').vertical, false);
  assert.strictEqual(L.RUNGS.find(r => r.id === 'cost').vertical, false);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
