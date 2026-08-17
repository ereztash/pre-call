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

console.log('\none question, and only where one is owed');

test('a call that answered everything is asked nothing', () => {
  assert.strictEqual(C.nextEpisode(C.assess(COMPLETE), COMPLETE), null,
    'the tool invented a question to look like it was working');
});

test('a missing value claim alone raises no question', () => {
  /* There is nothing to ask. The client did not put a number on the problem,
     the operator cannot answer that on his behalf, and the proposal does not
     need it. Asking here would be asking somebody to make one up. */
  const deal = { ...COMPLETE, provenance: 'mine' };
  assert.strictEqual(C.nextEpisode(C.assess(deal), deal), null);
});

test('the question asked first is the one the others depend on', () => {
  const ep = C.nextEpisode(C.assess(SPARSE), SPARSE);
  assert.strictEqual(ep.id, 'systems',
    'it asked what should happen between systems nobody has named yet');
  assert.ok(ep.remaining >= 1, 'it did not say more was coming');
});

test('answering one question moves to the next, and then stops', () => {
  let deal = { ...SPARSE };
  const seen = [];
  for (let i = 0; i < 6; i++) {
    const ep = C.nextEpisode(C.assess(deal), deal);
    if (!ep) break;
    seen.push(ep.id);
    if (ep.id === 'systems') deal = { ...deal, systems: ['A', 'B'] };
    if (ep.id === 'delivery') deal = { ...deal, delivery: 'לפתוח רשומה' };
  }
  assert.deepStrictEqual(seen, ['systems', 'delivery']);
  assert.strictEqual(C.nextEpisode(C.assess(deal), deal), null, 'it kept going');
});

test('a question carries the sentence that raised it and what it costs to guess', () => {
  const deal = { ...COMPLETE, signals: { freeText: true },
                 quotes: { 'exception-owner': 'לפעמים שולחים צילום מסך' } };
  const ep = C.nextEpisode(C.assess(deal), deal);
  assert.strictEqual(ep.quote, 'לפעמים שולחים צילום מסך');
  assert.ok(ep.consequence.length > 20, 'no reason attached to the question');
  assert.strictEqual(ep.type, 'choice');
  assert.ok(ep.options.some(o => o.value === 'ask'),
    '"ask the client" is missing, so the only ways out are to answer or to guess');
});

test('a question with no transcript behind it still arrives, without a quote', () => {
  const ep = C.nextEpisode(C.assess(SPARSE), SPARSE);
  assert.strictEqual(ep.quote, null, 'it invented a sentence nobody said');
  assert.strictEqual(ep.type, 'text');
  assert.ok(ep.placeholder, 'a free-text question with no example to follow');
});

test('choosing to include asks what, instead of asking the same thing again', () => {
  /* The loop this prevents: "include" leaves the commitment blocked, so the
     next question is owed — and if it were the same three options, the only
     way out would be to pick a different answer than the one you meant. */
  const chosen = { ...COMPLETE, signals: { enterpriseOpen: true },
                   decisions: { risk: 'include' } };
  const ep = C.nextEpisode(C.assess(chosen), chosen);
  assert.strictEqual(ep.id, 'enterprise-risk');
  assert.strictEqual(ep.type, 'text', 'it offered the same choice it just took');
  assert.ok(ep.placeholder, 'a free-text question with no example to follow');

  const said = { ...chosen, decisions: { risk: 'include', riskDetail: 'ניטור כשלים והתראה' } };
  assert.strictEqual(C.nextEpisode(C.assess(said), said), null, 'it asked a third time');
});

console.log('\nasking the client is an outcome');

test('a handoff keeps everything already established', () => {
  const deal = { ...COMPLETE, signals: { freeText: true } };
  const list = C.assess(deal);
  const h = C.handoff(list, 'exception-owner');
  assert.ok(h.question.length > 30, 'nothing to send the client');
  assert.ok(h.stillValid.some(c => c.id === 'systems'),
    'the rest of the deal was thrown away because one promise was open');
  assert.ok(!h.stillValid.some(c => c.id === 'exception-owner'),
    'the commitment being asked about travelled anyway');
});

test('the client is asked the question the operator could not answer', () => {
  const deal = { ...COMPLETE, signals: { enterpriseOpen: true } };
  const h = C.handoff(C.assess(deal), 'enterprise-risk');
  assert.ok(/אבטחה|רמת שירות|כשל/.test(h.question),
    'the handoff asks about something else entirely');
});

test('a commitment with no way to ask produces no handoff rather than a blank one', () => {
  assert.strictEqual(C.handoff(C.assess(COMPLETE), 'value-claim'), null);
  assert.strictEqual(C.handoff(C.assess(COMPLETE), 'no-such-thing'), null);
});

test('every material commitment can be asked about', () => {
  C.CATALOG.filter(c => c.material).forEach(c =>
    assert.ok(c.ask && c.ask.question,
      c.id + ' can block a proposal and there is no question that unblocks it'));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
