/* node assets/landing.test.js — the public page may only promise what the shipped journey can reach. */
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

const PUBLIC = 'post-call-landing.html';
/* The layer above it. post-call-landing sells the half of the device that is
   most finished; this one sells the device. They are separate pages because
   they answer different questions — "I just got off a call" versus "what is
   this" — and both are held to the same bar here rather than one of them
   getting a softer contract for being the broader claim. */
const PRODUCT = 'product-landing.html';
const TARGET = 'landing/post-call.html';
const landing = read(PUBLIC);
const product = read(PRODUCT);
const target = read(TARGET);
const postcall = read('post-call.html');
const precall = read('pre-call.html');
const contractOf = html => JSON.parse(
  html.match(/<script type="application\/json" id="publicLandingContract">([\s\S]*?)<\/script>/)[1]);
const manifest = contractOf(landing);
const productManifest = contractOf(product);
const PAGES = [[PUBLIC, landing], [PRODUCT, product]];

const PROOF = {
  'core-promise':        'scenario.test.js · the call is read locally and the open boundary is the only thing asked',
  'transcript-input':    'transcript.test.js · reading a transcript needs no network at all',
  'candidate-evidence':  'transcript.test.js · a local candidate carries its sentence, ' +
                         'its speaker and its confidence',
  'evidence-approval':   'transcript.test.js · rejecting a row keeps it out of the state',
  'mechanism-proof':     'transcript.test.js · the local path can reach a client-sourced ' +
                         'provenance, not only mine',
  'pricing-authority':   'landing.test.js · the public page defines no second commercial price',
  'product-vs-demo':     'landing.test.js · the public page labels its explanation as non-authoritative',
  'pilot-price':         'landing.test.js · the public page and the paywall agree on the price',
  'field-proof-pending': 'landing.test.js · the public page states no outcome number before FIELD'
};

console.log('\npublic claims');

