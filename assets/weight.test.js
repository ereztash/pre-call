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
   changed enough that somebody should say out loud whether they meant to".

   Budgeted on compressed bytes, because that is what the user pays. This
   file used to budget on raw bytes and the difference is not a rounding
   error: post-call.html is 321KB written and 95KB over the wire, so the
   old ceiling overstated a visitor's cost by 3.4x. It also made the wrong
   thing expensive — a third of what this project ships is comments, and
   they compress to almost nothing, so budgeting raw quietly taxed the
   documentation and let a real dependency in under the same number.

   Raw weight is still reported on every run. It is the honest signal for
   "is this file getting out of hand as a thing to read", which is a real
   question; it is just not the question a transfer budget answers. */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
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
   stylesheet and script it links.

   Test files are not counted here, and the first version of this comment
   also said they "are not shipped". That half was wrong for the whole life
   of the project: fetching /assets/model.test.js in production answered
   200. A file being deployed and a file being loaded are different things,
   and only the second was ever measured — so the budget was honest and the
   sentence next to it was not. .vercelignore now makes the sentence true,
   and markup.test.js asserts the list stays complete. */
function pageWeight(page) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  const assets = [
    ...[...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]),
    ...[...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m => m[1])
  ];
  const parts = assets.map(a => ({ f: a, bytes: size(a), wire: wire(a) }));
  const total = parts.reduce((s, p) => s + p.bytes, 0) + size(page);
  const overWire = parts.reduce((s, p) => s + p.wire, 0) + wire(page);
  return { total, overWire, parts, assets };
}

/* brotli, which every browser this product supports has accepted for
   years and which the host negotiates by default. gzip is ~20% larger and
   would be the pessimistic figure; brotli is what actually gets sent. */
function wire(f) {
  return zlib.brotliCompressSync(fs.readFileSync(path.join(root, f))).length;
}

/* Per page, because the entry page is the one a first-time visitor pays
   for before they have decided the product is worth anything. It has a
   much tighter ceiling than the working surfaces on purpose. */
/* 16 → 21 on the two small pages, 48 → 54 and 136 → 142 on the tools,
   all on the same day and all for the same capability: a dark theme and
   a second language. What every page now carries: pc-boot.js (theme and
   direction before first paint), theme.css (the dark ramp), pc-i18n.js
   (the dictionary runtime and the preferences strip) — about 5KB over
   the wire together. What no page carries: the English dictionaries
   themselves, which pc-boot.js loads only after the visitor chooses
   English, so the default Hebrew visit pays for the toggle and not for
   the translation. That split is the difference between a 5KB raise and
   a 15KB one, and it is asserted by the orphan-module test in
   assets/markup.test.js. */
/* A third raise on the tools, and this one is named rather than absorbed:
   the tr() seam and its Hebrew keys, the tablist wiring, the skip links and
   the prefers-contrast block. The dictionaries themselves are still not in
   any of these numbers — a Hebrew visit does not download them — so what
   grew is the product, not the translation. accessibility.html is a new
   page and gets the small-page ceiling the other static page has.

   A fourth raise, 146 → 148KB, landed the same day every remaining
   POST-CALL module (pc-followup, pc-gate, pc-history, pc-ledger,
   pc-proposal, pc-transcript) finished crossing the tr() seam — the
   wrapper itself, once per module, plus every Hebrew literal now sitting
   inside a function call instead of a bare string. That is the seam's
   fixed cost, paid once per file and paid by every visitor regardless of
   language, which is exactly the kind of growth this budget exists to
   surface rather than hide: 0.2KB over on the old ceiling, for finishing
   the second language.

   A fifth raise, 148 → 150KB, is the logo field on the sender box — a
   file picker, a preview, a size-checked upload path, and the <img> and
   CSS to print it beside the name. Every other proposal tool in the
   category ships this; this is the smallest version of it that fits an
   architecture with no server to resize an image on, which is why the
   feature is "pick a file under 60KB" rather than "upload anything and
   we will handle it". The 60KB itself never touches this budget — it
   lives in localStorage, not in a shipped asset. */
const BUDGETS = {
  'index.html':          21 * 1024,
  'privacy.html':        21 * 1024,
  'accessibility.html':  21 * 1024,
  'pre-call.html':       58 * 1024,
  /* 120 → 128 → 136KB, and the second raise happened the same day as the first,
     which is worth saying plainly rather than burying: a budget moved twice in a
     day by 13% is not holding anything back yet.

     What landed in between, all of it real: three journal verbs and the funnel
     derivation, the panel that reads them, the parser for the date the client
     named, and the iCalendar split. That last one is the reason to trust the
     rest — pre-call.html was over its own budget at 48.7KB, and instead of
     raising it the module it was loading for one function got split, which took
     that page to 45.4KB. Splitting is what the accidental case looks like when
     it is found; raising is for the case where the page does more.

     The line to hold: if this page needs a third raise without a matching
     capability, the growth has stopped being features and the trim is overdue.
     index.html and pre-call.html keep their tight ceilings either way — they are
     what a first visit pays for. */
  'post-call.html':     150 * 1024
};

console.log('\nper-page transfer weight, compressed as it is served');
const measured = {};
for (const [page, budget] of Object.entries(BUDGETS)) {
  test(page + ' stays under ' + kb(budget) + 'KB over the wire', () => {
    const w = pageWeight(page);
    measured[page] = w;
    const worst = [...w.parts].sort((a, b) => b.wire - a.wire).slice(0, 3)
      .map(p => p.f + ' ' + kb(p.wire) + 'KB').join(', ');
    assert.ok(w.overWire <= budget,
      page + ' is ' + kb(w.overWire) + 'KB compressed (' + kb(w.total) + 'KB raw), over the ' +
      kb(budget) + 'KB budget. Heaviest: ' + worst + '. Raise the budget deliberately or trim.');
  });
}

/* Raw weight is not budgeted, and it is still worth seeing: it is what a
   person reading this repository has to wade through, which is a real
   cost even though it is not the visitor's. */
test('the raw-to-wire ratio is reported, not assumed', () => {
  Object.entries(BUDGETS).forEach(([page]) => {
    const w = measured[page] || pageWeight(page);
    console.log('       ' + page.padEnd(17) + kb(w.overWire).toString().padStart(6) + 'KB wire   ' +
      kb(w.total).toString().padStart(6) + 'KB raw   ' +
      Math.round(w.overWire / w.total * 100) + '%');
  });
});

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
