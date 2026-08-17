/* node assets/ladder.test.js — no browser, no deps.

   The ladder exists because of real discovery calls, and the ones that taught
   it the most were not the automation work it was written for. Positioning and
   branding: no process, no systems, nothing recurring, no ledger history —
   and the tool read "300 שקל לפגישה", the fee being agreed in the room, as
   errCost, the cost of an incident, on its way to computing a year of the
   client's losses out of the seller's own price.

   The fixtures below are not those transcripts. They are their shape: no
   speaker labels anywhere, sentences that run for a paragraph because that is
   what speech-to-text returns, currency spelled the way a transcriber hears
   it, and a buyer saying out loud that there is no money. The content is
   invented.

   Most of what follows is about refusal — which calls may not reach which
   rung, and what a rung is not allowed to read. The happy paths are few. */
const L = require('./pc-ladder.js');
const T = require('./pc-transcript.js');
const assert = require('assert');

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

/* A soft call: no process anywhere, and near the end the client reaches for a
   price by naming what he thinks the category costs. */
const CONSULTING =
  'איך זה עובד אצלך היום כשאתה משיג לקוחות חדשים?\n' +
  'כרגע זה לא באמת עובד. יש לי לקוח אחד ואני מלמד תלמידות עיצוב.\n' +
  'כמה זה שווה לך לדעתך?\n' +
  'אני לא יודע.\n' +
  'כרגע אני רואה את זה קצת כמו פגישת פסיכולוג, בשביל שזה 300 שקל לפגישה.';

/* The same call with nothing priced in it at all — which is the more common
   soft call, and the one that has to fall all the way through. */
const CONSULTING_NO_PRICE =
  'איך זה עובד אצלך היום כשאתה משיג לקוחות חדשים?\n' +
  'כרגע זה לא באמת עובד. יש לי לקוח אחד ואני מלמד תלמידות עיצוב.\n' +
  'כמה זה שווה לך לדעתך?\n' +
  'אני לא יודע, אני לא יודע לשים על זה מחיר כרגע.';

const AUTOMATION =
  'לקוח: היום ההזמנות נכנסות בוואטסאפ, בערך 40 הזמנות ביום.\n' +
  'לקוח: מישהו מעתיק כל אחת ל-Priority, זה 8 דקות להזמנה.\n' +
  'לקוח: כל טעות עולה בערך 1800 ₪.';

console.log('\nthe rung a call can carry');

test('a call with a recurring quantity of work reaches the value rung', () => {
  const v = L.assess({ text: AUTOMATION, systems: ['WhatsApp', 'Priority'] });
  assert.strictEqual(v.rung, 'value');
  assert.deepStrictEqual(v.skipped, [], 'it climbed past something on the way up');
});

test('a call with no process in it does not', () => {
  const v = L.assess({ text: CONSULTING });
  assert.notStrictEqual(v.rung, 'value',
    'a consulting call with nothing recurring in it is about to be priced on the client\'s losses');
});

test('the bottom rung always holds, so there is always a price', () => {
  [undefined, null, {}, { text: '' }, { text: CONSULTING_NO_PRICE }].forEach(input => {
    const v = L.assess(input);
    assert.ok(v.method, 'no method for ' + JSON.stringify(input));
    assert.strictEqual(L.RUNGS[L.RUNGS.length - 1].holds(input || {}), true);
  });
});

test('every rung that was passed over says why, in order', () => {
  const v = L.assess({ text: CONSULTING_NO_PRICE });
  assert.deepStrictEqual(v.skipped.map(s => s.rung), ['value', 'comparable', 'anchor', 'market']);
  v.skipped.forEach(s => assert.ok(s.missing && s.missing.length > 20,
    s.rung + ' was skipped without saying what was absent'));
});

console.log('\nthe soft call');

test('a price the client names as his own reference is a rung, not noise', () => {
  /* The whole point of rung 3. This is the same sentence that used to come
     back as the cost of an incident. It is not that — it is the client saying
     what he thinks this class of work costs, which is the only priced thing
     anybody says out loud on a call like this. */
  const v = L.assess({ text: CONSULTING });
  assert.strictEqual(v.rung, 'anchor');
  assert.strictEqual(v.method, 'comparable', 'the engine has no fifth method and does not need one');
});

