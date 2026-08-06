/* node assets/flow.test.js — no browser, no deps.

   An explanation that is confidently wrong is worse than no explanation, so
   the thing under test is not "does it render" but "does the chain it shows
   actually end at the price beside it". */
require('./model.js');
const F = require('./pc-flow.js');
const assert = require('assert');

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

const compute = globalThis.PC.model.compute;
const INPUT = { freq: 40, freqUnit: 365, minutes: 8, rate: 85, capture: 0.7,
                errFreq: 3, errCost: 1800, systemCount: 3, integration: 1.4,
                edge: 1, myRate: 250, method: 'value' };
const M = compute(INPUT);
const CITES = [
  { key: 'freq', value: 40, quote: 'בערך ארבעים ביום', speaker: 'client' },
  { key: 'minutes', value: 8, quote: 'שמונה דקות בערך', speaker: 'client' },
  { key: 'errCost', value: 1800, quote: 'בסביבות אלף שמונה מאות שקל', speaker: 'client' }
];

console.log('\nthe chain');
test('runs from the first answer to the price', () => {
  const rows = F.build(M, INPUT, CITES);
  const ids = rows.map(r => r.id);
  ['runs', 'hours', 'time', 'err', 'annual', 'effort', 'price'].forEach(id =>
    assert.ok(ids.includes(id), 'missing step: ' + id));
  assert.strictEqual(ids[ids.length - 1], 'price', 'the chain must end at the price');
});
test('the last row shows the same price the model computed', () => {
  const rows = F.build(M, INPUT, CITES);
  const shown = rows.find(r => r.id === 'price').out.replace(/[^\d]/g, '');
  assert.strictEqual(+shown, Math.round(M.price),
    'a chain that ends somewhere else than the price beside it is a lie');
});
test('the annual figure on the chain is the model\'s own', () => {
  const rows = F.build(M, INPUT, CITES);
  const shown = rows.find(r => r.id === 'annual').out.replace(/[^\d]/g, '');
  assert.strictEqual(+shown, Math.round(M.annualValue));
});
test('each step reports the number the next one consumes', () => {
  const rows = F.build(M, INPUT, CITES);
  const runs = +rows.find(r => r.id === 'runs').out.replace(/[^\d]/g, '');
  assert.strictEqual(runs, Math.round(M.runs));
  assert.ok(rows.find(r => r.id === 'hours').formula.includes(runs.toLocaleString('en-US')),
    'the hours step must start from the runs the step above it reported');
});
test('every row says something in all three slots it promises', () => {
  F.build(M, INPUT, CITES).forEach(r => {
    assert.ok(r.title && r.formula && r.out, r.id + ' is incomplete');
    assert.ok(!/NaN|undefined|null/.test(r.title + r.formula + r.out), r.id + ': ' + r.formula);
  });
});

console.log('\nmissing inputs are absent, never zero');
test('nothing entered produces no chain at all', () => {
  assert.deepStrictEqual(F.build(compute({}), {}, []), []);
});
test('a deal with no error figure simply has no error step', () => {
  const noErr = Object.assign({}, INPUT, { errFreq: 0, errCost: 0 });
  const ids = F.build(compute(noErr), noErr, []).map(r => r.id);
  assert.ok(!ids.includes('err'), 'zero is a measurement; blank is the truth');
  assert.ok(ids.includes('annual'), 'the rest of the chain still runs');
});
test('systems with no volume still show the effort and the price', () => {
  const only = { systemCount: 3, integration: 1.4, edge: 1, myRate: 250, method: 'market' };
  const ids = F.build(compute(only), only, []).map(r => r.id);
  assert.ok(ids.includes('effort') && ids.includes('price'));
  assert.ok(!ids.includes('runs'));
});
test('a missing model does not throw', () => {
  assert.deepStrictEqual(F.build(null, null, null), []);
  assert.deepStrictEqual(F.build(undefined), []);
});

