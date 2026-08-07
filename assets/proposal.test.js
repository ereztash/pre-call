/* node assets/proposal.test.js — no browser, no deps.

   The proposal is the product. Until it was pulled out of the UI layer the
   only way to see what it said was to fill a form in a browser and read the
   result, which is why things like an unbounded tuning commitment or a client
   name landing unescaped could sit in it unnoticed. */
require('./model.js');
const P = require('./pc-proposal.js');
const assert = require('assert');

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

const ils = globalThis.PC.model.ils;
const compute = globalThis.PC.model.compute;

const scope = (inn = [], out = [], extra = []) => ({
  in: inn.map(t => ({ t })), out: out.map(t => ({ t })), extra: extra.map(t => ({ t }))
});

// a normal deal: 20 a week, 7 minutes each, two systems, some error cost
const M = compute({ freq: 20, freqUnit: 52, minutes: 7, rate: 60, capture: 0.7,
                    errFreq: 3, errCost: 400, systemCount: 2, integration: 1,
                    edge: 1, myRate: 250, maintPct: 0, method: 'value' });

const ctx = (over = {}) => Object.assign({
  m: M, ils,
  scope: scope(['מיפוי התהליך'], ['ניקוי נתונים'], ['תחזוקה שוטפת']),
  systems: ['וואטסאפ', 'CRM'],
  f: { client: 'מאפייה', process: 'הזמנות מוקלדות ידנית' },
  now: new Date('2026-03-04T09:00:00Z')
}, over);

console.log('\nstructure');
test('renders every section a proposal needs', () => {
  const h = P.build(ctx());
  ['מה קורה היום', 'מה נכלל', 'מה לא נכלל', 'זמין בתוספת תשלום',
   'המחיר', 'לוח זמנים', 'איך נדע שזה הצליח', 'ההחלטה'].forEach(s =>
    assert.ok(h.includes(s), 'missing section: ' + s));
});
test('an empty section is omitted, not left as a bare heading', () => {
  const h = P.build(ctx({ scope: scope(['מיפוי'], [], []) }));
  assert.ok(h.includes('מה נכלל'));
  assert.ok(!h.includes('מה לא נכלל'), 'a heading over nothing reads as an oversight');
  assert.ok(!h.includes('זמין בתוספת תשלום'));
});
test('optional fields appear only when supplied', () => {
  const bare = P.build(ctx());
  assert.ok(!bare.includes('למה עכשיו'));
  assert.ok(!bare.includes('מה שונה הפעם'));
  assert.ok(!bare.includes('מי שצריך לאשר'));
  const full = P.build(ctx({ f: { client: 'מאפייה', process: 'x', trigger: 'איבדנו לקוח',
                                  prev: 'ניסינו תוסף', decider: 'המנכ"ל', deadline: 'סוף הרבעון' } }));
  ['למה עכשיו', 'מה שונה הפעם', 'מי שצריך לאשר', 'היעד שהגדרת'].forEach(s =>
    assert.ok(full.includes(s), 'missing: ' + s));
});
test('the systems are named inside the first included line', () => {
  const h = P.build(ctx());
  assert.ok(/מיפוי התהליך, כולל החיבורים בין וואטסאפ, CRM/.test(h));
});

console.log('\ndates');
test('the offer is dated today and valid for fourteen days', () => {
  const h = P.build(ctx());
  assert.ok(h.includes('4.3.2026'), 'issue date');
  assert.ok(h.includes('18.3.2026'), 'fourteen days later');
});
test('the validity date is repeated in the decision section', () => {
  const h = P.build(ctx());
  assert.strictEqual((h.match(/18\.3\.2026/g) || []).length, 2,
    'the deadline must appear in the header and where the client acts on it');
});

console.log('\nsafety');
test('a client name with markup in it cannot inject html', () => {
  const h = P.build(ctx({ f: { client: '<img src=x onerror=alert(1)>', process: 'x' } }));
  assert.ok(!h.includes('<img'), 'raw tag reached the document');
  assert.ok(h.includes('&lt;img'), 'it should be shown as text');
});
test('every free-text field is escaped, not just the client', () => {
  const bad = '<script>x</script>';
  const h = P.build(ctx({ f: { client: bad, process: bad, trigger: bad, prev: bad,
                               decider: bad, deadline: bad, success: bad } }));
  assert.ok(!h.includes('<script>'), 'unescaped field found');
});
test('the tuning commitment is always bounded', () => {
  [0, 1, 4, 40, 400].forEach(effort => {
    const h = P.build(ctx({ m: Object.assign({}, M, { effort }) }));
    const cap = h.match(/עד (\d+) שעות עבודה/);
    assert.ok(cap, 'no hours ceiling at effort=' + effort);
    assert.ok(+cap[1] >= 4, 'the floor keeps it from reading as "no tuning at all"');
  });
});

console.log('\nrationale matches the method');
test('value pricing cites the annual cost and the payback', () => {
  const h = P.build(ctx());
  assert.ok(h.includes('מאיפה המחיר'));
  assert.ok(/מהערך של השנה הראשונה/.test(h));
});
test('cost pricing never shows the client an hour breakdown', () => {
  const cost = compute({ freq: 20, freqUnit: 52, minutes: 7, rate: 60, capture: 0.7,
                         systemCount: 2, integration: 1, edge: 1, myRate: 250, method: 'cost' });
  const h = P.build(ctx({ m: cost }));
  assert.ok(h.includes('מאיפה המחיר'));
  assert.ok(!/שעות עבודה שלי|התעריף שלי/.test(h),
    'justifying with hours invites a negotiation about hours');
});
test('a method with no data produces no rationale rather than a false one', () => {
  const bare = compute({ systemCount: 2, integration: 1, edge: 1, myRate: 250, method: 'comparable' });
  const h = P.build(ctx({ m: bare }));
  assert.ok(!h.includes('עבודה דומה שביצעתי'), 'no comparable was ever entered');
});

console.log('\ntitle');
test('a long first line is cut on a word boundary', () => {
  const long = 'כל הזמנה שנכנסת בוואטסאפ מוקלדת ידנית לגיליון ואז נפתחת חשבונית במערכת ונשלחת ללקוח';
  const t = P.titleFrom(long);
  assert.ok(t.endsWith('…'));
  assert.ok(!/\s…$/.test(t), 'no dangling space before the ellipsis');
  assert.ok(long.startsWith(t.slice(0, -1)), 'the cut must be a prefix of the original');
});
test('only the first line becomes the title', () => {
  assert.strictEqual(P.titleFrom('שורה ראשונה\nשורה שנייה'), 'שורה ראשונה');
});
test('no process text still yields a usable heading', () => {
  const h = P.build(ctx({ f: { client: 'א', process: '' } }));
  assert.ok(h.includes('אוטומציה של התהליך'));
  assert.ok(h.includes('התהליך מתבצע ידנית'));
});

console.log('\ndeterminism');
test('the same context twice gives byte-identical output', () => {
  assert.strictEqual(P.build(ctx()), P.build(ctx()));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
