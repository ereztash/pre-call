/* node assets/catalog.test.js — no browser, no deps.

   The scope list and the templates are the product's content, not decoration:
   a template that names a scope row which no longer exists silently applies
   nothing, and the user gets a document missing the exclusion they were
   promised. That is not visible on screen — the row just sits at its default.
   So it is checked here. */
const C = require('./pc-catalog.js');
const assert = require('assert');

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

const ids = C.SCOPE_ITEMS.map(i => i.id);

console.log('\nscope rows');
test('every row has a unique id, text and a valid default', () => {
  assert.strictEqual(new Set(ids).size, ids.length, 'duplicate id: ' +
    ids.filter((x, i) => ids.indexOf(x) !== i));
  C.SCOPE_ITEMS.forEach(i => {
    assert.ok(i.t && i.t.trim(), i.id + ' has no text');
    assert.ok(['in','out','extra'].includes(i.d), i.id + ' has an invalid default: ' + i.d);
  });
});
test('a conditional row is hidden until its system is chosen', () => {
  const none = C.visibleScope(new Set()).map(i => i.id);
  const wa = C.visibleScope(new Set(['וואטסאפ'])).map(i => i.id);
  assert.ok(!none.includes('wa'), 'no WhatsApp clause in a job with no WhatsApp');
  assert.ok(wa.includes('wa'));
});
test('every conditional row is reachable by some system', () => {
  const all = new Set(C.SYSTEMS);
  const reachable = C.visibleScope(all).map(i => i.id);
  C.SCOPE_ITEMS.filter(i => i.when).forEach(i =>
    assert.ok(reachable.includes(i.id), i.id + ' can never appear'));
});
test('defaults produce a state covering every row', () => {
  const s = C.defaultScopeState();
  assert.deepStrictEqual(Object.keys(s).sort(), [...ids].sort());
});

