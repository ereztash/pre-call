/* node assets/journal.test.js — no browser, no deps.

   The product is good at snapshots and blind to transitions, and every one of the
   four sub-topics scoring 2/10 is the same defect wearing a different hat: the
   moment after a call, the middle of a negotiation, whether anyone got anywhere,
   and whether money moved. All four are transitions, and a transition is only
   observable if the state before it was kept.

   The ledger keeps a baseline in exactly three places — estimatedHours locked at
   save, scopeAtQuote locked at send, and an in-memory report snapshot for the
   crossing trigger — and each one was added deliberately and unlocked a whole
   class of finding. Everywhere else there is no "before" at all, because
   storage.setItem overwrites the whole list on every write.

   This is the general case of those three: an append-only local log of what
   changed, from what, to what, and when.

   Two properties are load-bearing and most of this file is about them:

     1. It can never break the thing it observes. A journal that fails a save is
        worse than no journal, because the ledger treats a failed write as real.
     2. It carries no free text. It is local, but pc-backup.js round-trips it into
        a file that leaves the machine, so it holds the same discipline as the
        telemetry row: statuses, counts, ids. Never a client name. */
const { make, WHAT, CAP } = require('./pc-journal.js');
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

console.log('\nappending a transition');
test('a line records what changed, from what, to what', () => {
  const j = make(mem());
  const line = j.append({ what: 'deal.status', from: 'sent', to: 'won', ref: 'd_1' });
  assert.strictEqual(line.what, 'deal.status');
  assert.strictEqual(line.from, 'sent');
  assert.strictEqual(line.to, 'won');
  assert.strictEqual(line.ref, 'd_1');
  assert.ok(!isNaN(Date.parse(line.at)), 'a transition with no time is not a transition');
});
test('lines come back oldest first, because order IS the data', () => {
  /* The whole reason this exists is sequence. A reader that has to sort before it
     can reason is a reader that will one day forget to. */
  const j = make(mem());
  j.append({ what: 'deal.status', to: 'draft', ref: 'd_1' });
  j.append({ what: 'deal.status', from: 'draft', to: 'sent', ref: 'd_1' });
  j.append({ what: 'deal.status', from: 'sent', to: 'won', ref: 'd_1' });
  assert.deepStrictEqual(j.list().map(l => l.to), ['draft', 'sent', 'won']);
});
test('a transition that did not move is not recorded', () => {
  // re-saving a deal with the same price is not a price change
  const j = make(mem());
  assert.strictEqual(j.append({ what: 'deal.price', from: 8000, to: 8000, ref: 'd_1' }), null);
  assert.strictEqual(j.list().length, 0, 'a log of non-events buries the events');
});
test('an unknown `what` is refused, so the vocabulary cannot drift', () => {
  const j = make(mem());
  assert.strictEqual(j.append({ what: 'whatever', to: 'x' }), null);
  assert.ok(WHAT.length >= 4, 'the vocabulary is the contract');
});

console.log('\nit can never break the thing it observes');
test('blocked storage returns null rather than throwing', () => {
  /* deals.js treats a failed write as a real failure and reports it to the
     operator. If journaling could throw, an observation would be able to fail a
     save — which inverts what this is for. */
  const blocked = { getItem(){ throw new Error('x'); },
                    setItem(){ throw new Error('x'); }, removeItem(){ throw new Error('x'); } };
  const j = make(blocked);
  assert.doesNotThrow(() => j.append({ what: 'deal.status', to: 'won', ref: 'd' }));
  assert.strictEqual(j.append({ what: 'deal.status', to: 'won', ref: 'd' }), null);
  assert.deepStrictEqual(j.list(), []);
});
test('corrupt stored json reads as empty rather than throwing', () => {
  const j = make(mem({ postcall_journal_v1: '{not json' }));
  assert.deepStrictEqual(j.list(), []);
  assert.ok(j.append({ what: 'deal.status', to: 'won', ref: 'd' }), 'and it recovers');
});
test('it is capped, and drops the oldest rather than the newest', () => {
  /* localStorage is one quota shared with the ledger, the draft and the sender. An
     unbounded log would eventually make saving a deal fail — the observation
     starving the thing observed. Oldest goes, because the recent transitions are
     the ones any question is about. */
  const j = make(mem());
  for (let i = 0; i < CAP + 20; i++)
    j.append({ what: 'deal.price', from: i, to: i + 1, ref: 'd_1' });
  const l = j.list();
  assert.strictEqual(l.length, CAP);
  assert.strictEqual(l[l.length - 1].to, CAP + 20, 'the newest line must survive');
  assert.ok(l[0].from >= 20, 'the oldest lines should be the ones dropped');
});

