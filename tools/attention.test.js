/* Tests for the attention model. Runs in Node with no browser and no deps:
   node tools/attention.test.js

   The model is pure, so the claims it makes are checkable here rather than by
   arguing about whether a paragraph "feels long". Several of these tests exist
   to pin down properties that are easy to state and easy to accidentally break
   — especially the telescoping result, which is the reason the model is allowed
   to say "position does not affect completion" out loud. */
const A = require('./attention.js');
const assert = require('assert');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}

const step = (id, o) => Object.assign({ id, words: 0, fields: 0, choices: 0, blocks: 1 }, o);
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) < eps,
  (msg || '') + ' expected ' + b + ' got ' + a);

/* --- provenance ---------------------------------------------------------
   A model is only as honest as its willingness to say which numbers nobody
   measured. If a constant ever loses its citation, this fails. */
test('every constant carries a source', () => {
  for (const k in A.CONSTANTS) {
    const c = A.CONSTANTS[k];
    assert.ok(c.src && c.src.length > 30, k + ' has no meaningful source');
    assert.ok(Array.isArray(c.band) && c.band.length === 2, k + ' has no band');
    assert.ok(c.band[0] <= c.value && c.value <= c.band[1], k + ' value outside its own band');
  }
});

test('assumed constants say so in the text, not only in the flag', () => {
  for (const k in A.CONSTANTS) {
    const c = A.CONSTANTS[k];
    if (c.assumed) assert.ok(/ASSUMED/.test(c.src), k + ' is assumed but does not admit it');
  }
});

/* --- cost ---------------------------------------------------------------- */

test('cost splits into read, decide and input, and they sum', () => {
  const c = A.stepCost(step('x', { words: 100, fields: 2, choices: 3 }), A.tunables());
  near(c.totalMs, c.readMs + c.decideMs + c.inputMs, 1e-9, 'channels do not sum:');
  assert.ok(c.readMs > 0 && c.decideMs > 0 && c.inputMs > 0);
});

test('words are discounted by the scan factor, not read in full', () => {
  const t = A.tunables();
  const c = A.stepCost(step('x', { words: 220, blocks: 0 }), t);
  // 220 words at 220wpm is 60s read in full; at 28% scanned it is ~16.8s
  near(c.readMs, 60000 * t.scan, 1, 'scan factor not applied:');
});

test('a skipped block still costs a glance', () => {
  const c = A.stepCost(step('x', { words: 0, blocks: 4 }), A.tunables());
  near(c.readMs, 4 * A.CONSTANTS.glanceMs.value, 1e-9, 'glance floor missing:');
});

test('no choices means no Hick term', () => {
  assert.strictEqual(A.stepCost(step('x', { choices: 0 }), A.tunables()).decideMs, 0);
});

test('Hick is logarithmic, not linear, in the number of options', () => {
  const t = A.tunables();
  const d = n => A.stepCost(step('x', { choices: n }), t).decideMs;
  // doubling options adds one bit, i.e. a constant, not a doubling
  near(d(7) - d(3), d(15) - d(7), 1e-9, 'not log2:');
});

/* --- dwell --------------------------------------------------------------- */

test('dwell survival falls monotonically and starts at 1', () => {
  assert.strictEqual(A.dwellSurvival(0, A.tunables()), 1);
  let prev = 1;
  for (let s = 1; s < 600; s += 7) {
    const v = A.dwellSurvival(s, A.tunables());
    assert.ok(v < prev, 'not monotonic at ' + s);
    prev = v;
  }
});

test('negative aging: the hazard falls as the session goes on', () => {
  const t = A.tunables();
  const lossOver = (a, b) => 1 - A.dwellSurvival(b, t) / A.dwellSurvival(a, t);
  // the same 10 seconds costs more early than late
  assert.ok(lossOver(0, 10) > lossOver(100, 110));
  assert.ok(lossOver(100, 110) > lossOver(500, 510));
});

/* --- the telescoping result ---------------------------------------------
   This is the load-bearing claim: for COMPLETION, only the totals matter.
   If this ever fails, the report's "cut anywhere" advice is wrong and the
   per-step word price has to come back. */

test('completion depends only on total words, not on where they sit', () => {
  const front = [step('a', { words: 300 }), step('b', { words: 50 }), step('c', { words: 50 })];
  const back  = [step('a', { words: 50 }),  step('b', { words: 50 }), step('c', { words: 300 })];
  const even  = [step('a', { words: 133 }), step('b', { words: 133 }), step('c', { words: 134 })];
  const c = f => A.simulate(f).completion;
  near(c(front), c(back), 1e-9, 'front/back differ:');
  near(c(front), c(even), 2e-4, 'front/even differ:');
});

test('completion depends only on total fields, not on where they sit', () => {
  const a = [step('a', { fields: 6 }), step('b', { fields: 0 })];
  const b = [step('a', { fields: 0 }), step('b', { fields: 6 })];
  near(A.simulate(a).completion, A.simulate(b).completion, 1e-9, 'field order matters:');
});

test('but the BOUNDARY does move with distribution — that is the whole point', () => {
  const heavy = [step('a', { words: 4000 }), step('b', { words: 40 }), step('c', { words: 40 })];
  const light = [step('a', { words: 40 }), step('b', { words: 40 }), step('c', { words: 4000 })];
  const bi = f => { const r = A.simulate(f); return r.boundary ? r.boundary.index : f.length; };
  assert.ok(bi(heavy) < bi(light),
    'front-loading the words did not pull the boundary earlier');
});

