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
function page({ store = {}, remote = null, typed = '' } = {}) {
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
    window: { open: () => {} },
    setTimeout, clearTimeout, Date, JSON, Promise
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
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

(async () => {
  for (const [name, fn] of queue) {
    if (!fn) { console.log('\n' + name); continue; }
    try { await fn(); pass++; console.log('  ok   ' + name); }
    catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})();
