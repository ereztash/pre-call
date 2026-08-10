/* node assets/history.test.js — no browser, no deps.

   The thing under test is a claim generator: it takes the operator's own
   saved deals and produces sentences about how good this tool's advice
   has been for them. That makes wrong output worse than absent output —
   a track record that flatters is not a track record — so most of what
   follows is about refusing to speak rather than about speaking.

   The single assertion this file exists for: a mean ratio cannot tell
   "everything is 20% over" apart from "four were fine and one exploded",
   and those two demand opposite corrections. */
const H = require('./pc-history.js');
const M = require('./model.js');
const assert = require('assert');

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

let seq = 0;
/* A delivered job: estimated est hours, actually took act. */
const done = (est, act, over = {}) => Object.assign({
  id: 'd' + (++seq), client: 'לקוח ' + seq, status: 'won',
  estimatedHours: est, priceQuoted: 10000, pricedBy: 'value',
  created: '2026-0' + (1 + (seq % 9)) + '-01T10:00:00.000Z',
  outcome: { actualHours: act, closedPrice: 10000, at: '2026-0' + (1 + (seq % 9)) + '-15T10:00:00.000Z' }
}, over);

console.log('\nwhat counts as a delivery');
test('a deal with no reported hours is not one', () => {
  assert.strictEqual(H.deliveries([{ id: 'x', estimatedHours: 10, outcome: null }]).length, 0);
  assert.strictEqual(H.deliveries([{ id: 'x', estimatedHours: 10, outcome: { actualHours: 0 } }]).length, 0);
});
test('a deal with hours but no locked estimate is not one either', () => {
  /* Deals saved before the estimate was locked have nothing to compare
     against. Counting them would put a denominator under a number that
     does not exist. */
  assert.strictEqual(H.deliveries([{ id: 'x', outcome: { actualHours: 12 } }]).length, 0);
});
test('status is irrelevant — delivered and reported is enough', () => {
  /* A job can be delivered, invoiced and reported without anyone going
     back to the ledger to press "won". Requiring the button would lose
     real calibration data to an unpressed button. */
  const rows = H.deliveries([done(10, 11, { status: 'sent' })]);
  assert.strictEqual(rows.length, 1);
});
test('deliveries come back oldest first, so a trend can be read off them', () => {
  const rows = H.deliveries([
    done(10, 10, { outcome: { actualHours: 10, at: '2026-09-01T00:00:00.000Z' } }),
    done(10, 10, { outcome: { actualHours: 10, at: '2026-01-01T00:00:00.000Z' } })
  ]);
  assert.ok(rows[0].at < rows[1].at, 'newest first would invert every trend this module reports');
});

console.log('\nrefusing to speak too early');
test('under five deliveries there is no verdict, only a count', () => {
  for (let n = 0; n < H.MIN_DELIVERIES; n++) {
    const a = H.accuracy(Array.from({ length: n }, () => done(10, 20)));
    assert.strictEqual(a.verdict, null, n + ' deliveries produced a verdict');
    assert.strictEqual(a.enough, false);
  }
});
test('at five it speaks', () => {
  const a = H.accuracy(Array.from({ length: 5 }, () => done(10, 13)));
  assert.ok(a.verdict, 'five deliveries and still silent');
  assert.strictEqual(a.enough, true);
});
test('a trend needs six, so each half has three', () => {
  assert.strictEqual(H.trend(Array.from({ length: 5 }, () => done(10, 12))), null);
  assert.ok(H.trend(Array.from({ length: 6 }, () => done(10, 12))));
});

