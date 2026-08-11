/* node assets/deals.test.js — no browser, no deps. */
const { make, priceMoved } = require('./deals.js');
const assert = require('assert');

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

// in-memory storage stand-in
const mem = () => { const m = {}; return {
  getItem: k => (k in m ? m[k] : null),
  setItem: (k, v) => { m[k] = String(v); },
  removeItem: k => { delete m[k]; }
}; };

console.log('\nstorage');
test('saves and lists a deal', () => {
  const d = make(mem());
  d.save({ client: 'מאפייה', priceQuoted: 7200, estimatedHours: 24 });
  assert.strictEqual(d.list().length, 1);
  assert.strictEqual(d.list()[0].client, 'מאפייה');
  assert.strictEqual(d.list()[0].status, 'draft');
});
test('updates in place rather than duplicating', () => {
  const d = make(mem());
  const a = d.save({ client: 'א', priceQuoted: 1000 });
  d.save({ id: a.id, client: 'ב' });
  assert.strictEqual(d.list().length, 1);
  assert.strictEqual(d.get(a.id).client, 'ב');
  assert.strictEqual(d.get(a.id).priceQuoted, 1000, 'untouched fields survive');
});
test('an explicit undefined id does not overwrite the generated one', () => {
  const d = make(mem());
  const a = d.save({ id: undefined, client: 'א' });
  assert.ok(a.id, 'a record must always get an id');
  d.save({ id: undefined, client: 'ב' });
  assert.strictEqual(d.list().length, 2, 'two saves, two records, both identified');
  assert.ok(d.list().every(r => r.id));
});
test('remove and clear', () => {
  const d = make(mem());
  const a = d.save({ client: 'א' }); d.save({ client: 'ב' });
  d.remove(a.id); assert.strictEqual(d.list().length, 1);
  d.clear(); assert.strictEqual(d.list().length, 0);
});
test('blocked storage does not throw', () => {
  const blocked = { getItem(){ throw new Error('blocked'); },
                    setItem(){ throw new Error('blocked'); },
                    removeItem(){ throw new Error('blocked'); } };
  const d = make(blocked);
  assert.deepStrictEqual(d.list(), []);
  assert.strictEqual(d.save({ client: 'x' }), null, 'reports failure instead of pretending');
});
test('corrupt stored json degrades to empty', () => {
  const s = mem(); s.setItem('postcall_deals_v1', '{not json');
  assert.deepStrictEqual(make(s).list(), []);
});

console.log('\nstatus');
test('setStatus stamps sentAt once', () => {
  const d = make(mem());
  const a = d.save({ client: 'א' });
  const s1 = d.setStatus(a.id, 'sent');
  const first = s1.sentAt;
  assert.ok(first);
  d.setStatus(a.id, 'won');
  assert.strictEqual(d.get(a.id).sentAt, first, 'sent timestamp is not rewritten');
});
test('rejects an unknown status', () => {
  const d = make(mem());
  const a = d.save({ client: 'א' });
  assert.strictEqual(d.setStatus(a.id, 'maybe'), null);
});

console.log('\ncalibration — the reason this module exists');
test('refuses to report a ratio under five deliveries', () => {
  const d = make(mem());
  for (let i = 0; i < 4; i++) {
    const x = d.save({ client: 'c' + i, estimatedHours: 20 });
    d.recordOutcome(x.id, { actualHours: 30 });
  }
  const c = d.calibration();
  assert.strictEqual(c.n, 4);
  assert.strictEqual(c.enough, false);
  assert.strictEqual(c.suggestion, null, 'no advice from four jobs');
});
test('reports underestimation once there are five', () => {
  const d = make(mem());
  for (let i = 0; i < 5; i++) {
    const x = d.save({ client: 'c' + i, estimatedHours: 20 });
    d.recordOutcome(x.id, { actualHours: 30 });
  }
  const c = d.calibration();
  assert.strictEqual(c.enough, true);
  assert.strictEqual(c.ratio, 1.5);
  assert.ok(/נמוך ב-50%/.test(c.suggestion), c.suggestion);
});
test('reports overestimation too', () => {
  const d = make(mem());
  for (let i = 0; i < 5; i++) {
    const x = d.save({ client: 'c' + i, estimatedHours: 20 });
    d.recordOutcome(x.id, { actualHours: 10 });
  }
  assert.ok(/גבוה ב-50%/.test(d.calibration().suggestion));
});
test('deals without logged hours are excluded, not counted as zero', () => {
  const d = make(mem());
  const a = d.save({ client: 'a', estimatedHours: 20 });
  d.recordOutcome(a.id, { actualHours: 40 });
  d.save({ client: 'b', estimatedHours: 20 }); // never delivered
  const c = d.calibration(1);
  assert.strictEqual(c.n, 1);
  assert.strictEqual(c.ratio, 2, 'the undelivered deal does not drag the ratio down');
});