console.log('\ntemplates');
test('each template is complete and uniquely identified', () => {
  const tids = C.TEMPLATES.map(t => t.id);
  assert.strictEqual(new Set(tids).size, tids.length);
  C.TEMPLATES.forEach(t => {
    ['name','blurb'].forEach(k =>
      assert.ok(t[k] && t[k].trim(), t.id + ' is missing ' + k));
    /* note is structured rather than prose since the notes were cut — the
       shape is asserted in full further down */
    assert.ok(t.note && t.note.moves && Object.keys(t.note.moves).length,
      t.id + ' has no note explaining its scope moves');
    assert.ok(t.systems.length, t.id + ' selects no systems');
    assert.ok(Object.keys(t.numbers).length, t.id + ' sets no numbers');
    assert.ok(Object.keys(t.fields).length, t.id + ' sets no text');
  });
});
test('every system a template names actually exists', () => {
  C.TEMPLATES.forEach(t => t.systems.forEach(s =>
    assert.ok(C.SYSTEMS.includes(s), t.id + ' names an unknown system: ' + s)));
});
test('every scope row a template overrides actually exists', () => {
  C.TEMPLATES.forEach(t => Object.entries(t.scope || {}).forEach(([id, v]) => {
    assert.ok(ids.includes(id), t.id + ' overrides an unknown row: ' + id);
    assert.ok(['in','out','extra'].includes(v), t.id + '.' + id + ' invalid state: ' + v);
  }));
});
test('a template only lists rows it actually changes', () => {
  const def = C.defaultScopeState();
  C.TEMPLATES.forEach(t => Object.entries(t.scope || {}).forEach(([id, v]) =>
    assert.notStrictEqual(v, def[id],
      t.id + '.' + id + ' repeats the default — dead weight that will drift')));
});
test('a template that hides a row it overrides would be a no-op', () => {
  C.TEMPLATES.forEach(t => {
    const visible = C.visibleScope(new Set(t.systems)).map(i => i.id);
    Object.keys(t.scope || {}).forEach(id =>
      assert.ok(visible.includes(id),
        t.id + ' overrides ' + id + ', which its own systems keep hidden'));
  });
});
test('applying a template starts from the defaults, not from the last one', () => {
  const a = C.TEMPLATES.find(t => t.id === 'orders');
  const b = C.TEMPLATES.find(t => t.id === 'report');
  const afterA = C.scopeStateFor(a);
  const afterB = C.scopeStateFor(b);
  const def = C.defaultScopeState();
  // anything A moved and B does not mention must be back at its default
  Object.keys(a.scope).forEach(id => {
    if (id in b.scope) return;
    assert.strictEqual(afterB[id], def[id], id + ' leaked from the previous template');
  });
  assert.notDeepStrictEqual(afterA, afterB, 'these two make different decisions');
});
test('the templates do not all collapse to one scope', () => {
  // two templates landing on the same decisions is fine; all of them doing so
  // would mean the per-vertical scope is decoration
  const shapes = new Set(C.TEMPLATES.map(t => JSON.stringify(C.scopeStateFor(t))));
  assert.ok(shapes.size >= 3,
    'only ' + shapes.size + ' distinct scopes across ' + C.TEMPLATES.length + ' templates');
});
test('scopeStateFor is pure — calling it twice gives the same answer', () => {
  const t = C.TEMPLATES[0];
  const a = C.scopeStateFor(t);
  a.build = 'out';                       // caller mutates what it got back
  assert.strictEqual(C.scopeStateFor(t).build, 'in', 'state leaked between calls');
});
test('template numbers are plausible rather than placeholder', () => {
  C.TEMPLATES.forEach(t => {
    const n = t.numbers;
    assert.ok(+n.q_freq > 0, t.id + ' frequency');
    assert.ok(+n.q_minutes > 0, t.id + ' minutes');
    assert.ok(['365','52','12'].includes(String(n.q_freq_unit)), t.id + ' unit must match the select');
    // a process costing more than a full-time person a year is a typo, not a template
    const hoursYear = +n.q_freq * (+n.q_freq_unit) * (+n.q_minutes) / 60;
    assert.ok(hoursYear < 2000, t.id + ' implies ' + Math.round(hoursYear) + ' hours a year');
  });
});
/* This used to assert t.note.length > 60 — which sixty-one characters of
   anything would satisfy, and which said nothing about whether the note
   explained the decisions the template actually makes. The note is now keyed
   by scope id, so the real invariant is checkable: it explains every move,
   invents none, and names rows that exist. */
test('every template explains exactly the scope moves it makes', () => {
  C.TEMPLATES.forEach(t => {
    const moved = Object.keys(t.scope).sort();
    const explained = Object.keys((t.note && t.note.moves) || {}).sort();
    assert.deepStrictEqual(explained, moved,
      t.id + ' moves [' + moved + '] but explains [' + explained + ']');
  });
});

test('every row a note names is a row that exists', () => {
  const ids = new Set(C.SCOPE_ITEMS.map(i => i.id));
  C.TEMPLATES.forEach(t => {
    const n = t.note || {};
    [...Object.keys(n.moves || {}), ...Object.keys(n.watch || {})].forEach(id =>
      assert.ok(ids.has(id), t.id + ' note names unknown scope row ' + id));
  });
});

test('every reason a note gives is a reason, not a label', () => {
  C.TEMPLATES.forEach(t => {
    const n = t.note || {};
    Object.entries({ ...(n.moves || {}), ...(n.watch || {}) }).forEach(([id, why]) =>
      assert.ok(why && why.trim().length > 25,
        t.id + '/' + id + ' has no reasoning, only a label'));
  });
});

/* A watch row is one the note flags WITHOUT moving it. If it also appears in
   scope, the template is telling the reader to look at something it already
   changed, which is a contradiction rather than a second opinion. */
test('watch rows are rows the template left alone', () => {
  C.TEMPLATES.forEach(t => {
    Object.keys((t.note && t.note.watch) || {}).forEach(id =>
      assert.ok(!(id in t.scope),
        t.id + ' flags ' + id + ' to watch but also moves it'));
  });
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
