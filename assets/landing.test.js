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
const TARGET = 'landing/post-call.html';
const landing = read(PUBLIC);
const target = read(TARGET);
const postcall = read('post-call.html');
const manifest = JSON.parse(
  landing.match(/<script type="application\/json" id="publicLandingContract">([\s\S]*?)<\/script>/)[1]);

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
    assert.ok(!manifest.claims.some(c => c.id === id), id + ' leaked into the public contract');
    assert.ok(!landing.includes('data-claim-id="' + id + '"'), id + ' leaked into public copy');
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

test('the public landing is CSP-safe under the production policy', () => {
  const withoutData = landing.replace(/<script type="application\/json" id="publicLandingContract">[\s\S]*?<\/script>/, '');
  assert.ok(!/<style[\s>]/i.test(withoutData), 'inline <style> is blocked by style-src self');
  assert.ok(!/<script(?!\s+src=)[^>]*>/i.test(withoutData), 'inline executable <script> is blocked by script-src self');
  assert.ok(!/\sstyle="/i.test(withoutData), 'inline style= is blocked by CSP');
  assert.ok(!/\son\w+="/i.test(withoutData), 'inline event handlers are blocked by CSP');
  assert.ok(/href="assets\/entry\.css"/.test(landing), 'the page has no external stylesheet');
});

test('the public landing can survive a WhatsApp share', () => {
  ['og:title','og:description','og:image','og:url','og:type'].forEach(t => assert.ok(landing.includes('property="' + t + '"'), 'missing ' + t));
  assert.ok(/<meta name="description" content="[^"]{60,}"/.test(landing), 'description is too short');
  assert.ok(/rel="icon"/.test(landing), 'no icon');
  assert.ok(/rel="canonical"/.test(landing), 'no canonical URL');
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

test('the public page reads the one buyer route instead of copying it', () => {
  assert.ok(/<script src="assets\/pc-contact\.js"><\/script>/.test(landing), 'pc-contact.js is not loaded');
  assert.ok(/data-contact-route/.test(landing), 'no contact CTA');
  assert.ok(/data-contact-message/.test(landing), 'contact CTA has no page-specific opener');
  const route = read('assets/pc-contact.js').match(/const ROUTE = '([^']*)'/)[1];
  assert.ok(route, 'pc-contact.js has no route');
  assert.ok(!landing.includes(route), 'the route is copied into the public HTML');
  assert.ok(/querySelectorAll\('\[data-contact-route\]'\)/.test(read('assets/pc-contact.js')), 'pc-contact.js exposes a route but does not wire public contact links');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