console.log('\noutcome reporting');
test('win rate counts only decided deals', () => {
  const d = make(mem());
  ['won','won','lost','sent','no_answer'].forEach((s, i) => {
    const x = d.save({ client: 'c' + i }); d.setStatus(x.id, s);
  });
  const w = d.winRate();
  assert.strictEqual(w.won, 2); assert.strictEqual(w.lost, 1);
  assert.strictEqual(w.undecided, 2);
  assert.strictEqual(w.rate, 0.67, 'silence is not a loss');
});
test('price hold measures the discount that was actually given', () => {
  /* The average is over the deals that were discounted, not over every
     win. This assertion used to read `avgDiscount === 10` for exactly
     this fixture — one deal 20% off and one at full price — and 10% is a
     discount nobody in it received. Averaging the zeros in makes real
     concessions look small, which is the opposite of what an operator
     checking whether their price holds needs to see. */
  const d = make(mem());
  const a = d.save({ client: 'a', priceQuoted: 10000 });
  d.setStatus(a.id, 'won'); d.recordOutcome(a.id, { closedPrice: 8000 });
  const b = d.save({ client: 'b', priceQuoted: 10000 });
  d.setStatus(b.id, 'won'); d.recordOutcome(b.id, { closedPrice: 10000 });
  const p = d.priceHold();
  assert.strictEqual(p.n, 2);
  assert.strictEqual(p.held, 1);
  assert.strictEqual(p.discounted, 1);
  assert.strictEqual(p.avgDiscount, 20, 'the one client who got a discount got 20%');
});
test('when every deal held, there is no discount to average', () => {
  const d = make(mem());
  const a = d.save({ client: 'a', priceQuoted: 10000 });
  d.setStatus(a.id, 'won'); d.recordOutcome(a.id, { closedPrice: 10000 });
  const p = d.priceHold();
  assert.strictEqual(p.discounted, 0);
  assert.strictEqual(p.avgDiscount, null, '0% would imply a discount was given and measured');
});
test('zero and junk numbers are stored as null, not as values', () => {
  const d = make(mem());
  const a = d.save({ client: 'a', estimatedHours: 10 });
  d.recordOutcome(a.id, { actualHours: 'לא יודע', closedPrice: 0 });
  assert.strictEqual(d.get(a.id).outcome.actualHours, null);
  assert.strictEqual(d.get(a.id).outcome.closedPrice, null);
  assert.strictEqual(d.calibration(1).n, 0, 'junk does not enter the ratio');
});

console.log('\nwhere the number came from, kept on the record');
/* The form already carries q_provenance and dealSnapshot() already stores the
   whole form with the deal, so every saved deal has held this value all along.
   Nothing read it. Promoting it to a first-class field is what lets the track
   record group by it the same way it groups by pricedBy. */
test('a saved deal carries the provenance the form recorded', () => {
  const d = make(mem());
  const a = d.save({ client: 'א', priceQuoted: 5000, form: { q_provenance: 'unprompted' } });
  assert.strictEqual(a.provenance, 'unprompted');
  assert.strictEqual(d.get(a.id).provenance, 'unprompted', 'and it survives the round trip');
});
test('an explicitly supplied provenance is not overwritten by the form', () => {
  const d = make(mem());
  const a = d.save({ client: 'א', provenance: 'mine', form: { q_provenance: 'prompted' } });
  assert.strictEqual(a.provenance, 'mine', 'the caller is more specific than the form dump');
});
test('a deal with neither is unattributed, never guessed', () => {
  /* The rule pc-history.js already applies to pricedBy: a record saved before
     the field existed is counted as unattributable rather than assigned a
     value. Defaulting to 'mine' here would invent the most damning reading of
     a deal nobody recorded anything about. */
  const d = make(mem());
  const a = d.save({ client: 'א', priceQuoted: 5000 });
  assert.strictEqual(a.provenance, null);
  assert.strictEqual(d.provenanceOf(d.get(a.id)), null);
});
test('the four values the form can produce all survive, including "no number"', () => {
  /* The select has four options, not three. 'none' is an answer — the client
     never named a figure — and it is not the same thing as a record that was
     saved before anyone asked. Folding them together would hide the first
     inside the second. */
  ['unprompted', 'prompted', 'mine', 'none'].forEach(v => {
    const d = make(mem());
    const a = d.save({ client: 'א', priceQuoted: 5000, form: { q_provenance: v } });
    assert.strictEqual(a.provenance, v, v + ' did not survive the save');
  });
});
test('a value nobody defined reads as unattributed, not as its own group', () => {
  /* A hand-edited store, or a fifth option added to the form later without
     anyone teaching the track record about it. Either way the panel must not
     grow a bucket named after a string it cannot explain. */
  const d = make(mem());
  const a = d.save({ client: 'א', priceQuoted: 5000, form: { q_provenance: 'לא-קיים' } });
  assert.strictEqual(a.provenance, null);
  assert.strictEqual(d.provenanceOf({ provenance: 'banana' }), null);
});
test('a record already in storage is read through the fallback, not rewritten', () => {
  /* save() can only promote what passes through it. Deals sitting in
     localStorage from before this existed never pass through it again, so the
     read side has to reach into form itself or they stay invisible. */
  const st = mem();
  st.setItem('postcall_deals_v1', JSON.stringify([{
    id: 'old1', client: 'עתיק', status: 'won', priceQuoted: 4000,
    form: { q_provenance: 'prompted' }
  }]));
  const d = make(st);
  const rec = d.get('old1');
  assert.strictEqual(rec.provenance, undefined, 'storage is not rewritten behind the operator');
  assert.strictEqual(d.provenanceOf(rec), 'prompted', 'but it is readable');
});