test('a number beside a currency word is not a reference price', () => {
  /* Without the per-unit this is the old bug's exact shape, and it must not
     reach the rung that was built to replace it. */
  ['השנה הפסדנו 300 שקל על זה', 'קנינו מדפסת ב-1800 ₪', 'הוא חייב לי 500 שח'].forEach(t =>
    assert.notStrictEqual(L.assess({ text: t }).rung, 'anchor',
      'a stray figure was read as what the client thinks the work is worth: ' + t));
});

test('the rung carries the sentence it read, never the number', () => {
  const v = L.assess({ text: CONSULTING });
  assert.ok(v.quote && v.quote.indexOf('300') !== -1, 'the rung named a price with no sentence under it');
  Object.keys(v).forEach(k => assert.ok(!/price|amount|₪/i.test(k),
    'the ladder is carrying a parsed price, and the engine is the only thing allowed to'));
});

test('a paragraph-long transcript line is windowed, and the window stays verbatim', () => {
  /* Speech-to-text returns sentences that run for hundreds of characters with
     no punctuation, and an unreadable quote is not a quote. The middle has to
     survive intact or it cannot be found again in the transcript. */
  const filler = 'ואז אמרתי לו שזה מה שיש וזה מה שאני חושב על הדברים האלה בערך ';
  const line = filler.repeat(6) + 'בסוף זה 300 שקל לפגישה אצלי ' + filler.repeat(6);
  const v = L.assess({ text: line });
  assert.strictEqual(v.rung, 'anchor');
  assert.ok(v.quote.length < 250, 'the quote is ' + v.quote.length + ' characters, which nobody reads');
  assert.ok(line.indexOf(v.quote.replace(/^…|…$/g, '')) !== -1,
    'the windowed middle is not in the transcript any more');
  assert.ok(/…/.test(v.quote), 'text was cut without saying so');
});

test('your own closed deal outranks what the client thinks it costs', () => {
  /* comparable sits above anchor: a job you did and were paid for is evidence
     that a price cleared. What the client reaches for is evidence of what he
     expects to pay, which is a different and weaker thing. */
  assert.strictEqual(L.assess({ text: CONSULTING, comparableLast: 4000 }).rung, 'comparable');
  assert.strictEqual(L.assess({ text: CONSULTING }).rung, 'anchor');
});

test('what the client named outranks a published range', () => {
  /* anchor sits above market: the client's own reference is about this buyer,
     and the market table is ranges converted from somebody else's projects in
     a vertical this call may have nothing to do with. */
  assert.strictEqual(L.assess({ text: CONSULTING, systems: ['CRM'] }).rung, 'anchor');
  assert.strictEqual(L.assess({ text: CONSULTING_NO_PRICE, systems: ['CRM'] }).rung, 'market');
});

console.log('\nthe buyer said no');

test('a stated absence of budget comes back with the sentence', () => {
  const v = L.assess({ text: 'השירות נשמע לי מעניין אבל אני אהיה איתך כנה, אין לי כסף.' });
  assert.ok(v.stalled, 'the buyer said there was no money and nothing carried it back');
  assert.ok(v.stalled.indexOf('אין לי כסף') !== -1, 'the wrong sentence was quoted');
});

test('it is reported on any rung, including the top one', () => {
  /* A call can carry perfectly good evidence and still have ended in a no.
     Tying this to a low rung would hide exactly the case worth seeing: a
     well-qualified process that the buyer is not buying. */
  const v = L.assess({ text: AUTOMATION + '\nלקוח: אבל אין לי תקציב לזה השנה.' });
  assert.strictEqual(v.rung, 'value');
  assert.ok(v.stalled, 'the refusal disappeared because the call priced well');
});

test('it does not change which method wins', () => {
  const with_ = L.assess({ text: CONSULTING + '\nאין לי תקציב.' });
  const without = L.assess({ text: CONSULTING });
  assert.strictEqual(with_.rung, without.rung, 'a refusal moved the pricing method');
  assert.strictEqual(with_.method, without.method);
});

