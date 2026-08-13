/* What has to be translated, extracted from the shipped files.
   node tools/i18n-extract.js            # what is missing, per dictionary
   node tools/i18n-extract.js --all      # every unit, translated or not

   The English overlay in assets/pc-i18n.js translates three kinds of
   thing at runtime: text nodes, four read-aloud attributes, and the
   innerHTML of elements marked data-i18n. This file extracts the same
   three kinds from the same files with the same normalization, so
   assets/i18n.test.js can hold the dictionaries to them. If the walker
   and this extractor ever disagree about what counts as translatable,
   the coverage test is asserting the wrong contract — which is why both
   sides share PC.i18n.norm rather than each writing their own.

   Extraction is regex over markup, in the house style of
   tools/attention-report.js: deliberately crude, deliberately visible.
   The one convention it depends on: data-i18n goes on elements that do
   not nest their own tag name, so the non-greedy match below finds the
   real closing tag. */
const fs = require('fs');
const path = require('path');
const norm = require('../assets/pc-i18n.js').norm;

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const HEB = /[֐-׿]/;

/* ---------- HTML pages ---------- */

function htmlUnits(page) {
  let html = read(page)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');

  const units = new Set();

  const title = html.match(/<title>([^<]*)<\/title>/i);
  if (title && HEB.test(title[1])) units.add(norm(title[1]));

  /* data-i18n blocks leave the stream whole, so their inner tags are not
     mistaken for text boundaries */
  html = html.replace(/<(\w+)([^>]*\bdata-i18n\b[^>]*)>([\s\S]*?)<\/\1>/g,
    (m, tag, attrs, inner) => { units.add(norm(inner)); return ' '; });

  for (const m of html.matchAll(/(?:placeholder|aria-label|title|alt)="([^"]*)"/gi))
    if (HEB.test(m[1])) units.add(norm(m[1]));

  for (const m of html.matchAll(/>([^<]+)</g))
    if (HEB.test(m[1])) units.add(norm(m[1]));

  return units;
}

/* ---------- JS modules ---------- */

/* Everything a module hands to tr(). Three quote styles; backticks may
   span lines. The Hebrew inside the literal is the dictionary key,
   params and all — tr() interpolates {name} after lookup. */
function jsUnits(file) {
  const src = read(file).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const units = new Set();
  for (const m of src.matchAll(/\btr\(\s*'((?:[^'\\]|\\.)*)'/g)) units.add(norm(m[1].replace(/\\'/g, "'")));
  for (const m of src.matchAll(/\btr\(\s*"((?:[^"\\]|\\.)*)"/g)) units.add(norm(m[1].replace(/\\"/g, '"')));
  for (const m of src.matchAll(/\btr\(\s*`([^`]*)`/g)) units.add(norm(m[1]));
  return units;
}

/* Hebrew string literals a module ships that do NOT pass through tr() —
   the untranslated remainder. Modules listed as converted in
   assets/i18n.test.js must keep this at zero, minus their declared
   exemptions (parser labels that must match user paste, storage keys). */
function bareHebrew(file) {
  let src = read(file).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  /* remove every tr(...) literal, then look at what is left */
  src = src.replace(/\btr\(\s*'((?:[^'\\]|\\.)*)'/g, 'tr(')
           .replace(/\btr\(\s*"((?:[^"\\]|\\.)*)"/g, 'tr(')
           .replace(/\btr\(\s*`([^`]*)`/g, 'tr(');
  const out = [];
  for (const m of src.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`([^`]*)`/g)) {
    const lit = m[1] || m[2] || m[3] || '';
    if (HEB.test(lit)) out.push(norm(lit));
  }
  return out;
}

/* ---------- the dictionaries ---------- */

/* en-*.js files call PC.i18n.reg({...}). Evaluated here with a collector
   standing in for the real runtime, so the test reads exactly what the
   browser would register. */
function dictOf(file) {
  const collected = {};
  const src = read(file);
  const fn = new Function('PC', src);
  fn({ i18n: { reg: e => Object.assign(collected, e) } });
  const out = {};
  for (const k in collected) out[norm(k)] = collected[k];
  return out;
}

/* ---------- which page loads what ---------- */

/* Derived from the pages' own script tags rather than maintained by
   hand, so a module added to a page joins its translation contract on
   the same commit. The dictionary pairing mirrors the loader in
   assets/pc-boot.js: every page gets en-common.js plus its own file. */
const PAGE_DICT = {
  'index.html': ['assets/en-entry.js'],
  'pre-call.html': ['assets/en-pre-call.js'],
  'post-call.html': ['assets/en-post-call.js', 'assets/en-post-call-tools.js'],
  'privacy.html': ['assets/en-privacy.js']
};

function pagePlan() {
  const plan = {};
  for (const [page, dicts] of Object.entries(PAGE_DICT)) {
    const modules = [...read(page).matchAll(/<script src="(assets\/[^"]+)"/g)]
      .map(m => m[1])
      .filter(f => !/pc-boot|pc-i18n|en-[\w-]+\.js/.test(f));
    plan[page] = { modules, dicts: ['assets/en-common.js'].concat(dicts) };
  }
  return plan;
}

module.exports = { htmlUnits, jsUnits, bareHebrew, dictOf, norm, pagePlan };

/* ---------- CLI ---------- */
if (require.main === module) {
  const all = process.argv.includes('--all');
  for (const [page, cfg] of Object.entries(pagePlan())) {
    const units = new Set([...htmlUnits(page)]);
    for (const f of cfg.modules) for (const u of jsUnits(f)) units.add(u);
    const dict = {};
    for (const d of cfg.dicts) Object.assign(dict, dictOf(d));
    const missing = [...units].filter(u => !(u in dict));
    console.log('\n===== ' + page + ' — ' + units.size + ' units, ' +
      missing.length + ' missing from ' + cfg.dicts.join(' + '));
    for (const u of (all ? [...units] : missing)) console.log('  ' + u);
  }
}