console.log('\nthe distinction a single ratio cannot make');
test('uniformly low estimates read as a baseline to raise', () => {
  /* Five jobs, each 40% over. The correction is "add 40%". */
  const a = H.accuracy([done(10, 14), done(10, 14), done(20, 28), done(10, 14), done(15, 21)]);
  assert.strictEqual(a.verdict.kind, 'low');
  assert.ok(/40%/.test(a.verdict.text), a.verdict.text);
});
test('one exploded job reads as a scoping problem, not a wrong baseline', () => {
  /* Four accurate jobs and one that ran 4x. The mean ratio is dragged
     well past the threshold, so a mean-only reading would tell the
     operator to raise every estimate — which would be wrong four times
     out of five. The median sees through it. */
  const a = H.accuracy([done(10, 10), done(10, 11), done(10, 10), done(10, 9), done(10, 40)]);
  assert.ok(a.meanRatio > 1.3, 'the aggregate really is dragged: ' + a.meanRatio);
  assert.strictEqual(a.verdict.kind, 'outlier',
    'the mean says "raise everything"; four of these five estimates were fine');
  assert.ok(a.verdict.text.includes(a.worst.client),
    'an outlier verdict that does not name the outlier is not actionable');
});
test('the two cases really are indistinguishable by mean alone', () => {
  /* The point stated as an assertion rather than as a comment: build the
     two sets so their aggregate ratios are close, and check the module
     still separates them. */
  const uniform = [done(10, 16), done(10, 16), done(10, 16), done(10, 16), done(10, 16)];
  const oneBad  = [done(10, 10), done(10, 10), done(10, 10), done(10, 10), done(10, 40)];
  const a = H.accuracy(uniform), b = H.accuracy(oneBad);
  assert.ok(Math.abs(a.meanRatio - b.meanRatio) <= 0.2,
    'the fixtures do not actually collide: ' + a.meanRatio + ' vs ' + b.meanRatio);
  assert.notStrictEqual(a.verdict.kind, b.verdict.kind,
    'both sets produced the same verdict — the module is reading the mean after all');
});
test('the correction comes from recent work once the estimate has moved', () => {
  /* Found by loading six deliveries into a browser and reading the panel:
     early jobs ran 80% over, recent ones 20% over, and the median across
     everything told the operator to add 45% — which would now over-shoot
     by more than the original error. The number to act on is the recent
     one; the whole-history figure is reported beside it so the panel does
     not look like it quietly changed its mind. */
  /* Explicit ascending dates: deliveries() sorts by outcome.at, so a
     fixture whose dates do not ascend is not testing "recent" at all. */
  const inOrder = acts => acts.map((act, i) => done(10, act, {
    outcome: { actualHours: act, closedPrice: 10000,
               at: '2026-01-' + String(i + 10) + 'T09:00:00.000Z' }
  }));
  const a = H.accuracy(inOrder([18, 18, 17, 12, 12, 12]));
  assert.strictEqual(a.verdict.kind, 'low');
  assert.ok(a.recentRatio < a.medianRatio,
    'the fixture does not actually drift: ' + a.recentRatio + ' vs ' + a.medianRatio);
  assert.ok(/20%/.test(a.verdict.text),
    'the advice should be built on the recent 20%, not the historic median: ' + a.verdict.text);
  assert.ok(a.verdict.text.includes('כל ההיסטוריה'),
    'dropping the historic figure entirely hides why the number changed');
});
test('drifting the wrong way is never described as an improvement', () => {
  /* Found in review. The parenthetical fired on any drift and always read
     "but the recent deliveries are better", so three accurate jobs
     followed by three that took twice as long said "the recent ones are
     better" here and "your estimate is not improving" in the trend line
     immediately below it. Two sentences of one panel contradicting each
     other tells the reader it is not reading its own data. */
  const at = i => '2026-01-' + (10 + i) + 'T09:00:00.000Z';
  const rows = [10, 10, 10, 20, 20, 20].map((act, i) => done(10, act, {
    outcome: { actualHours: act, closedPrice: 10000, at: at(i) }
  }));
  const a = H.accuracy(rows), t = H.trend(rows);
  assert.ok(Math.abs(a.recentRatio - 1) > Math.abs(a.medianRatio - 1),
    'the fixture must actually get worse: ' + a.medianRatio + ' -> ' + a.recentRatio);
  assert.strictEqual(t.improving, false);
  assert.ok(!/טובות יותר/.test(a.verdict.text),
    'the verdict calls a worsening record an improvement: ' + a.verdict.text);
  assert.ok(/גרועות יותר/.test(a.verdict.text),
    'and it has to say which way it moved, not merely stop claiming the wrong one');
});
test('a steady record gets one number and no parenthetical', () => {
  const a = H.accuracy(Array.from({ length: 6 }, () => done(10, 14)));
  assert.strictEqual(a.verdict.kind, 'low');
  assert.ok(!a.verdict.text.includes('כל ההיסטוריה'),
    'nothing drifted, so there is no second number to explain');
});
test('estimates that hold say so, and ask for nothing', () => {
  const a = H.accuracy([done(10, 10), done(10, 11), done(10, 9), done(20, 21), done(15, 14)]);
  assert.strictEqual(a.verdict.kind, 'holds');
});
test('systematically padded estimates are named too, not only thin ones', () => {
  /* The flattering direction. A tool that only ever tells you to charge
     more is a tool selling you something. */
  const a = H.accuracy([done(20, 12), done(20, 13), done(10, 6), done(20, 12), done(30, 19)]);
  assert.strictEqual(a.verdict.kind, 'high');
});

