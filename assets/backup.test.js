/* node assets/backup.test.js — no browser, no deps.

   The one property that matters most here is not "round trips" — it is
   "never carries the license state". Everything else is secondary to that. */
const PC_BACKUP = require('./pc-backup.js');
const assert = require('assert');

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

const mem = (seed = {}) => { const m = Object.assign({}, seed); return {
  _m: m,
  getItem: k => (k in m ? m[k] : null),
  setItem: (k, v) => { m[k] = String(v); },
  removeItem: k => { delete m[k]; }
}; };

const FULL_SEED = {
  precall_profile_v1: JSON.stringify({ f_what: 'מסדר תהליכי גבייה' }),
  postcall_deals_v1: JSON.stringify([{ id: '1', client: 'לקוח א' }]),
  postcall_draft_v1: JSON.stringify({ fields: { q_process: 'ידני' } }),
  postcall_sender_v1: JSON.stringify({ s_name: 'דנה לוי', s_phone: '052-1234567' }),
  /* The transition log. Added to DATA_KEYS because a history you can only rebuild
     by living through it again is not a history — and the anti-stale-fixture test
     below is what made this line necessary rather than optional. */
  postcall_journal_v1: JSON.stringify([
    { at: '2026-08-01T09:00:00.000Z', what: 'deal.status', to: 'draft', ref: 'd_1' },
    { at: '2026-08-01T09:05:00.000Z', what: 'deal.price', from: 12000, to: 10000, ref: 'd_1' }
  ]),
  postcall_key: 'PC-AAAA-BBBB',
  postcall_key_ok_at: '2026-08-01T00:00:00.000Z'
};

console.log('\nexport');
test('exports exactly the data keys, nothing else', () => {
  const out = PC_BACKUP.exportAll(mem(FULL_SEED));
  assert.deepStrictEqual(Object.keys(out.data).sort(), PC_BACKUP.DATA_KEYS.slice().sort());
});
test('never exports the license state, even when it is sitting right there in storage', () => {
  const out = PC_BACKUP.exportAll(mem(FULL_SEED));
  PC_BACKUP.EXCLUDED_KEYS.forEach(k => {
    assert.ok(!(k in out.data), k + ' must never appear in an exported backup');
  });
});
test('every data key the module claims is actually seeded by this test — a stale fixture hides a gap', () => {
  PC_BACKUP.DATA_KEYS.forEach(k => assert.ok(k in FULL_SEED,
    k + ' was added to DATA_KEYS but never to this test\'s seed, so nothing here covers it'));
});
test('a version and a timestamp are stamped on every export', () => {
  const out = PC_BACKUP.exportAll(mem(FULL_SEED));
  assert.strictEqual(out.version, PC_BACKUP.VERSION);
  assert.ok(Date.parse(out.at) > 0);
});
test('missing keys are simply absent, not written as null or empty string', () => {
  const out = PC_BACKUP.exportAll(mem({ precall_profile_v1: FULL_SEED.precall_profile_v1 }));
  assert.deepStrictEqual(Object.keys(out.data), ['precall_profile_v1']);
});
test('serialize produces the same shape as JSON text', () => {
  const text = PC_BACKUP.serialize(mem(FULL_SEED));
  const parsed = JSON.parse(text);
  assert.deepStrictEqual(Object.keys(parsed.data).sort(), PC_BACKUP.DATA_KEYS.slice().sort());
});

console.log('\nround trip');
test('what goes in comes back out, byte for byte per key', () => {
  const src = mem(FULL_SEED), dst = mem();
  const text = PC_BACKUP.serialize(src);
  const r = PC_BACKUP.importAll(text, dst);
  assert.strictEqual(r.ok, true);
  PC_BACKUP.DATA_KEYS.forEach(k => assert.strictEqual(dst.getItem(k), src.getItem(k)));
});
test('importing never writes the license state even if a crafted file smuggles it in', () => {
  const crafted = JSON.stringify({
    version: 1, at: new Date().toISOString(),
    data: { precall_profile_v1: 'x', postcall_key: 'PC-STOLEN-KEY0' }
  });
  const dst = mem();
  const r = PC_BACKUP.importAll(crafted, dst);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(dst.getItem('postcall_key'), null, 'a smuggled license key must never be written');
  assert.ok(r.foreign.indexOf('postcall_key') !== -1, 'the smuggled key should be reported, not silently dropped');
});

console.log('\npreview before overwrite');
test('preview reports which keys already exist without touching storage', () => {
  const dst = mem({ postcall_deals_v1: 'old ledger' });
  const text = PC_BACKUP.serialize(mem(FULL_SEED));
  const p = PC_BACKUP.preview(text, dst);
  assert.strictEqual(p.ok, true);
  assert.deepStrictEqual(p.willOverwrite, ['postcall_deals_v1']);
  assert.strictEqual(dst.getItem('postcall_deals_v1'), 'old ledger', 'preview must not write anything');
});
test('preview on an empty destination reports nothing to overwrite', () => {
  const text = PC_BACKUP.serialize(mem(FULL_SEED));
  const p = PC_BACKUP.preview(text, mem());
  assert.deepStrictEqual(p.willOverwrite, []);
});

console.log('\nrefusing bad input');
test('garbage text is reported, not thrown', () => {
  const r = PC_BACKUP.importAll('not json at all', mem());
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, 'not_json');
});
test('valid JSON with no data field is refused', () => {
  const r = PC_BACKUP.importAll(JSON.stringify({ version: 1 }), mem());
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, 'bad_shape');
});
test('a future version this file cannot read is refused, not partially applied', () => {
  const r = PC_BACKUP.importAll(JSON.stringify({ version: 99, data: { precall_profile_v1: 'x' } }), mem());
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, 'unknown_version');
});
test('a file with only foreign keys is refused as empty', () => {
  const r = PC_BACKUP.importAll(JSON.stringify({ version: 1, data: { some_other_key: 'x' } }), mem());
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, 'empty');
});
test('a partially-recognised file imports the known keys and reports the rest as foreign', () => {
  const dst = mem();
  const r = PC_BACKUP.importAll(JSON.stringify({
    version: 1, data: { precall_profile_v1: 'x', unknown_future_key: 'y' }
  }), dst);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.imported, ['precall_profile_v1']);
  assert.deepStrictEqual(r.foreign, ['unknown_future_key']);
});

console.log('\nfailure modes');
test('blocked storage on import reports what was skipped, not a throw', () => {
  const blocked = { getItem: () => null, setItem() { throw new Error('quota'); }, removeItem(){} };
  const text = PC_BACKUP.serialize(mem(FULL_SEED));
  const r = PC_BACKUP.importAll(text, blocked);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.imported, []);
  assert.strictEqual(r.skipped.length, PC_BACKUP.DATA_KEYS.length);
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
