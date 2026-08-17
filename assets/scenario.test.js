/* node assets/scenario.test.js — no browser, no deps.

   Every other suite here tests one module against its own contract. This one
   tests the sentence on the landing page: paste the call, and the tool works
   out what can already go in the proposal, what still has to be settled, and
   what it is not entitled to claim.

   That sentence is only true if the whole chain holds — local extraction, the
   operator's approval, per-commitment readiness, and a question only where one
   is owed. Each link passes its own tests today and the chain is still where
   this kind of product breaks: a module returns exactly what it promised, in a
   shape the next one reads as something else, and nothing fails.

   So these five run the real modules end to end on five calls that go wrong in
   five different ways. No mocks, no fixtures beyond the transcripts. */
/* pc-catalog first: observe() reads the product's own system list from it, the
   way the page does. Without it the detector silently falls back to the
   platform names alone and a call that named אימייל comes back with one
   system — a chain test that quietly stops testing the chain. */
require('./pc-catalog.js');
const T = require('./pc-transcript.js');
const C = require('./pc-commitments.js');
const assert = require('assert');

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

/* The chain itself, exactly as a caller runs it: read the call, approve what
   came back, hand the engine a deal. approve() stands in for the operator at
   the review step — by default they accept what was found, which is the
   generous case and therefore the one worth testing against. */
function assessCall(transcript, decisions, reject) {
  const seen = T.observe(transcript);
  const numbers = T.heuristics(transcript);
  const keep = x => !(reject || []).includes(x.value);
  const systems = seen.systems.filter(keep).map(s => s.value);
  const deal = {
    systems,
    systemsSource: systems.length ? C.SOURCES.clientSaid : undefined,
    delivery: seen.goal ? seen.goal.value : null,
    deliverySource: seen.goal && seen.goal.speaker === 'client'
      ? C.SOURCES.clientSaid : C.SOURCES.operatorSaid,
    provenance: numbers.length ? T.provenance(numbers, transcript).value : null,
    signals: seen.signals,
    quotes: seen.quotes,
    decisions: decisions || {}
  };
  return { deal, list: C.assess(deal), seen, numbers };
}
const byId = (list, id) => list.find(c => c.id === id);

/* S1 — orders arrive on WhatsApp and are retyped into Priority. Volume,
   duration and rate are all stated. One sentence says some orders arrive as
   free text or a screenshot, and one says nobody has settled who handles
   those. */
const S1 = `לקוח: היום ההזמנות נכנסות בוואטסאפ. בערך 40 הזמנות ביום.
מוכר: ומה קורה אחר כך?
לקוח: מישהו מעתיק כל הזמנה ל-Priority. זה בערך 8 דקות להזמנה.
מוכר: יש פורמט קבוע?
לקוח: ברוב המקרים כן, אבל לפעמים שולחים טקסט חופשי או צילום מסך.
מוכר: ומי מטפל כשאי אפשר להבין את ההזמנה?
לקוח: את זה עוד לא סגרנו.
לקוח: מבחינתי המטרה היא שההזמנות הרגילות ייכנסו ל-Priority בלי שמישהו יעתיק אותן ידנית.`;

/* S2 — the work is completely clear and nobody knows what it is worth. */
const S2 = `לקוח: הלידים נכנסים מטופס באתר, ואז מישהו פותח אותם ידנית ב-HubSpot.
מוכר: מה אתם רוצים שיקרה?
לקוח: המטרה היא שכל ליד חדש מהאתר ייפתח אוטומטית ב-HubSpot.
מוכר: כמה כסף זה חוסך לכם?
לקוח: אין לי מושג, לא מדדנו את זה.`;

/* S3 — an enterprise integration where the parts that carry the liability are
   the parts nobody closed. */
const S3 = `לקוח: אנחנו צריכים לחבר בין Salesforce ל-SAP.
מוכר: מה התוצאה שצריכה לקרות?
לקוח: המטרה היא שכשעסקה מאושרת ב-Salesforce תיפתח הזמנה ב-SAP.
מוכר: ומה לגבי אבטחה, SLA וטיפול בכשל?
לקוח: עוד לא סגרנו את זה. גם לא ברור מי אחראי אם הסנכרון נכשל.`;

