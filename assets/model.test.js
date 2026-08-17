/* Tests for the pricing model. Runs in Node with no browser and no deps:
   node assets/model.test.js
   The model is pure, so every rule that decides a price is checkable here
   rather than by filling a form and reading pixels. */
const M = require('./model.js');
const assert = require('assert');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}

// a mid-sized job: 20 runs/week, 7 min each, ops coordinator, 3 systems
const base = {
  freq: 20, freqUnit: 52, minutes: 7, rate: 85, capture: 0.8,
  errFreq: 3, errCost: 400, systemCount: 3, integration: 1.4, edge: 1.25,
  myRate: 250, maintPct: 15, method: 'value'
};

console.log('\nvalue calculation');
test('hours = runs x minutes / 60', () => {
  assert.strictEqual(Math.round(M.compute(base).hours), 121);
});
test('annual value = time + errors', () => {
  const r = M.compute(base);
  assert.strictEqual(Math.round(r.timeValue + r.errValue), Math.round(r.annualValue));
});
test('errShare reports how much rests on the guessed error figure', () => {
  assert.ok(M.compute(base).errShare > 0.6, 'errors dominate this case');
});
test('no client numbers -> no value method, tool still prices', () => {
  const r = M.compute({ ...base, freq: 0, minutes: 0, errFreq: 0, errCost: 0 });
  assert.strictEqual(r.M.value, null);
  assert.ok(r.price > 0, 'falls back rather than showing nothing');
});

console.log('\ncost floor');
test('no method prices below delivery cost', () => {
  const r = M.compute(base);
  r.available.forEach(k => assert.ok(r.M[k].value >= r.costFloor,
    k + ' priced under the floor'));
});
test('a method pushed up to the floor is flagged as raised', () => {
  // tiny process, real build: value pricing lands under cost
  const r = M.compute({ ...base, freq: 2, minutes: 3, errFreq: 0, errCost: 0 });
  assert.strictEqual(r.M.value.raised, true);
  assert.ok(r.M.value.value > r.M.value.raw);
});

console.log('\nwhich method pays most');
test('value wins when the process is expensive next to the build', () => {
  const r = M.compute({ ...base, minutes: 15, rate: 215, errCost: 900, errFreq: 4 });
  assert.strictEqual(r.best, 'value');
  assert.ok(r.M.value.value > r.M.cost.value * 2, 'and by a wide margin');
});
test('cost wins when the process is cheap', () => {
  const r = M.compute({ ...base, freq: 5, minutes: 3, errFreq: 0, errCost: 0 });
  assert.notStrictEqual(r.best, 'value');
});
test('best never exceeds the defensibility ceiling', () => {
  const r = M.compute(base);
  if (r.best) assert.ok(r.M[r.best].value <= r.high + 1);
});

console.log('\nmethod availability');
test('comparable appears only with a past deal', () => {
  assert.strictEqual(M.compute(base).M.comparable, null);
  assert.ok(M.compute({ ...base, compLast: 6000, compScale: 1.5 }).M.comparable);
});
test('market tier follows system count', () => {
  assert.strictEqual(M.compute({ ...base, systemCount: 2, integration: 1.0 }).M.market.raw, 2750);
  assert.strictEqual(M.compute({ ...base, systemCount: 5 }).M.market.raw, 18000);
});
test('unknown method falls back instead of throwing', () => {
  const r = M.compute({ ...base, method: 'nope' });
  assert.strictEqual(r.usedFallback, true);
  assert.ok(r.price > 0);
});

console.log('\nguardrails');
test('payback is computed net of maintenance', () => {
  assert.ok(M.compute(base).payback > 0);
});
test('tooThin fires when the build outruns what the value justifies', () => {
  assert.strictEqual(M.compute({ ...base, freq: 2, minutes: 2, errFreq: 0, errCost: 0 }).tooThin, true);
});
test('healthy deal is not flagged', () => {
  assert.strictEqual(M.compute({ ...base, minutes: 15, rate: 215, errCost: 900, errFreq: 4 }).tooThin, false);
});

