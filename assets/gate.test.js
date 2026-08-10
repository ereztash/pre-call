/* node assets/gate.test.js — no browser, no deps.

   pc-gate.js was the one file with money attached and no test, and it is where
   the review found a bug: the unlock path let the server overrule the local
   checksum, and the reload path did not, so a key the server had already
   accepted was thrown away on the next page load. That is a customer who paid,
   coming back the next morning to a paywall.

   The file is written for a page — it reads el(), show(), track(), fetch and
   localStorage out of the global scope and exports nothing. Rather than
   restructure a working module to make it testable, the page is faked: a vm
   context with those five things in it, and the source evaluated inside. Top
   level `let` in a vm context lives in the context's lexical scope, so the
   state can be read back by evaluating the name.

   Every test below is one question: after this sequence, is the person who
   paid still on the inside? */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

/* The tests are async, so they are queued and run at the bottom rather than
   inline — which means the section headers have to be queued alongside them or
   they all print first, under the wrong tests. */
let pass = 0, fail = 0;
const queue = [];
const test = (name, fn) => queue.push([name, fn]);
const section = title => queue.push([title, null]);

const SRC = fs.readFileSync(path.join(__dirname, 'pc-gate.js'), 'utf8');

/* A key the in-page checksum accepts. Computed rather than pasted, so the two
   sides of this test cannot drift apart if the checksum is ever retuned. */
const ALPHA = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function mint(seed) {
  const body = seed.slice(0, 7);
  let sum = 0; for (const ch of body) sum += ch.charCodeAt(0);
  const full = body + ALPHA[sum % 36];
  return 'PC-' + full.slice(0, 4) + '-' + full.slice(4);
}
const GOOD = mint('ABCDEFG');          // passes the checksum
const ISSUED = 'PC-ABCD-EFGH';         // right shape, fails the checksum —
                                       // exactly what POSTCALL_KEYS may contain

/* The fake page. `remote` is what /api/license will answer: true, false, null
   (not configured), 'throttle' (429), or 'offline' (fetch rejects). */
/* PAYMENT_URL and SALES.contact are the two things that decide which sale the
   wall describes, and both are top-level consts — SALES is an object so its
   fields can be set from a test, but the URL cannot be reassigned. So the
   source is varied instead, and the substitution is asserted: a renamed
   constant has to fail this file rather than quietly leave every
   automated-route test evaluating the default. */
function withConfig(src, { paymentUrl, contact }) {
  if (paymentUrl !== undefined) {
    const before = src;
    src = src.replace("'https://example.com/replace-with-your-payment-link'", JSON.stringify(paymentUrl));
    assert.notStrictEqual(src, before, 'the PAYMENT_URL placeholder moved — this test now proves nothing');
  }
  if (contact !== undefined) {
    const before = src;
    src = src.replace("contact: ''", 'contact: ' + JSON.stringify(contact));
    assert.notStrictEqual(src, before, 'SALES.contact moved — this test now proves nothing');
  }
  return src;
}

function page({ store = {}, remote = null, typed = '', paymentUrl, contact } = {}) {
  const env = {
    calls: 0, shown: {}, tracked: [], store,
    els: { keyIn: { value: typed }, keyErr: { textContent: '' },
           wall: { scrollIntoView() {} } }
  };
  const ctx = {
    console,
    localStorage: {
      getItem: k => (k in env.store ? env.store[k] : null),
      setItem: (k, v) => { env.store[k] = String(v); },
      removeItem: k => { delete env.store[k]; }
    },
    fetch: async () => {
      env.calls++;
      if (remote === 'offline') throw new Error('network');
      if (remote === 'throttle') return { ok: false, status: 429 };
      return { ok: true, status: 200, json: async () => ({ valid: remote }) };
    },
    el: id => env.els[id] || (env.els[id] = { textContent: '', classList: { add(){}, remove(){} } }),
    show: (id, on) => { env.shown[id] = on; },
    /* Provided by pc-dom.js in the page. The harness has to stand in for
       it, and the reason it now must is worth recording: every scroll in
       the product used to call scrollIntoView directly with a hardcoded
       behavior:'smooth', so this file could get away with one stub method
       on one fake element. Routing them through a helper that honours
       prefers-reduced-motion made that dependency real, and this file
       failed loudly rather than silently — which is the behaviour worth
       having. */
    scrollToEl: (target, block) => { env.scrolled = { target, block }; },
    scrollPageTop: () => { env.scrolled = { target: 'top' }; },
    track: name => env.tracked.push(name),
    alert: () => {},
    // location as well as open: a mailto route replaces the location, an https
    // route opens a tab, and the difference is the point of one of the tests
    window: {
      open: (url) => { env.opened = url; },
      location: { set href(u){ env.navigated = u; }, get href(){ return env.navigated; } }
    },
    setTimeout, clearTimeout, Date, JSON, Promise
  };
  vm.createContext(ctx);
  vm.runInContext(withConfig(SRC, { paymentUrl, contact }), ctx);
  env.read = expr => vm.runInContext(expr, ctx);
  env.run = expr => vm.runInContext(expr, ctx);
  return env;
}