test('hesitation is not refusal', () => {
  /* Kept narrow on purpose. Everything below is ordinary in a discovery call
     and reading any of it as a no would make the warning noise, and a warning
     that is noise is a warning nobody reads. */
  ['אני צריך לחשוב על זה', 'אני לא יודע לשים על זה מחיר כרגע',
   'תחזור אליי בעוד חודש', 'זה קצת יקר לי', 'אני צריך לבדוק מול השותף שלי'
  ].forEach(t => assert.ok(!L.assess({ text: t }).stalled, 'read as a refusal: ' + t));
});

console.log('\nwho the ladder is listening to');

test('when the transcript names speakers, your own numbers do not lift the call', () => {
  /* Half a discovery call is the seller describing their own business. Every
     cue here was written for the other side of the table. */
  const t = 'מוכר: אני שולח 5 פניות בשבוע וזה עובד לי מצוין.\n' +
            'לקוח: אני עוד לא יודע מה אני עושה.';
  const v = L.assess({ text: t, lines: T.withSpeakers(t) });
  assert.strictEqual(v.labelled, true);
  assert.notStrictEqual(v.rung, 'value',
    'the call was priced on the seller\'s own posting cadence');
});

test('when it does not, everything is read — and it says so', () => {
  /* Neither real transcript this was built from carries a single speaker
     label, so this is the ordinary case, not the edge one. It is allowed,
     because reading nothing would be worse, and it is reported, because the
     operator has to know the rung may be resting on their own sentence. */
  const t = 'אני שולח 5 פניות בשבוע וזה עובד לי מצוין.\nאני עוד לא יודע מה אני עושה.';
  const v = L.assess({ text: t, lines: T.withSpeakers(t) });
  assert.strictEqual(v.labelled, false);
  assert.strictEqual(v.rung, 'value', 'the unlabelled reading narrowed instead of being flagged');
});

test('a quantity here and a period over there is not a rate', () => {
  /* The fixtures in this file are five lines long, and that is what hid this:
     rung 1 used to test for a quantity somewhere in the text and a period
     somewhere in the text, independently. On a real transcript of thirty
     thousand characters both are true of almost any call — run against five
     actual discovery calls it held on four, and every one of them had no
     process in it at all. The two that extracted anything matched the seller
     talking: the length of the call itself, and the seller's own arithmetic
     about the client's working hours.

     Long fixture on purpose. A short one cannot fail this test. */
  const filler = 'ואז דיברנו על כל מיני דברים שקשורים למה שהיא עושה היום וזה היה מעניין. ';
  const t = filler.repeat(20) +
    'יש לי שלוש פניות פתוחות מהחודש שעבר. ' + filler.repeat(20) +
    'ואנחנו נדבר על זה שוב בחודש הבא. ' + filler.repeat(20);
  assert.notStrictEqual(L.assess({ text: t }).rung, 'value',
    'a document long enough to contain both words was read as a process');
});

test('and the rung asks the question with the expression that answers it', () => {
  /* One regex, in pc-transcript.js with the other cues. A rung that holds
     while nothing fills the fields it licensed is worse than one that never
     holds, and two copies of the test would drift into exactly that. */
  const yes = 'לקוח: נכנסות בערך 40 הזמנות ביום.';
  const v = L.assess({ text: yes });
  assert.strictEqual(v.rung, 'value');
  assert.ok(T.heuristics(yes, v.licence).some(r => r.key === 'freq'),
    'the rung held and the cue it licensed found nothing');
});

test('a caller that passes no lines at all is in the same position, not a worse one', () => {
  assert.strictEqual(L.assess({ text: AUTOMATION }).labelled, false);
  assert.strictEqual(L.assess({ text: AUTOMATION }).rung, 'value');
});

console.log('\nwhat a rung is allowed to read');

test('the fee agreed in the room is not read as the cost of an incident', () => {
  /* The number is read now — as what it is. The incident cue is not merely
     unused on this call, it is never looked for, and what comes back instead
     is the client's own reference price headed for the comparable field. Same
     sentence, same 300, a different thing entirely. */
  const v = L.assess({ text: CONSULTING });
  const rows = T.heuristics(CONSULTING, v.licence);
  assert.ok(!rows.some(r => r.key === 'errCost'),
    'the fee in the room came back as the cost of an incident');
  assert.deepStrictEqual(rows.map(r => r.key), ['anchor'],
    'the rung read something it did not license: ' + rows.map(r => r.key).join(', '));
  assert.strictEqual(rows[0].value, 300);
});