/* S4 — barely a call. */
const S4 = 'לקוח: יש לנו כמה תהליכים ידניים ואנחנו רוצים לשפר.';

/* S5 — everything the tool needs, said plainly, nothing left open. */
const S5 = `לקוח: החשבוניות נכנסות לאימייל ואנחנו מקלידים אותן ל-Priority.
לקוח: זה בערך 30 חשבוניות ביום, 6 דקות לכל אחת, ועלות שעה 90 שקל.
לקוח: המטרה היא שכל חשבונית תיכנס ל-Priority בלי הקלדה.
לקוח: הפורמט תמיד זהה, אין חריגים.`;

console.log('\nS1 · one open boundary, and the rest of the deal survives it');

test('the call is read locally and the open boundary is the only thing asked', () => {
  const { list, deal } = assessCall(S1);
  assert.ok(deal.systems.includes('Priority'), 'Priority was in the call and was not read');
  assert.strictEqual(byId(list, 'systems').status, C.READY);
  assert.strictEqual(byId(list, 'delivery').status, C.READY);
  const ep = C.nextEpisode(list, deal);
  assert.strictEqual(ep.id, 'exception-owner',
    'it asked about something other than the one thing the call left open');
  assert.ok(ep.quote && /צילום מסך|טקסט חופשי/.test(ep.quote),
    'the question arrived without the sentence that raised it');
});

test('choosing to ask the client keeps everything already established', () => {
  const { list } = assessCall(S1);
  const h = C.handoff(list, 'exception-owner');
  const kept = h.stillValid.map(c => c.id);
  assert.ok(kept.includes('systems') && kept.includes('delivery'),
    'one open promise threw away a deal that was otherwise understood');
  assert.ok(!kept.includes('exception-owner'));
});

test('answering it in either direction closes the deal', () => {
  ['client', 'system'].forEach(who => {
    const { list, deal } = assessCall(S1, { exceptionOwner: who });
    assert.deepStrictEqual(C.blocking(list), [], 'answering left something blocked');
    assert.strictEqual(C.nextEpisode(list, deal), null, 'it kept asking after being answered');
  });
});

test('the client gave the numbers, so the deal may say what it is worth', () => {
  const { list } = assessCall(S1, { exceptionOwner: 'client' });
  assert.strictEqual(byId(list, 'value-claim').status, C.READY);
  assert.strictEqual(byId(list, 'value-claim').source, C.SOURCES.clientSaid);
});

console.log('\nS2 · no idea what it is worth, and a proposal all the same');

test('the work is ready and the value claim is not', () => {
  const { list } = assessCall(S2);
  assert.strictEqual(byId(list, 'systems').status, C.READY);
  assert.strictEqual(byId(list, 'delivery').status, C.READY);
  assert.strictEqual(byId(list, 'value-claim').status, C.BLOCKED);
});

test('nothing is blocked and nothing is asked', () => {
  const { list, deal } = assessCall(S2);
  assert.deepStrictEqual(C.blocking(list), [],
    'a job the tool understands was blocked because nobody mentioned savings');
  assert.strictEqual(C.nextEpisode(list, deal), null,
    'it asked the operator to invent a number the client does not have');
});

test('what may travel excludes the claim about his business', () => {
  const ids = C.admissible(assessCall(S2).list).map(c => c.id);
  assert.ok(ids.includes('systems') && ids.includes('delivery'));
  assert.ok(!ids.includes('value-claim'),
    'a proposal is about to quote an ROI figure nobody produced');
});

console.log('\nS3 · the liability is exactly what was left open');

test('an enterprise call does not come back ready', () => {
  const { list, deal } = assessCall(S3);
  assert.strictEqual(byId(list, 'enterprise-risk').status, C.BLOCKED);
  assert.strictEqual(byId(list, 'enterprise-risk').source, C.SOURCES.absent,
    'the tool noticed the word and recorded it as though it were a decision');
  assert.strictEqual(C.nextEpisode(list, deal).id, 'enterprise-risk');
});