console.log('\nwhich pricing method actually held');
const quoted = (pricedBy, status, price, closed) => ({
  id: 'q' + (++seq), client: 'ל' + seq, status, priceQuoted: price,
  pricedBy, created: '2026-01-01T00:00:00.000Z',
  outcome: closed == null ? null : { closedPrice: closed, actualHours: 0 }
});

test('a method with fewer than three quotes is counted but not concluded from', () => {
  const m = H.methods([quoted('value', 'won', 10000, 10000), quoted('value', 'won', 8000, 8000)],
                      M.METHOD_LABEL);
  assert.strictEqual(m.rows[0].quoted, 2);
  assert.strictEqual(m.rows[0].enough, false,
    'two quotes is not a finding about a pricing method');
});
test('at three it is willing to report, and reports the discount honestly', () => {
  const m = H.methods([
    quoted('market', 'won', 10000, 10000),
    quoted('market', 'won', 10000, 8000),    // 20% off
    quoted('market', 'lost', 10000, null)
  ], M.METHOD_LABEL);
  const r = m.rows[0];
  assert.strictEqual(r.enough, true);
  assert.strictEqual(r.quoted, 3);
  assert.strictEqual(r.won, 2);
  assert.strictEqual(r.lost, 1);
  assert.strictEqual(r.winRate, 0.67);
  assert.strictEqual(r.heldFull, 1);
  assert.strictEqual(r.avgDiscount, 20, 'the discount that was actually given');
});
test('undecided quotes stay out of the win rate, as everywhere else in this product', () => {
  const m = H.methods([
    quoted('cost', 'won', 5000, 5000),
    quoted('cost', 'sent', 5000, null),
    quoted('cost', 'no_answer', 5000, null)
  ], M.METHOD_LABEL);
  const r = m.rows[0];
  assert.strictEqual(r.decided, 1);
  assert.strictEqual(r.winRate, 1, 'silence counted as a loss would damn any recent quote');
  assert.strictEqual(r.undecided, 2);
});
test('the method that set the price is read, never the one that was asked for', () => {
  /* The reason model.js gained pricedBy. Asking for "comparable" with no
     previous deal gets you a cost-plus price; filing that win under
     "comparable" would build a recommendation out of a mislabelled row. */
  const r = M.compute({ method: 'comparable', systemCount: 2, freq: 10, freqUnit: 12,
                        minutes: 30, rate: 100, capture: 0.7 });
  assert.strictEqual(r.method, 'comparable', 'the request is still recorded');
  assert.strictEqual(r.pricedBy, 'cost', 'but the price came from cost');

  const m = H.methods([{ id: 'z', status: 'won', priceQuoted: r.price,
                         pricedBy: r.pricedBy, outcome: { closedPrice: r.price } }],
                      M.METHOD_LABEL);
  assert.strictEqual(m.rows[0].method, 'cost');
});
test('a price the cost floor set is not credited to the method that was clicked', () => {
  /* Found in review, and it is the same fault pricedBy was introduced to
     prevent — the first version only caught the case where the requested
     method had no data at all, and missed the case where it had data that
     priced under what delivery costs. Every method's value is
     Math.max(raw, costFloor), so the number sent is the floor and the
     method contributed nothing to it. */
  const r = M.compute({ method: 'value', systemCount: 5, integration: 1.4, edge: 1.2,
                        freq: 1, freqUnit: 12, minutes: 5, rate: 60, capture: 0.5, myRate: 250 });
  assert.strictEqual(r.method, 'value', 'the request is still recorded');
  assert.ok(r.M.value.raised, 'the fixture must actually hit the floor');
  assert.strictEqual(r.price, r.costFloor, 'and the floor must be what was quoted');
  assert.strictEqual(r.pricedBy, 'floor',
    'crediting "value" for a price the floor set is exactly the mislabelled row this prevents');
  assert.notStrictEqual(r.pricedBy, 'cost',
    'nor is it the cost method — cost+margin is floor x1.3, the floor is x1.1');

  const m = H.methods([{ id: 'f', status: 'won', priceQuoted: r.price, pricedBy: r.pricedBy,
                         outcome: { closedPrice: r.price } }], M.METHOD_LABEL);
  assert.strictEqual(m.rows[0].label, M.METHOD_LABEL.floor,
    'the floor needs a name of its own on screen, or the row is unreadable');
});
test('deals saved before pricedBy existed are excluded, not guessed at', () => {
  const m = H.methods([
    { id: 'old', status: 'won', priceQuoted: 9000, method: 'value' },   // no pricedBy
    quoted('value', 'won', 9000, 9000)
  ], M.METHOD_LABEL);
  assert.strictEqual(m.attributed, 1);
  assert.strictEqual(m.unattributed, 1);
  assert.strictEqual(m.rows.reduce((s, r) => s + r.quoted, 0), 1,
    'an unattributable deal was silently folded into a method bucket');
});
test('the labels come from the model, so the two can never drift apart', () => {
  const m = H.methods([quoted('market', 'won', 1000, 1000)], M.METHOD_LABEL);
  assert.strictEqual(m.rows[0].label, M.METHOD_LABEL.market);
});