console.log('\nwho moved the price');
/* A discount the client asked for and a discount the operator offered without
   being asked call for opposite corrections — one says the price was too high
   for this buyer, the other says nothing about the buyer at all. A single mean
   across both cannot tell them apart, which is the same argument this module
   already makes about averaging the zeros into avgDiscount. */
test('a concession defaults to unknown rather than to either side', () => {
  const d = make(mem());
  const a = d.save({ client: 'a', priceQuoted: 10000 });
  d.setStatus(a.id, 'won'); d.recordOutcome(a.id, { closedPrice: 8000 });
  assert.strictEqual(d.get(a.id).outcome.concession, 'unknown',
    'guessing who asked would invent the finding this field exists to record');
});
test('the two answers are stored as given', () => {
  ['client_asked', 'i_offered'].forEach(v => {
    const d = make(mem());
    const a = d.save({ client: 'a', priceQuoted: 10000 });
    d.setStatus(a.id, 'won');
    d.recordOutcome(a.id, { closedPrice: 8000, concession: v });
    assert.strictEqual(d.get(a.id).outcome.concession, v);
  });
});
test('an outcome note survives the next save that does not re-send it', () => {
  /* The same defect `concession` was already fixed for, one field over. The
     outcome form re-renders after every save, and a field that is not on screen
     is not re-sent — so a value that is overwritten with '' rather than carried
     over is a value the operator loses by saving again. Nothing in the product
     sends this field today, which is exactly why it went unnoticed. */
  const d = make(mem());
  const a = d.save({ client: 'a', priceQuoted: 10000 });
  d.setStatus(a.id, 'won');
  d.recordOutcome(a.id, { closedPrice: 9000, outcomeNote: 'ביקש לפרוס לשלושה' });
  assert.strictEqual(d.get(a.id).outcome.note, 'ביקש לפרוס לשלושה');
  d.recordOutcome(a.id, { actualHours: 22 });          // a second save, hours only
  assert.strictEqual(d.get(a.id).outcome.note, 'ביקש לפרוס לשלושה',
    'saving the hours wiped the note the operator had already written');
  assert.strictEqual(d.get(a.id).outcome.actualHours, 22, 'and the hours still land');
});
test('a value outside the three falls back to unknown', () => {
  const d = make(mem());
  const a = d.save({ client: 'a', priceQuoted: 10000 });
  d.setStatus(a.id, 'won');
  d.recordOutcome(a.id, { closedPrice: 8000, concession: 'maybe' });
  assert.strictEqual(d.get(a.id).outcome.concession, 'unknown');
});
test('priceHold splits the average by who moved it, and reports the two apart', () => {
  const d = make(mem());
  const mk = (price, closed, conc) => {
    const x = d.save({ client: 'c', priceQuoted: price });
    d.setStatus(x.id, 'won');
    d.recordOutcome(x.id, { closedPrice: closed, concession: conc });
  };
  mk(10000, 8000, 'client_asked');    // 20%
  mk(10000, 9000, 'client_asked');    // 10%
  mk(10000, 5000, 'i_offered');       // 50%
  mk(10000, 10000, 'client_asked');   // held, must not enter any average
  const p = d.priceHold();
  assert.strictEqual(p.discounted, 3);
  assert.strictEqual(p.byConcession.client_asked.n, 2);
  assert.strictEqual(p.byConcession.client_asked.avgDiscount, 15);
  assert.strictEqual(p.byConcession.i_offered.n, 1);
  assert.strictEqual(p.byConcession.i_offered.avgDiscount, 50);
  assert.strictEqual(p.byConcession.unknown.n, 0);
  assert.strictEqual(p.byConcession.unknown.avgDiscount, null,
    'a side with no deals has no average, not an average of zero');
});
test('a deal that held its price is in no concession group at all', () => {
  const d = make(mem());
  const a = d.save({ client: 'a', priceQuoted: 10000 });
  d.setStatus(a.id, 'won'); d.recordOutcome(a.id, { closedPrice: 10000, concession: 'i_offered' });
  const p = d.priceHold();
  assert.strictEqual(p.discounted, 0);
  assert.strictEqual(p.byConcession.i_offered.n, 0,
    'the price did not move, so nobody moved it — whatever the field says');
});
test('an unanswered concession is counted on its own, not folded into either side', () => {
  const d = make(mem());
  const a = d.save({ client: 'a', priceQuoted: 10000 });
  d.setStatus(a.id, 'won'); d.recordOutcome(a.id, { closedPrice: 7000 });
  const p = d.priceHold();
  assert.strictEqual(p.byConcession.unknown.n, 1);
  assert.strictEqual(p.byConcession.unknown.avgDiscount, 30);
  assert.strictEqual(p.byConcession.client_asked.n, 0);
  assert.strictEqual(p.byConcession.i_offered.n, 0);
});
test('every discounted deal lands in exactly one group, whatever the field holds', () => {
  /* The invariant, asserted directly rather than through any one bad value.
     Reported in review: a value outside the three fell through all three
     filters, so `discounted` could exceed the groups it is supposed to be made
     of and the panel would underreport unattributed discounts without saying
     so. pc-backup.js restores ledger JSON verbatim, so an edited or
     hand-written backup is a real way in. */
  const st = mem();
  st.setItem('postcall_deals_v1', JSON.stringify([
    { id: 'r1', status: 'won', priceQuoted: 10000,
      outcome: { closedPrice: 8000, concession: 'banana' } },
    { id: 'r2', status: 'won', priceQuoted: 10000,
      outcome: { closedPrice: 9000, concession: 'client_asked' } },
    { id: 'r3', status: 'won', priceQuoted: 10000,
      outcome: { closedPrice: 5000, concession: '' } }
  ]));
  const p = make(st).priceHold();
  const summed = Object.keys(p.byConcession)
    .reduce((s, k) => s + p.byConcession[k].n, 0);
  assert.strictEqual(summed, p.discounted,
    'discounted=' + p.discounted + ' but the groups add to ' + summed);
  assert.strictEqual(p.byConcession.unknown.n, 2,
    'an unrecognised value and an empty one are both "nobody recorded it"');
});
test('a bad value on the record is repaired the next time an outcome is saved', () => {
  /* Root cause of the above: the carry-forward kept whatever was already
     there. Preserving the answer an operator gave is the point of it, but a
     string nobody defined is not an answer to preserve. */
  const st = mem();
  st.setItem('postcall_deals_v1', JSON.stringify([
    { id: 'r1', status: 'won', priceQuoted: 10000,
      outcome: { closedPrice: 8000, concession: 'banana' } }
  ]));
  const d = make(st);
  d.recordOutcome('r1', { closedPrice: 8000, actualHours: 12 });
  assert.strictEqual(d.get('r1').outcome.concession, 'unknown');
});
test('recording an outcome again does not silently reset the answer', () => {
  /* The outcome form re-renders after every save, and the hours field is the
     one an operator comes back to. Wiping the concession on a second save
     because that dropdown was not re-sent would lose the answer they gave. */
  const d = make(mem());
  const a = d.save({ client: 'a', priceQuoted: 10000 });
  d.setStatus(a.id, 'won');
  d.recordOutcome(a.id, { closedPrice: 8000, concession: 'i_offered' });
  d.recordOutcome(a.id, { closedPrice: 8000, actualHours: 12 });
  assert.strictEqual(d.get(a.id).outcome.concession, 'i_offered');
});

