/* node assets/client.test.js — no browser, no deps.

   These inferences rewrite payment terms, add clauses and can remove the ROI
   paragraph from a document that goes to a paying client. A heuristic with
   that much reach gets tested harder than the arithmetic does. */
const C = require('./pc-client.js');
const assert = require('assert');

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

const read = o => C.read(o);
const adapt = o => C.adapt(C.read(o));

console.log('\nsize');
test('an ERP or a billing system means somebody else handles the money', () => {
  assert.strictEqual(read({ systems: ['ERP', 'אימייל'] }).size, 'mid');
  assert.strictEqual(read({ systems: ['מערכת סליקה'] }).size, 'mid');
});
test('five systems in one process is not a two-person business', () => {
  assert.strictEqual(read({ systems: ['וואטסאפ','אימייל','Excel','CRM','אתר / טפסים'] }).size, 'mid');
});
test('high volume alone is enough', () => {
  assert.strictEqual(read({ systems: ['וואטסאפ'], freq: 100, freqUnit: 365 }).size, 'mid');
});
test('few systems and low volume reads as a small operation', () => {
  assert.strictEqual(read({ systems: ['וואטסאפ','אימייל'], freq: 5, freqUnit: 52 }).size, 'solo');
});
test('the middle case is not forced into an extreme', () => {
  assert.strictEqual(read({ systems: ['וואטסאפ','CRM','אימייל'], freq: 40, freqUnit: 52 }).size, 'small');
});

console.log('\nwho decides');
test('reads a single decider from how it was phrased', () => {
  ['אף אחד, אני מחליט', 'רק אני', 'אני הבעלים'].forEach(d =>
    assert.strictEqual(read({ decider: d }).decision, 'single', d));
});
test('reads a committee', () => {
  ['ההנהלה', 'מחלקת רכש', 'אני והשותף וההנהלה'].forEach(d =>
    assert.strictEqual(read({ decider: d }).decision, 'committee', d));
});
test('an unrecognised answer is shared, not guessed as single', () => {
  assert.strictEqual(read({ decider: 'דנה מהמשרד' }).decision, 'shared');
});
test('an empty field stays unknown rather than defaulting to convenient', () => {
  assert.strictEqual(read({}).decision, 'unknown');
});

console.log('\nconfidence');
test('nothing filled reports no confidence', () => {
  assert.strictEqual(read({}).confidence, 0);
});
test('confidence rises with the number of signals actually present', () => {
  const thin = read({ systems: ['וואטסאפ'] });
  const thick = read({ systems: ['ERP'], freq: 20, freqUnit: 52, decider: 'ההנהלה',
                       provenance: 'unprompted', prev: 'ניסינו' });
  assert.ok(thick.confidence > thin.confidence);
  assert.strictEqual(thick.confidence, 1);
});
test('a read always says what it was based on', () => {
  const p = read({ systems: ['ERP'], decider: 'ההנהלה' });
  assert.ok(p.evidence.length, 'an inference with no stated basis cannot be checked');
});

console.log('\nwhat it changes in the document');
test('a committee gets a longer validity window', () => {
  const a = adapt({ decider: 'ההנהלה' });
  assert.strictEqual(a.validityDays, 21);
  assert.ok(a.changes.some(c => /21 יום/.test(c)));
});
test('a single decider keeps the short window', () => {
  assert.strictEqual(adapt({ decider: 'רק אני' }).validityDays, 14);
});
test('an organisation gets payment terms and a purchase order', () => {
  const a = adapt({ systems: ['ERP'] });
  assert.ok(/שוטף\+30/.test(a.terms));
  assert.ok(/הזמנת רכש/.test(a.terms));
  assert.ok(a.clauses.some(c => c.id === 'access'), 'access is the thing that delays them');
});
test('a small business keeps the simple terms', () => {
  const a = adapt({ systems: ['וואטסאפ','אימייל'], freq: 5, freqUnit: 52 });
  assert.ok(!/שוטף/.test(a.terms));
  assert.strictEqual(a.clauses.length, 0);
});
test('a number the operator invented is not quoted back at the client', () => {
  const a = adapt({ provenance: 'mine' });
  assert.strictEqual(a.suppressRoi, true);
  assert.ok(a.changes.some(c => /ROI/.test(c)));
  assert.ok(a.focus.includes('q_provenance'));
});
test('a number the client volunteered is kept', () => {
  assert.strictEqual(adapt({ provenance: 'unprompted' }).suppressRoi, false);
});
test('a number that appeared on request is kept but flagged for attention', () => {
  const a = adapt({ provenance: 'prompted' });
  assert.strictEqual(a.suppressRoi, false, 'suppressing it would overreach — it may be real');
  assert.ok(a.focus.includes('q_provenance'));
});
test('someone burned before gets a handover clause, not a reassuring sentence', () => {
  const a = adapt({ prev: 'קנינו תוסף ואף אחד לא הטמיע' });
  const h = a.clauses.find(c => c.id === 'handover');
  assert.ok(h, 'no handover clause');
  assert.ok(/על שמכם|בעצמכם/.test(h.p), 'the clause has to actually transfer something');
});
test('nothing known changes nothing', () => {
  const a = adapt({});
  assert.strictEqual(a.validityDays, 14);
  assert.strictEqual(a.suppressRoi, false);
  assert.deepStrictEqual(a.clauses, []);
  assert.deepStrictEqual(a.changes, [], 'silence is the correct output for no evidence');
});
test('every change is explained, never applied silently', () => {
  [{ decider: 'ההנהלה' }, { systems: ['ERP'] }, { provenance: 'mine' }, { prev: 'x' }]
    .forEach(sig => {
      const a = adapt(sig);
      const changed = a.validityDays !== 14 || a.suppressRoi ||
                      a.clauses.length || a.terms.includes('שוטף');
      if (changed) assert.ok(a.changes.length,
        'changed the document with nothing to show the operator: ' + JSON.stringify(sig));
    });
});
test('focus lists no duplicates', () => {
  const f = adapt({ provenance: 'mine', prev: 'x', decider: 'ההנהלה', trigger: 'y' }).focus;
  assert.strictEqual(new Set(f).size, f.length);
});

console.log('\noverride');
test('an override wins over the inference', () => {
  const auto = read({ systems: ['ERP'] });
  assert.strictEqual(auto.size, 'mid');
  assert.strictEqual(C.applyOverride(auto, 'solo').size, 'solo');
});
test('an override says it was manual instead of showing stale evidence', () => {
  const p = C.applyOverride(read({ systems: ['ERP'] }), 'small');
  assert.ok(p.overridden);
  assert.ok(!p.evidence.some(e => /ERP/.test(e)), 'evidence for a read no longer in effect');
});
test('overriding to an organisation also changes the terms', () => {
  const p = C.applyOverride(read({ systems: ['וואטסאפ'], freq: 5, freqUnit: 52 }), 'mid');
  assert.ok(/שוטף\+30/.test(C.adapt(p).terms));
});
test('auto leaves the profile untouched', () => {
  const p = read({ systems: ['ERP'] });
  assert.strictEqual(C.applyOverride(p, 'auto'), p);
  assert.strictEqual(C.applyOverride(p, null), p);
});
test('reading twice from the same signals gives the same answer', () => {
  const sig = { systems: ['ERP','CRM'], freq: 20, freqUnit: 52, decider: 'ההנהלה',
                provenance: 'mine', prev: 'x' };
  assert.deepStrictEqual(read(sig), read(sig));
  assert.deepStrictEqual(adapt(sig), adapt(sig));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
