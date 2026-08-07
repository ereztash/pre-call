/* node assets/viz.test.js — no browser, no deps.

   A picture of a number the tool does not have is a lie that looks
   authoritative, so most of this suite is about refusing to draw. */
const V = require('./pc-viz.js');
const assert = require('assert');

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

console.log('\npayback as an icon array');
test('fills one cell per week, out of a year', () => {
  const p = V.payback(15.3);
  assert.strictEqual(p.cells, 52);
  assert.strictEqual(p.filled, 15);
  assert.strictEqual(p.beyond, false);
});
test('a very fast payback still shows at least one cell', () => {
  assert.strictEqual(V.payback(0.2).filled, 1, 'an empty array reads as "no data"');
});
test('longer than a year is capped and said out loud', () => {
  const p = V.payback(80);
  assert.strictEqual(p.filled, 52);
  assert.strictEqual(p.beyond, true);
  assert.ok(/לא חוזרת/.test(p.label));
  assert.ok(/לצמצם את ההיקף/.test(p.sentence), 'it should say what to do about it');
});
test('nothing to draw when there is no payback', () => {
  [0, -1, null, undefined, NaN, 'שלוש'].forEach(v =>
    assert.strictEqual(V.payback(v), null, String(v)));
});
test('the verdict is a word, not only a colour', () => {
  // WCAG 1.4.1: colour is never the only carrier of meaning
  assert.strictEqual(V.payback(6).verdictText, 'מהיר');
  assert.strictEqual(V.payback(16).verdictText, 'סביר');
  assert.strictEqual(V.payback(30).verdictText, 'איטי');
  [6, 16, 30].forEach(w => assert.ok(V.payback(w).verdictText.trim().length));
});
test('the bands match what the tool already tells the operator', () => {
  assert.strictEqual(V.payback(12).verdict, 'fast');
  assert.strictEqual(V.payback(12.1).verdict, 'ok');
  assert.strictEqual(V.payback(20).verdict, 'ok');
  assert.strictEqual(V.payback(20.1).verdict, 'slow', 'the page warns past 20 weeks');
});
test('the label explains what a cell is', () => {
  assert.ok(/כל ריבוע הוא שבוע/.test(V.payback(10).label),
    'an unexplained grid is decoration');
});

console.log('\nprice against the annual cost');
test('reports the share as a proportion', () => {
  const s = V.share(5000, 20000);
  assert.strictEqual(s.percent, 25);
  assert.strictEqual(s.over, false);
});
test('refuses to draw a bar against an unknown whole', () => {
  assert.strictEqual(V.share(5000, 0), null);
  assert.strictEqual(V.share(5000, null), null);
  assert.strictEqual(V.share(0, 20000), null);
});
test('a price above the annual cost is flagged rather than clipped silently', () => {
  const s = V.share(30000, 20000);
  assert.strictEqual(s.percent, 100);
  assert.strictEqual(s.over, true);
  assert.ok(/קשה להגנה/.test(s.sentence));
});
test('the sentence gives the operator something to say', () => {
  assert.ok(/מפסיק לשלם/.test(V.share(5000, 20000).sentence));
});

console.log('\nthe cost of waiting');
test('divides the annual figure into a week', () => {
  assert.strictEqual(V.costOfWaiting(52000).perWeek, 1000);
});
test('refuses when the number was the operator\'s own invention', () => {
  assert.strictEqual(V.costOfWaiting(52000, true), null,
    'you cannot press a client with arithmetic on a figure you made up for them');
});
test('refuses when there is no annual figure', () => {
  assert.strictEqual(V.costOfWaiting(0), null);
  assert.strictEqual(V.costOfWaiting(null), null);
});
test('says what it is, so it does not read as a sales trick', () => {
  assert.ok(/הוא עצמו נתן/.test(V.costOfWaiting(52000).note));
});

console.log('\nwhat the panel draws');
test('an empty model draws nothing at all', () => {
  const v = V.forModel({});
  assert.strictEqual(v.payback, null);
  assert.strictEqual(v.share, null);
  assert.strictEqual(v.waiting, null);
});
test('a real model draws all three', () => {
  const v = V.forModel({ payback: 15.3, price: 5660, annualValue: 22651 });
  assert.ok(v.payback && v.share && v.waiting);
});
test('the operator\'s own numbers suppress the pressure figure only', () => {
  const v = V.forModel({ payback: 15.3, price: 5660, annualValue: 22651 },
                       { numbersAreMine: true });
  assert.ok(v.payback, 'the payback is still arithmetic on the price you set');
  assert.ok(v.share);
  assert.strictEqual(v.waiting, null);
});
test('a missing model does not throw', () => {
  assert.doesNotThrow(() => V.forModel(null));
  assert.doesNotThrow(() => V.forModel(undefined, undefined));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
