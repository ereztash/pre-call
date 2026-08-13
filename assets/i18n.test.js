/* node assets/i18n.test.js — no browser, no deps.

   The English overlay is a dictionary keyed by the Hebrew it replaces
   (assets/pc-i18n.js), which leaves it one failure mode: a Hebrew
   string ships, the dictionary does not know it, and the English page
   quietly shows Hebrew in the middle of a sentence. Nothing crashes.
   Nobody files a bug. The product just looks abandoned to exactly the
   audience the second language was built for.

   So the dictionary is held to the files, not to good intentions:
   every translatable unit the pages and modules ship must have an
   English entry, every English entry must correspond to something that
   still exists (a translation of deleted copy is debt wearing a seat
   belt), and a converted module may not carry Hebrew that bypasses
   tr() unless the bypass is named here with its reason. */
const assert = require('assert');
const X = require('../tools/i18n-extract.js');

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

const HEB = /[֐-׿]/;
const plan = X.pagePlan();

/* Hebrew that is allowed to bypass tr(), each with the reason it must.
   Parser patterns have to match what a MODEL was asked to emit or what
   a USER pasted — translating them breaks the parse, not the prose. */
const EXEMPT = {
  'assets/pre-call.js': [
    /* KNOWN_LABELS and the field extractors match the profile format the
       business prompt asks the model to return. The prompt ships in both
       languages and the parser recognises both label sets; the Hebrew
       set is the one that cannot go through tr() — it IS the format. */
    (s) => /^(מה אני מוכר|למי|יחידה תחומה|מחיר היחידה|עסקה אחרונה|מקור הלקוח האחרון|מה הלקוח הרוויח|מה רק אני רואה|מה אני לא מוכר):?$/.test(s.replace(/:\s*$/, ':')),
  ],
  'assets/pc-transcript.js': [
    /* UNIT_VALUES keys: the literal freqUnit words the extraction prompt
       asks the model to answer with, and the same words the local
       heuristic matches back out of a pasted answer. Translating the key
       would make the lookup track the UI language instead of whatever the
       model actually wrote — the English equivalents ('day'/'week'/
       'month') are already added alongside them as separate, untranslated
       keys in the same object, so both languages work at once. */
    (s) => s === 'יום' || s === 'שבוע' || s === 'חודש',
  ],
};

console.log('\nevery Hebrew unit the product ships has an English entry');
const allUnits = {}, allDicts = {};
for (const [page, cfg] of Object.entries(plan)) {
  test(page + ' — coverage', () => {
    const units = new Set([...X.htmlUnits(page)]);
    for (const f of cfg.modules) for (const u of X.jsUnits(f)) units.add(u);
    const dict = {};
    for (const d of cfg.dicts) Object.assign(dict, X.dictOf(d));
    allUnits[page] = units; allDicts[page] = dict;
    const missing = [...units].filter(u => !(u in dict));
    assert.deepStrictEqual(missing, [],
      missing.length + ' unit(s) with no English:\n         ' +
      missing.slice(0, 12).join('\n         '));
  });
}

console.log('\nthe English is English, and the parameters survive translation');
test('no Hebrew survives inside an English value', () => {
  const bad = [];
  for (const dict of Object.values(allDicts))
    for (const [k, v] of Object.entries(dict))
      if (HEB.test(v)) bad.push(v.slice(0, 60));
  assert.deepStrictEqual([...new Set(bad)], []);
});
test('every {param} in a key appears in its value, and none appear from nowhere', () => {
  const bad = [];
  for (const dict of Object.values(allDicts))
    for (const [k, v] of Object.entries(dict)) {
      const kp = (k.match(/\{\w+\}/g) || []).sort().join(',');
      const vp = (v.match(/\{\w+\}/g) || []).sort().join(',');
      if (kp !== vp) bad.push(k.slice(0, 50) + '  [' + kp + '] vs [' + vp + ']');
    }
  assert.deepStrictEqual(bad, []);
});
test('no English entry translates copy that no longer exists', () => {
  const live = new Set();
  for (const units of Object.values(allUnits)) for (const u of units) live.add(u);
  const bad = [];
  for (const dict of Object.values(allDicts))
    for (const k of Object.keys(dict)) if (!live.has(k)) bad.push(k.slice(0, 60));
  assert.deepStrictEqual([...new Set(bad)], [],
    'entries whose Hebrew key matches nothing shipped');
});

console.log('\nno module smuggles Hebrew around the dictionary');
const modules = [...new Set(Object.values(plan).flatMap(c => c.modules))];
for (const f of modules) {
  test(f.replace('assets/', ''), () => {
    const ex = EXEMPT[f] || [];
    const bare = X.bareHebrew(f).filter(s => !ex.some(rule => rule(s)));
    assert.deepStrictEqual(bare, [],
      bare.length + ' Hebrew literal(s) not passing through tr():\n         ' +
      bare.slice(0, 10).join('\n         '));
  });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