console.log('\nthe concession that never shows up as one');
/* priceHold() answers "did the price hold" by comparing closedPrice to
   priceQuoted. So the one form of giving that leaves both numbers untouched is
   invisible to it: adding work to the scope after the quote has gone out. The
   client pays what was quoted, the panel records a clean full-price win, and the
   operator delivered more for it.

   This is worse than an unmeasured concession, because the instrument reports
   the opposite of what happened — and it is plausibly the most common form of
   giving, precisely because it does not feel like a discount while you do it. */
const withScope = (state) => ({ fields: {}, systems: ['וואטסאפ'], scope: state });
const SCOPE_A = { build: 'in', train: 'in', docs: 'out' };

test('the in-scope set is locked when the quote goes out, like the estimate', () => {
  const d = make(mem());
  const a = d.save({ client: 'a', priceQuoted: 10000, form: withScope(SCOPE_A) });
  assert.strictEqual(d.get(a.id).scopeAtQuote, undefined,
    'a draft has not been quoted yet — nothing to lock against');
  d.setStatus(a.id, 'sent');
  assert.deepStrictEqual([...d.get(a.id).scopeAtQuote].sort(), ['build', 'train'],
    'only the in-scope rows, locked at the moment the price left');
});
test('the lock is not overwritten by a later send', () => {
  // re-marking sent must not move the baseline to whatever the scope is now
  const d = make(mem());
  const a = d.save({ client: 'a', priceQuoted: 10000, form: withScope(SCOPE_A) });
  d.setStatus(a.id, 'sent');
  d.save({ id: a.id, form: withScope({ build: 'in', train: 'in', docs: 'in' }) });
  d.setStatus(a.id, 'sent');
  assert.deepStrictEqual([...d.get(a.id).scopeAtQuote].sort(), ['build', 'train'],
    'a moved baseline measures nothing');
});
test('scopeDrift reports what was added after the quote, and what was dropped', () => {
  const d = make(mem());
  const a = d.save({ client: 'a', priceQuoted: 10000, form: withScope(SCOPE_A) });
  d.setStatus(a.id, 'sent');
  d.save({ id: a.id, form: withScope({ build: 'in', train: 'out', docs: 'in' }) });
  const drift = d.scopeDrift(d.get(a.id));
  assert.deepStrictEqual(drift.added, ['docs']);
  assert.deepStrictEqual(drift.removed, ['train']);
  assert.strictEqual(drift.widened, true, 'something was added at the same price');
});
test('a deal whose scope never moved reports no drift', () => {
  const d = make(mem());
  const a = d.save({ client: 'a', priceQuoted: 10000, form: withScope(SCOPE_A) });
  d.setStatus(a.id, 'sent');
  const drift = d.scopeDrift(d.get(a.id));
  assert.deepStrictEqual(drift.added, []);
  assert.strictEqual(drift.widened, false);
});
test('a deal with no lock reports unmeasurable, never "no drift"', () => {
  /* Every deal saved before this shipped has no baseline. Reporting those as
     zero drift would state a finding the ledger cannot support — the same rule
     provenanceOf() follows by refusing to backfill, and calibration() follows by
     refusing to report under five deliveries. */
  const st = mem();
  st.setItem('postcall_deals_v1', JSON.stringify([
    { id: 'old', status: 'won', priceQuoted: 10000,
      form: withScope({ build: 'in', docs: 'in' }), outcome: { closedPrice: 10000 } }
  ]));
  const d = make(st);
  assert.strictEqual(d.scopeDrift(d.get('old')).widened, null,
    'no baseline is not the same as no movement');
});
test('priceHold separates a clean hold from one that delivered more', () => {
  const d = make(mem());
  const clean = d.save({ client: 'clean', priceQuoted: 10000, form: withScope(SCOPE_A) });
  d.setStatus(clean.id, 'sent'); d.setStatus(clean.id, 'won');
  d.recordOutcome(clean.id, { closedPrice: 10000 });

  const wider = d.save({ client: 'wider', priceQuoted: 10000, form: withScope(SCOPE_A) });
  d.setStatus(wider.id, 'sent');
  d.save({ id: wider.id, form: withScope({ build: 'in', train: 'in', docs: 'in' }) });
  d.setStatus(wider.id, 'won');
  d.recordOutcome(wider.id, { closedPrice: 10000 });

  const p = d.priceHold();
  assert.strictEqual(p.held, 2, 'factually the price did not drop in either');
  assert.strictEqual(p.widened, 1);
  assert.strictEqual(p.heldClean, 1,
    'only one of these two is a win the panel may call full price');
});
test('widened is null when no won deal carries a baseline', () => {
  const st = mem();
  st.setItem('postcall_deals_v1', JSON.stringify([
    { id: 'old', status: 'won', priceQuoted: 10000, outcome: { closedPrice: 10000 } }
  ]));
  const p = make(st).priceHold();
  assert.strictEqual(p.held, 1);
  assert.strictEqual(p.widened, null, '0 would read as "this never happens here"');
  assert.strictEqual(p.heldClean, null);
  assert.strictEqual(p.scopeTracked, 0, 'say how many deals could be checked at all');
});
test('a deal that was discounted AND widened is counted in both', () => {
  // the worst case, and the one an operator most needs to see
  const d = make(mem());
  const a = d.save({ client: 'a', priceQuoted: 10000, form: withScope(SCOPE_A) });
  d.setStatus(a.id, 'sent');
  d.save({ id: a.id, form: withScope({ build: 'in', train: 'in', docs: 'in' }) });
  d.setStatus(a.id, 'won');
  d.recordOutcome(a.id, { closedPrice: 8000, concession: 'i_offered' });
  const p = d.priceHold();
  assert.strictEqual(p.discounted, 1);
  assert.strictEqual(p.widened, 1, 'the scope moved too, and that is not cancelled by the discount');
  assert.strictEqual(p.heldClean, 0);
});

