/* node assets/landing.test.js — no browser, no deps.

   The landing page makes promises. The product either keeps them or it does
   not, and until this file existed nothing connected the two: the page was
   written in one place, the product in another, and the only thing checking
   that they agreed was somebody remembering to look.

   That is the failure this file is built against, and it is not hypothetical.
   The page as delivered carried a data-claim-id — mechanism-proof — that was
   not in its own manifest. A claim nobody had agreed to govern, on the page
   that exists to state what is governed.

   So the rule is: every claim on the page is in the manifest, every claim in
   the manifest is on the page, and every required claim names the product test
   that proves it. A claim with no proof is not an error — it is honest, and it
   is why the page ships gated. What is an error is a claim that is unproven
   and a page that is reachable anyway. The release gate below asserts exactly
   that, which makes shipping the page a decision somebody has to make in this
   file rather than a thing that happens by forgetting. */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

const LANDING = 'landing/post-call.html';
const landing = read(LANDING);
const postcall = read('post-call.html');

/* The manifest is the contract. It is read out of the page rather than kept
   beside it, because a copy is a thing that drifts and this whole file exists
   because of drift. */
const manifest = JSON.parse(
  landing.match(/<script type="application\/json" id="landingProductContract">([\s\S]*?)<\/script>/)[1]);

/* Which product test proves which claim. null is a claim the product does not
   keep yet — stated, not hidden, and it holds the release gate shut.

   Each entry names a real test that runs. When a phase lands, its claims move
   from null to the suite that proves them, and the gate opens on its own once
   the last null is gone. */
const PROOF = {
  'core-promise':        'scenario.test.js · the call is read locally and the open boundary is the only thing asked',
  'transcript-input':    'transcript.test.js · reading a transcript needs no network at all',
  'commitment-gate':     'commitments.test.js · one deal carries different verdicts at the same time',
  'decision-episodes':   'commitments.test.js · a call that answered everything is asked nothing',
  'handoff-valid':       'commitments.test.js · a handoff keeps everything already established',
  'candidate-evidence':  'transcript.test.js · a local candidate carries its sentence, ' +
                         'its speaker and its confidence',
  'evidence-approval':   'transcript.test.js · rejecting a row keeps it out of the state',
  'mechanism-proof':     'transcript.test.js · the local path can reach a client-sourced ' +
                         'provenance, not only mine',
  'pricing-authority':   'landing.test.js · the demo states no commercial price',
  'product-vs-demo':     'landing.test.js · the demo price is marked illustrative',
  'pilot-price':         'landing.test.js · the page and the paywall agree on the price',
  'field-proof-pending': 'landing.test.js · no outcome number appears before it is measured'
};

console.log('\nthe contract covers the page and the page covers the contract');