console.log('\nwhere the number came from, as a track record');
/* Same shape as methods() above, on the axis the ledger has been storing and
   never reading. The point of grouping by it is that the four values are not
   interchangeable inputs to the same calculation — a figure the client named
   unprompted and a figure you estimated for him are different kinds of claim,
   and if they close differently the operator should be the one to see it. */
const P = require('./deals.js');
const prov = (provenance, status, price, closed) => ({
  id: 'p' + (++seq), client: 'ל' + seq, status, priceQuoted: price,
  provenance, created: '2026-01-01T00:00:00.000Z',
  outcome: closed == null ? null : { closedPrice: closed, actualHours: 0 }
});

test('groups by provenance and holds to the same threshold as the methods table', () => {
  const r = H.provenance([prov('unprompted', 'won', 10000, 10000),
                          prov('unprompted', 'won', 8000, 8000)], P.PROVENANCE_LABEL);
  assert.strictEqual(r.rows[0].quoted, 2);
  assert.strictEqual(r.rows[0].enough, false,
    'two quotes is no more a finding here than it is about a pricing method');
});
test('at three it reports, and averages only the discounts that happened', () => {
  const r = H.provenance([
    prov('mine', 'won', 10000, 10000),
    prov('mine', 'won', 10000, 8000),    // 20% off
    prov('mine', 'lost', 10000, null)
  ], P.PROVENANCE_LABEL);
  const row = r.rows[0];
  assert.strictEqual(row.enough, true);
  assert.strictEqual(row.quoted, 3);
  assert.strictEqual(row.winRate, 0.67, 'two won of three decided');
  assert.strictEqual(row.heldFull, 1);
  assert.strictEqual(row.avgDiscount, 20, 'not 10 — averaging in the zero answers nobody’s question');
});
test('"no number" is its own group, not folded into the unattributed', () => {
  const r = H.provenance([
    prov('none', 'won', 4000, 4000),
    { id: 'x', status: 'won', priceQuoted: 4000 }        // saved before the field was read
  ], P.PROVENANCE_LABEL);
  assert.strictEqual(r.attributed, 1);
  assert.strictEqual(r.unattributed, 1);
  assert.strictEqual(r.rows.length, 1);
  assert.strictEqual(r.rows[0].provenance, 'none',
    '"the client never gave a figure" is an answer; "nobody recorded it" is not');
});
test('an old deal is read through its stored form rather than being dropped', () => {
  /* The value was in form.q_provenance on every saved deal long before
     anything read it, so a ledger full of old rows is not a blank slate. */
  /* 'unprompted' rather than 'prompted': this test is about the value being
     readable out of the stored form at all, and 'prompted' additionally needs a
     confirmation flag — a different rule, tested on its own below. */
  const r = H.provenance([
    { id: 'o1', status: 'won', priceQuoted: 4000, form: { q_provenance: 'unprompted' } },
    { id: 'o2', status: 'won', priceQuoted: 4000, form: { q_provenance: 'unprompted' } },
    { id: 'o3', status: 'won', priceQuoted: 4000, form: { q_provenance: 'unprompted' } }
  ], P.PROVENANCE_LABEL);
  assert.strictEqual(r.attributed, 3);
  assert.strictEqual(r.rows[0].enough, true);
});
test('the labels come from deals.js, so the two can never drift apart', () => {
  const r = H.provenance([prov('unprompted', 'won', 1000, 1000)], P.PROVENANCE_LABEL);
  assert.strictEqual(r.rows[0].label, P.PROVENANCE_LABEL.unprompted);
});
test('a legacy "prompted" is not counted as a choice somebody made', () => {
  /* Raised in review, and it is the same ambiguity from the other end: deals
     saved before the default changed hold 'prompted' because nobody touched the
     question, and by value alone they are indistinguishable from a deliberate
     'prompted'. The panel claims every row is a choice, so either that claim
     needs a disclaimer or these rows need to leave. They leave — a record that
     was actually answered carries the flag collectDraft() now writes, and one
     that was not is unattributed, which the panel already discloses. */
  const legacy   = { id: 'L', status: 'won', priceQuoted: 4000,
                     form: { q_provenance: 'prompted' } };            // no flag
  const answered = { id: 'A', status: 'won', priceQuoted: 4000, provenance: 'prompted',
                     form: { q_provenance: 'prompted', provenanceAnswered: true } };
  const r = H.provenance([legacy, answered], P.PROVENANCE_LABEL);
  assert.strictEqual(r.attributed, 1, 'the legacy row was counted as a choice');
  assert.strictEqual(r.unattributed, 1);
  assert.strictEqual(r.rows[0].quoted, 1);
});
test('the three answers that were never a default need no flag', () => {
  /* Only 'prompted' is ambiguous. Requiring a flag from the others would
     discard real answers from every record written before it existed. */
  ['unprompted', 'mine', 'none'].forEach(v => {
    const r = H.provenance([{ id: 'x', status: 'won', priceQuoted: 4000,
                              form: { q_provenance: v } }], P.PROVENANCE_LABEL);
    assert.strictEqual(r.attributed, 1, v + ' was discarded for lacking a flag it never needed');
  });
});
test('a deal with no recorded source is disclosed, not just dropped', () => {
  /* Found by rendering the panel in a browser: the row was correctly kept out
     of every bucket, and nothing on screen said so. Excluding a deal quietly
     and excluding it visibly are different products — the whole panel is built
     on saying what it cannot answer. */
  const u = H.unknowns([
    prov('unprompted', 'won', 4000, 4000),
    { id: 'n1', status: 'won', priceQuoted: 4000, pricedBy: 'value' }   // no provenance anywhere
  ], M.METHOD_LABEL, P.PROVENANCE_LABEL);
  assert.ok(u.some(x => /בלי שנרשם מאיפה|בלי מקור/.test(x.what + x.text)),
    'the excluded deal is invisible: ' + JSON.stringify(u.map(x => x.what)));
});
test('the form default never becomes a group, so every row is a real choice', () => {
  /* This replaces a test that asserted the opposite arrangement. The form used
     to default to 'prompted', so that group mixed deals somebody had marked with
     deals nobody had touched, and the panel had to disclaim it. The default is
     'unset' now, which deliberately has no label — and the label map is what
     defines the buckets — so it can be stored and can never be claimed about.
     The disclaimer is gone with the ambiguity, and this is what keeps it gone. */
  const r = H.provenance([
    prov('unset', 'won', 4000, 4000),
    prov('unset', 'won', 4000, 4000),
    prov('unset', 'won', 4000, 4000),
    Object.assign(prov('prompted', 'won', 4000, 4000),
                  { form: { provenanceAnswered: true } })
  ], P.PROVENANCE_LABEL);
  assert.deepStrictEqual(r.rows.map(x => x.provenance), ['prompted'],
    'the unanswered ones became a group: ' + JSON.stringify(r.rows.map(x => x.provenance)));
  assert.strictEqual(r.unattributed, 3, 'and they are counted as unattributed instead');

  const u = H.unknowns([Object.assign(prov('prompted', 'won', 4000, 4000),
                                     { form: { provenanceAnswered: true } })],
                       M.METHOD_LABEL, P.PROVENANCE_LABEL);
  assert.ok(!u.some(x => /ברירת המחדל של הטופס/.test(x.text)),
    'a disclaimer that no longer describes the code teaches the reader to discount the ones that do');
});
test('report() carries the breakdown, and unknowns() counts down to it', () => {
  const rep = H.report([prov('mine', 'won', 5000, 5000)], M.METHOD_LABEL);
  assert.ok(rep.provenance, 'report() must expose it or the ledger cannot render it');
  assert.ok(rep.unknowns.some(u => /מאיפה/.test(u.what) || /מקור/.test(u.what)),
    'one quote is not enough to conclude from, so it belongs in the countdown');
});

