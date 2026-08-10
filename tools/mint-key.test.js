/* node tools/mint-key.test.js — no browser, no deps.

   The whole point of the minting tool is that a key satisfies two authorities
   that live in two other files and know nothing about each other. So this does
   not test the tool against a copy of their rules — it reaches into both real
   files and tests against what they actually do:

     - keyValid() is lifted out of assets/pc-gate.js and run for real
     - the shape regex is lifted out of api/license.js as written

   If either side is ever retuned, the build fails here rather than a buyer
   discovering it on a train with no signal. That is the failure this tool was
   built to remove, and a hand-copied constant would quietly reintroduce it. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

const root = path.join(__dirname, '..');
const mint = require('./mint-key.js');

/* pc-gate.js is written for a page and exports nothing, but its top level is
   only declarations — nothing runs on load — so evaluating it in a bare vm
   context is enough to get at the real keyValid(). Same technique as
   assets/gate.test.js, for the same reason. */
const realKeyValid = (() => {
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/pc-gate.js'), 'utf8'), ctx);
  return k => vm.runInContext('keyValid', ctx)(k);
})();

/* Not a copy of the shape — the literal one the endpoint enforces. */
const serverShape = (() => {
  const src = fs.readFileSync(path.join(root, 'api/license.js'), 'utf8');
  const m = src.match(/if \(!(\/\^PC-.*?\/)\.test\(key\)\)/);
  assert.ok(m, 'could not find the shape regex in api/license.js — has it moved?');
  return new RegExp(m[1].slice(1, -1));
})();

const BATCH = Array.from({ length: 400 }, () => mint.mintOne(new Set()));

console.log('\na minted key satisfies both authorities, not one');
test('every minted key passes the real in-page checksum', () => {
  const bad = BATCH.filter(k => !realKeyValid(k));
  assert.deepStrictEqual(bad, [],
    bad.length + ' of ' + BATCH.length + ' minted keys fail keyValid() in assets/pc-gate.js — ' +
    'these are exactly the keys that die offline and from file://');
});
test('every minted key matches the shape the endpoint enforces', () => {
  const bad = BATCH.filter(k => !serverShape.test(k));
  assert.deepStrictEqual(bad, [], 'the server would answer 400 for these before comparing anything');
});
test('the tool and pc-gate.js agree about which keys are bad, not only which are good', () => {
  /* A checksum test that only ever feeds valid input proves nothing: a
     function returning true unconditionally would pass it. Mutating the check
     character is the one edit that must flip the verdict. */
  const key = BATCH[0];
  const body = mint.bodyOf(key);
  const wrong = body[7] === 'Z' ? 'Y' : 'Z';
  const broken = mint.format(body.slice(0, 7) + wrong);
  assert.ok(!realKeyValid(broken), 'pc-gate.js accepted a key with the wrong check character');
  assert.ok(!mint.passesChecksum(broken), 'the tool accepted a key with the wrong check character');
});

test('the checksum is still a filter, not a lock', () => {
  /* Carried over from tools/mintkey.test.js, which this file replaced when the
     two minters were merged. Everything else that suite asserted is covered
     above; this was not, and it is the one assertion about what the checksum
     is FOR. It stops somebody typing PC-AAAA-AAAA and getting in, and nothing
     more — pc-gate.js says that in prose, and this says it in behaviour so
     nobody later mistakes it for security.

     A seeded generator rather than Math.random, so a bad build fails every
     time instead of one run in twenty. Note the full [A-Z0-9] alphabet, not
     mint.SAFE: what matters is what a person can type, not what the tool
     draws from. */
  const ALPHA = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const r = (n => () => (n = (n * 1103515245 + 12345) % 2147483648) / 2147483648)(7);
  let refused = 0, tried = 0;
  for (let i = 0; i < 400; i++) {
    const body = Array.from({ length: 8 }, () => ALPHA[Math.floor(r() * 36)]).join('');
    tried++;
    if (!realKeyValid(mint.format(body))) refused++;
  }
  /* One in thirty-six passes by luck. That is the design, not a shortfall. */
  assert.ok(refused / tried > 0.9,
    'the checksum refused only ' + refused + ' of ' + tried + ' random strings of the right shape');
});

console.log('\nkeys a person has to read and type');
test('no character anyone confuses for another', () => {
  const AMBIGUOUS = /[01OI]/;
  const bad = BATCH.filter(k => AMBIGUOUS.test(k.replace(/^PC-/, '')));
  assert.deepStrictEqual(bad, [],
    'a key containing 0/O or 1/I costs a support thread worth more than the key');
});
test('the safe alphabet is a subset of what both sides accept', () => {
  assert.ok(/^[A-Z0-9]+$/.test(mint.SAFE), 'a character outside [A-Z0-9] would fail both regexes');
  assert.ok(!/[01OI]/.test(mint.SAFE), 'the safe alphabet is not safe');
});

console.log('\nno key is issued twice, and none is guessable from another');
test('a batch contains no duplicates', () => {
  assert.strictEqual(new Set(BATCH).size, BATCH.length, 'the same key was minted twice in one batch');
});
test('a key already in POSTCALL_KEYS is never re-issued', () => {
  const one = mint.mintOne(new Set());
  const taken = new Set([one]);
  for (let i = 0; i < 50; i++) assert.notStrictEqual(mint.mintOne(taken), one);
});
test('the randomness is the cryptographic one, not Math.random', () => {
  /* Math.random is reconstructible from a handful of outputs, which for a
     bearer token means one buyer's key narrows the search for the next. This
     is asserted at the source because the property is invisible in output. */
  const src = fs.readFileSync(path.join(__dirname, 'mint-key.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(/crypto\.randomInt\(/.test(src), 'keys must come from crypto.randomInt');
  assert.ok(!/Math\.random/.test(src), 'Math.random has no business issuing a key that unlocks a purchase');
});
test('every position in the key varies — a fixed character is lost entropy', () => {
  /* Cheap smoke test for an off-by-one in the draw loop, which would pin one
     position to a constant and shrink the space without changing the shape. */
  for (let i = 0; i < 8; i++) {
    const pos = BATCH.map(k => k.replace(/-/g, '').slice(2)[i]);
    assert.ok(new Set(pos).size > 1, 'position ' + i + ' is the same character in all 400 keys');
  }
});

console.log('\nthe tool refuses to imply a key is live');
test('minting without --env says the key does nothing until POSTCALL_KEYS holds it', () => {
  const src = fs.readFileSync(path.join(__dirname, 'mint-key.js'), 'utf8');
  assert.ok(/POSTCALL_KEYS/.test(src) && /--env/.test(src),
    'a minted key that looks issued but is not in the allowlist is a refunded sale');
});
test('the deploy does not serve the tools directory', () => {
  const ignore = path.join(root, '.vercelignore');
  assert.ok(fs.existsSync(ignore), 'no .vercelignore — tools/ would be published as static files');
  assert.ok(/^tools\/?$/m.test(fs.readFileSync(ignore, 'utf8')), 'tools/ is not excluded from the deploy');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