console.log('\nwhat it must never carry');
test('free text is refused, because a backup leaves the machine', () => {
  /* pc-backup.js round-trips this into a downloadable file. The ledger holds
     client names and process descriptions and that is the operator's own
     business, but a log of transitions has no reason to carry any of it — so it
     cannot. Same rule as the telemetry row, one layer down. */
  const j = make(mem());
  const line = j.append({ what: 'deal.status', from: 'sent', to: 'won', ref: 'd_1',
                          client: 'לקוח סודי בע"מ', note: 'תיאור התהליך' });
  assert.deepStrictEqual(Object.keys(line).sort(), ['at', 'from', 'ref', 'to', 'what']);
  assert.ok(!JSON.stringify(j.list()).includes('סודי'), 'a client name reached the journal');
});
test('the retro flag is a boolean and cannot become a sentence', () => {
  /* `retro` is the only field here that is not a status, a number or a generated
     id, so it is the only place text could try to enter. It is set for a literal
     true and nothing else — not for a truthy value, which is how a string would
     have got through. */
  const j = make(mem());
  j.append({ what: 'deal.status', to: 'won', ref: 'd_1', retro: 'הוזן בדיעבד' });
  j.append({ what: 'deal.status', to: 'lost', ref: 'd_2', retro: 1 });
  j.append({ what: 'deal.status', to: 'won', ref: 'd_3', retro: true });
  const l = j.list();
  assert.strictEqual(l[0].retro, undefined, 'a string reached the retro field');
  assert.strictEqual(l[1].retro, undefined, 'a truthy non-boolean set the flag');
  assert.strictEqual(l[2].retro, true);
  assert.ok(!JSON.stringify(l).includes('בדיעבד'), 'text got in through retro');
});
test('the vocabulary covers the closing transition, not only the quoting one', () => {
  /* For a long time it did not, and that was the gap: every verb here watched
     the quote being written and none watched it being answered. */
  ['deal.closed', 'deal.hours', 'deal.removed'].forEach(w =>
    assert.ok(WHAT.indexOf(w) > -1, w + ' is not in the vocabulary'));
});
test('a ref longer than a deal id is refused, not truncated', () => {
  // an id is generated (d_2026..._3); anything long is somebody putting prose here
  const j = make(mem());
  assert.strictEqual(j.append({ what: 'deal.status', to: 'won', ref: 'x'.repeat(80) }), null);
});

console.log('\nthe middle of the negotiation, which had no state at all');
/* STATUS is ['draft','sent','won','lost','no_answer'] — five states and nothing
   between sent and the outcome, which is exactly where the money is lost. The
   journal does not add a status; the middle is DERIVED from what moved. */
const negotiated = () => {
  const j = make(mem());
  j.append({ what: 'deal.status', to: 'draft', ref: 'd_1' });
  j.append({ what: 'deal.price', from: 12000, to: 10000, ref: 'd_1' });
  j.append({ what: 'deal.status', from: 'draft', to: 'sent', ref: 'd_1' });
  j.append({ what: 'deal.scope', from: 3, to: 4, ref: 'd_1' });
  j.append({ what: 'deal.status', from: 'sent', to: 'won', ref: 'd_1' });
  return j;
};
test('movement reports the price moving before the quote went out', () => {
  /* And this one is invisible today by construction: priceQuoted is overwritten
     on every re-save, so a price that dropped from 12,000 to 10,000 before
     sending leaves no trace anywhere in the product. */
  const m = negotiated().movement('d_1');
  assert.strictEqual(m.priceMoves, 1);
  assert.strictEqual(m.priceFrom, 12000);
  assert.strictEqual(m.priceTo, 10000);
  assert.strictEqual(m.droppedBeforeSending, true,
    'the drop happened while it was still a draft, and that is a different fact ' +
    'from a discount the client asked for');
});
test('movement reports the scope growing after the quote went out', () => {
  const m = negotiated().movement('d_1');
  assert.strictEqual(m.scopeMoves, 1);
  assert.strictEqual(m.grewAfterSending, true);
});
test('movement gives the status path, so the middle is readable', () => {
  assert.deepStrictEqual(negotiated().movement('d_1').path, ['draft', 'sent', 'won']);
});
test('a deal that never moved reports no movement, not null', () => {
  const j = make(mem());
  j.append({ what: 'deal.status', to: 'draft', ref: 'd_9' });
  const m = j.movement('d_9');
  assert.strictEqual(m.priceMoves, 0);
  assert.strictEqual(m.scopeMoves, 0);
  assert.strictEqual(m.droppedBeforeSending, false);
});
test('an unknown deal reports nothing rather than throwing', () => {
  const m = make(mem()).movement('nope');
  assert.strictEqual(m.priceMoves, 0);
  assert.deepStrictEqual(m.path, []);
});
test('one deal never reports another deal\'s movement', () => {
  const j = negotiated();
  j.append({ what: 'deal.price', from: 5000, to: 4000, ref: 'd_OTHER' });
  assert.strictEqual(j.movement('d_1').priceMoves, 1, 'a second deal leaked into the first');
});

console.log('\nsessions, which is a funnel with no identifier at all');
test('a session line anchors the sequence without any id being invented', () => {
  /* The telemetry row carries no session id, so counts are all it can ever give.
     Here the log is local and inherently ordered, so the operator\'s own sequence
     IS the funnel — and no cross-visit identifier has to exist for it. */
  const j = make(mem());
  j.append({ what: 'session', to: 'post-call' });
  j.append({ what: 'deal.status', to: 'draft', ref: 'd_1' });
  j.append({ what: 'session', to: 'post-call' });
  assert.strictEqual(j.list().filter(l => l.what === 'session').length, 2);
  assert.strictEqual(j.sessions(), 2, 'how many times this person came back');
});

console.log('\ndeterminism');
test('reading twice gives the same answer', () => {
  const j = negotiated();
  assert.deepStrictEqual(j.movement('d_1'), j.movement('d_1'));
});
test('a caller that supplies the rows gets exactly the same answer', () => {
  /* The ledger asks this once per deal on screen, so it reads the log once and
     hands it down — otherwise every row re-parses the whole thing. An
     optimisation a caller opts into is one that can quietly start answering
     something else, so the two forms are pinned to each other here. */
  const j = negotiated();
  j.append({ what: 'deal.price', from: 5000, to: 4000, ref: 'd_OTHER' });
  const all = j.list();
  assert.deepStrictEqual(j.movement('d_1', all), j.movement('d_1'));
  assert.deepStrictEqual(j.movement('d_OTHER', all), j.movement('d_OTHER'),
    'a shared list must still be filtered per deal');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