console.log('\nwhat it admits it cannot say');
test('an empty history reports no findings rather than an empty panel', () => {
  assert.strictEqual(H.report([]), null);
  assert.strictEqual(H.report(null), null);
});
test('one saved deal is a countdown, not a finding', () => {
  const r = H.report([quoted('value', 'sent', 10000, null)], M.METHOD_LABEL);
  assert.ok(r, 'a saved deal should produce something');
  assert.strictEqual(r.hasFindings, false);
  assert.ok(r.unknowns.length, 'nothing knowable and nothing listed as missing');
});
test('every unknown says how many deliveries away it is', () => {
  const r = H.report([done(10, 12)], M.METHOD_LABEL);
  r.unknowns.forEach(u => {
    assert.ok(typeof u.need === 'number', u.what + ' has no countdown');
    assert.ok(u.text && u.text.length > 10, u.what + ' has no explanation');
  });
  const acc = r.unknowns.find(u => /מדויק/.test(u.what));
  assert.strictEqual(acc.need, H.MIN_DELIVERIES - 1, 'the countdown is wrong');
});
test('an answered question stops being listed as unknown', () => {
  const five = Array.from({ length: 5 }, () => done(10, 11));
  const u = H.unknowns(five, M.METHOD_LABEL);
  assert.ok(!u.some(x => /מדויק/.test(x.what)),
    'accuracy is known at five deliveries and must drop off the missing list');
  assert.ok(u.some(x => /משתפר/.test(x.what)),
    'the trend still is not known at five and must stay on it');
});
test('the list never empties, however much the tool has learned', () => {
  /* Found by walking six delivered jobs through a browser: every
     countdown had resolved, the gaps list went to zero, and the panel
     started reading like an oracle. The standing caveat is not a gap in
     the data — it is what the data is, and it does not expire. */
  const six = Array.from({ length: 6 }, (_, i) => done(10, 11, {
    pricedBy: i < 3 ? 'value' : 'market', status: 'won',
    outcome: { actualHours: 11, closedPrice: 10000,
               at: '2026-01-' + (10 + i) + 'T09:00:00.000Z' }
  }));
  const r = H.report(six, M.METHOD_LABEL);
  assert.strictEqual(r.hasFindings, true, 'the fixture should answer every countdown');
  assert.ok(!r.unknowns.some(u => /מדויק|משתפר|שיטת/.test(u.what)),
    'a resolved countdown should stop being listed');
  assert.ok(r.unknowns.length >= 1,
    'the panel went completely silent once it was confident');
  assert.ok(r.unknowns.some(u => /לא מדד שוק/.test(u.text)),
    'the standing caveat must say what this is not, not merely that something is missing');
});
test('old unattributable deals are disclosed rather than quietly dropped', () => {
  const u = H.unknowns([{ id: 'old', status: 'won', priceQuoted: 9000 }], M.METHOD_LABEL);
  assert.ok(u.some(x => /ישנות/.test(x.what)),
    'excluding rows from a count without saying so is how a number starts lying');
});

