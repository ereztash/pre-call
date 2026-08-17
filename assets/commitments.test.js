/* node assets/commitments.test.js — no browser, no deps.

   The engine decides what a proposal is allowed to promise. Most of what is
   below is not testing that it says READY when it should — that part is easy
   and it is not where the damage is. It is testing that it refuses: that a
   default cannot arrive dressed as something the client said, that an answer
   typed after the call cannot become a quote, and that a topic the transcript
   merely mentioned is not a decision about that topic.

   The adversarial block at the bottom is the file's real content. Each of
   those is a way the tool could produce a confident, plausible, wrong
   proposal, which is the only failure mode that matters here — a proposal
   that is obviously broken gets fixed before it is sent. */
const C = require('./pc-commitments.js');
const assert = require('assert');

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

const byId = (list, id) => list.find(c => c.id === id);

/* A call that went well: two systems named, the outcome stated, the client
   gave the numbers himself, and nothing exotic came up. */
const COMPLETE = {
  systems: ['WhatsApp', 'Priority'],
  systemsSource: C.SOURCES.clientSaid,
  delivery: 'הזמנות נכנסות ל-Priority בלי העתקה ידנית',
  deliverySource: C.SOURCES.clientSaid,
  provenance: 'unprompted',
  signals: {},
  decisions: {}
};

/* A call where almost nothing was established. */
const SPARSE = { systems: [], delivery: null, provenance: null, signals: {}, decisions: {} };

console.log('\nreadiness belongs to a promise, not to a deal');

test('one deal carries different verdicts at the same time', () => {
  const list = C.assess({ ...COMPLETE, provenance: 'mine' });
  assert.strictEqual(byId(list, 'systems').status, C.READY);
  assert.strictEqual(byId(list, 'delivery').status, C.READY);
  assert.strictEqual(byId(list, 'value-claim').status, C.BLOCKED);
});

test('a missing value claim does not stop the proposal', () => {
  /* The separation the whole file exists for. There is no ROI figure, so the
     document must not claim one — and the work is still fully specified, so
     there is nothing here to stop. A tool that blocked this deal would be
     refusing to quote a job it understands. */
  const list = C.assess({ ...COMPLETE, provenance: 'mine' });
  assert.strictEqual(byId(list, 'value-claim').status, C.BLOCKED);
  assert.deepStrictEqual(C.blocking(list), [],
    'a deal with a known scope was blocked for want of a number nobody needs');
});

test('a sparse call blocks what is material and invents nothing', () => {
  const list = C.assess(SPARSE);
  assert.strictEqual(byId(list, 'systems').status, C.BLOCKED);
  assert.strictEqual(byId(list, 'delivery').status, C.BLOCKED);
  assert.ok(C.blocking(list).length >= 2, 'a sparse call reported nothing to resolve');
  list.forEach(c => assert.notStrictEqual(c.source, C.SOURCES.clientSaid,
    c.id + ' claims the client said something in a call where nothing was established'));
});

test('a complete call produces nothing to resolve', () => {
  assert.deepStrictEqual(C.blocking(C.assess(COMPLETE)), [],
    'the tool found a question to ask about a call that answered everything');
});

console.log('\na promise nobody has a reason to make is absent, not blocked');

test('exception ownership appears only once the call raises an exception', () => {
  assert.ok(!byId(C.assess(COMPLETE), 'exception-owner'),
    'a call with no edge case is being asked who owns the edge case');
  const raised = C.assess({ ...COMPLETE, signals: { freeText: true } });
  assert.ok(byId(raised, 'exception-owner'), 'the call raised it and nothing asked');
  assert.strictEqual(byId(raised, 'exception-owner').status, C.BLOCKED);
});

test('enterprise risk appears only once the call leaves it open', () => {
  assert.ok(!byId(C.assess(COMPLETE), 'enterprise-risk'));
  assert.ok(byId(C.assess({ ...COMPLETE, signals: { enterpriseOpen: true } }), 'enterprise-risk'));
});

console.log('\nwhat may travel to the document');