console.log('\ndeals that happened before the tool existed');
/* The advantage this product offers is an accumulation, so it is worth nothing on
   deal one — which is exactly when people leave. And every threshold in here
   sensibly refuses to speak without evidence, so guidance arrives inversely to
   need: the operator who has priced fifteen jobs gets the findings, and the one
   who has priced none gets a blank panel.

   Entering deals that already happened is the only fix that needs no server, no
   account and no second side. What it must not do is let a remembered number
   pass itself off as a measured one. */
test('a past deal that closed is stored as a win with both prices', () => {
  const d = make(mem());
  const r = d.addPast({ client: 'מאפייה', quoted: 8000, closed: 7000 });
  assert.strictEqual(r.status, 'won');
  assert.strictEqual(r.priceQuoted, 8000);
  assert.strictEqual(r.outcome.closedPrice, 7000);
});
test('a past deal that did not close is stored as lost, not as a zero-price win', () => {
  const d = make(mem());
  const r = d.addPast({ client: 'יבואן', quoted: 12000, lost: true });
  assert.strictEqual(r.status, 'lost');
  assert.strictEqual(r.outcome, null, 'there is no closing price to record');
  assert.strictEqual(d.winRate().lost, 1);
});
test('it carries no estimate, so it can never enter the calibration figures', () => {
  /* The whole reason calibration() exists is estimate-versus-actual on a number
     locked at quote time. Nobody can reconstruct that from memory, and letting a
     remembered figure in would corrupt the one statistic the effort table depends
     on to stop being fitted backwards. */
  const d = make(mem());
  d.addPast({ client: 'a', quoted: 8000, closed: 8000, hours: 40 });
  const r = d.list()[0];
  assert.strictEqual(r.estimatedHours, null, 'an estimate nobody locked is not an estimate');
  assert.strictEqual(d.calibration().n, 0, 'a remembered deal must not calibrate anything');
});
test('provenance is unset, because it cannot be remembered honestly', () => {
  const d = make(mem());
  const r = d.addPast({ client: 'a', quoted: 8000, closed: 8000, provenance: 'unprompted' });
  assert.strictEqual(d.provenanceOf(r), null,
    'whether the client volunteered a figure months ago is not recoverable, and a ' +
    'caller claiming it does not make it so');
});
test('scope drift is unmeasurable on a past deal rather than absent', () => {
  const d = make(mem());
  const r = d.addPast({ client: 'a', quoted: 8000, closed: 8000 });
  assert.strictEqual(d.scopeDrift(r).measurable, false);
});
test('it is marked as entered rather than measured', () => {
  const d = make(mem());
  const r = d.addPast({ client: 'a', quoted: 8000, closed: 8000 });
  assert.strictEqual(r.retro, true,
    'nothing may present a remembered deal as one the tool watched happen');
});
test('who asked for the discount is recorded when there was one', () => {
  const d = make(mem());
  d.addPast({ client: 'a', quoted: 10000, closed: 8000, concession: 'i_offered' });
  assert.strictEqual(d.priceHold().byConcession.i_offered.n, 1);
});
test('a concession on a deal that held its price is not recorded as one', () => {
  const d = make(mem());
  d.addPast({ client: 'a', quoted: 10000, closed: 10000, concession: 'i_offered' });
  const p = d.priceHold();
  assert.strictEqual(p.discounted, 0, 'nothing was conceded, whatever the field says');
  assert.strictEqual(p.byConcession.i_offered.n, 0);
});
test('a closing price above the quote is refused rather than stored', () => {
  const d = make(mem());
  assert.strictEqual(d.addPast({ client: 'a', quoted: 8000, closed: 9000 }), null,
    'that is not a discount and not a hold — it is a typo, and it would report as a hold');
});
test('a missing or junk quote is refused', () => {
  const d = make(mem());
  [{}, { quoted: 0 }, { quoted: -5 }, { quoted: 'הרבה' }].forEach(row =>
    assert.strictEqual(d.addPast(row), null, JSON.stringify(row)));
  assert.strictEqual(d.list().length, 0);
});
test('six entered deals are enough for the ceiling finding to speak', () => {
  /* The point of the whole exercise: the beginner enters what already happened
     and the panel starts working the same afternoon. Six wins, none discounted,
     none lost — and the tool can now say the thing it could never say before,
     that the price has never actually been tested. */
  const d = make(mem());
  for (let i = 0; i < 6; i++) d.addPast({ client: 'c' + i, quoted: 6000, closed: 6000 });
  const w = d.winRate();
  assert.strictEqual(w.won, 6);
  assert.strictEqual(w.rate, 1);
  assert.strictEqual(d.priceHold().discounted, 0);
});

