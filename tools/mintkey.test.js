/* node tools/mintkey.test.js — no browser, no deps.

   A key that this mints and the page rejects is worse than no tool at
   all: the buyer paid, the key looks right, and it fails for them on a
   train and works in the office. So this does not re-implement the
   checksum to check the checksum — it runs the real keyValid() out of
   assets/pc-gate.js, in a vm with a fake page, against every key minted
   here. If the two ever drift apart, this is where it shows. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { mint, ALPHA } = require('./mintkey.js');

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

/* The gate, loaded as the page loads it. It reaches for a DOM and a
   network at import time, so both are stubbed; only keyValid() is read. */
const SRC = fs.readFileSync(path.join(__dirname, '..', 'assets', 'pc-gate.js'), 'utf8');
const ctx = {
  console, JSON, Date, Promise, setTimeout, clearTimeout,
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  fetch: async () => ({ ok: false, status: 500 }),
  el: () => ({ textContent: '', value: '', classList: { add(){}, remove(){} } }),
  show: () => {}, track: () => {}, alert: () => {},
  scrollToEl: () => {}, scrollPageTop: () => {},
  window: { open: () => {} }
};
vm.createContext(ctx);
vm.runInContext(SRC, ctx);
const keyValid = k => vm.runInContext('keyValid(' + JSON.stringify(k) + ')', ctx);

console.log('\nevery key this mints is a key the page accepts');
test('the page accepts 500 freshly minted keys', () => {
  const bad = [];
  for (let i = 0; i < 500; i++) {
    const k = mint();
    if (!keyValid(k)) bad.push(k);
  }
  assert.deepStrictEqual(bad, [],
    'minted keys the shipped gate rejects — the tool and assets/pc-gate.js have drifted: ' +
    bad.slice(0, 5).join(', '));
});

test('the shape is the one the gate matches on', () => {
  for (let i = 0; i < 50; i++)
    assert.ok(/^PC-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(mint()), 'wrong shape');
});

console.log('\nand it is still a filter, not a lock');
test('a random string of the right shape is refused', () => {
  /* The checksum exists to stop someone typing PC-AAAA-AAAA and getting
     in, and nothing more. Worth asserting so nobody later mistakes it
     for security — pc-gate.js says so in prose, this says it in code. */
  let refused = 0, tried = 0;
  const r = (n => () => (n = (n * 1103515245 + 12345) % 2147483648) / 2147483648)(7);
  for (let i = 0; i < 200; i++) {
    const body = Array.from({ length: 8 }, () => ALPHA[Math.floor(r() * 36)]).join('');
    const k = 'PC-' + body.slice(0, 4) + '-' + body.slice(4);
    tried++; if (!keyValid(k)) refused++;
  }
  /* One in thirty-six random strings passes by luck. That is the design. */
  assert.ok(refused / tried > 0.9,
    'the checksum refused only ' + refused + ' of ' + tried + ' random strings');
});

test('two keys minted in a row are different', () => {
  const seen = new Set(Array.from({ length: 200 }, () => mint()));
  assert.ok(seen.size > 190, 'minting repeats itself: ' + seen.size + ' distinct out of 200');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
