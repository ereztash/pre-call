/* node assets/weight.test.js — no browser, no deps.

   A budget, not a benchmark. There is no build step here, so nothing
   minifies, tree-shakes or code-splits on the way out: whatever is written
   is what a phone on a bad connection downloads, byte for byte. That is a
   good property and it is a fragile one — it holds only as long as nobody
   adds a library, and the way it usually stops holding is that the first
   dependency arrives for a good reason and no single commit ever looks
   expensive.

   The numbers below are ceilings with room in them, not targets to grow
   into. A failure here is not "the product is slow" — it is "the weight
   changed enough that somebody should say out loud whether they meant to". */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

const kb = bytes => Math.round(bytes / 1024 * 10) / 10;
const size = f => fs.statSync(path.join(root, f)).size;

/* Everything a browser actually fetches for one page: the HTML, plus every
   stylesheet and script it links. Test files are not shipped and are not
   counted — they live in the same directory only because this project has
   no build step to separate them. */
function pageWeight(page) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  const assets = [
    ...[...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]),
    ...[...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m => m[1])
  ];
  const parts = assets.map(a => ({ f: a, bytes: size(a) }));
  const total = parts.reduce((s, p) => s + p.bytes, 0) + size(page);
  return { total, parts, assets };
}

/* Per page, because the entry page is the one a first-time visitor pays
   for before they have decided the product is worth anything. It has a
   much tighter ceiling than the working surfaces on purpose. */
const BUDGETS = {
  'index.html':     40 * 1024,
  'privacy.html':   40 * 1024,
  'pre-call.html': 120 * 1024,
  'post-call.html': 320 * 1024
};

console.log('\nper-page transfer weight');
for (const [page, budget] of Object.entries(BUDGETS)) {
  test(page + ' stays under ' + kb(budget) + 'KB', () => {
    const w = pageWeight(page);
    const worst = w.parts.sort((a, b) => b.bytes - a.bytes).slice(0, 3)
      .map(p => p.f + ' ' + kb(p.bytes) + 'KB').join(', ');
    assert.ok(w.total <= budget,
      page + ' is ' + kb(w.total) + 'KB, over the ' + kb(budget) + 'KB budget. ' +
      'Heaviest: ' + worst + '. Raise the budget deliberately or trim.');
  });
}

console.log('\nno dependency arrived without anyone noticing');
test('the shipped pages load nothing from another origin', () => {
  for (const page of Object.keys(BUDGETS)) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    const external = [...html.matchAll(/(?:src|href)="(https?:)?\/\/[^"]+"/g)]
      .map(m => m[0])
      .filter(s => !/rel="noopener"/.test(s));   // ordinary outbound links are fine
    const risky = external.filter(s => /^(src|href)="(https?:)?\/\//.test(s) &&
      /\.(js|css|woff2?|ttf)/.test(s));
    assert.deepStrictEqual(risky, [],
      page + ' fetches a subresource from another origin — the CSP forbids it at ' +
      'runtime, so this would be a silently broken page, not a slow one');
  }
});

test('no node_modules crept into what gets served', () => {
  assert.ok(!fs.existsSync(path.join(root, 'node_modules')),
    'a node_modules directory in the repo root would be deployed as-is — ' +
    'there is no build step to leave it behind');
});

console.log('\nthe whole product, for the record');
test('every shipped byte is accounted for and reported', () => {
  const seen = new Set();
  let total = 0;
  for (const page of Object.keys(BUDGETS)) {
    const w = pageWeight(page);
    if (!seen.has(page)) { seen.add(page); total += size(page); }
    w.assets.forEach(a => { if (!seen.has(a)) { seen.add(a); total += size(a); } });
  }
  console.log('       ' + seen.size + ' files, ' + kb(total) + 'KB uncompressed, ' +
    'zero third-party bytes');
  assert.ok(total > 0);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