// let every pending promise chain in the vm context settle
const settle = () => new Promise(r => setImmediate(() => setImmediate(r)));
const stamp = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString();
const DAY = 24 * 60 * 60 * 1000;

/* ---------------------------------------------------------------- */

section('coming back to the tool');
test('the checksum accepts a minted key and refuses a shaped one', () => {
  const p = page();
  assert.strictEqual(p.read('keyValid(' + JSON.stringify(GOOD) + ')'), true);
  assert.strictEqual(p.read('keyValid(' + JSON.stringify(ISSUED) + ')'), false,
    'this is the whole premise: the server may issue keys the checksum rejects');
  assert.strictEqual(p.read('keyValid("PC-ABCD")'), false);
  assert.strictEqual(p.read('keyValid("")'), false);
});

test('nothing stored means locked, and no request spent asking', async () => {
  const p = page();
  p.run('rehydrateKey()');
  await settle();
  assert.strictEqual(p.read('unlocked'), false);
  assert.strictEqual(p.calls, 0);
});

test('a malformed stored key is dropped without touching the network', async () => {
  const p = page({ store: { postcall_key: 'not-a-key' } });
  p.run('rehydrateKey()');
  await settle();
  assert.strictEqual(p.read('unlocked'), false);
  assert.strictEqual(p.calls, 0, 'the shape check is free; the rate limit is not');
});

test('a checksum-valid key unlocks the reload immediately', async () => {
  const p = page({ store: { postcall_key: GOOD }, remote: null });
  p.run('rehydrateKey()');
  assert.strictEqual(p.read('unlocked'), true, 'no spinner between a buyer and their own tool');
  await settle();
  assert.strictEqual(p.read('unlocked'), true);
});

/* The reported bug, stated as the sequence that produces it. */
test('a key the server accepted survives the next reload', async () => {
  const p = page({ typed: ISSUED, remote: true });
  await p.run('tryUnlock()');
  assert.strictEqual(p.read('unlocked'), true, 'the server said yes');
  assert.ok(p.store.postcall_key, 'and the key was kept');

  // same browser, next morning
  const q = page({ store: p.store, remote: 'offline' });
  q.run('rehydrateKey()');
  await settle();
  assert.strictEqual(q.read('unlocked'), true,
    'a paying customer was being sent back to the paywall by a checksum the ' +
    'server does not even enforce');
});

test('a server confirmation is trusted offline, without a request', async () => {
  const p = page({ store: { postcall_key: ISSUED, postcall_key_ok_at: stamp() },
                   remote: 'offline' });
  p.run('rehydrateKey()');
  assert.strictEqual(p.read('unlocked'), true);
  await settle();
  assert.strictEqual(p.calls, 0, 'a fresh confirmation needs no second opinion');
});

test('an unconfirmed key that fails the checksum waits for the server', async () => {
  const p = page({ store: { postcall_key: ISSUED }, remote: true });
  p.run('rehydrateKey()');
  assert.strictEqual(p.read('unlocked'), false,
    'nothing here says this key was ever bought — do not open on a shape alone');
  await settle();
  assert.strictEqual(p.read('unlocked'), true, 'the server vouched for it');
  assert.ok(p.store.postcall_key_ok_at, 'and the answer is remembered');
});