test('the anchor reaches the field the engine actually prices from', () => {
  /* Without this the rung names `comparable` and compute() cannot price
     comparable, because M.comparable is null with no figure in the form. The
     rung said one thing and the engine did another, on 12% of every call the
     ladder assessed. */
  const v = L.assess({ text: CONSULTING });
  const rows = T.heuristics(CONSULTING, v.licence);
  assert.strictEqual(rows[0].target, 'c_last', 'the number has nowhere to land');
  assert.strictEqual(v.method, 'comparable');
});

test('without the ladder the same call still misreads it, which is the bug', () => {
  /* Pinned deliberately. If this ever comes back empty the licence has stopped
     being what protects the call and something else is, and this file should
     be the thing that notices. */
  const unlicensed = T.heuristics(CONSULTING);
  assert.ok(unlicensed.some(r => r.key === 'errCost' && r.value === 300),
    'the unguarded reading changed — the ladder may no longer be what prevents this');
});

test('the value rung licenses exactly the three cues its formula needs', () => {
  const v = L.assess({ text: AUTOMATION, systems: ['WhatsApp'] });
  assert.deepStrictEqual([...v.licence].sort(), ['errCost', 'freq', 'minutes']);
  const rows = T.heuristics(AUTOMATION, v.licence);
  assert.deepStrictEqual([...new Set(rows.map(r => r.key))].sort(),
    ['errCost', 'freq', 'minutes'], 'the rung licensed cues it did not read, or read cues it did not license');
});

test('a rung licenses only cues that feed the method it names', () => {
  /* The invariant is not "low rungs read nothing" — anchor has to read one
     number or the method it names cannot be priced. It is that a rung never
     licenses a cue belonging to a method it is not proposing. errCost, freq
     and minutes feed the value formula, so nothing below value may look for
     them; that is the whole reason a fee in the room stopped being read as the
     cost of an incident. */
  assert.deepStrictEqual(L.LICENCE.anchor, ['anchor']);
  ['comparable', 'market', 'cost'].forEach(id =>
    assert.deepStrictEqual(L.LICENCE[id], [],
      id + ' may read a number, and a number on those calls means something else'));
  Object.entries(L.LICENCE).forEach(([id, keys]) => {
    if (id === 'value') return;
    ['freq', 'minutes', 'errCost'].forEach(k => assert.ok(keys.indexOf(k) === -1,
      id + ' licenses ' + k + ', which only the value formula consumes'));
  });
});

test('every rung has a licence entry, so a new one cannot arrive unrestricted', () => {
  L.RUNGS.forEach(r => assert.ok(Array.isArray(L.LICENCE[r.id]),
    r.id + ' was added to the ladder without saying what it may read'));
});

test('an omitted licence still reads everything, so nothing that worked stopped working', () => {
  assert.ok(T.heuristics(AUTOMATION).length >= 3, 'the default reading narrowed');
  assert.ok(L.licences(null, 'freq'), 'a caller with no ladder was refused');
  assert.ok(!L.licences([], 'freq'), 'an empty licence permitted a cue');
});

console.log('\nwhat the ladder does not decide');

test('it names a method and never a price', () => {
  const v = L.assess({ text: AUTOMATION, systems: ['WhatsApp'] });
  assert.ok(v.method, 'no method named');
});

test('every rung states whether it needs a vertical behind it', () => {
  /* Two of the five do. market looks generic and is keyed on how many systems
     connect, with ranges converted from automation projects; reading
     complexity for other work needs a different metric, not a translation of
     this one. anchor is vertical-free precisely because the number comes from
     the buyer rather than from a table about somebody else's industry. */
  L.RUNGS.forEach(r => assert.strictEqual(typeof r.vertical, 'boolean', r.id));
  assert.strictEqual(L.RUNGS.find(r => r.id === 'market').vertical, true);
  assert.strictEqual(L.RUNGS.find(r => r.id === 'anchor').vertical, false);
  assert.strictEqual(L.RUNGS.find(r => r.id === 'comparable').vertical, false);
  assert.strictEqual(L.RUNGS.find(r => r.id === 'cost').vertical, false);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