console.log('\nrobustness');
test('empty input does not throw and yields no negative price', () => {
  const r = M.compute({});
  assert.ok(r.price >= 0);
  assert.ok(Number.isFinite(r.price));
});
test('prices round to 10, never to a bare hundred by accident', () => {
  assert.strictEqual(M.compute(base).price % 10, 0);
});

console.log('\nevery reported number is a number');
test('nothing the UI prints comes back NaN', () => {
  /* The defensible band read "₪NaN" for as long as it existed: PRICE has a
     bandLow, never a low, so the multiplication produced NaN, nothing threw,
     and no test looked. Anything the screen shows gets checked for being a
     number at all. */
  const cases = [
    { freq: 20, freqUnit: 52, minutes: 7, rate: 85, capture: 0.7, errFreq: 3,
      errCost: 400, systemCount: 2, integration: 1.4, edge: 1, myRate: 250, method: 'value' },
    { systemCount: 1, integration: 1, edge: 1, myRate: 250, method: 'market' },
    { freq: 1, freqUnit: 12, minutes: 1, rate: 60, capture: 0.5, systemCount: 0,
      integration: 1, edge: 1, myRate: 250, method: 'cost' },
    {}
  ];
  const NUMERIC = ['runs','hours','timeValue','errValue','annualValue','effort',
                   'floor','costFloor','price','high','low','payback','errShare','spread'];
  cases.forEach((c, i) => {
    const m = M.compute(c);
    NUMERIC.forEach(k => assert.ok(typeof m[k] === 'number' && !Number.isNaN(m[k]),
      'case ' + i + ': ' + k + ' is ' + m[k]));
  });
});
test('the defensible band sits below the ceiling and above zero', () => {
  const m = M.compute({ freq: 20, freqUnit: 52, minutes: 7, rate: 85, capture: 0.7,
                        errFreq: 3, errCost: 400, systemCount: 2, integration: 1.4,
                        edge: 1, myRate: 250, method: 'value' });
  assert.ok(m.low > 0);
  assert.ok(m.low < m.high, 'a band whose bottom is not below its top is not a band');
});

console.log('\nthe engine chooses its own path');
/* pickMethod moved here out of pc-guide.js. What it returns is not advice —
   it is the key compute() looks up to decide which of the four methods sets
   the price, so a fifth name, a typo, or an undefined would not produce worse
   guidance, it would produce no price at all. The guide layer is being
   replaced; this guard is what makes that safe to do. */
test('every method it can return is one the engine can actually price', () => {
  const known = ['cost', 'market', 'value', 'comparable'];
  [{}, { freq: 20, minutes: 7 }, { freq: 20, minutes: 7, numbersAreMine: true },
   { numbersAreMine: true }, { comparableLast: 8000 }, { comparableLast: 0 },
   { freq: 0, minutes: 0 }, { freq: 20, minutes: 7, comparableLast: 8000 }]
    .forEach(s => {
      const p = M.pickMethod(s);
      assert.ok(known.includes(p.method),
        'pickMethod returned ' + JSON.stringify(p.method) + ' and compute() has no such method');
      assert.ok(M.METHOD_LABEL[p.method], 'no label for ' + p.method);
    });
});

test('a chosen method that has no data still yields a price, never NaN', () => {
  /* value and comparable return null inside compute() when their inputs are
     missing. pickMethod can name value on the strength of freq and minutes
     alone, while compute() needs a rate and a capture rate as well — so the
     pair has to survive the gap between them. */
  const m = M.compute({ freq: 20, freqUnit: 52, minutes: 7, systemCount: 2,
                        method: M.pickMethod({ freq: 20, minutes: 7 }).method });
  assert.ok(Number.isFinite(m.price), 'the price is not a number: ' + m.price);
  assert.ok(m.price > 0, 'a method with no data priced the work at ' + m.price);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
