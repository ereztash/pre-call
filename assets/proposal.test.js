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
/* This test used to require an ellipsis on every long title, which
   encoded the behaviour that was itself the fault: the client's first line
   arrived guillotined. The intent it was protecting — a long process must
   not produce an unbounded heading — is still right, so it is kept and the
   mechanism assertion is dropped. */
test('a long first line yields a bounded title, however it gets there', () => {
  const long = 'כל הזמנה שנכנסת בוואטסאפ מוקלדת ידנית לגיליון ואז נפתחת חשבונית במערכת ונשלחת ללקוח';
  const t = P.titleFrom(long);
  assert.ok(t.length <= 62, 'the heading is unbounded: ' + t.length + ' chars');
  assert.ok(long.startsWith(t.replace(/…$/, '')), 'the title must be a prefix of what was written');
  assert.ok(!/\s…$/.test(t), 'no dangling space before an ellipsis');
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

console.log('\nthe document as the client receives it');
/* Three faults found by rendering the document and looking at it, which
   nothing in this project had ever done — every check had been run against
   the tool and none against its output. */
test('the title is a complete thought, not a sentence cut mid-word', () => {
  const t = P.titleFrom('כל הזמנה שנכנסת בוואטסאפ מוקלדת ידנית לגיליון, ואז נפתחת חשבונית במורנינג ונשלחת חזרה');
  assert.ok(!t.includes('…'), 'the first line the client reads was guillotined: ' + t);
  assert.ok(!/ואז$/.test(t), 'it ended on a conjunction going nowhere');
  assert.strictEqual(t, 'כל הזמנה שנכנסת בוואטסאפ מוקלדת ידנית לגיליון');
});
test('a sequence word breaks the title just like punctuation does', () => {
  assert.strictEqual(P.titleFrom('מישהו עובר על החשבוניות הפתוחות ואז שולח תזכורות ידנית'),
    'מישהו עובר על החשבוניות הפתוחות');
});
test('a clause too short to say anything keeps the fuller line instead', () => {
  assert.strictEqual(P.titleFrom('גבייה, תזכורות ומעקב אחרי לקוחות'), 'גבייה, תזכורות ומעקב אחרי לקוחות',
    '"גבייה" alone is a worse title than the line it came from');
});
test('an unpunctuated monster still gets cut on a word boundary, as a last resort', () => {
  const t = P.titleFrom('תהליך ארוך במיוחד בלי שום סימן פיסוק שממשיך ונמשך ואינו נגמר לעולם וכך הלאה עוד ועוד');
  assert.ok(t.length <= 62 && t.endsWith('…'));
  assert.ok(!/\S…$/.test(t.replace('…','')) || !t.includes('  '), 'cut mid-word');
});

test('the client copy never states the build estimate', () => {
  /* "שעות עבודה" appears three times for good reasons — the client's own
     annual hours, the hours they get back each week, and the bounded tuning
     commitment. None of those is the operator's build estimate, which is
     the one figure rationaleFor() says must stay out because quoting it
     invites a negotiation about hours instead of about worth. So this
     asserts on that number specifically, with a value chosen not to collide
     with anything else the document prints. */
  const EFFORT = 4242;
  const html = P.build(ctx({
    m: Object.assign({}, ctx().m, { effort: EFFORT }),
    f: { client: 'לקוח', process: 'תהליך ידני' }
  }));
  assert.ok(!html.includes(String(EFFORT)),
    'the build estimate reached the client copy — it belongs on the operator\'s screen');
  assert.ok(/שבועות/.test(html), 'how long it takes is what the client is owed, and must stay');
});

test('exclusions are not the loudest thing on the page', () => {
  const html = P.build(ctx({
    scope: { in: [{ t: 'בנייה' }], out: [{ t: 'ניקוי נתונים' }, { t: 'הרשאות' }], extra: [] },
    f: { client: 'לקוח', process: 'תהליך' }
  }));
  assert.ok(/ul class="excl"/.test(html), 'the exclusion list has no class of its own to quiet');
  assert.ok(!/li class="no"/.test(html),
    'red is this document\'s alarm colour, and a boundary is not an alarm');
  assert.ok(/ul class="incl"/.test(html), 'what the client is buying should carry the weight');
});
test('both lists stay distinguishable without colour', () => {
  const css = require('fs').readFileSync(__dirname + '/post-call.css', 'utf8');
  assert.ok(/\.out ul\.incl li::before\{content:"[^"]+"/.test(css),
    'inclusions need a marker that survives greyscale and colour blindness');
  assert.ok(/\.out ul\.excl li::before\{content:"[^"]+"/.test(css),
    'so do exclusions');
});

console.log('\nthe payback picture, in the copy the client actually reads');
/* The product's own README argues for this and then aimed it at the wrong
   person: 52 squares, one per week, filled to the point the investment is back —
   "easier to grasp, faster to process, and the benefit is largest for people with
   low numerical literacy, which is exactly the audience here". It rendered into
   the tool, for the operator. The operator computed the number. The restaurant
   owner is the one who has to believe it, and they got "31.4 weeks" as text.

   It lives inside the rationale block and therefore under the rationale's own
   suppression rule: the picture makes the same claim the sentence makes, so it
   must live and die with the sentence rather than get a rule of its own. */
require('./pc-viz.js');
const vizFor = m => globalThis.PC.viz.forModel(m, {});

test('the grid is drawn, and drawn to the number the sentence states', () => {
  const h = P.build(ctx({ viz: vizFor(M) }));
  const cells = (h.match(/class="pbk-c/g) || []).length;
  assert.strictEqual(cells, 52, 'one cell per week of the year, got ' + cells);
  const filled = (h.match(/pbk-c on/g) || []).length;
  const v = vizFor(M).payback;
  assert.strictEqual(filled, v.filled,
    'the picture and the sentence disagree: ' + filled + ' filled vs ' + v.filled + ' weeks');
  assert.ok(h.includes(String(v.weeks)), 'the number itself is still written out');
});
test('the picture carries its meaning in words, not only in colour', () => {
  /* pc-viz.js states the rule it was built to: hue only ever repeats a meaning
     that already exists as a word. A client printing this in greyscale, or one
     who cannot separate the two tones, has to get the same claim. */
  const h = P.build(ctx({ viz: vizFor(M) }));
  const v = vizFor(M).payback;
  assert.ok(h.includes(v.label), 'the label that explains the grid is missing');
  assert.ok(/role="img"/.test(h) && /aria-label="/.test(h),
    'a grid of 52 divs with no accessible name is 52 announcements of nothing');
  assert.ok(/aria-hidden="true"/.test(h), 'the individual cells must not be announced');
});
test('no picture where there is no claim to picture', () => {
  // every other method states no payback, so there is nothing honest to draw
  ['cost', 'market', 'comparable'].forEach(method => {
    const m2 = compute({ freq: 20, freqUnit: 52, minutes: 7, rate: 60, capture: 0.7,
      errFreq: 3, errCost: 400, systemCount: 2, integration: 1, edge: 1,
      myRate: 250, maintPct: 0, method });
    const h = P.build(ctx({ m: m2, viz: vizFor(m2) }));
    if (m2.method !== 'value')
      assert.ok(!/pbk-c/.test(h), method + ' drew a payback grid with no payback claim');
  });
});
test('the picture is suppressed exactly when the sentence is', () => {
  /* The rationale is withheld when the numbers came from the operator rather
     than the client — the rule that keeps an invented figure out of a
     client-facing document. A picture of that same figure is the same claim, in
     a form that is harder to argue with, so it cannot outlive the sentence. */
  const h = P.build(ctx({ viz: vizFor(M), adapt: { suppressRoi: true } }));
  assert.ok(!/מאיפה המחיר/.test(h), 'the rationale should be suppressed here');
  assert.ok(!/pbk-c/.test(h),
    'the grid survived a suppressed rationale — it is the same claim, drawn');
});
test('no viz in the context changes nothing at all', () => {
  // the document has to keep building for any caller that has not been updated
  const h = P.build(ctx());
  assert.ok(h.includes('מאיפה המחיר'), 'the sentence must still be there');
  assert.ok(!/pbk-c/.test(h));
});

test('the drawn payback survives a print that drops backgrounds', () => {
  /* Browsers do not print background colour unless asked, so a grid whose filled
     state is only a fill comes out of a printer as fifty-two identical empty
     squares — no information at all, in the one artefact the client keeps. Two
     independent channels: print-color-adjust asks for the fill, and the filled
     cell also carries a heavier border so the picture reads if a printer or a
     PDF pipeline refuses anyway. Same rule as the ✓ and — markers below. */
  const css = require('fs').readFileSync(__dirname + '/post-call.css', 'utf8');
  const on = (css.match(/\.out \.pbk-c\.on\{([^}]+)\}/) || [])[1] || '';
  const base = (css.match(/\.out \.pbk-c\{([^}]+)\}/) || [])[1] || '';
  assert.ok(/print-color-adjust:\s*exact/.test(base),
    'without print-color-adjust the fill is dropped by every printer');
  assert.ok(/border:\s*2px/.test(on) && /border:\s*1px/.test(base),
    'the filled state must differ by more than a background, or greyscale loses it');
});

console.log('\nthe three moments read as moments');
test('the price, the timeline and the decision are marked apart from the rest', () => {
  /* Measured before this: two type sizes in the whole document — 22px for the
     title and 12px for all eleven section headings. Eleven sections at identical
     weight in a 2,250px document means the price and "access and permissions"
     are typographically equal, and nothing tells the eye where to stop. */
  const h = P.build(ctx({ viz: vizFor(M) }));
  ['המחיר', 'לוח זמנים', 'ההחלטה'].forEach(t =>
    assert.ok(new RegExp('<h4 class="moment">' + t + '</h4>').test(h),
      t + ' is not marked as a moment'));
  const plain = (h.match(/<h4>/g) || []).length;
  assert.ok(plain >= 5, 'the ordinary sections must stay ordinary, found ' + plain);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
