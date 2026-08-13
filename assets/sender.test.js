/* node assets/sender.test.js — no browser, no deps.

   The product shipped for months with no sender on the document and every
   check passed, because an absent letterhead breaks no rule. These are
   the rules that did not exist. */
const { make, block, missing, FIELDS, KEY, LOGO_KEY, LOGO_MAX } = require('./pc-sender.js');
const proposal = require('./pc-proposal.js');
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

const FULL = { s_name: 'דנה לוי', s_business: 'אוטומציות לעסקים קטנים',
               s_phone: '052-1234567', s_email: 'dana@example.co.il' };

console.log('\nstorage');
test('round trips every field', () => {
  const s = mem(), api = make(s);
  api.save(FULL);
  const back = api.load();
  FIELDS.forEach(f => assert.strictEqual(back[f], FULL[f], f + ' did not survive'));
});
test('values are trimmed on the way in', () => {
  const api = make(mem());
  api.save({ s_name: '  דנה לוי  ' });
  assert.strictEqual(api.load().s_name, 'דנה לוי');
});
test('attribution defaults to on and can be turned off', () => {
  const api = make(mem());
  api.save(FULL);
  assert.strictEqual(api.load().attribution, true);
  api.save(Object.assign({}, FULL, { attribution: false }));
  assert.strictEqual(api.load().attribution, false);
});
test('the sender never shares a key with the draft or the ledger', () => {
  assert.notStrictEqual(KEY, 'postcall_draft_v1');
  assert.notStrictEqual(KEY, 'postcall_deals_v1');
});
test('blocked storage reports failure instead of pretending', () => {
  const blocked = { getItem(){ throw new Error('x'); }, setItem(){ throw new Error('x'); },
                    removeItem(){ throw new Error('x'); } };
  const api = make(blocked);
  assert.strictEqual(api.save(FULL), false);
  assert.strictEqual(api.load(), null);
});
test('a corrupt value reads as absent rather than throwing', () => {
  const api = make(mem({ [KEY]: 'not json' }));
  assert.strictEqual(api.load(), null);
});

console.log('\nwhat is worth printing');
test('a name alone is enough for a letterhead', () => {
  const b = block({ s_name: 'דנה לוי' });
  assert.strictEqual(b.name, 'דנה לוי');
  assert.deepStrictEqual(b.contact, []);
});
test('contact details without a name print nothing at all', () => {
  assert.strictEqual(block({ s_phone: '052-1234567', s_email: 'x@y.co.il' }), null,
    'a header carrying only a phone number reads worse than no header');
  assert.strictEqual(missing({ s_phone: '052-1234567' }), true);
});
test('both contact routes appear when both are given', () => {
  assert.deepStrictEqual(block(FULL).contact, ['052-1234567', 'dana@example.co.il']);
});

console.log('\nthe document');
const ctxFor = sender => ({
  m: { price: 12000, effort: 20, hours: 400, runs: 100, annualValue: 90000, payback: 6,
       method: 'value', errValue: 0, M: {} },
  ils: n => '₪' + n.toLocaleString('en-US'),
  scope: { in: [{ t: 'בנייה' }], out: [], extra: [] },
  systems: ['וואטסאפ'], sender,
  f: { client: 'יבואן ציוד', process: 'הזמנות ידניות' },
  now: new Date('2026-08-09T00:00:00Z')
});