test('an unconfirmed shaped key stays out when no one can vouch for it', async () => {
  for (const remote of ['offline', null, 'throttle']) {
    const p = page({ store: { postcall_key: ISSUED }, remote });
    p.run('rehydrateKey()');
    await settle();
    assert.strictEqual(p.read('unlocked'), false,
      'remote=' + remote + ': writing a shaped string into storage must not be a bypass');
  }
});

test('a revoked key is locked and cleared on the next daily check', async () => {
  const p = page({ store: { postcall_key: GOOD, postcall_key_ok_at: stamp(2 * DAY) },
                   remote: false });
  p.run('rehydrateKey()');
  assert.strictEqual(p.read('unlocked'), true, 'optimistic first');
  await settle();
  assert.strictEqual(p.read('unlocked'), false, 'and corrected once the server answers');
  assert.strictEqual(p.store.postcall_key, undefined);
  assert.strictEqual(p.store.postcall_key_ok_at, undefined);
});

test('a stale confirmation is rechecked; a fresh one is not', async () => {
  const fresh = page({ store: { postcall_key: GOOD, postcall_key_ok_at: stamp(60_000) },
                       remote: true });
  fresh.run('rehydrateKey()');
  await settle();
  assert.strictEqual(fresh.calls, 0, 'reloading all day must not burn the rate limit');

  const stale = page({ store: { postcall_key: GOOD, postcall_key_ok_at: stamp(2 * DAY) },
                       remote: true });
  stale.run('rehydrateKey()');
  await settle();
  assert.strictEqual(stale.calls, 1);
  assert.strictEqual(stale.read('unlocked'), true);
});

test('a throttled recheck leaves an unlocked user alone', async () => {
  const p = page({ store: { postcall_key: GOOD, postcall_key_ok_at: stamp(2 * DAY) },
                   remote: 'throttle' });
  p.run('rehydrateKey()');
  await settle();
  assert.strictEqual(p.read('unlocked'), true,
    'a busy endpoint is not evidence that a key is bad');
});

section('typing the key in');
test('a malformed key never reaches the network', async () => {
  const p = page({ typed: 'PC-1', remote: true });
  await p.run('tryUnlock()');
  assert.strictEqual(p.calls, 0);
  assert.strictEqual(p.read('unlocked'), false);
  assert.strictEqual(p.shown.keyErr, true);
});

test('the server overrules a checksum that would have passed', async () => {
  const p = page({ typed: GOOD, remote: false });
  await p.run('tryUnlock()');
  assert.strictEqual(p.read('unlocked'), false,
    'once keys are configured, a made-up key of the right shape is refused');
  assert.strictEqual(p.store.postcall_key, undefined);
});

test('with no server configured the checksum decides', async () => {
  const yes = page({ typed: GOOD, remote: null });
  await yes.run('tryUnlock()');
  assert.strictEqual(yes.read('unlocked'), true);
  assert.strictEqual(yes.store.postcall_key_ok_at, undefined,
    'a fallback unlock must not stamp itself a day of not being asked');

  const no = page({ typed: ISSUED, remote: null });
  await no.run('tryUnlock()');
  assert.strictEqual(no.read('unlocked'), false);
});

test('being throttled says so instead of calling the key wrong', async () => {
  const p = page({ typed: GOOD, remote: 'throttle' });
  await p.run('tryUnlock()');
  assert.strictEqual(p.read('unlocked'), false);
  assert.ok(/ניסיונות/.test(p.els.keyErr.textContent),
    'telling a paying customer their key is invalid when the server is merely ' +
    'busy is how a support ticket becomes a refund');
});

test('an export attempt while locked raises the wall and is remembered', () => {
  const p = page();
  p.run('globalThis.__ran = 0; requireKey(function(){ globalThis.__ran++; })');
  assert.strictEqual(p.shown.wall, true);
  assert.ok(p.tracked.includes('export_attempted'));
  assert.strictEqual(p.read('globalThis.__ran'), 0);
  assert.strictEqual(p.read('typeof pendingExport'), 'function',
    'the export the buyer asked for should happen the moment the key lands');
});

test('the pending export runs itself once the key is accepted', async () => {
  const p = page({ typed: GOOD, remote: true });
  p.run('globalThis.__ran = 0; requireKey(function(){ globalThis.__ran++; })');
  assert.strictEqual(p.read('globalThis.__ran'), 0, 'held, not run');
  await p.run('tryUnlock()');
  assert.strictEqual(p.read('globalThis.__ran'), 1);
  assert.strictEqual(p.read('pendingExport'), null, 'and not held a second time');
});