console.log('\nit does not throw on what real storage actually contains');
test('nulls, blanks and text in numeric fields produce no findings and no crash', () => {
  const junk = [null, undefined, {}, { estimatedHours: 'x', outcome: { actualHours: 'y' } },
                { estimatedHours: 0, outcome: { actualHours: 5 } },
                { priceQuoted: 'לא מספר', pricedBy: 'value', status: 'won' }];
  const r = H.report(junk, M.METHOD_LABEL);
  assert.ok(r === null || r.hasFindings === false);
  assert.deepStrictEqual(H.deliveries(junk), []);
});

console.log('\nwinning everything is not a result, it is a missing measurement');
/* winRate() has been computed and displayed as a score since the ledger existed.
   Nobody interprets it. And the interpretation is the counterintuitive one: an
   operator who has never lost a priced proposal, and never had one negotiated
   down, has no evidence about their ceiling — not because they are underpricing
   for certain, but because they have never tested it. You need a lost deal to
   know where the edge is.

   The claim is narrow on purpose. It fires only when there is nothing else that
   could explain the run: no losses, no discounts, and no deal that quietly grew
   its scope at the same price. Any one of those means the price WAS tested and
   moved, which is a different finding. */
const closed = (id, over = {}) => Object.assign({
  id, status: 'won', priceQuoted: 10000, pricedBy: 'value', provenance: 'unprompted',
  outcome: { closedPrice: 10000, concession: 'unknown' }
}, over);
const cleanHold = { n: 6, held: 6, discounted: 0, widened: 0, heldClean: 6, scopeTracked: 6 };
const sixWins = Array.from({ length: 6 }, (_, i) => closed('w' + i));

