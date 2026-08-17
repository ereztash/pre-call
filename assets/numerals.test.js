/* node assets/numerals.test.js — no browser, no deps.

   This module exists because of one measurement. Across 200 generated calls,
   the value rung — the pricing method this whole product is built around — was
   reached 30 times out of 104 when the numbers came back as digits and 0 times
   out of 96 when they came back as words. Speech-to-text writes what it hears,
   and every cue in this product was written around \d+.

   So most of what is below is about a transcript being speech and not a form. */
const N = require('./pc-numerals.js');
const T = require('./pc-transcript.js');
const assert = require('assert');

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};
const d = s => N.digitize(s);

console.log('\nnumbers as they are said');

test('the plain ones', () => {
  assert.strictEqual(d('שמונה דקות'), '8 דקות');
  assert.strictEqual(d('ארבעים הזמנות ביום'), '40 הזמנות ביום');
  assert.strictEqual(d('שלוש מאות שקל'), '300 שקל');
  assert.strictEqual(d('מאה וחמישים'), '150');
});

test('a thousand and eight hundred is one number, not two', () => {
  /* "אלף ושמונה מאות" is 1800. The eight belongs to the hundreds that follow
     it, and a reader that stops at the conjunction gets 1008. */
  assert.strictEqual(d('אלף ושמונה מאות שקל'), '1800 שקל');
  assert.strictEqual(d('אלף ושמונה'), '1008');
});

test('the construct form before thousands', () => {
  assert.strictEqual(d('חמשת אלפים'), '5000');
  assert.strictEqual(d('שלושת אלפים שקל'), '3000 שקל');
  assert.strictEqual(d('אלפיים'), '2000');
});

test('twelve is not twenty', () => {
  /* Only the second word separates "שתים עשרה" from "עשרים", so the pair has
     to be read together or a dozen becomes a score. */
  assert.strictEqual(d('שתים עשרה שעות'), '12 שעות');
  assert.strictEqual(d('עשרים שעות'), '20 שעות');
  assert.strictEqual(d('עשרים וחמש'), '25');
});

test('the conjunction fused to the front of a word', () => {
  assert.strictEqual(d('שלושים ושתיים'), '32');
  assert.strictEqual(d('מאה ועשרים'), '120');
});

test('English too, because a transcript may come back in it', () => {
  assert.strictEqual(d('forty orders a day'), '40 orders a day');
  assert.strictEqual(d('eight minutes'), '8 minutes');
});

console.log('\nwhat it must leave alone');

test('punctuation ends a run — two numbers are not one', () => {
  assert.strictEqual(d('שמונה, תשע'), '8, 9');
  assert.strictEqual(d('שלוש\nארבע'), '3\n4');
});

test('everything that is not a number survives untouched', () => {
  const s = 'אנחנו יבואנים של ציוד למטבחים, וההזמנות מגיעות בוואטסאפ.';
  assert.strictEqual(d(s), s);
  assert.strictEqual(d(''), '');
  assert.strictEqual(d(null), '');
});

test('a lone zero is a turn of phrase more often than a quantity', () => {
  assert.strictEqual(d('אפס בעיות'), 'אפס בעיות');
});

console.log('\nwhat this buys the reader');

test('the repository\'s own demo transcript is written in words', () => {
  /* The reason this went unnoticed: the one call anybody ran locally produced
     one field out of thirteen, and that reads like a thin transcript rather
     than a reader that cannot hear numbers. */
  const E = require('./pc-example.js');
  assert.ok(/ארבעים|שמונה|אלף/.test(E.TRANSCRIPT), 'the demo stopped being spelled out');
  const keys = T.heuristics(E.TRANSCRIPT).map(r => r.key).sort();
  ['errCost', 'freq', 'minutes'].forEach(k => assert.ok(keys.indexOf(k) !== -1,
    'the demo transcript still yields no ' + k + ' — got ' + keys.join(',')));
});

test('the quote stays the sentence that was actually said', () => {
  /* The match runs on the digitized reading; the citation must not. A quote is
     what somebody said, and `verified` means this text is in the transcript
     word for word — rewriting "שלוש מאות" to 300 inside it would break both. */
  const line = 'לקוח: בערך ארבעים ביום.';
  const row = T.heuristics(line).find(r => r.key === 'freq');
  assert.ok(row, 'the spoken frequency was not read');
  assert.strictEqual(row.value, 40);
  assert.ok(row.quote.indexOf('ארבעים') !== -1, 'the quote was rewritten: ' + row.quote);
  assert.strictEqual(row.verified, true);
});

test('a frequency is a rate, and a count with no period is a backlog', () => {
  /* The old cue wanted the number and the noun to touch, which is how people
     write and not how they answer: the noun is in the question. On the demo
     transcript that skipped "בערך ארבעים ביום" and matched "שתי הזמנות שנפלו
     בין הכיסאות" — two orders that were lost, read as the volume of work. */
  const freq = t => (T.heuristics('לקוח: ' + t).find(r => r.key === 'freq') || {}).value;
  assert.strictEqual(freq('בערך ארבעים ביום'), 40, 'the answer form is not read');
  assert.strictEqual(freq('40 הזמנות ביום'), 40, 'the written form stopped being read');
  assert.strictEqual(freq('שתי הזמנות שנפלו בין הכיסאות'), undefined, 'a backlog was read as a rate');
  assert.strictEqual(freq('שלוש, ארבע פעמים'), undefined, 'incidents were read as the process rate');
});

test('a module that is absent degrades to the old reading, not to a crash', () => {
  /* pc-transcript.js resolves this at call time on purpose: an older page, or
     a test requiring that file alone, should get the deaf reading it had
     before rather than a thrown error on the one path that reads a call. */
  const saved = globalThis.PC.numerals;
  delete globalThis.PC.numerals;
  try {
    assert.deepStrictEqual(T.heuristics('לקוח: בערך ארבעים ביום.'), []);
    assert.ok(T.heuristics('לקוח: 40 הזמנות ביום.').length >= 1, 'digits stopped working');
  } finally { globalThis.PC.numerals = saved; }
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