test('an unlocked session exports without seeing the wall again', () => {
  const p = page();
  p.run('unlocked = true; globalThis.__ran = 0; requireKey(function(){ globalThis.__ran++; })');
  assert.strictEqual(p.read('globalThis.__ran'), 1);
  assert.strictEqual(p.shown.wall, undefined);
});

section('what the wall says about how to pay');
/* The state this replaced: the buy button called alert() and told whoever
   clicked it to replace PAYMENT_URL in assets/pc-gate.js. That message was
   addressed to the person who wrote the code, and it was shown to the person
   trying to give them money. */
test('an automated sale opens the payment page in a new tab, and says nothing extra', () => {
  const p = page({ paymentUrl: 'https://buy.example.org/postcall' });
  p.run('renderBuyRoute()');
  p.els.payBtn.onclick();
  assert.strictEqual(p.opened, 'https://buy.example.org/postcall');
  assert.strictEqual(p.shown.buyRoute, false, 'there is nothing manual to explain');
  assert.strictEqual(p.navigated, undefined, 'the buyer must not lose an unsaved proposal to a redirect');
});

test('a manual sale says a person sends the key, and never says "buy"', () => {
  const p = page({ contact: 'mailto:sales@example.org' });
  p.run('renderBuyRoute()');
  assert.ok(!/קנה/.test(p.els.payBtn.textContent),
    'the label still promises a purchase on the spot: "' + p.els.payBtn.textContent + '"');
  assert.strictEqual(p.shown.buyRoute, true);
  assert.ok(/ביד/.test(p.els.buyHow.textContent), 'the wall must say the key is sent by hand');
  assert.ok(/יום עסקים|שעות/.test(p.els.buyHow.textContent),
    'an unstated wait is what makes a manual sale feel broken');
});

test('the address is on screen as text, not only behind the button', () => {
  /* A mailto with no mail client configured is a click that does nothing at
     all, and this project has shipped that failure before. */
  const p = page({ contact: 'mailto:sales@example.org' });
  p.run('renderBuyRoute()');
  assert.strictEqual(p.els.buyContact.textContent, 'sales@example.org',
    'the scheme is machine syntax — what is shown should read as an address');
});

test('a mailto replaces the location; an https route opens a tab instead', () => {
  const mail = page({ contact: 'mailto:sales@example.org' });
  mail.run('renderBuyRoute()');
  mail.els.payBtn.onclick();
  assert.strictEqual(mail.navigated, 'mailto:sales@example.org');
  assert.strictEqual(mail.opened, undefined, 'window.open on a mailto leaves an orphaned blank tab');

  const chat = page({ contact: 'https://wa.me/972000000' });
  chat.run('renderBuyRoute()');
  chat.els.payBtn.onclick();
  assert.strictEqual(chat.opened, 'https://wa.me/972000000');
  assert.strictEqual(chat.navigated, undefined,
    'navigating away mid-proposal loses the document the buyer is paying to export');
});

test('with neither configured the wall stops implying a purchase, and keeps the key field', () => {
  const p = page();                       // the repository default: both empty
  p.run('renderBuyRoute()');
  assert.strictEqual(p.shown.payBtn, false, 'a buy button with nowhere to go is the old alert() again');
  assert.strictEqual(p.shown.wallPrice, false, 'a price above "not on sale yet" is a contradiction');
  assert.ok(/כבר יש לכם מפתח/.test(p.els.buyHow.textContent),
    'someone who already paid still has to be able to use their key');
});

section('asking for a key before the gate asks');
/* The gate stops three actions and all three happen at one moment: the proposal
   is finished and about to go to the client. With a manual sale the answer to
   "I need a key" is "in a few hours", so the gate lands at the worst possible
   point to introduce a wait. This note moves the requirement earlier — and the
   whole risk of it is becoming a standing advert next to the work, which is why
   most of what follows tests when it stays HIDDEN. */