test('six decided, none lost, nothing discounted — says the price is untested', () => {
  const c = H.ceiling(sixWins, cleanHold);
  assert.strictEqual(c.enough, true);
  assert.strictEqual(c.untested, true);
  assert.ok(c.text, 'a finding with nothing to say is not a finding');
});
test('the text does not congratulate, and does not order a price rise', () => {
  const c = H.ceiling(sixWins, cleanHold);
  assert.ok(!/מצוין|כל הכבוד|מעולה/.test(c.text), 'this is not good news: ' + c.text);
  assert.ok(!/תעלה את המחיר|העלה את המחיר/.test(c.text),
    'the finding is an absence of evidence, not an instruction: ' + c.text);
});
test('one lost deal is enough to make the price tested', () => {
  const withLoss = sixWins.slice(0, 5).concat([{ id: 'l', status: 'lost', priceQuoted: 10000 }]);
  assert.strictEqual(H.ceiling(withLoss, cleanHold).untested, false,
    'a loss is the evidence — it is where the edge showed up');
});
test('a discount means the price was tested and moved', () => {
  const hold = Object.assign({}, cleanHold, { discounted: 1 });
  assert.strictEqual(H.ceiling(sixWins, hold).untested, false);
});
test('scope that grew at the same price also counts as tested', () => {
  /* The link to the drift work in deals.js. A deal that gained a clause after the
     quote was conceded, even though both numbers held — so a run of those is not
     an untested price, it is a tested one that moved somewhere the discount
     figure cannot see. */
  const hold = Object.assign({}, cleanHold, { widened: 1, heldClean: 5 });
  assert.strictEqual(H.ceiling(sixWins, hold).untested, false,
    'widening is a concession, and a conceded price is not an untested one');
});
test('says nothing under the threshold, and says how far off it is', () => {
  const three = sixWins.slice(0, 3);
  const c = H.ceiling(three, Object.assign({}, cleanHold, { n: 3, held: 3, heldClean: 3, scopeTracked: 3 }));
  assert.strictEqual(c.enough, false);
  assert.strictEqual(c.untested, null, 'not enough data is not a verdict of "tested"');
  assert.ok(c.need > 0, 'a countdown, the way every other threshold here reports one');
});
test('an empty ledger reports nothing rather than a perfect record', () => {
  const c = H.ceiling([], { n: 0, held: null, discounted: 0, widened: null, heldClean: null, scopeTracked: 0 });
  assert.strictEqual(c.untested, null);
  assert.strictEqual(c.enough, false);
});
test('undecided proposals are not counted as wins', () => {
  // same rule winRate() already follows: sent-and-silent is not a result
  const mixed = sixWins.slice(0, 3).concat(
    Array.from({ length: 5 }, (_, i) => ({ id: 's' + i, status: 'sent', priceQuoted: 10000 })));
  assert.strictEqual(H.ceiling(mixed, cleanHold).enough, false,
    'five silent proposals must not push this over the threshold');
});

