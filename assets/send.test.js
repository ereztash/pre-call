/* node assets/send.test.js — no browser, no deps.

   A send link that silently truncates is worse than no link: the client gets
   half an offer and the operator never finds out. Most of these tests are
   about refusing to build one. */
const S = require('./pc-send.js');
const assert = require('assert');

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

const DOC = '<h3>הצעה</h3><div class="meta">מאפייה · 4.3.2026</div>' +
            '<h4>מה נכלל</h4><ul><li>מיפוי</li><li>בנייה</li></ul>' +
            '<div class="pricebox"><div class="amt">₪5,660</div></div>';

console.log('\nturning the document into something readable in a chat');
test('headings and paragraphs become line breaks', () => {
  const t = S.toPlainText(DOC);
  assert.ok(t.includes('הצעה\n'), 'the heading must end its line');
  assert.ok(!/[<>]/.test(t), 'no markup survives: ' + t.slice(0, 40));
});
test('list items become bullets', () => {
  assert.ok(/• מיפוי/.test(S.toPlainText(DOC)));
});
test('escaped entities come back as characters', () => {
  assert.strictEqual(S.toPlainText('<p>a &amp; b &lt;c&gt;</p>').trim(), 'a & b <c>');
});
test('runs of blank lines collapse', () => {
  assert.ok(!/\n{3}/.test(S.toPlainText('<p>a</p><p></p><p></p><p>b</p>')));
});
test('empty input does not produce the string undefined', () => {
  assert.strictEqual(S.toPlainText(null), '');
  assert.strictEqual(S.toPlainText(undefined), '');
});

console.log('\nphone numbers');
test('accepts the shapes an Israeli number actually arrives in', () => {
  ['052-123-4567', '0521234567', '052 123 4567', '+972521234567', '972521234567']
    .forEach(n => assert.strictEqual(S.normalisePhone(n), '972521234567', n));
});
test('refuses rather than guesses when it cannot tell', () => {
  assert.strictEqual(S.normalisePhone(''), null);
  assert.strictEqual(S.normalisePhone('לא יודע'), null);
  assert.strictEqual(S.normalisePhone('1234'), null, 'a message to the wrong number is not recoverable');
});

console.log('\nwhatsapp');
test('builds an addressed link when the number is known', () => {
  const r = S.whatsapp({ phone: '052-123-4567', text: DOC });
  assert.ok(r.ok);
  assert.ok(r.url.startsWith('https://wa.me/972521234567?text='));
  assert.strictEqual(r.addressed, true);
});
test('with no number it still opens the picker instead of failing', () => {
  const r = S.whatsapp({ text: DOC });
  assert.ok(r.ok);
  assert.strictEqual(r.addressed, false);
});
test('refuses to build a link that would arrive cut in half', () => {
  const r = S.whatsapp({ text: '<p>' + 'א'.repeat(5000) + '</p>' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'too_long');
  assert.ok(r.length > r.limit);
});
test('hebrew survives the encoding', () => {
  const r = S.whatsapp({ text: '<p>שלום</p>' });
  assert.ok(decodeURIComponent(r.url.split('text=')[1]).includes('שלום'));
});

console.log('\nemail');
test('carries recipient, subject and body', () => {
  const r = S.mailto({ to: 'a@b.co.il', subject: 'הצעה', text: '<p>שלום</p>' });
  assert.ok(r.ok);
  assert.ok(r.url.startsWith('mailto:a%40b.co.il?subject='));
  assert.ok(decodeURIComponent(r.url).includes('שלום'));
});
test('measures the ENCODED length, which is what clients truncate', () => {
  // Hebrew triples under percent-encoding, so a document that looks short
  // enough in characters can still be far over the real ceiling
  const r = S.mailto({ to: 'a@b.co', subject: 'x', text: '<p>' + 'א'.repeat(700) + '</p>' });
  assert.strictEqual(r.ok, false, '700 Hebrew characters encode to over 2,000');
});
test('a subject names the client when there is one', () => {
  assert.strictEqual(S.subjectFor('מאפייה'), 'הצעת מחיר · מאפייה');
  assert.strictEqual(S.subjectFor(''), 'הצעת מחיר');
  assert.strictEqual(S.subjectFor('  '), 'הצעת מחיר');
});

console.log('\nwhat to offer');
test('always offers at least one route that cannot fail', () => {
  [{ html: DOC }, { html: '<p>' + 'א'.repeat(9000) + '</p>' }, { html: '' }].forEach(c => {
    const r = S.routes(c);
    assert.ok(r.some(x => x.ok), 'no usable route for ' + (c.html || '').length + ' chars');
    assert.strictEqual(r.find(x => x.id === 'copy').ok, true, 'copy must never fail');
  });
});
test('a route that cannot carry this document says why, in plain words', () => {
  const r = S.routes({ html: '<p>' + 'א'.repeat(9000) + '</p>' });
  const w = r.find(x => x.id === 'whatsapp');
  assert.strictEqual(w.ok, false);
  assert.ok(w.note.includes('העתק'), 'a blocked route must say what to do instead');
  assert.ok(!/undefined|NaN/.test(w.note));
});
test('every route has a label and a note whatever the inputs', () => {
  S.routes({}).forEach(r => {
    assert.ok(r.label && r.note, r.id + ' is missing its wording');
    assert.ok(!/undefined/.test(r.note));
  });
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