console.log('\nwhat was said');
test('a step carries the sentences that fed it', () => {
  const rows = F.build(M, INPUT, CITES);
  const runs = rows.find(r => r.id === 'runs');
  assert.strictEqual(runs.said.length, 1);
  assert.ok(runs.said[0].quote.includes('ארבעים'));
  assert.ok(rows.find(r => r.id === 'err').said.some(s => s.quote.includes('אלף שמונה מאות')));
});
test('no citations means no quotes, not a crash', () => {
  F.build(M, INPUT, []).forEach(r => assert.deepStrictEqual(r.said, []));
  assert.doesNotThrow(() => F.build(M, INPUT, null));
});
test('one sentence cited by two fields is printed once', () => {
  // the volume and its unit both come out of "about forty a day"
  const both = CITES.concat([{ key: 'freqUnit', value: '365',
    quote: 'בערך ארבעים ביום', speaker: 'client' }]);
  const runs = F.build(M, INPUT, both).find(r => r.id === 'runs');
  assert.strictEqual(runs.said.length, 1,
    'twice reads as two pieces of evidence where there is one');
});
test('the price step does not print two different upper bounds', () => {
  const price = F.build(M, INPUT, CITES).find(r => r.id === 'price');
  const inBasis = (price.formula.match(/[\d,]{4,}/g) || []);
  const inNote = (price.note.match(/[\d,]{4,}/g) || []);
  const overlap = inNote.filter(x => inBasis.includes(x));
  assert.ok(!/הטווח שניתן להגנה/.test(price.note),
    'the method basis already states the band; restating it with a different ' +
    'ceiling made the panel look like it contradicted itself');
  assert.strictEqual(overlap.length <= 1, true);
});
test('a quote never appears on a step it did not feed', () => {
  const rows = F.build(M, INPUT, CITES);
  const time = rows.find(r => r.id === 'time');
  assert.deepStrictEqual(time.said, [],
    'the capture rate is an assumption of ours, not something anyone said');
});

console.log('\nthe headline');
test('says what happened, with the two numbers that matter', () => {
  const h = F.headline(M, F.build(M, INPUT, CITES));
  assert.ok(h.includes(Math.round(M.annualValue).toLocaleString('en-US')));
  assert.ok(h.includes(Math.round(M.price).toLocaleString('en-US')));
});
test('with no client numbers it says so instead of implying there are some', () => {
  const only = { systemCount: 3, integration: 1.4, edge: 1, myRate: 250, method: 'market' };
  const m2 = compute(only);
  assert.ok(/עוד אין מספרים מהלקוח/.test(F.headline(m2, F.build(m2, only, []))));
});
test('nothing at all yields nothing to say', () => {
  const empty = compute({});
  assert.strictEqual(F.headline(empty, F.build(empty, {}, [])), null);
  assert.strictEqual(F.headline(null, null), null);
});
test('the headline never describes a chain the panel is not showing', () => {
  // the model reports a price for an empty form; the rows correctly refuse to
  const empty = compute({});
  assert.ok(empty.price > 0, 'the model still floors an empty form — that is the trap');
  assert.deepStrictEqual(F.build(empty, {}, []), []);
  assert.strictEqual(F.headline(empty, []), null);
});

console.log('\nthe weakest link');
test('names the step a dominant guess enters through', () => {
  const heavy = Object.assign({}, INPUT, { errCost: 40000 });
  const w = F.weakest(compute(heavy));
  assert.strictEqual(w.id, 'err');
  assert.ok(w.share > 55);
});
test('names the time chain when it carries almost everything', () => {
  const noErr = Object.assign({}, INPUT, { errFreq: 0, errCost: 0 });
  assert.strictEqual(F.weakest(compute(noErr)).id, 'hours');
});
test('a balanced deal has no weakest link to flag', () => {
  assert.strictEqual(F.weakest(M), null);
});
test('nothing computed flags nothing', () => {
  assert.strictEqual(F.weakest(compute({})), null);
  assert.strictEqual(F.weakest(null), null);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