test('a ledger with no scope baselines never claims that nothing gained scope', () => {
  /* Raised in review, and it is item 1's own flagship scenario. Six deals entered
     through addPast() carry no scopeAtQuote, so priceHold() reports widened:null —
     correctly, because nothing is measurable. `(h.widened || 0) > 0` then read null
     as "no widening", and the sentence went on to assert "ואף אחת לא קיבלה סעיף
     נוסף באותו מחיר" about deals where that could not be known.

     Which is exactly the null-versus-zero discipline this same change argued for
     three times over, applied everywhere except the sentence a person reads. The
     price evidence is still real — no loss, no discount — so the finding stands;
     what has to go is the clause it cannot support. */
  const unknownScope = { n: 6, held: 6, discounted: 0, widened: null,
                         heldClean: null, scopeTracked: 0 };
  const c = H.ceiling(sixWins, unknownScope);
  assert.strictEqual(c.untested, true, 'no loss and no discount is still evidence');
  assert.ok(!/סעיף נוסף/.test(c.text),
    'claimed no deal gained scope, on a ledger where scope was never tracked: ' + c.text);
  assert.ok(/לא נבדק/.test(c.text), 'the finding itself must survive');
});
test('with baselines present the scope clause is stated, because then it is known', () => {
  const c = H.ceiling(sixWins, cleanHold);
  assert.ok(/סעיף נוסף/.test(c.text),
    'six tracked deals that did not widen — say so, that is a real part of the case');
});

console.log('\nthe moment something became sayable');
/* The cheapest real trigger in the product, and it needs no channel at all.

   There is no server here, so nothing can be pushed. But a threshold crossing is
   CAUSED by an action inside the tool — recording an outcome, entering a past
   deal — which means the tool is already open at the moment it happens. The
   trigger is simply to say it, once, there.

   And it needs no new vocabulary: unknowns() is already the list of what cannot
   yet be said, so an item that LEAVES that list is a thing that became sayable.
   Defining a crossing as a set difference over that list means the two can never
   describe different sets of findings. */
const reportOf = (deals, hold) =>
  H.report(deals, M.METHOD_LABEL, { unprompted: 'א', prompted: 'ב', mine: 'ג', none: 'ד' }, hold);

test('an item leaving the cannot-say list is a crossing', () => {
  const four = Array.from({ length: 4 }, () => done(10, 11));
  const five = Array.from({ length: 5 }, () => done(10, 11));
  const before = reportOf(four), after = reportOf(five);
  const gained = H.crossed(before, after);
  assert.ok(gained.includes('כמה מדויק האומדן שלך'),
    'the fifth delivery makes accuracy sayable and nothing said so: ' + JSON.stringify(gained));
});
test('no change means no crossing, so nothing is announced twice', () => {
  const five = Array.from({ length: 5 }, () => done(10, 11));
  assert.deepStrictEqual(H.crossed(reportOf(five), reportOf(five)), []);
});
test('an item that is still unsayable is not reported as gained', () => {
  const two = Array.from({ length: 2 }, () => done(10, 11));
  const three = Array.from({ length: 3 }, () => done(10, 11));
  const gained = H.crossed(reportOf(two), reportOf(three));
  assert.ok(!gained.includes('כמה מדויק האומדן שלך'),
    'three deliveries is still under the threshold of five');
});
test('losing data is never reported as a gain', () => {
  /* A restored backup or a deleted deal can move the ledger backwards. A crossing
     is a strict set difference in one direction: what left the list, never what
     joined it. Announcing a regression as news would be worse than silence. */
  const five = Array.from({ length: 5 }, () => done(10, 11));
  const two = Array.from({ length: 2 }, () => done(10, 11));
  assert.deepStrictEqual(H.crossed(reportOf(five), reportOf(two)), [],
    'the ledger went backwards and something was announced as newly sayable');
});
test('an empty ledger before, and a first deal after, does not crash', () => {
  /* report() returns null for an empty list, which is the state every first-time
     operator is in one action before their first crossing. */
  const one = [done(10, 11)];
  assert.doesNotThrow(() => H.crossed(null, reportOf(one)));
  assert.deepStrictEqual(H.crossed(null, reportOf(one)), [],
    'nothing can have become sayable when there was no list to leave');
});
test('the crossing carries the label the panel itself uses', () => {
  /* So the announcement and the panel name the same thing. A trigger that says
     "a finding is ready" and a panel headed differently is two products. */
  const before = reportOf(Array.from({ length: 4 }, () => done(10, 11)));
  const gained = H.crossed(before, reportOf(Array.from({ length: 5 }, () => done(10, 11))));
  gained.forEach(g => assert.ok(
    before.unknowns.some(u => u.what === g),
    'announced "' + g + '", which was never on the cannot-say list'));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