test('excluding it is a decision and travels; including it vaguely does not', () => {
  const off = assessCall(S3, { risk: 'exclude' });
  assert.strictEqual(byId(off.list, 'enterprise-risk').status, C.CONDITIONAL);
  assert.deepStrictEqual(C.blocking(off.list), []);

  const vague = assessCall(S3, { risk: 'include' });
  assert.strictEqual(byId(vague.list, 'enterprise-risk').status, C.BLOCKED);
  const ep = C.nextEpisode(vague.list, vague.deal);
  assert.strictEqual(ep.type, 'text', 'it offered the same choice it had just been given');
});

test('saying what is included closes it', () => {
  const said = assessCall(S3, { risk: 'include', riskDetail: 'ניטור כשלי סנכרון והתראה לצוות' });
  assert.strictEqual(byId(said.list, 'enterprise-risk').status, C.READY);
  assert.strictEqual(C.nextEpisode(said.list, said.deal), null);
});

console.log('\nS4 · a call that said almost nothing stays that way');

test('nothing is completed on the operator\'s behalf', () => {
  const { list, deal } = assessCall(S4);
  assert.strictEqual(byId(list, 'systems').status, C.BLOCKED);
  assert.strictEqual(byId(list, 'delivery').status, C.BLOCKED);
  assert.strictEqual(byId(list, 'value-claim').status, C.BLOCKED);
  list.forEach(c => assert.notStrictEqual(c.source, C.SOURCES.clientSaid,
    c.id + ' claims the client said something in a call where nothing was said'));
  assert.strictEqual(C.nextEpisode(list, deal).id, 'systems');
});

test('answers given after the call carry their own provenance', () => {
  const seen = T.observe(S4);
  const deal = { systems: ['Excel', 'CRM'], systemsSource: C.SOURCES.operatorSaid,
                 delivery: 'לסנכרן לקוחות', deliverySource: C.SOURCES.operatorSaid,
                 provenance: null, signals: seen.signals, decisions: {} };
  const list = C.assess(deal);
  assert.strictEqual(byId(list, 'systems').source, C.SOURCES.operatorSaid,
    'the operator typed this in and the record says the client said it');
  assert.strictEqual(byId(list, 'value-claim').status, C.BLOCKED,
    'filling the form in afterwards produced a claim about the client\'s business');
});

console.log('\nS5 · a call that answered everything is not interrogated');

test('a complete call reaches a proposal with no questions at all', () => {
  const { list, deal } = assessCall(S5);
  assert.deepStrictEqual(C.blocking(list), []);
  assert.strictEqual(C.nextEpisode(list, deal), null,
    'it invented a question to look like it was working');
  assert.strictEqual(byId(list, 'value-claim').status, C.READY);
});

test('no promise is raised that the call gave no reason to raise', () => {
  const list = assessCall(S5).list;
  assert.ok(!byId(list, 'exception-owner'), 'a call that said there are no exceptions was asked about them');
  assert.ok(!byId(list, 'enterprise-risk'), 'a call that never mentioned SLA was asked about it');
});

console.log('\nthe chain refuses what the modules refuse');

test('a row the operator rejects cannot reach a commitment', () => {
  /* The approval step is real or it is theatre. Rejecting Priority at review
     has to leave the deal without it, all the way through. */
  const { list } = assessCall(S1, {}, ['Priority']);
  assert.strictEqual(byId(list, 'systems').status, C.BLOCKED,
    'a system the operator struck out is still holding up a commitment');
});

test('no scenario ever produces a status the engine does not define', () => {
  [S1, S2, S3, S4, S5].forEach((t, i) =>
    assessCall(t).list.forEach(c =>
      assert.ok([C.READY, C.CONDITIONAL, C.BLOCKED].includes(c.status),
        'S' + (i + 1) + ' · ' + c.id + ' came back ' + c.status)));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