test('it appears once there is a real price and somewhere to ask', () => {
  const p = page({ contact: 'mailto:sales@example.org' });
  p.run('renderKeyAhead(true)');
  assert.strictEqual(p.shown.keyAhead, true);
  assert.ok(/מפתח/.test(p.els.keyAheadText.textContent), 'the note has to say what is needed');
  assert.ok(/ביד/.test(p.els.keyAheadText.textContent),
    'the reason to ask early is that a person sends it — say so, or the ask has no motive');
});
test('an empty form is never told it will need a key', () => {
  const p = page({ contact: 'mailto:sales@example.org' });
  p.run('renderKeyAhead(false)');
  assert.strictEqual(p.shown.keyAhead, false,
    'with nothing worth exporting yet, this is an advert rather than information');
});
test('nothing to sell means nothing to ask for', () => {
  const p = page();                       // no PAYMENT_URL, no contact
  p.run('renderKeyAhead(true)');
  assert.strictEqual(p.shown.keyAhead, false, 'asking for a key nobody can issue is a dead end');
});
test('a key already held removes it', () => {
  const p = page({ contact: 'mailto:sales@example.org' });
  p.run('unlocked = true; renderKeyAhead(true)');
  assert.strictEqual(p.shown.keyAhead, false);
});
test('"אחר כך" means for the rest of the session, not until the next keystroke', () => {
  /* Every edit runs the recompute chain, which calls renderKeyAhead again. A
     dismissal that did not survive that would reappear on the next character
     typed, which is worse than never offering it. */
  const p = page({ contact: 'mailto:sales@example.org' });
  p.run('renderKeyAhead(true)');
  p.run('dismissKeyAhead()');
  assert.strictEqual(p.shown.keyAhead, false);
  p.run('renderKeyAhead(true)');
  assert.strictEqual(p.shown.keyAhead, false, 'the dismissal did not survive one recompute');
});
test('the dismissal is not persisted — a buyer weeks later must be warned again', () => {
  const store = {};
  const p = page({ contact: 'mailto:sales@example.org', store });
  p.run('renderKeyAhead(true); dismissKeyAhead()');
  assert.deepStrictEqual(Object.keys(store), [],
    'a stored dismissal spends the one warning forever and the next session meets the wall cold');
});
test('unlocking hides it without waiting for a recompute', () => {
  /* The unlock happens in the wall, and nothing about the price changed, so no
     recompute is coming. A note asking for the thing that just arrived is the
     obvious way for this to look broken. */
  const p = page({ contact: 'mailto:sales@example.org', typed: GOOD, remote: null });
  p.run('renderKeyAhead(true)');
  assert.strictEqual(p.shown.keyAhead, true, 'setup');
  return p.run('tryUnlock()').then(() => {
    assert.strictEqual(p.read('unlocked'), true, 'setup: the key should have been accepted');
    assert.strictEqual(p.shown.keyAhead, false);
  });
});
test('a revoked key brings the note back on the daily recheck', () => {
  const p = page({ contact: 'mailto:sales@example.org',
                   store: { postcall_key: GOOD, postcall_key_ok_at: stamp(2 * DAY) },
                   remote: false });
  p.run('renderKeyAhead(true)');
  p.run('rehydrateKey()');
  return settle().then(() => {
    assert.strictEqual(p.read('unlocked'), false, 'setup: the key should have been revoked');
    assert.strictEqual(p.shown.keyAhead, true,
      'the key is gone, so the requirement is live again and has to be said again');
  });
});
test('asking early and asking at the wall go to the same place', () => {
  const p = page({ contact: 'mailto:sales@example.org' });
  p.run('askForKeyAhead()');
  assert.strictEqual(p.navigated, 'mailto:sales@example.org',
    'two routes to buy is two conversations to run by hand');
  assert.ok(p.tracked.includes('key_requested'),
    'without its own event there is no way to tell whether moving the ask earlier did anything');
});

test('the wall never tells a buyer to edit a source file', () => {
  const src = fs.readFileSync(path.join(__dirname, 'pc-gate.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/alert\(/.test(src), 'an alert() in the gate is addressed to the wrong person');
  assert.ok(!/PAYMENT_URL[^\n]*assets\/pc-gate/.test(src), 'instructions for the developer are on the buyer’s screen');
});

(async () => {
  for (const [name, fn] of queue) {
    if (!fn) { console.log('\n' + name); continue; }
    try { await fn(); pass++; console.log('  ok   ' + name); }
    catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})();
