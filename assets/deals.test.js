/* node assets/deals.test.js — no browser, no deps. */
const { make } = require('./deals.js');
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

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
