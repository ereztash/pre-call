/* node assets/draft.test.js — no browser, no deps.

   This module exists because of a measured loss, not a hypothetical one: a
   reload during a draft left storage empty and the form blank. So the tests
   are about the loss, not about the getters. */
const { make, FIELDS, KEY } = require('./pc-draft.js');
const assert = require('assert');

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

const mem = () => { const m = {}; return {
  _m: m,
  getItem: k => (k in m ? m[k] : null),
  setItem: (k, v) => { m[k] = String(v); },
  removeItem: k => { delete m[k]; }
}; };

const filled = (over = {}) => ({
  fields: Object.assign({ q_process: 'הזמנות מוקלדות ידנית', q_freq: '20', q_minutes: '7' }, over),
  systems: ['וואטסאפ'], scope: { map: 'in' }, template: 'orders', dealId: null, override: 'auto'
});

console.log('\nround trip');
test('what goes in comes back out', () => {
  const s = mem(), d = make(s);
  d.save(filled());
  const back = d.load();
  assert.strictEqual(back.fields.q_process, 'הזמנות מוקלדות ידנית');
  assert.deepStrictEqual(back.systems, ['וואטסאפ']);
  assert.strictEqual(back.template, 'orders');
  assert.strictEqual(back.scope.map, 'in');
});
test('a save stamps the time so the operator can be told the draft is stale', () => {
  const d = make(mem());
  d.save(filled());
  assert.ok(Date.parse(d.load().at) > 0);
});
test('clearing removes it and leaves nothing behind', () => {
  const s = mem(), d = make(s);
  d.save(filled()); d.clear();
  assert.strictEqual(d.load(), null);
  assert.deepStrictEqual(Object.keys(s._m), []);
});
test('the draft never shares a key with the saved deals', () => {
  assert.notStrictEqual(KEY, 'postcall_deals_v1',
    'a corrupt draft must not be able to take the ledger with it');
});

console.log('\nfailure modes');
test('blocked storage reports failure instead of pretending', () => {
  const blocked = { getItem(){ throw new Error('x'); }, setItem(){ throw new Error('x'); },
                    removeItem(){ throw new Error('x'); } };
  const d = make(blocked);
  assert.strictEqual(d.save(filled()), false, 'the operator has to be told it will not survive');
  assert.strictEqual(d.load(), null);
});
test('corrupt json degrades to nothing rather than throwing on boot', () => {
  const s = mem(); s.setItem('postcall_draft_v1', '{broken');
  assert.strictEqual(make(s).load(), null);
});
test('a non-object payload is refused', () => {
  const s = mem(); s.setItem('postcall_draft_v1', '"just a string"');
  assert.strictEqual(make(s).load(), null);
});

console.log('\nwhen not to restore');
test('nothing saved is not a draft', () => {
  const d = make(mem());
  assert.strictEqual(d.isEmpty(null), true);
  assert.strictEqual(d.isEmpty(d.load()), true);
});
const PRISTINE = { q_freq_unit: '52', q_role: '85', q_integration: '1.4',
                   q_edge: '1', q_provenance: 'prompted', q_client: '', q_process: '' };
test('a form where only the untouched selects are set is still empty', () => {
  const d = make(mem());
  assert.strictEqual(d.isEmpty({ fields: { q_freq_unit: '52', q_role: '85',
    q_integration: '1.4', q_edge: '1', q_provenance: 'prompted' }, systems: [] }, PRISTINE), true,
    'otherwise every first visit claims to have recovered a draft');
});
test('a select moved off its default IS content', () => {
  assert.strictEqual(make(mem()).isEmpty(
    { fields: { q_provenance: 'mine' }, systems: [] }, PRISTINE), false,
    'changing where the number came from is a real decision worth restoring');
});
test('one real field is enough to be worth restoring', () => {
  assert.strictEqual(make(mem()).isEmpty({ fields: { q_client: 'מאפייה' }, systems: [] }, PRISTINE), false);
});
test('a chosen system alone is enough', () => {
  assert.strictEqual(make(mem()).isEmpty({ fields: {}, systems: ['וואטסאפ'] }, PRISTINE), false);
});
test('whitespace is not content', () => {
  assert.strictEqual(make(mem()).isEmpty({ fields: { q_client: '   ' }, systems: [] }, PRISTINE), true);
});
test('with no pristine snapshot, any filled field counts', () => {
  // the module must not silently treat everything as empty if the caller
  // forgets to pass the baseline
  assert.strictEqual(make(mem()).isEmpty({ fields: { q_freq_unit: '52' }, systems: [] }), false);
});

console.log('\nage');
test('reports how old the draft is, in words', () => {
  const d = make(mem());
  const at = t => ({ at: new Date(t).toISOString() });
  const now = new Date('2026-03-04T12:00:00Z');
  assert.strictEqual(d.age(at('2026-03-04T11:59:40Z'), now), 'לפני פחות מדקה');
  assert.strictEqual(d.age(at('2026-03-04T11:40:00Z'), now), 'לפני 20 דקות');
  assert.strictEqual(d.age(at('2026-03-04T09:00:00Z'), now), 'לפני 3 שעות');
  assert.strictEqual(d.age(at('2026-03-01T12:00:00Z'), now), 'לפני 3 ימים');
});
test('a draft with no timestamp or a broken one reports nothing rather than a lie', () => {
  const d = make(mem());
  assert.strictEqual(d.age({}), null);
  assert.strictEqual(d.age({ at: 'not a date' }), null);
});

console.log('\nfield list');
test('covers every input whose loss would cost the session', () => {
  ['q_process','q_client','q_freq','q_minutes','q_err_freq','q_err_cost',
   'q_trigger','q_prev','q_decider','q_success','q_provenance'].forEach(f =>
    assert.ok(FIELDS.includes(f), f + ' would be lost on reload'));
});
test('the list has no duplicates', () => {
  assert.strictEqual(new Set(FIELDS).size, FIELDS.length);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
