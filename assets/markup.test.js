/* node assets/markup.test.js — no browser, no deps.

   Both production-breaking bugs found so far were silent: the page looked
   perfect locally and broke only once deployed or once printed. Neither had
   a failing unit test to catch it, because neither lives in the model layer.

     1. The CSP in vercel.json declares script-src/style-src 'self', which
        kills every inline onclick= and style=. Locally there is no CSP
        header, so every button worked right up until it was deployed.
     2. The print sheet allows one section through by class. The restructure
        wrapped the proposal in a section whose display:none removed it, and
        the paid PDF came out blank — with no error anywhere.

   These are contracts between files, so they are checked between files. */
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

const PAGES = ['index.html', 'post-call.html'];
const html = Object.fromEntries(PAGES.map(f => [f, read(f)]));

console.log('\ncontent security policy');
const csp = JSON.parse(read('vercel.json'));
const cspValue = JSON.stringify(csp).match(/default-src[^"]*/)?.[0] || '';

test('the policy still forbids inline script and style', () => {
  assert.ok(/script-src 'self'/.test(cspValue), 'script-src changed — retune these tests');
  assert.ok(/style-src 'self'/.test(cspValue), 'style-src changed — retune these tests');
  assert.ok(!/unsafe-inline/.test(cspValue), 'unsafe-inline would defeat the point of the policy');
});

for (const f of PAGES) {
  test(f + ' has no inline event handler', () => {
    const hits = html[f].match(/\son[a-z]+\s*=\s*"/gi) || [];
    assert.deepStrictEqual(hits, [], 'blocked by script-src: ' + hits.join(', '));
  });
  test(f + ' has no inline style attribute', () => {
    const hits = html[f].match(/\sstyle\s*=\s*"/gi) || [];
    assert.deepStrictEqual(hits, [], 'blocked by style-src: ' + hits.length + ' found');
  });
}

/* Comments explaining these rules quote the very patterns they forbid, so a
   scanner that reads them finds itself. Code only. */
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* Every script the pages load, not a hand-kept list — a new module that
   generates markup is exactly the one that would slip past a stale list. */
const SCRIPTS = fs.readdirSync(path.join(root, 'assets'))
  .filter(f => f.endsWith('.js') && !f.endsWith('.test.js'))
  .map(f => 'assets/' + f);

for (const f of SCRIPTS) {
  test(f + ' injects no inline style or handler either', () => {
    const src = stripComments(read(f));
    // template strings that build markup are just as subject to the policy
    assert.ok(!/\sstyle\s*=\s*['"\\]/.test(src), 'inline style in generated markup');
    assert.ok(!/\son(click|input|change)\s*=\s*['"\\]/.test(src), 'inline handler in generated markup');
  });
}

console.log('\ntelemetry contract');
/* The client sends an event name; the server checks it against a fixed list
   and answers 400 for anything else. Nothing surfaces that rejection — the
   fetch is deliberately silent on failure — so a name added on one side and
   not the other means the event is simply never counted. That is how the one
   measurement worth having (did anyone use the template shortcut) went
   uncounted the day it was added. */
test('every event the client sends is on the server allowlist', () => {
  const allowed = (read('api/event.js').match(/const EVENTS = new Set\(\[([\s\S]*?)\]\)/) || [])[1] || '';
  const known = [...allowed.matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
  assert.ok(known.length, 'could not read the allowlist');
  const sent = [...new Set([...read('assets/post-call.js').matchAll(/track\('([a-z_]+)'/g)]
    .map(m => m[1]))];
  assert.ok(sent.length, 'no events found in the client');
  const rejected = sent.filter(e => !known.includes(e));
  assert.deepStrictEqual(rejected, [], 'the server would answer 400 and nobody would know');
});

console.log('\nprint contract');
test('post-call still marks the printable section with .doc', () => {
  assert.ok(/class="sec doc"/.test(html['post-call.html']),
    'the print sheet allows through .sec.doc only — without this class the PDF is blank');
  assert.strictEqual((html['post-call.html'].match(/class="sec doc"/g) || []).length, 1,
    'exactly one section may be the document');
});
test('the printable section is the one holding the proposal', () => {
  const from = html['post-call.html'].indexOf('class="sec doc"');
  const to = html['post-call.html'].indexOf('<div class="sec"', from);
  const section = html['post-call.html'].slice(from, to === -1 ? undefined : to);
  assert.ok(/id="proposal"/.test(section), '.doc must be the section wrapping #proposal');
});
test('the print sheet allows .sec.doc through and hides its siblings', () => {
  const css = read('assets/post-call.css');
  const block = css.slice(css.indexOf('@media print'));
  const rules = block.slice(0, block.indexOf('\n  }'));
  assert.ok(/main > \*\{display:none!important\}/.test(rules), 'siblings must be hidden');
  assert.ok(/main > \.sec\.doc\{display:block!important\}/.test(rules), 'the document must be allowed back');
  assert.ok(/\.sec\.doc > #proposal\{display:block!important\}/.test(rules), 'and the proposal within it');
});
test('pre-call still prints the script and never the private notes', () => {
  const css = read('assets/pre-call.css');
  const block = css.slice(css.indexOf('@media print'));
  const rules = block.slice(0, block.indexOf('\n  }'));
  assert.ok(/[,\s]\.priv[,\s]/.test(rules),
    'the private calibration notes are for the seller, not for the printed script');
  assert.ok(/#p1,#p2,#p3/.test(rules), 'the input steps must not print');
});

console.log('\nshow/hide mechanism');
/* Removing the inline styles for the CSP turned style="display:none" into
   class="hidden", and every site that un-hid with style.display='' silently
   stopped working — clearing an inline style cannot outrank a class rule.
   The paywall never opened and three of the four pricing methods lost their
   inputs, with no error anywhere. So: one mechanism, enforced. */
test('nothing toggles display through the style property', () => {
  for (const f of SCRIPTS) {
    const hits = stripComments(read(f)).match(/\.style\.display\s*=/g) || [];
    assert.deepStrictEqual(hits, [], f + ' must toggle the hidden class instead');
  }
});
test('every element hidden by the class is toggled through show()', () => {
  const js = SCRIPTS.map(read).join('\n');
  const ids = [...html['post-call.html'].matchAll(/<[^>]*\sid="([^"]+)"[^>]*\sclass="[^"]*\bhidden\b/g)]
    .map(m => m[1])
    .concat([...html['post-call.html'].matchAll(/<[^>]*\sclass="[^"]*\bhidden\b[^"]*"[^>]*\sid="([^"]+)"/g)]
    .map(m => m[1]));
  const untouched = [...new Set(ids)].filter(id =>
    js.includes(id) && !new RegExp("show\\(\\s*'" + id + "'").test(js));
  assert.deepStrictEqual(untouched, [],
    'referenced in the script but never shown — it would stay hidden forever');
});

console.log('\nstructure');
for (const f of PAGES) {
  test(f + ' has no duplicate element id', () => {
    const ids = [...html[f].matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    assert.deepStrictEqual([...new Set(dupes)], [],
      'a duplicate id silently makes getElementById pick the wrong node');
  });
  test(f + ' has balanced div tags', () => {
    const open = (html[f].match(/<div\b/g) || []).length;
    const close = (html[f].match(/<\/div>/g) || []).length;
    assert.strictEqual(open, close, 'an orphan </div> reparents everything after it');
  });
  test(f + ' labels every field', () => {
    const fields = [...html[f].matchAll(/<(input|select|textarea)\b[^>]*>/g)].map(m => m[0]);
    const unlabelled = fields.filter(tag => {
      if (/aria-label/.test(tag)) return true; // handled, skip
      const id = (tag.match(/\sid="([^"]+)"/) || [])[1];
      return !id || !html[f].includes('for="' + id + '"');
    }).filter(t => !/aria-label/.test(t));
    assert.deepStrictEqual(unlabelled, [], 'a field with no label is unusable by screen reader');
  });
}

console.log('\nmodule loading');
/* Classic scripts share one global scope and run in document order, so the
   shell — which calls into every module at load time — has to come last, and
   a module that is written but never linked is dead code that still passes
   every other test in this file. */
test('every module the assets directory defines is actually loaded', () => {
  const linked = [...html['post-call.html'].matchAll(/<script src="(assets\/[^"]+)"/g)].map(m => m[1])
    .concat([...html['index.html'].matchAll(/<script src="(assets\/[^"]+)"/g)].map(m => m[1]));
  const orphans = SCRIPTS.filter(f => !linked.includes(f));
  assert.deepStrictEqual(orphans, [], 'written but never loaded by any page');
});
test('the shell loads after everything it depends on', () => {
  const order = [...html['post-call.html'].matchAll(/<script src="assets\/([^"]+)"/g)].map(m => m[1]);
  assert.strictEqual(order[order.length - 1], 'post-call.js',
    'the shell renders on load and needs every module already evaluated');
  ['model.js', 'deals.js', 'pc-dom.js', 'pc-catalog.js', 'pc-proposal.js'].forEach(dep =>
    assert.ok(order.indexOf(dep) > -1 && order.indexOf(dep) < order.indexOf('post-call.js'),
      dep + ' must load before the shell'));
});
/* A top-level const declared twice across classic scripts is a SyntaxError,
   and the file that loses simply does not run — the page half-boots with
   nothing obvious to point at. Only names loaded by the SAME page can
   collide, so the check is per page. */
for (const page of PAGES) {
  test(page + ' loads no name twice at top level', () => {
    const seen = new Map(), dupes = [];
    for (const f of [...html[page].matchAll(/<script src="(assets\/[^"]+)"/g)].map(m => m[1])) {
      const decls = new Set([...stripComments(read(f))
        .matchAll(/^(?:const|let|function)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]));
      for (const d of decls) {
        if (seen.has(d)) dupes.push(d + ': ' + seen.get(d) + ' and ' + f);
        else seen.set(d, f);
      }
    }
    assert.deepStrictEqual(dupes, []);
  });
}

test('every data-act in the markup has a handler in the script', () => {
  const pairs = [['index.html', 'assets/pre-call.js'], ['post-call.html', 'assets/post-call.js']];
  for (const [page, script] of pairs) {
    const src = read(script);
    const acts = [...new Set([...html[page].matchAll(/data-act="([^"]+)"/g)].map(m => m[1]))];
    const missing = acts.filter(a => !new RegExp("['\"]?" + a.replace(/-/g, '\\-') + "['\"]?\\s*:").test(src));
    assert.deepStrictEqual(missing, [],
      page + ': buttons with no handler are dead on click — ' + missing.join(', '));
  }
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