test('every visible claim is governed and every governed claim is visible', () => {
  const onPage = [...new Set([...landing.matchAll(/data-claim-id="([^"]+)"/g)].map(m => m[1]))].sort();
  const governed = manifest.claims.map(c => c.id).sort();
  assert.deepStrictEqual(onPage, governed, 'public copy and public contract drifted');
});

test('every public claim carries a capability sentence', () => {
  const empty = manifest.claims.filter(c => !c.capability || c.capability.length < 20).map(c => c.id);
  assert.deepStrictEqual(empty, [], 'empty capability: ' + empty.join(', '));
});

test('every public claim names a real passing product test', () => {
  const missing = manifest.claims.map(c => c.id).filter(id => !(id in PROOF));
  assert.deepStrictEqual(missing, [], 'no proof mapping: ' + missing.join(', '));
  const broken = [];
  Object.entries(PROOF).forEach(([claim, proof]) => {
    const [file, name] = proof.split(' · ');
    const suite = path.join(root, 'assets', file);
    if (!fs.existsSync(suite)) return broken.push(claim + ' → no suite ' + file);
    if (!fs.readFileSync(suite, 'utf8').includes(name)) broken.push(claim + ' → test name not found: ' + name);
  });
  assert.deepStrictEqual(broken, [], 'broken proof map:\n' + broken.join('\n'));
});

test('research-only readiness claims stay off the public page until the shipped journey uses them', () => {
  ['commitment-gate', 'decision-episodes', 'handoff-valid'].forEach(id => {
    [[PUBLIC, landing, manifest], [PRODUCT, product, productManifest]].forEach(([name, html, m]) => {
      assert.ok(!m.claims.some(c => c.id === id), name + ': ' + id + ' leaked into the public contract');
      assert.ok(!html.includes('data-claim-id="' + id + '"'), name + ': ' + id + ' leaked into public copy');
    });
  });
});

console.log('\nclaim -> capability -> reachable journey');

const loaded = [...postcall.matchAll(/<script src="assets\/([^"]+)"/g)].map(m => 'assets/' + m[1]);
const REACHABLE = {
  'core-promise':       ['assets/pc-transcript.js', 'assets/pc-proposal.js', 'assets/post-call.js'],
  'transcript-input':   ['assets/pc-transcript.js', 'assets/post-call.js'],
  'candidate-evidence': ['assets/pc-transcript.js', 'assets/post-call.js'],
  'evidence-approval':  ['assets/pc-transcript.js', 'assets/post-call.js'],
  'mechanism-proof':    ['assets/pc-transcript.js', 'assets/post-call.js'],
  'pricing-authority':  ['assets/model.js', 'assets/post-call.js'],
  'pilot-price':        ['assets/pc-gate.js', 'assets/post-call.js']
};

test('every runtime claim depends only on modules the shipped POST-CALL actually loads', () => {
  const missing = [];
  Object.entries(REACHABLE).forEach(([claim, modules]) => modules.forEach(m => {
    if (!loaded.includes(m)) missing.push(claim + ' → ' + m);
  }));
  assert.deepStrictEqual(missing, [], 'proved module exists but user journey cannot reach it:\n' + missing.join('\n'));
});

test('the public page hands the user to the shipped POST-CALL, not to a demo clone', () => {
  const links = [...landing.matchAll(/href="([^"]*post-call\.html)"/g)].map(m => m[1]);
  assert.ok(links.length >= 2, 'the main CTA does not reach post-call.html');
  assert.ok(!/pc-commitments\.js/.test(landing), 'the marketing page is loading the research readiness engine instead of handing off to the product');
});

console.log('\npublic-page release safety');

test('every public landing is CSP-safe under the production policy', () => {
  PAGES.forEach(([name, html]) => {
    const withoutData = html.replace(/<script type="application\/json" id="publicLandingContract">[\s\S]*?<\/script>/, '');
    assert.ok(!/<style[\s>]/i.test(withoutData), name + ': inline <style> is blocked by style-src self');
    assert.ok(!/<script(?!\s+src=)[^>]*>/i.test(withoutData), name + ': inline executable <script> is blocked by script-src self');
    assert.ok(!/\sstyle="/i.test(withoutData), name + ': inline style= is blocked by CSP');
    assert.ok(!/\son\w+="/i.test(withoutData), name + ': inline event handlers are blocked by CSP');
    assert.ok(/href="assets\/entry\.css"/.test(html), name + ': the page has no external stylesheet');
  });
});

test('every public landing can survive a WhatsApp share', () => {
  PAGES.forEach(([name, html]) => {
    ['og:title','og:description','og:image','og:url','og:type'].forEach(t =>
      assert.ok(html.includes('property="' + t + '"'), name + ': missing ' + t));
    assert.ok(/<meta name="description" content="[^"]{60,}"/.test(html), name + ': description is too short');
    assert.ok(/rel="icon"/.test(html), name + ': no icon');
    assert.ok(/rel="canonical"/.test(html), name + ': no canonical URL');
  });
});

test('the two public landings do not claim the same canonical URL', () => {
  const url = h => (h.match(/rel="canonical" href="([^"]+)"/) || [])[1];
  assert.notStrictEqual(url(landing), url(product),
    'two pages pointing at one canonical is one of them telling search engines it does not exist');
});

test('the old target contract remains research-only rather than becoming a second public landing', () => {
  const ignored = read('.vercelignore').split('\n').map(l => l.trim()).some(l => l === 'landing/' || l === TARGET);
  assert.ok(ignored, 'the target contract is no longer isolated from production');
  assert.ok(/noindex,nofollow/.test(target), 'the target contract is no longer marked research-only');
});

console.log('\ncommercial truth');

test('the public page defines no second commercial price', () => {
  const block = landing.match(/data-demo-pricing="illustrative"[^>]*>([\s\S]*?)<\/span>/);
  assert.ok(block, 'no explicit non-authoritative pricing explanation');
  assert.deepStrictEqual(block[1].match(/₪\s*[\d,]+/g) || [], [], 'the explanation block prints a price of its own');
  assert.ok(/מנוע התמחור/.test(block[1]), 'the explanation does not hand authority back to the product engine');
});

test('the public page labels its explanation as non-authoritative', () => {
  assert.ok(/data-demo-pricing="illustrative"/.test(landing), 'the explanation is not marked non-authoritative');
});

test('the public page and the paywall agree on the price', () => {
  const wall = postcall.match(/id="wallPrice"[^>]*>([^<]+)</);
  assert.ok(wall, 'post-call.html no longer exposes #wallPrice');
  const amount = wall[1].replace('₪', '').trim();
  assert.ok([...landing.matchAll(/₪(\d+)/g)].some(m => m[1] === amount), 'paywall says ' + wall[1] + ' and the public page disagrees');
  assert.ok(/₪0/.test(landing), 'free-until-export is missing');
});

test('the public page states no outcome number before FIELD', () => {
  const card = landing.match(/data-claim-id="field-proof-pending"[\s\S]*?<\/article>/)[0];
  const numbers = card.match(/\d+\s*%|פי\s*\d+|×\s*\d+/g) || [];
  assert.deepStrictEqual(numbers, [], 'unmeasured outcome claim: ' + numbers.join(', '));
});

console.log('\ncontact route');

test('every public page reads the one buyer route instead of copying it', () => {
  const route = read('assets/pc-contact.js').match(/const ROUTE = '([^']*)'/)[1];
  assert.ok(route, 'pc-contact.js has no route');
  PAGES.forEach(([name, html]) => {
    assert.ok(/<script src="assets\/pc-contact\.js"><\/script>/.test(html), name + ': pc-contact.js is not loaded');
    assert.ok(/data-contact-route/.test(html), name + ': no contact CTA');
    assert.ok(/data-contact-message/.test(html), name + ': contact CTA has no page-specific opener');
    assert.ok(!html.includes(route), name + ': the route is copied into the public HTML');
  });
  assert.ok(/querySelectorAll\('\[data-contact-route\]'\)/.test(read('assets/pc-contact.js')), 'pc-contact.js exposes a route but does not wire public contact links');
});

console.log('\nthe system landing');

/* Its own map, because it makes claims post-call-landing does not: the two
   halves joining, and the ledger reaching back into the next call's script.
   That last one is the reason this page exists — it is the part of the device
   a proposal generator has no equivalent of — and it is also the claim this
   repository most recently got wrong in the other direction, having stated in
   the README that no such path existed. It does, it is loaded on the page that
   uses it, and it has had tests since it was written. */
const PRODUCT_PROOF = {
  'two-tools-one-ledger':     'landing.test.js · the ledger reaches the next call in the shipped journey',
  'pre-call-prepares':        'pre-call.test.js · a filled f_what is enough to build',
  'post-call-prices':         'scenario.test.js · the work is ready and the value claim is not',
  'pricing-authority':        'model.test.js · every method it can return is one the engine can actually price',
  'ledger-informs-next-call': 'pre-call.test.js · a discount the operator offered unasked is named before the call, not after',
  'ledger-not-just-output':   'pre-call.test.js · a price that has never moved is reported as untested, not as a good record',
  'handoff-is-manual':        'landing.test.js · nothing carries from PRE-CALL to POST-CALL on its own',
  'pilot-price':              'landing.test.js · the system landing agrees with the paywall on the price',
  'field-proof-pending':      'landing.test.js · the system landing states no outcome number before FIELD',
  'fit':                      'model.test.js · no client numbers -> no value method, tool still prices'
};

/* A limitation is a claim, and it needs the same treatment as any other. This
   one pins the absence: version 1.0 of the page said preparation was derived
   from what pricing would require and that the two halves were one system, and
   neither was true — PRE-CALL asks about the pain and who holds it, the engine
   prices frequency, handling time and incidents, and no code carries anything
   between them. Stating that on the page is only worth something if something
   notices when it stops being true, so if the path is ever built this fails and
   the copy has to be rewritten rather than quietly becoming understated. */
test('nothing carries from PRE-CALL to POST-CALL on its own', () => {
  const PRE_KEY = 'precall_profile_v1';
  /* Scoped to what POST-CALL loads, because that is the claim. entry.js reads
     the same key and is not a counter-example: it is the routing screen, it is
     not on post-call.html, and its own comment says it takes a count and a
     name and never the contents. Naming it in an exclusion list would have
     been a guess dressed as a rule; asking which page loads it is the rule. */
  const onPostCall = [...postcall.matchAll(/<script src="assets\/([^"]+)"/g)].map(m => m[1]);
  const consumers = onPostCall
    .filter(f => read('assets/' + f).includes(PRE_KEY))
    /* pc-backup.js is exempt only while its mention stays inside the key list
       it bundles into a downloadable file. That is an export of everything the
       browser holds, not a path between the tools — and if it ever reads the
       profile for any other purpose, this stops exempting it. */
    .filter(f => !(f === 'pc-backup.js' &&
      /DATA_KEYS = \[[^\]]*precall_profile_v1[^\]]*\]/.test(read('assets/' + f)) &&
      read('assets/' + f).split(PRE_KEY).length === 2));
  assert.deepStrictEqual(consumers, [],
    'the page says PRE-CALL hands POST-CALL nothing, and these read its store: ' +
    consumers.join(', '));
});

test('every claim on the system landing is governed, and every governed one is visible', () => {
  const onPage = [...new Set([...product.matchAll(/data-claim-id="([^"]+)"/g)].map(m => m[1]))].sort();
  assert.deepStrictEqual(onPage, productManifest.claims.map(c => c.id).sort(),
    'system copy and system contract drifted');
});

test('every system claim carries a capability sentence and a real passing test', () => {
  const empty = productManifest.claims.filter(c => !c.capability || c.capability.length < 20).map(c => c.id);
  assert.deepStrictEqual(empty, [], 'empty capability: ' + empty.join(', '));
  const broken = [];
  productManifest.claims.map(c => c.id).forEach(id => {
    const proof = PRODUCT_PROOF[id];
    if (!proof) return broken.push(id + ' → no proof mapping');
    const [file, name] = proof.split(' · ');
    const suite = path.join(root, 'assets', file);
    if (!fs.existsSync(suite)) return broken.push(id + ' → no suite ' + file);
    if (!fs.readFileSync(suite, 'utf8').includes(name)) broken.push(id + ' → test name not found: ' + name);
  });
  assert.deepStrictEqual(broken, [], 'broken proof map:\n' + broken.join('\n'));
});

/* The reachability half, for the claim the whole page turns on. A test that
   only proved tenure() returns the right sentences would pass just as well if
   PRE-CALL never loaded the ledger — which is exactly the shape of mistake
   this file exists to catch, and exactly the one that produced a wrong line in
   the README: the loop was verified by searching for storage keys rather than
   for the call, and the call goes through the module's own API. */
test('the ledger reaches the next call in the shipped journey', () => {
  const scripts = [...precall.matchAll(/<script src="assets\/([^"]+)"/g)].map(m => m[1]);
  assert.ok(scripts.includes('deals.js'),
    'pre-call.html does not load the ledger, so nothing it says can depend on one');
  assert.ok(scripts.indexOf('deals.js') < scripts.indexOf('pre-call.js'),
    'the ledger loads after the script that reads it — classic scripts run in document order');
  assert.ok(/PC\.deals\.tenure\s*\(/.test(read('assets/pre-call.js')),
    'pre-call.js no longer asks the ledger anything');
  assert.ok(/tenure\s*\(\s*\)\s*\{/.test(read('assets/deals.js')),
    'deals.js no longer offers the summary PRE-CALL reads');
});

test('the system landing hands the user to the product, not to a demo', () => {
  assert.ok(/href="index\.html"/.test(product), 'the main CTA does not reach the product');
  assert.ok(/href="post-call-landing\.html"/.test(product),
    'the deeper POST-CALL page is unreachable from the layer above it');
  assert.ok(!/pc-commitments\.js/.test(product),
    'the marketing page is loading the research readiness engine instead of handing off');
});

test('the system landing agrees with the paywall on the price', () => {
  const wall = postcall.match(/id="wallPrice"[^>]*>([^<]+)</);
  const amount = wall[1].replace('₪', '').trim();
  assert.ok([...product.matchAll(/₪(\d+)/g)].some(m => m[1] === amount),
    'paywall says ' + wall[1] + ' and the system landing disagrees');
});

test('the system landing states no outcome number before FIELD', () => {
  const card = product.match(/data-claim-id="field-proof-pending"[\s\S]*?<\/article>/)[0];
  const numbers = card.match(/\d+\s*%|פי\s*\d+|×\s*\d+/g) || [];
  assert.deepStrictEqual(numbers, [], 'unmeasured outcome claim: ' + numbers.join(', '));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
