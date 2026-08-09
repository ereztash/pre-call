/* node assets/sender.test.js — no browser, no deps.

   The product shipped for months with no sender on the document and every
   check passed, because an absent letterhead breaks no rule. These are
   the rules that did not exist. */
const { make, block, missing, FIELDS, KEY } = require('./pc-sender.js');
const proposal = require('./pc-proposal.js');
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

const FULL = { s_name: 'דנה לוי', s_business: 'אוטומציות לעסקים קטנים',
               s_phone: '052-1234567', s_email: 'dana@example.co.il' };

console.log('\nstorage');
test('round trips every field', () => {
  const s = mem(), api = make(s);
  api.save(FULL);
  const back = api.load();
  FIELDS.forEach(f => assert.strictEqual(back[f], FULL[f], f + ' did not survive'));
});
test('values are trimmed on the way in', () => {
  const api = make(mem());
  api.save({ s_name: '  דנה לוי  ' });
  assert.strictEqual(api.load().s_name, 'דנה לוי');
});
test('attribution defaults to on and can be turned off', () => {
  const api = make(mem());
  api.save(FULL);
  assert.strictEqual(api.load().attribution, true);
  api.save(Object.assign({}, FULL, { attribution: false }));
  assert.strictEqual(api.load().attribution, false);
});
test('the sender never shares a key with the draft or the ledger', () => {
  assert.notStrictEqual(KEY, 'postcall_draft_v1');
  assert.notStrictEqual(KEY, 'postcall_deals_v1');
});
test('blocked storage reports failure instead of pretending', () => {
  const blocked = { getItem(){ throw new Error('x'); }, setItem(){ throw new Error('x'); },
                    removeItem(){ throw new Error('x'); } };
  const api = make(blocked);
  assert.strictEqual(api.save(FULL), false);
  assert.strictEqual(api.load(), null);
});
test('a corrupt value reads as absent rather than throwing', () => {
  const api = make(mem({ [KEY]: 'not json' }));
  assert.strictEqual(api.load(), null);
});

console.log('\nwhat is worth printing');
test('a name alone is enough for a letterhead', () => {
  const b = block({ s_name: 'דנה לוי' });
  assert.strictEqual(b.name, 'דנה לוי');
  assert.deepStrictEqual(b.contact, []);
});
test('contact details without a name print nothing at all', () => {
  assert.strictEqual(block({ s_phone: '052-1234567', s_email: 'x@y.co.il' }), null,
    'a header carrying only a phone number reads worse than no header');
  assert.strictEqual(missing({ s_phone: '052-1234567' }), true);
});
test('both contact routes appear when both are given', () => {
  assert.deepStrictEqual(block(FULL).contact, ['052-1234567', 'dana@example.co.il']);
});

console.log('\nthe document');
const ctxFor = sender => ({
  m: { price: 12000, effort: 20, hours: 400, runs: 100, annualValue: 90000, payback: 6,
       method: 'value', errValue: 0, M: {} },
  ils: n => '₪' + n.toLocaleString('en-US'),
  scope: { in: [{ t: 'בנייה' }], out: [], extra: [] },
  systems: ['וואטסאפ'], sender,
  f: { client: 'יבואן ציוד', process: 'הזמנות ידניות' },
  now: new Date('2026-08-09T00:00:00Z')
});

test('the sender appears in the document when set', () => {
  const html = proposal.build(ctxFor(FULL));
  assert.ok(html.includes('דנה לוי'), 'the name never reached the document');
  assert.ok(html.includes('אוטומציות לעסקים קטנים'), 'the business line is missing');
  assert.ok(html.includes('052-1234567'), 'the client has no way to reply');
});
test('no sender means no empty letterhead, not a blank one', () => {
  const html = proposal.build(ctxFor({}));
  assert.ok(!/class="from"/.test(html),
    'an empty letterhead block is worse than none — it prints a rule over nothing');
});
test('the document is signed off with the name', () => {
  const html = proposal.build(ctxFor(FULL));
  assert.ok(/class="signoff"/.test(html), 'a proposal that is not signed is not from anyone');
});
test('the attribution line is present by default and removable', () => {
  assert.ok(proposal.build(ctxFor(FULL)).includes('madewith'),
    'the one place this product travels on its own');
  assert.ok(!proposal.build(ctxFor(Object.assign({}, FULL, { attribution: false })))
    .includes('madewith'), 'the operator must be able to take it off');
});
test('a sender name containing markup is escaped, not injected', () => {
  const html = proposal.build(ctxFor({ s_name: '<script>alert(1)</script>' }));
  assert.ok(!html.includes('<script>alert'), 'unescaped sender name reached the document');
  assert.ok(html.includes('&lt;script&gt;'));
});

console.log('\nthe backup carries it');
test('the sender is included in a backup — losing it means every future proposal is unsigned', () => {
  const backup = require('./pc-backup.js');
  assert.ok(backup.DATA_KEYS.includes(KEY),
    'the sender key is not backed up; a cache clear would silently unsign every proposal after it');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