test('every claim marked on the page is governed by the manifest', () => {
  const onPage = [...new Set([...landing.matchAll(/data-claim-id="([^"]+)"/g)].map(m => m[1]))].sort();
  const governed = manifest.claims.map(c => c.id).sort();
  const ungoverned = onPage.filter(id => !governed.includes(id));
  assert.deepStrictEqual(ungoverned, [],
    'the page claims this and the manifest does not govern it: ' + ungoverned.join(', '));
});

test('every claim in the manifest is marked somewhere on the page', () => {
  const onPage = [...new Set([...landing.matchAll(/data-claim-id="([^"]+)"/g)].map(m => m[1]))];
  const orphan = manifest.claims.map(c => c.id).filter(id => !onPage.includes(id));
  assert.deepStrictEqual(orphan, [],
    'the manifest governs a claim the page never makes: ' + orphan.join(', '));
});

test('every claim names the product test that proves it, or states that none does', () => {
  const missing = manifest.claims.map(c => c.id).filter(id => !(id in PROOF));
  assert.deepStrictEqual(missing, [],
    'these claims have no entry in PROOF — add the test that proves them, or null: ' +
    missing.join(', '));
});

/* Without this the map is a promise about promises: a claim can name a test
   that was renamed, moved or never written, and the page ships on the strength
   of a string. Each entry is "file.test.js · the test name", and both halves
   have to be real. */
test('every named proof is a test that actually exists', () => {
  const broken = [];
  Object.entries(PROOF).forEach(([claim, proof]) => {
    if (!proof) return;
    const [file, name] = proof.split(' · ');
    const suite = path.join(root, 'assets', file);
    if (!fs.existsSync(suite)) return broken.push(claim + ' → no such suite: ' + file);
    if (!fs.readFileSync(suite, 'utf8').includes(name))
      broken.push(claim + ' → ' + file + ' has no test called "' + name + '"');
  });
  assert.deepStrictEqual(broken, [],
    'a claim is resting on a test that is not there:\n       ' + broken.join('\n       '));
});

test('every claim carries a capability sentence, not just an id', () => {
  const empty = manifest.claims.filter(c => !c.capability || c.capability.length < 20).map(c => c.id);
  assert.deepStrictEqual(empty, [],
    'a claim id with no capability behind it is a label, not a contract: ' + empty.join(', '));
});

console.log('\nthe release gate');

/* The gate is the point of the file. While any required claim is unproven the
   page describes a product that does not exist, and the only safe place for
   it is unreachable. noindex is not enough on its own — it stops indexing,
   not a URL pasted into a chat — so the deployment ignore is what is asserted,
   and the meta tag is asserted with it. */
const unproven = manifest.claims.filter(c => c.required && !PROOF[c.id]).map(c => c.id);

/* The first version of these returned early once every claim was proven,
   which meant that on the day the work finished the gate stopped being
   asserted at all — three tests going green by having nothing left to say.
   That is the same shape as a health endpoint that reports what it was told
   rather than what is true, and this repository already refuses that one.

   So the assertion is not "it is shut" but "the three things that describe its
   state agree with each other". Proving the last claim unlocks the gate; it
   does not open it. Opening it is a person editing the manifest, and the two
   lines that make the page reachable have to move in the same commit. */
const declaredShut = manifest.releaseGate === 'blocked_until_required_claim_tests_pass';
const ignored = read('.vercelignore').split('\n').map(l => l.trim())
  .some(l => l === 'landing/' || l === LANDING);
const noindex = /<meta name="robots" content="noindex,nofollow"/.test(landing);

test('an unproven claim can only mean the page is gated', () => {
  if (!unproven.length) return;
  assert.ok(declaredShut && ignored && noindex,
    unproven.length + ' required claims are unproven (' + unproven.join(', ') +
    ') — gate declared shut: ' + declaredShut + ', ignored by the deploy: ' +
    ignored + ', noindex: ' + noindex);
});

test('the manifest, the deploy and the robots tag tell the same story', () => {
  /* Any two of these disagreeing is a page that is half published, and the
     half that decides whether a stranger can read it is the deploy. */
  assert.strictEqual(declaredShut, ignored,
    declaredShut
      ? 'the manifest says the gate is shut and the page is not in .vercelignore'
      : 'the manifest says the gate is open and the page is still ignored — ' +
        'if publishing was the intent, move landing/ out of .vercelignore and ' +
        'into SERVED in markup.test.js');
  assert.strictEqual(declaredShut, noindex,
    'the deployment state and the robots tag disagree about whether this page ' +
    'is meant to be found');
});

test('a page that keeps every promise is still not published by accident', () => {
  if (unproven.length) return;
  /* Nothing is unproven, so nothing here forces the page to stay hidden. It
     stays hidden anyway until somebody says otherwise, and this test exists to
     be the thing they have to walk past. */
  assert.ok(declaredShut === ignored,
    'the last claim passing did not publish the page, and it should not have');
});

console.log('\nclaims the product keeps today');

/* pricing-authority + product-vs-demo. The demo walks the same decision path
   the product will, which makes it the most useful thing on the page and the
   most dangerous: a second pricing formula, written to illustrate, read as
   the real one. The product's engine has four methods, a cost floor and
   guardrails. The demo has none of that and must not pretend to. */
test('the demo states no commercial price', () => {
  const script = landing.match(/<script>([\s\S]*?)<\/script>/)[1];
  /* *100 is the percent idiom and is allowed; anything else multiplied by a
     rate-shaped constant is a second pricing model being written by hand. The
     version before this one did exactly that — hours * 275 — and rendered the
     result next to the word "מחיר". */
  const rates = (script.match(/\*\s*\d{2,}|\d{2,}\s*\*/g) || [])
    .filter(m => !/\*\s*100\b|\b100\s*\*/.test(m));
  assert.deepStrictEqual(rates, [],
    'the demo multiplies by a rate constant — it is defining a second pricing ' +
    'model: ' + rates.join(', '));
});

test('the demo never renders a price of its own', () => {
  const block = landing.match(/data-demo-pricing="illustrative"[\s\S]*?<\/div>/)[0];
  const amounts = block.match(/₪\s*[\d,]+/g) || [];
  assert.deepStrictEqual(amounts, [],
    'the demo prints a shekel amount where the product engine should be named: ' +
    amounts.join(', '));
});

test('the demo price is marked illustrative', () => {
  assert.ok(/data-demo-pricing="illustrative"/.test(landing),
    'the demo price block is not marked illustrative');
});

test('the demo hands pricing back to the existing engine in words too', () => {
  assert.ok(/מנוע התמחור/.test(landing),
    'nothing on the page tells the reader the price comes from the product engine');
});

/* pilot-price. The number lives in exactly two places and they are written
   months apart by different hands. ₪49 on the page and ₪49 on the paywall is
   the whole claim; when one moves the other has to. */
test('the page and the paywall agree on the price', () => {
  const wall = postcall.match(/id="wallPrice"[^>]*>([^<]+)</);
  assert.ok(wall, 'post-call.html no longer has #wallPrice — the paywall price moved');
  const onLanding = [...landing.matchAll(/₪(\d+)/g)].map(m => m[1]);
  assert.ok(onLanding.includes(wall[1].replace('₪', '').trim()),
    'the paywall says ' + wall[1] + ' and the landing page does not say it anywhere');
});

test('the page still says the build itself is free', () => {
  assert.ok(/₪0/.test(landing), 'the free-until-export half of the model is gone from the page');
});

/* field-proof-pending. The one claim that is kept by absence: no outcome
   number exists yet, so none may appear. A percentage or a multiple inside
   the pending card would be a measurement nobody took. */
test('no outcome number appears before it is measured', () => {
  const card = landing.match(/data-claim-id="field-proof-pending"[\s\S]*?<\/article>/)[0];
  const numbers = card.match(/\d+\s*%|פי\s*\d+|×\s*\d+/g) || [];
  assert.deepStrictEqual(numbers, [],
    'the pending-results card states a result: ' + numbers.join(', '));
});

/* The contact route. The first version of this test asserted that the landing
   page and the paywall held the same number — which is not one source of
   truth, it is two with an alarm on them, and the alarm rings after somebody
   has already shipped a page pointing at the wrong chat. So the assertion is
   not "they agree" but "there is only one of them to disagree with." */
test('the buyer\'s route is declared exactly once in the repository', () => {
  /* The rule is not "no phone numbers anywhere" — accessibility.html carries a
     statutory contact for accessibility complaints, which is a different route
     to a different inbox for a different reason, and the suites use fixture
     numbers to exercise the rendering. The rule is that whatever the sales
     route currently is, it is written down once. So the value is read out of
     the module and every other product file is checked for a copy of it. */
  const route = read('assets/pc-contact.js').match(/const ROUTE = '([^']*)'/)[1];
  assert.ok(route, 'pc-contact.js no longer declares a route');

  const walk = d => fs.readdirSync(path.join(root, d), { withFileTypes: true })
    .flatMap(e => e.name === '.git' || e.name === 'node_modules' ? []
      : e.isDirectory() ? walk(path.join(d, e.name))
      : [path.join(d, e.name)]);

  const copies = walk('.').map(f => f.replace(/^\.\//, ''))
    .filter(f => /\.(js|html)$/.test(f) && !f.endsWith('.test.js'))
    .filter(f => f !== 'assets/pc-contact.js')
    .filter(f => read(f).includes(route));

  assert.deepStrictEqual(copies, [],
    'the sales route is copied outside pc-contact.js, so there are now two ' +
    'places for it to be wrong: ' + copies.join(', '));
});

/* The demo is the most persuasive thing on the page and therefore the most
   dangerous: it walks the decision path convincingly, and if it walks its own
   copy of that path then the page is demonstrating something the product does
   not do. That is the exact failure the contract exists to catch, reproduced
   inside the page that states the contract. It carried its own readiness
   engine — seven commitments, hand-written statuses, a second opinion about
   what BLOCKED means — until the engine became a module both could load. */
test('the demo asks the engine rather than keeping its own copy of it', () => {
  assert.ok(/pc-commitments\.js/.test(landing),
    'the landing page does not load the readiness engine');
  assert.ok(/PC\.commitments\.assess/.test(landing),
    'the landing page loads the engine and does not ask it');
});

test('the demo holds no second opinion about what the verdicts mean', () => {
  const script = landing.match(/<script>([\s\S]*?)<\/script>/g)
    .map(s => s.replace(/<\/?script>/g, '')).join('\n');
  const own = script.match(/["'](READY|CONDITIONAL|BLOCKED)["']/g) || [];
  assert.deepStrictEqual(own, [],
    'the demo spells out a verdict of its own, so there are two definitions of ' +
    'it to drift apart: ' + own.join(', '));
});

test('the paywall and the landing page both read that one declaration', () => {
  assert.ok(/PC\.contact/.test(read('assets/pc-gate.js')),
    'pc-gate.js has stopped reading the shared route');
  assert.ok(/PC\.contact/.test(landing),
    'the landing page has stopped reading the shared route');
  assert.ok(/pc-contact\.js/.test(landing),
    'the landing page does not load the module it reads from');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