console.log('\nthe two places that ask "was the price ever tested" agree');
/* Review found these two apart: ceiling() in pc-history.js requires lost === 0
   before calling a price untested, and PRE-CALL's line checked only for discounts
   — so one ledger read "untested" in the call script and "tested" in the panel.
   The rule now lives once, in priceMoved(), and this pins the agreement rather
   than trusting two call sites to stay in step. Same instrument the project uses
   between the key minter and the gate, and between the client's event names and
   the server allowlist. */
const H = require('./pc-history.js');
test('priceMoved and the ceiling verdict never disagree', () => {
  const wins = n => Array.from({ length: n }, (_, i) => ({
    id: 'w' + i, status: 'won', priceQuoted: 10000,
    outcome: { closedPrice: 10000, concession: 'unknown' } }));
  const cases = [
    { label: 'clean six',        deals: wins(6), hold: { n: 6, discounted: 0, widened: 0, scopeTracked: 6 } },
    { label: 'one lost',         deals: wins(5).concat([{ id: 'l', status: 'lost', priceQuoted: 10000 }]),
                                 hold: { n: 5, discounted: 0, widened: 0, scopeTracked: 5 } },
    { label: 'one discounted',   deals: wins(6), hold: { n: 6, discounted: 1, widened: 0, scopeTracked: 6 } },
    { label: 'one widened',      deals: wins(6), hold: { n: 6, discounted: 0, widened: 1, scopeTracked: 6 } },
    { label: 'scope unknown',    deals: wins(6), hold: { n: 6, discounted: 0, widened: null, scopeTracked: 0 } }
  ];
  cases.forEach(c => {
    const lost = c.deals.filter(d => d.status === 'lost').length;
    const moved = priceMoved({ lost, discounted: c.hold.discounted, widened: c.hold.widened });
    const verdict = H.ceiling(c.deals, c.hold);
    assert.strictEqual(verdict.untested, !moved,
      c.label + ': priceMoved says ' + moved + ' and ceiling says untested=' + verdict.untested);
  });
});