test('the sender appears in the document when set', () => {
  const html = proposal.build(ctxFor(FULL));
  assert.ok(html.includes('דנה לוי'), 'the name never reached the document');
  assert.ok(html.includes('אוטומציות לעסקים קטנים'), 'the business line is missing');
  assert.ok(html.includes('052-1234567'), 'the client has no way to reply');
});
test('no sender means no empty letterhead, not a blank one', () => {
  const html = proposal.build(ctxFor({}));
  assert.ok(!/class="from"/.test(html),
    'an empty letterhead block is worse than none — it prints a rule over nothing');
});
test('the document is signed off with the name', () => {
  const html = proposal.build(ctxFor(FULL));
  assert.ok(/class="signoff"/.test(html), 'a proposal that is not signed is not from anyone');
});
test('the attribution line is present by default and removable', () => {
  assert.ok(proposal.build(ctxFor(FULL)).includes('madewith'),
    'the one place this product travels on its own');
  assert.ok(!proposal.build(ctxFor(Object.assign({}, FULL, { attribution: false })))
    .includes('madewith'), 'the operator must be able to take it off');
});
test('the attribution says where to find the tool, not only that it exists', () => {
  /* The line read "נבנה עם PRE-CALL · מהשיחה להצעה מתומחרת" — a name and a
     tagline, and no way to act on either. Somebody who receives a proposal and
     wants the tool has a product name and a search box. That is the whole of
     this product's referral path, and it terminated in a dead end. */
  const line = (proposal.build(ctxFor(FULL))
    .match(/<div class="madewith">([\s\S]*?)<\/div>/) || [])[1] || '';
  assert.ok(/pre-call-swart\.vercel\.app/.test(line),
    'the attribution names the tool and gives no address for it: ' + line);
});
test('the address survives the two ways this document actually leaves', () => {
  /* Both exits drop markup. copyProposal() reads el('proposal').innerText and
     the operator pastes that into WhatsApp; print puts ink on paper. An <a>
     whose href is the only copy of the URL is invisible on both paths — the
     link works exactly once, in a browser nobody but the operator is using.
     So the address has to be text, and the href is the convenience on top. */
  const line = (proposal.build(ctxFor(FULL))
    .match(/<div class="madewith">([\s\S]*?)<\/div>/) || [])[1] || '';
  const asText = line.replace(/<[^>]*>/g, '');           // what innerText keeps
  assert.ok(/pre-call-swart\.vercel\.app/.test(asText),
    'the address lives only in an attribute — a paste into WhatsApp loses it: ' + line);
});
test('a sender name containing markup is escaped, not injected', () => {
  const html = proposal.build(ctxFor({ s_name: '<script>alert(1)</script>' }));
  assert.ok(!html.includes('<script>alert'), 'unescaped sender name reached the document');
  assert.ok(html.includes('&lt;script&gt;'));
});

console.log('\nthe anonymous-document warning');
/* An external review asked for missing-sender to block export. The concern
   is real and the instrument is wrong: this product warns and never blocks,
   and there is a legitimate case for exporting without a letterhead. What
   was actually wrong is that missing() was exported and never called. */
test('missing() is wired into the shell, not merely exported', () => {
  const shell = require('fs').readFileSync(__dirname + '/post-call.js', 'utf8');
  assert.ok(/senderMissing\(/.test(shell),
    'the check exists but nothing calls it — dead code shaped like a safeguard');
});
test('the warning fires exactly when there is no name to print', () => {
  assert.strictEqual(missing({}), true);
  assert.strictEqual(missing({ s_phone: '052-1234567' }), true, 'contacts alone are not a sender');
  assert.strictEqual(missing({ s_name: 'דנה לוי' }), false);
});
test('export is warned about, never prevented', () => {
  const shell = require('fs').readFileSync(__dirname + '/post-call.js', 'utf8');
  const guarded = /senderMissing\([^)]*\)\s*\)?\s*(?:return|\|\|\s*return)/.test(shell);
  assert.ok(!guarded,
    'a missing letterhead must not stop the operator — see the note in renderSend');
});

console.log('\nthe logo — every proposal tool in the category has one, and this one is client-side only');
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
test('a well-formed image data URI round trips through save/load', () => {
  const s = mem(), api = make(s);
  api.save(Object.assign({}, FULL, { [LOGO_KEY]: PNG }));
  assert.strictEqual(api.load()[LOGO_KEY], PNG, 'the logo did not survive a save/load cycle');
});
test('anything that is not an image data URI is dropped, not stored', () => {
  // save() is the last line of defence — a caller that skipped the UI's own
  // checks (or a hand-edited localStorage value) must not be trusted to have
  // validated anything
  const api = make(mem());
  api.save(Object.assign({}, FULL, { [LOGO_KEY]: 'not a data uri at all' }));
  assert.strictEqual(api.load()[LOGO_KEY], undefined, 'a non-image string was stored as if it were a logo');
});
test('a value over the ceiling is dropped, not truncated', () => {
  // truncating would silently store a corrupt image — half a base64 payload
  // decodes to nothing, and the first anyone would learn of it is a broken
  // <img> on a document already sent to a client
  const api = make(mem());
  const tooBig = 'data:image/png;base64,' + 'A'.repeat(LOGO_MAX);
  api.save(Object.assign({}, FULL, { [LOGO_KEY]: tooBig }));
  assert.strictEqual(api.load()[LOGO_KEY], undefined, 'an oversized logo was stored instead of refused');
});
test('no logo means no logo — FULL never carried one', () => {
  const api = make(mem());
  api.save(FULL);
  assert.strictEqual(api.load()[LOGO_KEY], undefined);
});