/* --- calibration and the ceiling ----------------------------------------- */

test('calibrate solves for the patience that reproduces a target', () => {
  const f = [step('a', { words: 200, fields: 2 }), step('b', { words: 200, fields: 3 })];
  for (const target of [0.25, 0.4, 0.6]) {
    const scale = A.calibrate(f, target);
    near(A.simulate(f, { weibullScale: scale }).completion, target, 1e-3,
      'calibration missed ' + target + ':');
  }
});

test('ceiling is what survives when words and time are free', () => {
  const t = A.tunables();
  const f = [step('a', { words: 9999, fields: 4 }), step('b', { words: 9999, fields: 1 })];
  const cap = A.ceiling(f);
  near(cap.completion, Math.pow(1 - t.fieldHazard, 5), 1e-6, 'ceiling is not the field term:');
  assert.strictEqual(cap.fields, 5);
});

test('a funnel can be structurally incapable of hitting the benchmark', () => {
  // 30 fields alone put the ceiling under the average web form
  const f = [step('a', { fields: 30 })];
  const cap = A.ceiling(f);
  assert.ok(cap.completion < A.BENCHMARK_COMPLETION,
    'expected the ceiling to fall short, got ' + cap.completion);
  // and in that case calibrate saturates rather than converging
  const scale = A.calibrate(f);
  assert.ok(A.simulate(f, { weibullScale: scale }).completion < A.BENCHMARK_COMPLETION,
    'calibrate claimed to reach a target above the ceiling');
});

/* --- exits --------------------------------------------------------------- */

test('an exit step is charged once, as survival, not as time', () => {
  const t = A.tunables();
  const plain = [step('a', { words: 100 })];
  const exit  = [step('a', { words: 100, exits: true })];
  near(A.simulate(exit).completion,
       A.simulate(plain).completion * (1 - t.exitHazard), 1e-9, 'exit term wrong:');
  // and it does not change the time spent
  near(A.simulate(exit).totalSec, A.simulate(plain).totalSec, 1e-9, 'exit changed elapsed time:');
});

/* --- boundary and value -------------------------------------------------- */

test('the boundary is the first step below half the starters', () => {
  const f = [step('a', { fields: 2 }), step('b', { fields: 30 }), step('c', { fields: 1 })];
  const r = A.simulate(f);
  assert.strictEqual(r.boundary.index, 1);
  assert.ok(r.steps[0].survival >= 0.5 && r.steps[1].survival < 0.5);
});

test('no boundary is reported when the funnel never loses half', () => {
  assert.strictEqual(A.simulate([step('a', { words: 5 })]).boundary, null);
});

test('first value and full value are tracked separately', () => {
  const f = [step('a', { words: 20, value: true }), step('b', { fields: 20 }),
             step('c', { words: 20, value: true })];
  const r = A.simulate(f);
  assert.strictEqual(r.firstValue.id, 'a');
  assert.strictEqual(r.valueStep.id, 'c');
  assert.ok(r.firstValue.survival > r.valueStep.survival);
});

/* --- levers -------------------------------------------------------------- */

test('one field outweighs 100 words — the finding the report leads with', () => {
  const base = [step('a', { words: 400, fields: 6 }), step('b', { words: 400, fields: 6 })];
  const c = f => A.simulate(f).completion;
  const lessWords  = [step('a', { words: 300, fields: 6 }), step('b', { words: 400, fields: 6 })];
  const lessFields = [step('a', { words: 400, fields: 5 }), step('b', { words: 400, fields: 6 })];
  assert.ok(c(lessFields) - c(base) > c(lessWords) - c(base),
    'removing a field did not beat cutting 100 words');
});

test('wordValue reports a single position-independent completion price', () => {
  const f = [step('a', { words: 300 }), step('b', { words: 300 }), step('c', { words: 300 })];
  const v = A.wordValue(f);
  assert.ok(v.completionPer100 > 0);
  const gains = v.perStep.map(p => p.completionGain);
  near(Math.max(...gains), Math.min(...gains), 1e-9,
    'per-step completion gains differ, so telescoping is broken:');
});

/* --- sensitivity --------------------------------------------------------- */

test('sensitivity re-calibrates, so completion stays pinned across the sweep', () => {
  const f = [step('a', { words: 300, fields: 3 }), step('b', { words: 300, fields: 3 })];
  const s = A.sensitivity(f);
  const bench = s.rows.filter(r => r.knob !== 'benchmark');
  for (const r of bench) {
    near(r.completion, A.BENCHMARK_COMPLETION, 1e-3,
      'row ' + r.knob + '=' + r.at + ' drifted off the benchmark:');
  }
});

test('the free parameter is solved, never swept', () => {
  const f = [step('a', { words: 300, fields: 3 })];
  assert.ok(A.sensitivity(f).rows.every(r => r.knob !== 'weibullScale'),
    'weibullScale was swept as if it were an independent input');
});

test('sensitivity reports whether the boundary held', () => {
  const s = A.sensitivity([step('a', { words: 300, fields: 3 }), step('b', { words: 300, fields: 3 })]);
  assert.strictEqual(typeof s.stable, 'boolean');
  assert.ok(s.boundaryMin <= s.boundaryMax);
});

console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