console.log('\nthe ledger writes its transitions to a journal, when given one');
/* One choke point. save/setStatus are where every mutation goes through, so
   journaling here means a caller cannot forget — which is the mistake review
   already caught once, when the crossing trigger was wired to two of four paths.

   Injected rather than reached for, so this module stays pure and Node-testable
   with and without it. Given no journal, nothing changes at all. */
const J = require('./pc-journal.js');
const withJournal = () => { const st = mem(); return { d: make(st, J.make(st)), st }; };

test('a status change is journalled, from and to', () => {
  const { d, st } = withJournal();
  const a = d.save({ client: 'א', priceQuoted: 10000 });
  d.setStatus(a.id, 'sent');
  const j = J.make(st).forDeal(a.id).filter(l => l.what === 'deal.status');
  assert.ok(j.some(l => l.from === 'draft' && l.to === 'sent'),
    'the transition the ledger has no state for: ' + JSON.stringify(j));
});
test('a price that moved before sending is journalled — the ledger overwrites it', () => {
  /* priceQuoted is overwritten on every re-save, so today a price that dropped
     from 12,000 to 10,000 while still a draft leaves no trace anywhere in the
     product. This is the whole point of the module. */
  const { d, st } = withJournal();
  const a = d.save({ client: 'א', priceQuoted: 12000 });
  d.save({ id: a.id, priceQuoted: 10000 });
  const m = J.make(st).movement(a.id);
  assert.strictEqual(m.priceMoves, 1);
  assert.strictEqual(m.droppedBeforeSending, true);
  assert.strictEqual(d.get(a.id).priceQuoted, 10000, 'the ledger still holds only the latest');
});
test('a re-save at the same price writes nothing', () => {
  const { d, st } = withJournal();
  const a = d.save({ client: 'א', priceQuoted: 10000 });
  d.save({ id: a.id, client: 'ב' });
  assert.strictEqual(J.make(st).forDeal(a.id).filter(l => l.what === 'deal.price').length, 1,
    'only the first, which moved from nothing to 10,000');
});
test('a scope that grew after the quote went out is journalled', () => {
  /* The other half of the price moving. Same money, more work — and the ledger
     holds only the current scope, so the growth is invisible in it by
     construction, exactly like the price. */
  const { d, st } = withJournal();
  const a = d.save({ client: 'א', priceQuoted: 10000,
                     form: { scope: { x: 'in', y: 'in', z: 'out' } } });
  d.setStatus(a.id, 'sent');
  d.save({ id: a.id, form: { scope: { x: 'in', y: 'in', z: 'in' } } });
  const m = J.make(st).movement(a.id);
  assert.strictEqual(m.scopeMoves, 1);
  assert.strictEqual(m.grewAfterSending, true, 'work was added at the sent price');
});
test('a scope nobody answered is not journalled as a scope of zero', () => {
  /* The null-vs-zero rule this file already enforces on `widened`: unmeasurable
     is not the same fact as measured-and-empty. A deal saved before the scope
     question was answered has no scope, and the first save that answers it is
     the scope being ESTABLISHED. Journal that as 0 → 2 and every such deal
     reports its scope as having moved, which makes scopeMoves mean nothing —
     the same mistake priceMoves already had to be corrected for. */
  const { d, st } = withJournal();
  const a = d.save({ client: 'א', priceQuoted: 10000 });          // no scope at all
  d.save({ id: a.id, form: { scope: { x: 'in', y: 'in' } } });    // now answered
  assert.strictEqual(J.make(st).movement(a.id).scopeMoves, 0,
    'answering the scope question for the first time is not the scope moving');
});
test('the money actually moving is journalled — the one transition it exists for', () => {
  /* The module's own argument is that a price which drops leaves no trace,
     because the record holds one price. But recordOutcome ended in save(), and
     save() only compares priceQuoted — which does not move when an outcome is
     recorded — so the closing price landing below the quote wrote nothing at
     all. The fact the journal was built for was the fact it could not see. */
  const { d, st } = withJournal();
  const a = d.save({ client: 'א', priceQuoted: 12000, estimatedHours: 20 });
  d.setStatus(a.id, 'sent');
  d.recordOutcome(a.id, { closedPrice: 9500, actualHours: 31 });
  const j = J.make(st).forDeal(a.id);
  const closed = j.find(l => l.what === 'deal.closed');
  assert.ok(closed, 'no deal.closed line: ' + JSON.stringify(j.map(l => l.what)));
  assert.strictEqual(closed.from, 12000);
  assert.strictEqual(closed.to, 9500);
  const hours = j.find(l => l.what === 'deal.hours');
  assert.ok(hours, 'the estimate against the actual is the other half of the fact');
  assert.strictEqual(hours.from, 20);
  assert.strictEqual(hours.to, 31);
});
test('a price that held writes no closing line', () => {
  // same discipline as everywhere else here: a transition that did not move is
  // not a transition, and a log of non-events buries the events
  const { d, st } = withJournal();
  const a = d.save({ client: 'א', priceQuoted: 10000 });
  d.setStatus(a.id, 'won');
  d.recordOutcome(a.id, { closedPrice: 10000 });
  assert.strictEqual(J.make(st).forDeal(a.id).filter(l => l.what === 'deal.closed').length, 0);
});
test('a deal that is deleted says so, instead of just vanishing from the count', () => {
  /* Without this every number the reader shows is higher than reality and
     nothing reveals the gap: four saves and one deletion leave three deals in
     the ledger and four save lines in the log. */
  const { d, st } = withJournal();
  const a = d.save({ client: 'א', priceQuoted: 10000 });
  d.remove(a.id);
  const j = J.make(st).forDeal(a.id);
  assert.ok(j.some(l => l.what === 'deal.removed'),
    'a deal left the ledger and the log did not notice');
  assert.strictEqual(d.list().length, 0, 'and it really is gone');
});
test('a deal entered in hindsight is marked as such', () => {
  /* addPast reaches the journal only through save(), so a retro entry looks
     exactly like a deal that happened live — and any median time-from-open-to-
     send computed over it would be measuring the data entry, not the selling. */
  const { d, st } = withJournal();
  const a = d.addPast({ client: 'א', quoted: 8000, closed: 7000, concession: 'client_asked' });
  assert.ok(a, 'addPast must still work');
  const j = J.make(st).forDeal(a.id);
  assert.ok(j.some(l => l.what === 'deal.status' && l.retro === true),
    'nothing distinguishes it from a deal that happened while the tool watched: ' +
    JSON.stringify(j));
});
test('no journal means no change in behaviour at all', () => {
  const d = make(mem());
  const a = d.save({ client: 'א', priceQuoted: 10000 });
  assert.ok(d.setStatus(a.id, 'sent'), 'the ledger must work exactly as before without one');
  assert.strictEqual(d.get(a.id).status, 'sent');
});
test('a journal that throws never fails a save', () => {
  /* The inversion this must never allow: an observation failing the thing
     observed. deals.js reports a failed write to the operator as real. */
  const angry = { append(){ throw new Error('boom'); } };
  const d = make(mem(), angry);
  let rec;
  assert.doesNotThrow(() => { rec = d.save({ client: 'א', priceQuoted: 10000 }); });
  assert.ok(rec, 'the save must succeed even when journalling explodes');
  assert.doesNotThrow(() => d.setStatus(rec.id, 'sent'));
});
test('the journal never receives a client name', () => {
  const { d, st } = withJournal();
  const a = d.save({ client: 'לקוח סודי בע"מ', priceQuoted: 10000 });
  d.setStatus(a.id, 'won');
  assert.ok(!JSON.stringify(J.make(st).list()).includes('סודי'),
    'a backup carries this file — it holds ids, statuses and numbers, never names');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