test('an explicit exclusion travels; an unexamined promise does not', () => {
  const excluded = C.assess({ ...COMPLETE, signals: { enterpriseOpen: true },
                              decisions: { risk: 'exclude' } });
  const risk = byId(excluded, 'enterprise-risk');
  assert.strictEqual(risk.status, C.CONDITIONAL);
  assert.ok(C.admissible(excluded).includes(risk),
    'a promise the operator deliberately excluded cannot reach the page that says so');
  assert.deepStrictEqual(C.blocking(excluded), [],
    'an exclusion is a decision, not an open question');
});

test('choosing to include without saying what is still not a promise', () => {
  const vague = C.assess({ ...COMPLETE, signals: { enterpriseOpen: true },
                           decisions: { risk: 'include' } });
  assert.strictEqual(byId(vague, 'enterprise-risk').status, C.BLOCKED,
    '"SLA included" with no sentence behind it is an open-ended liability');
});

test('every commitment states what goes wrong if it ships unsupported', () => {
  C.assess({ ...COMPLETE, signals: { freeText: true, enterpriseOpen: true } })
    .forEach(c => {
      assert.ok(c.consequenceIfWrong && c.consequenceIfWrong.length > 20,
        c.id + ' has no consequence, so nothing explains why it is worth asking');
      assert.ok(c.candidateClaim, c.id + ' does not say what it would be claiming');
    });
});

console.log('\nthings it must refuse');

test('an answer given after the call never becomes something the client said', () => {
  const list = C.assess({ ...COMPLETE, signals: { freeText: true },
                          decisions: { exceptionOwner: 'client' } });
  const owner = byId(list, 'exception-owner');
  assert.strictEqual(owner.status, C.READY);
  assert.strictEqual(owner.source, C.SOURCES.operatorSaid,
    'the operator decided this and the record says the client did');
});

test('an operator estimate cannot carry a claim about the client\'s business', () => {
  ['mine', null, undefined].forEach(p => {
    const v = byId(C.assess({ ...COMPLETE, provenance: p }), 'value-claim');
    assert.strictEqual(v.status, C.BLOCKED, 'provenance ' + p + ' produced a value claim');
    assert.notStrictEqual(v.source, C.SOURCES.clientSaid);
  });
});

test('a value claim needs the client, and prompted still counts as the client', () => {
  /* He answered a question rather than volunteering it. That changes how hard
     the number leans, which the document already reflects elsewhere; it does
     not change who said it. */
  ['unprompted', 'prompted'].forEach(p => {
    const v = byId(C.assess({ ...COMPLETE, provenance: p }), 'value-claim');
    assert.strictEqual(v.status, C.READY);
    assert.strictEqual(v.source, C.SOURCES.clientSaid);
  });
});

test('a default is never reported as evidence', () => {
  const list = C.assess(SPARSE);
  list.filter(c => c.status === C.BLOCKED).forEach(c =>
    assert.strictEqual(c.source, C.SOURCES.absent,
      c.id + ' is blocked and still names a source — missing is missing'));
});

test('the tool having noticed a topic is not a decision about it', () => {
  /* The regex found the word "security" in a sentence saying it was not
     settled. That is the reason to ask, and it is the whole of what the tool
     knows. */
  const list = C.assess({ ...COMPLETE, signals: { enterpriseOpen: true } });
  assert.strictEqual(byId(list, 'enterprise-risk').status, C.BLOCKED);
  assert.strictEqual(byId(list, 'enterprise-risk').source, C.SOURCES.absent);
});

test('a commitment reports the weakest source holding it up', () => {
  const w = C.weakest([{ source: C.SOURCES.clientSaid }, { source: C.SOURCES.fallback }]);
  assert.strictEqual(w.source, C.SOURCES.fallback,
    'a promise is only as good as the softest thing under it');
});

test('an empty deal is assessed rather than crashed', () => {
  [undefined, null, {}].forEach(d => {
    const list = C.assess(d);
    assert.ok(Array.isArray(list) && list.length, 'assess(' + d + ') produced nothing');
    list.forEach(c => assert.ok([C.READY, C.CONDITIONAL, C.BLOCKED].includes(c.status),
      c.id + ' has status ' + c.status));
  });
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