test('block() carries the logo through only when it is a real image URI', () => {
  assert.strictEqual(block(Object.assign({}, FULL, { [LOGO_KEY]: PNG })).logo, PNG);
  assert.strictEqual(block(FULL).logo, null, 'no logo was set — block() must not invent one');
  assert.strictEqual(block(Object.assign({}, FULL, { [LOGO_KEY]: 'javascript:alert(1)' })).logo, null,
    'a non-image URI reached the document instead of being refused');
});
test('the document prints the logo beside the name, and nowhere without one', () => {
  const withLogo = proposal.build(ctxFor(Object.assign({}, FULL, { [LOGO_KEY]: PNG })));
  assert.ok(withLogo.includes('class="from-logo"'), 'the logo never reached the document');
  assert.ok(withLogo.includes(PNG), 'the image src is not the stored data URI');
  // decorative alt: the name text right beside it already says who this is
  // from, and a screen reader announcing the same identity twice is noise
  assert.ok(/<img class="from-logo" src="[^"]*" alt="">/.test(withLogo),
    'the logo needs an empty alt — the adjacent name already carries this information');
  const noLogo = proposal.build(ctxFor(FULL));
  assert.ok(!noLogo.includes('from-logo'), 'a sender with no logo printed one anyway');
});
test('a logo cannot be used to inject markup — checked at the gate, escaped at the template too', () => {
  const html = proposal.build(ctxFor(Object.assign({}, FULL,
    { [LOGO_KEY]: '"><script>alert(1)</script>' })));
  assert.ok(!html.includes('<script>alert'), 'an unvalidated logo value reached the document');
});

console.log('\nthe logo gate against a value that never went through save()');
/* Found in review: pc-backup.js's importAll() writes a restored backup's
   fields straight into storage with setItem() — never through save() — so
   a hand-edited or shared backup file can carry an s_logo value that has
   passed no validation of any kind by the time block() sees it. The prefix
   test `/^data:image\//` that used to guard this accepted exactly the
   shape below: it opens like a real logo and ends as markup. block() is
   the one gate a value on that path is guaranteed to cross, so it has to
   be a complete validator, not a hint. */
test('block() rejects a value that opens like a logo and ends as markup', () => {
  const attack = 'data:image/"><script>alert(1)</script>';
  assert.strictEqual(block(Object.assign({}, FULL, { [LOGO_KEY]: attack })).logo, null,
    'a prefix match let an attribute-breaking payload through');
});
test('block() rejects an unterminated data URI, an unlisted MIME type, and a non-base64 payload', () => {
  const bad = [
    'data:image/png;base64,',                              // real prefix, empty payload — nothing to render
    'data:image/png,<script>alert(1)</script>',             // no ;base64, marker at all
    'data:image/bmp;base64,QQ==',                            // not in the allowlist the file picker itself offers
    'data:text/html;base64,PHNjcmlwdD4=',                    // not an image type — the whole point of the check
    'data:image/png;base64,not-base64-at-all!!"><b>'         // valid prefix, payload outside the base64 alphabet
  ];
  bad.forEach(v => assert.strictEqual(block(Object.assign({}, FULL, { [LOGO_KEY]: v })).logo, null,
    'accepted as a logo: ' + v));
});
test('save() applies the same complete check, not the old prefix test', () => {
  const api = make(mem());
  api.save(Object.assign({}, FULL, { [LOGO_KEY]: 'data:image/"><script>alert(1)</script>' }));
  assert.strictEqual(api.load()[LOGO_KEY], undefined,
    'save() stored a value that only LOOKS like a data:image URI');
});
test('a value restored straight into storage — the path save() never sees — still cannot reach the document', () => {
  // simulates exactly what pc-backup.js's importAll() does: setItem() with
  // no validation, then the normal load() -> senderBlock() render path
  const s = mem();
  s.setItem(KEY, JSON.stringify(Object.assign({}, FULL,
    { [LOGO_KEY]: 'data:image/"><img src=x onerror=alert(1)>' })));
  const restored = make(s).load();
  const html = proposal.build(ctxFor(restored));
  assert.ok(!html.includes('onerror=alert'),
    'a value that bypassed save() entirely still reached the printed document');
});
test('a well-formed logo of every allowed type still passes', () => {
  ['data:image/png;base64,' + 'A'.repeat(40) + '==',
   'data:image/jpeg;base64,' + 'A'.repeat(40) + '=',
   'data:image/jpg;base64,' + 'A'.repeat(40),
   'data:image/webp;base64,' + 'A'.repeat(40) + '==',
   'data:image/svg+xml;base64,' + 'A'.repeat(40)
  ].forEach(v => assert.strictEqual(block(Object.assign({}, FULL, { [LOGO_KEY]: v })).logo, v,
    'a legitimate ' + v.slice(11, v.indexOf(';')) + ' logo was rejected'));
});

console.log('\nthe backup carries it');
test('the sender is included in a backup — losing it means every future proposal is unsigned', () => {
  const backup = require('./pc-backup.js');
  assert.ok(backup.DATA_KEYS.includes(KEY),
    'the sender key is not backed up; a cache clear would silently unsign every proposal after it');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
