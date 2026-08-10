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

/* index.html is the entry page — it asks which situation you are in and
   routes; the two tools live beside it. Every structural/CSP rule below
   applies to all three, because the entry page is the first thing anyone
   sees and a broken CSP there breaks the front door. */
const PAGES = ['index.html', 'pre-call.html', 'post-call.html'];
const TOOLS = ['pre-call.html', 'post-call.html'];
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

console.log('\ncopy');
/* The jargon rule was enforced on the guide module only, so the page around
   it went on saying "סקופ" in four places while the guide it wrapped was
   clean. A rule that holds in one file and not on the screen is not a rule. */
test('the page uses no word the reader has to already own', () => {
  const BANNED = ['סקופ', 'טריאנגולציה', 'provenance', 'payback', 'ולידציה',
                  'קונברסיה', 'back-office', 'onboarding'];
  const visible = PAGES.map(f => html[f]
    .replace(/<!--[\s\S]*?-->/g, '')      // comments are for us, not for them
    .replace(/<[^>]+>/g, ' ')).join(' ');
  BANNED.forEach(w => assert.ok(!visible.includes(w),
    '"' + w + '" is on screen — if it needs a glossary it needs a rewrite'));
});
test('no button is labelled with a bare verb that hides its outcome', () => {
  // "שמור" tells you an action; "שמור לפנקס" tells you where it goes
  const labels = [...html['post-call.html'].matchAll(/data-act="[a-z]+">([^<]+)</g)]
    .map(m => m[1].trim());
  assert.ok(labels.length >= 4, 'no action buttons found — has the markup moved?');
  labels.forEach(l => assert.ok(l.split(/\s+/).length >= 2 || l.length > 6,
    'bare label: "' + l + '"'));
});

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
  /* Every script, not just the shell. This test existed precisely to catch
     an event the server would reject, and it still missed one — because it
     read post-call.js alone, and the new event was emitted from
     pc-ledger.js. A guard that inspects one file is a guard against one
     file. Found by an external reviewer, which is its own lesson: the
     blind spot was in the checker, not in the code it checks. */
  const sent = [...new Set(SCRIPTS.flatMap(f =>
    [...read(f).matchAll(/track\('([a-z_]+)'/g)].map(m => m[1])))];
  assert.ok(sent.length, 'no events found in the client');
  const rejected = sent.filter(e => !known.includes(e));
  assert.deepStrictEqual(rejected, [], 'the server would answer 400 and nobody would know');
});

console.log('\nclient read contract');
/* The per-client read marks the questions that move THIS client's document.
   The marker attaches to the field's .qa or .box wrapper, so a field that
   has neither — or an id that no longer exists — makes the emphasis vanish
   with no error. That is how the provenance select, the single most
   important thing to mark, was silently unmarkable. */
test('every field the client read wants to emphasise can be emphasised', () => {
  const ids = [...new Set([...read('assets/pc-client.js').matchAll(/focus\.push\(([^)]*)\)/g)]
    .flatMap(m => [...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1])))];
  assert.ok(ids.length, 'no focus targets found — has the mechanism moved?');
  const page = html['post-call.html'];
  ids.forEach(id => {
    const at = page.indexOf('id="' + id + '"');
    assert.ok(at > -1, id + ' does not exist in the page');
    const before = page.slice(0, at);
    const wrapper = Math.max(before.lastIndexOf('class="qa"'), before.lastIndexOf('class="box'));
    assert.ok(wrapper > -1, id + ' has no .qa or .box wrapper, so its marker goes nowhere');
  });
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
  // The file input behind the backup-import button is not a panel that
  // opens — it is a permanently hidden native control, clicked
  // programmatically (el('backupFile').click()) and never meant to become
  // visible. show() has nothing to toggle here, by design, not by omission.
  const PERMANENTLY_HIDDEN = ['backupFile'];
  const ids = [...html['post-call.html'].matchAll(/<[^>]*\sid="([^"]+)"[^>]*\sclass="[^"]*\bhidden\b/g)]
    .map(m => m[1])
    .concat([...html['post-call.html'].matchAll(/<[^>]*\sclass="[^"]*\bhidden\b[^"]*"[^>]*\sid="([^"]+)"/g)]
    .map(m => m[1]));
  const untouched = [...new Set(ids)].filter(id =>
    !PERMANENTLY_HIDDEN.includes(id) &&
    js.includes(id) && !new RegExp("show\\(\\s*'" + id + "'").test(js));
  assert.deepStrictEqual(untouched, [],
    'referenced in the script but never shown — it would stay hidden forever');
});

console.log('\nstructure');
/* These read the markup as the browser will parse it, so the comments have
   to go first. This file's own convention is to explain a decision in a
   comment right above the element it is about — which means a comment
   quite reasonably contains a snippet like id="ledger", and a raw-text
   regex then counts it as a second element with that id. The comment was
   correct and the test was wrong; measuring the parsed markup fixes it for
   every rule below at once rather than by rewording prose. */
const code = Object.fromEntries(PAGES.map(f => [f, html[f].replace(/<!--[\s\S]*?-->/g, '')]));
for (const f of PAGES) {
  test(f + ' has no duplicate element id', () => {
    const ids = [...code[f].matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    assert.deepStrictEqual([...new Set(dupes)], [],
      'a duplicate id silently makes getElementById pick the wrong node');
  });
  test(f + ' has balanced div tags', () => {
    const open = (code[f].match(/<div\b/g) || []).length;
    const close = (code[f].match(/<\/div>/g) || []).length;
    assert.strictEqual(open, close, 'an orphan </div> reparents everything after it');
  });
  test(f + ' labels every field', () => {
    const fields = [...code[f].matchAll(/<(input|select|textarea)\b[^>]*>/g)].map(m => m[0]);
    const unlabelled = fields.filter(tag => {
      if (/aria-label/.test(tag)) return true; // handled, skip
      const id = (tag.match(/\sid="([^"]+)"/) || [])[1];
      return !id || !code[f].includes('for="' + id + '"');
    }).filter(t => !/aria-label/.test(t));
    assert.deepStrictEqual(unlabelled, [], 'a field with no label is unusable by screen reader');
  });
}

console.log('\nresponsive tables');
/* This block used to assert the opposite conclusion, and it said so: PRE-CALL's
   two comparison tables carry full Hebrew sentences across 3-4 columns, so "there
   is no narrow layout for that content, only a choice of what scrolls" — and the
   choice made was a wrapper that scrolls in place of the page.

   Retuned on measurement, which the old comment invited. On a 390x844 phone the
   tables paint 480px wide, so the reading card — the artefact that decides what
   you are allowed to offer — sits behind a horizontal scroll during a live call.
   Guidance for cards used while talking treats that as disqualifying, and it is
   the one artefact here that is genuinely used mid-conversation.

   So there IS a narrow layout: below 600px each row becomes a block and each
   cell carries its own column heading. The wrapper stays, because between 600px
   and the table's natural width scrolling in place of the page is still right.
   What is asserted now is both halves, plus the two things that can silently
   break the narrow one. */
test('every table.read in pre-call.js is wrapped for horizontal scroll', () => {
  const src = read('assets/pre-call.js');
  const tables = (src.match(/<table class="read"/g) || []).length;
  const wraps = (src.match(/<div class="tbl-wrap">/g) || []).length;
  assert.ok(tables > 0, 'the tables this test protects are gone — retune or remove it');
  assert.strictEqual(wraps, tables,
    'a table.read with no matching .tbl-wrap has no scroll container between 600px and 480px');
});
test('pre-call.css gives .tbl-wrap something to actually scroll', () => {
  const css = read('assets/pre-call.css');
  const rule = (css.match(/\.tbl-wrap\{[^}]*\}/) || [''])[0];
  assert.ok(/overflow-x:\s*auto|overflow-x:\s*scroll/.test(rule),
    '.tbl-wrap must scroll horizontally, or the wrapper does nothing');
  assert.ok(/min-width/.test(css.match(/table\.read\{[^}]*\}/)?.[0] || ''),
    'table.read needs a min-width or there is nothing for the wrapper to scroll — ' +
    'the table just shrinks its columns into unreadable slivers instead');
});
test('the narrow layout exists, and drops the min-width that would defeat it', () => {
  const css = read('assets/pre-call.css');
  const q = css.match(/@media screen and \(max-width:600px\)\{[\s\S]*?\n  \}/);
  assert.ok(q, 'no narrow-table media query — the card is back behind a horizontal scroll at 390px');
  const rules = q[0];
  assert.ok(/table\.read\{min-width:0\}/.test(rules),
    'the 480px floor survives into the narrow layout, so the wrapper still scrolls there');
  assert.ok(/table\.read tr:first-child\{display:none\}/.test(rules),
    'the heading row must be hidden once each cell carries its own heading');
  assert.ok(/content:attr\(data-l\)/.test(rules),
    'hiding the heading row without printing data-l leaves cells with no column name at all');
});
test('every generated cell carries the heading it will lose at 390px', () => {
  /* The reason the tables are generated from arrays rather than written as
     markup. Hand-written data-l attributes drift from the <th> above them the
     first time a column is renamed, and nothing on screen says so — the wrong
     label simply appears under the right cell. */
  const src = read('assets/pre-call.js');
  const cells = (src.match(/<td[ >]/g) || []).length;
  assert.strictEqual(cells, 1,
    'a <td> is built in ' + cells + ' places — every one beyond the shared helper ' +
    'carries a data-l that can drift from its own column heading');
  assert.ok(/data-l="\$\{esc\(heads\[i\]\)\}"/.test(src),
    'the one place a cell is built must take its label from the heading array itself');
});
test('display:block on a table does not take its semantics with it', () => {
  /* display:block strips table roles in assistive technology. The narrow
     layout is exactly that, so the markup names every role explicitly. */
  const src = read('assets/pre-call.js');
  ['role="table"', 'role="rowgroup"', 'role="row"', 'role="columnheader"', 'role="cell"']
    .forEach(r => assert.ok(src.includes(r),
      'missing ' + r + ' — the stacked layout would read as plain text to a screen reader'));
});

console.log('\ncall mode — the print sheet, applied to the screen');
/* Measured on a 390x844 phone: the finished script is 5,923px and 1,605px of
   that, 27%, is not the script at all. The print sheet already names exactly
   that list, and has since printing produced a blank page. Call mode reuses it
   rather than restating it, so these tests are about the two lists not drifting
   and about the reuse not damaging the original. */
const preCss = read('assets/pre-call.css');
const printBlock = (() => {
  const b = preCss.slice(preCss.indexOf('@media print'));
  return b.slice(0, b.indexOf('\n  }'));
})();
const callBlock = (() => {
  const i = preCss.indexOf('@media screen{');
  assert.ok(i > 0, 'call mode must live in an @media screen block');
  const b = preCss.slice(i);
  return b.slice(0, b.indexOf('\n  }'));
})();

test('call mode hides on screen the same chrome the print sheet hides on paper', () => {
  ['header', '.steps', '.backupbox', 'footer', '.next-tool', '#p4 .box:first-of-type']
    .forEach(sel => {
      assert.ok(printBlock.includes(sel), 'setup: ' + sel + ' is no longer in the print sheet');
      assert.ok(callBlock.includes('body.callmode ' + sel),
        sel + ' prints away but stays on screen in call mode — the two lists have drifted');
    });
});
test('call mode is screen-only, so printing from inside it still prints everything', () => {
  /* It also hides the twelve `why` lines and the post-call reading card. If
     those rules were not inside @media screen, hitting print while in call mode
     would emit a script with its reasoning and its reading card missing, with
     nothing to say so — the blank-PDF failure again, one layer in. */
  assert.ok(/body\.callmode #outArea \.why/.test(callBlock),
    'the why lines must come off in the room');
  assert.ok(/body\.callmode #outArea \.blk-post/.test(callBlock),
    'the post-call card must come off in the room');
  assert.ok(!/@media print/.test(callBlock),
    'the call-mode rules must not reach the print sheet');
  assert.ok(!/callmode/.test(printBlock),
    'the print sheet must not know about call mode at all');
});
test('the control box stays the first div in #p4, or the print sheet loses its target', () => {
  /* `#p4 .box:first-of-type` is first-of-ELEMENT-type: it matches the first div
     child of #p4 only if that div also carries .box. .callbar is a div, so
     inserting it above the control box would silently start printing the button
     row. This pins the order the selector depends on. */
  const open = '<div class="panel" id="p4">';
  const p4 = html['pre-call.html'].slice(html['pre-call.html'].indexOf(open) + open.length);
  const firstDiv = p4.match(/<div class="([^"]+)"/);
  assert.ok(/\bbox\b/.test(firstDiv[1]),
    'the first div inside #p4 is now class="' + firstDiv[1] + '" — the print sheet targets .box:first-of-type');
});
test('copy reads the script with call mode off, or it emits a truncated one', () => {
  /* innerText excludes anything CSS has hidden, so copying from inside call
     mode would produce a shorter document than the page shows — silently. */
  const src = stripComments(read('assets/pre-call.js'));
  const fn = src.slice(src.indexOf('function cpText'), src.indexOf('async function copyText'));
  assert.ok(/classList\.remove\('callmode'\)/.test(fn),
    'cpText must drop call mode before reading innerText');
  assert.ok(fn.indexOf("classList.remove('callmode')") < fn.indexOf('.innerText'),
    'the class has to come off before the read, not after it');
  assert.ok(/classList\.add\('callmode'\)/.test(fn),
    'and go back on afterwards, or copying ejects the operator mid-call');
});

console.log('\na way out for a stuck user');
/* Found by a UX review, confirmed by grep, not by a test: zero references to
   README anywhere in either page, so a user with no prior context and a
   question the guide's one-line hints don't answer had nowhere in the
   product to go. This does not replace in-app help — it is the honest
   minimum, a real door instead of no door. */
for (const f of PAGES) {
  test(f + ' links out to the explanation document', () => {
    assert.ok(/href="https:\/\/github\.com\/[^"]+README\.md"/.test(html[f]),
      f + ' has no way for a stuck user to reach the docs');
    assert.ok(/rel="noopener"/.test(html[f].match(/<a [^>]*README\.md[^>]*>/)?.[0] || ''),
      'target="_blank" without rel="noopener" hands the opened tab a reference back to this one');
  });
  test(f + ' links out to the privacy page', () => {
    assert.ok(/href="privacy\.html"/.test(html[f]),
      f + ' has no way for someone reading it to find out what happens to their data');
  });
}

console.log('\nthe route between the two tools');
/* Found by re-reading the two pages side by side, not by any tool: neither
   page had ever linked to the other. PRE-CALL builds the call script;
   POST-CALL prices what came out of it — the whole product is that
   sequence — and until this test, someone landing on either page had no
   way to discover the other one exists. */
test('pre-call.html hands off to post-call.html once a script exists', () => {
  assert.ok(/href="post-call\.html"/.test(html['pre-call.html']),
    'PRE-CALL has no link forward to where its output gets priced');
});
test('post-call.html links back to pre-call.html for anyone arriving without a call script', () => {
  assert.ok(/href="pre-call\.html"/.test(html['post-call.html']),
    'POST-CALL has no link back to where the call gets prepared');
});
for (const f of TOOLS) {
  test(f + ' can get back to the entry page', () => {
    assert.ok(/href="index\.html"/.test(html[f]),
      'a tool with no way back to the entry is a dead end for anyone who picked wrong');
  });
}

console.log('\nthe entry page routes by situation, not by tool name');
/* The product used to open on a tool, which assumed the visitor already
   knew there were two and which one they needed. The entry page asks where
   they are instead. These tests hold that line: the four situations must
   stay reachable, and none of them may be phrased as a tool to pick. */
test('the entry offers a route for every situation someone can arrive in', () => {
  const e = html['index.html'];
  const routes = [
    ['pre-call.html', 'before the call'],
    ['post-call.html', 'straight after the call'],
    ['post-call.html#ledger', 'after sending, chasing an answer'],
    ['post-call.html?demo=1', 'just looking']
  ];
  routes.forEach(([href, situation]) =>
    assert.ok(e.includes('href="' + href + '"'),
      'no route for: ' + situation + ' (expected ' + href + ')'));
});
test('both entry routes that need a landing state are honoured by the shell', () => {
  const src = read('assets/post-call.js');
  assert.ok(/demo=1/.test(src),
    '?demo=1 is linked from the entry but the shell ignores it — the route is a lie');
  assert.ok(/#ledger|'#ledger'|hash === '#ledger'/.test(src),
    '#ledger is linked from the entry but the shell ignores it — it would land at the top of a blank form');
});
test('the entry names situations, never the tools as a choice to make', () => {
  const visibleText = html['index.html']
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ');
  // the question the page asks must be about the person, not the product
  assert.ok(/איפה אתם/.test(visibleText),
    'the entry must ask where the visitor is, not which tool they want');
});

console.log('\nhow a link to this looks when somebody sends it');
/* Found by an AARRR pass rather than by any checker: acquisition and
   referral were both literally zero. No description, no og tags, no icon,
   on any page. The channel this product travels through is a link pasted
   into WhatsApp, and without these that link renders as a bare URL — no
   title, no picture, nothing saying what it is. Nothing was broken, which
   is exactly why nothing here ever caught it. */
const SHARE_PAGES = [...PAGES, 'privacy.html'];
for (const f of SHARE_PAGES) {
  const src = f === 'privacy.html' ? read(f) : html[f];
  test(f + ' can be shared as a link', () => {
    const need = ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'];
    const absent = need.filter(t => !src.includes('property="' + t + '"'));
    assert.deepStrictEqual(absent, [], f + ' would paste into WhatsApp as a bare URL');
    assert.ok(/<meta name="description" content="[^"]{60,}"/.test(src),
      'a description under 60 characters tells a reader nothing');
    assert.ok(/rel="icon"/.test(src), 'no icon means a blank tab among twenty others');
  });
  test(f + ' describes itself differently from the other pages', () => {
    const desc = (src.match(/<meta name="description" content="([^"]+)"/) || [])[1] || '';
    const others = SHARE_PAGES.filter(x => x !== f)
      .map(x => ((x === 'privacy.html' ? read(x) : html[x])
        .match(/<meta name="description" content="([^"]+)"/) || [])[1] || '');
    assert.ok(!others.includes(desc),
      'two pages share one description — a copied boilerplate line, not a description');
  });
}
test('the share image exists and is the size every platform expects', () => {
  const p = path.join(root, 'assets/og.png');
  assert.ok(fs.existsSync(p), 'og:image points at a file that is not in the repo');
  const buf = fs.readFileSync(p);
  // PNG IHDR: width and height are big-endian uint32 at bytes 16 and 20
  assert.strictEqual(buf.readUInt32BE(16), 1200, 'og image width must be 1200');
  assert.strictEqual(buf.readUInt32BE(20), 630, 'og image height must be 630');
});

console.log('\nreachable from outside');
/* Same AARRR pass, next hole along: a link pasted into WhatsApp renders
   properly now, but nothing else could ever find this. No robots.txt and no
   sitemap, so the only address that resolves is one somebody was handed. That
   is a defensible choice for a private tool and not for a sold one, and either
   way nothing here recorded which it was.

   A sitemap is the one SEO artefact that can be wrong in a way that costs
   something: it asks a crawler to index an address. If that address is not the
   one the page names as canonical, the crawler is being pointed at a duplicate
   of a page that disowns it. So the sitemap is not checked for existence, it is
   checked for agreement — against the canonical tags, which are what the pages
   themselves claim. */
const SITE_PAGES = { 'index.html': '/', 'post-call.html': '/post-call',
                     'pre-call.html': '/pre-call', 'privacy.html': '/privacy' };
/* Read defensively, and not out of politeness. The first version of this block
   called read() at the top level, and with the files absent the suite died on
   require with a stack trace instead of reporting a failure — taking every
   later test in this file down with it, unrun and unmentioned. A file that is
   missing is a failing test, not a crashing one. */
const readOr = f => { try { return read(f); } catch (e) { return ''; } };
const sitemap = readOr('sitemap.xml');
const robots = readOr('robots.txt');
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);

test('both files exist at the root, where they are the only place they work', () => {
  assert.ok(sitemap, 'sitemap.xml is missing — robots.txt promises a file that 404s');
  assert.ok(robots, 'robots.txt is missing');
});
test('the sitemap is a sitemap — the namespace is the one crawlers look for', () => {
  /* Caught in this file rather than in production: the first draft wrote
     www.sitemap.org, singular. It is well-formed XML with a plausible URL and
     no crawler recognises it, which is the failure mode a sitemap has — it does
     not error, it is simply ignored, and nothing downstream ever says so. */
  assert.ok(sitemap.includes('http://www.sitemaps.org/schemas/sitemap/0.9'),
    'wrong urlset namespace — the file parses and is then discarded: ' +
    ((sitemap.match(/xmlns="[^"]*"/) || [])[0] || 'no xmlns at all'));
});
test('every address in the sitemap is the address its page calls canonical', () => {
  const canonical = Object.keys(SITE_PAGES).map(f =>
    ((f === 'privacy.html' ? read(f) : html[f])
      .match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || f + ': no canonical');
  assert.deepStrictEqual([...locs].sort(), [...canonical].sort(),
    'the sitemap and the canonical tags name different addresses — a crawler is ' +
    'being sent to a URL the page itself disowns');
});
test('every page that can be shared is in the sitemap', () => {
  const missing = Object.values(SITE_PAGES).filter(p => !locs.some(l => l.endsWith(p) ||
    (p === '/' && /\/$/.test(l))));
  assert.deepStrictEqual(missing, [],
    'a page with og tags and a canonical tag, that nothing can discover');
});
test('the sitemap lists clean URLs, matching how the host serves them', () => {
  /* vercel.json sets cleanUrls, so /post-call.html redirects to /post-call.
     Listing the .html form asks a crawler to index a redirect. */
  assert.deepStrictEqual(locs.filter(l => /\.html$/.test(l)), []);
});
test('robots.txt points at the sitemap and blocks nothing', () => {
  assert.ok(/Sitemap:\s*https:\/\/\S+\/sitemap\.xml/.test(robots),
    'a sitemap nothing references is a file only a direct fetch finds');
  assert.deepStrictEqual((robots.match(/^Disallow:\s*\S+/gm) || []), [],
    'nothing here is private, so a Disallow line is a mistake, not a policy');
});
test('the attribution link is styled, not left at the browser default', () => {
  /* Measured in Chromium, not guessed: the link computed to rgb(0, 0, 238)
     inside an attribution line that is rgb(90, 103, 119). Stock blue underlined
     is what an unstyled page looks like, and this line sits at the foot of a
     document with a price on it — the one element of the whole product a
     stranger sees first. It is the only <a> anywhere inside .out, so no
     existing rule was ever going to cover it. */
  const css = read('assets/post-call.css');
  assert.ok(/\.out\s+\.madewith\s+a\s*\{[^}]*color:/.test(css),
    'the only link in the document inherits the UA stylesheet');
});
test('neither file is excluded from the deploy', () => {
  /* .vercelignore is the only thing between what is written and what is served
     here, and a sitemap that 404s is worse than no sitemap: robots.txt promises
     it. */
  const ignore = read('.vercelignore').split('\n')
    .map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  ['sitemap.xml', 'robots.txt'].forEach(f => assert.ok(!ignore.includes(f),
    f + ' is referenced publicly and excluded from the deploy'));
});

console.log('\nthe document says who it is from');
/* The single most obviously unprofessional thing the product did, and it
   survived every automated check for the same reason: a missing sender is
   not a defect in anything. */
test('post-call.html asks who is sending, outside any drawer', () => {
  const beforeDrawers = html['post-call.html'].split('<details')[0];
  ['s_name', 's_phone', 's_email'].forEach(id =>
    assert.ok(beforeDrawers.includes('id="' + id + '"'),
      id + ' is missing or hidden behind a disclosure — a document with no sender is not sendable'));
});
test('the sender survives a backup', () => {
  assert.ok(read('assets/pc-backup.js').includes('postcall_sender_v1'),
    'a cache clear would silently unsign every proposal after it');
});

console.log('\nprivacy.html — static, but not exempt from the CSP that killed every button once already');
const privacy = read('privacy.html');
test('privacy.html has balanced div tags', () => {
  const open = (privacy.match(/<div\b/g) || []).length;
  const close = (privacy.match(/<\/div>/g) || []).length;
  assert.strictEqual(open, close, 'an orphan </div> reparents everything after it');
});
test('privacy.html has no duplicate element id', () => {
  const ids = [...privacy.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepStrictEqual([...new Set(dupes)], []);
});
test('privacy.html carries no inline script or style — the shipped CSP forbids both', () => {
  assert.ok(!/<script(?!\s+src=)/.test(privacy), 'inline <script> is blocked by script-src \'self\'');
  assert.ok(!/\sstyle="/.test(privacy), 'inline style= is blocked by style-src \'self\'');
  assert.ok(!/\son\w+="/.test(privacy), 'inline onclick=/oninput= etc. do not run under this CSP');
});
test('privacy.html links out to both tools and the README, not just one', () => {
  assert.ok(/href="index\.html"/.test(privacy) && /href="post-call\.html"/.test(privacy),
    'a privacy page reachable from both tools should be able to return to both');
  assert.ok(/README\.md/.test(privacy));
});

console.log('\ndestructive actions ask first');
/* "הצעה חדשה" clears the form and the autosaved draft with no way back. It
   used to fire straight off the toolbar click with nothing in between — found
   by a UX review, not a test, because nothing broke; a misclick just silently
   won. Guarded now, but a guard that is easy to route around in a later edit
   is not a guard, so the wiring itself is asserted here: the toolbar button
   must reach the checking wrapper, not the raw reset directly. */
test('the "new deal" button is wired to the confirming wrapper, not the raw reset', () => {
  const src = read('assets/post-call.js');
  assert.ok(/newdeal:\s*confirmNewDeal\s*,/.test(src),
    'data-act="newdeal" must call confirmNewDeal, not newDeal directly — ' +
    'that is what makes the confirmation unskippable by construction');
});
test('the wrapper only interrupts when there is real content to lose, and only then asks', () => {
  const src = read('assets/post-call.js');
  const fn = (src.match(/function confirmNewDeal\(\)\{[\s\S]*?\n\}/) || [''])[0];
  assert.ok(fn, 'confirmNewDeal() not found');
  assert.ok(/PC\.draft\.isEmpty\(/.test(fn),
    'without the emptiness check every reset asks, including ones with nothing to lose');
  assert.ok(/confirm\(/.test(fn), 'no confirm() call — the click goes straight through again');
});

console.log('\nmodule loading');
/* Classic scripts share one global scope and run in document order, so the
   shell — which calls into every module at load time — has to come last, and
   a module that is written but never linked is dead code that still passes
   every other test in this file. */
test('every module the assets directory defines is actually loaded', () => {
  const linked = PAGES.flatMap(p =>
    [...html[p].matchAll(/<script src="(assets\/[^"]+)"/g)].map(m => m[1]));
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

/* The same fact — one shared global scope, filled in document order — is what
   makes stale caching a correctness bug here rather than a performance note.
   There is no build step and therefore no fingerprint in a filename, so a
   deploy that ships a new post-call.html against an hour-old post-call.js gets
   a page that boots, renders, and calls a function that is not there yet. That
   is the exact failure class the rest of this file exists to catch, arriving
   by a route no test of the source can see. Until something hashes the names,
   the assets must revalidate on every load. */
test('assets are not cached under names that never change', () => {
  const rule = (csp.headers || []).find(h => /assets/.test(h.source));
  assert.ok(rule, 'the /assets rule went missing');
  const cc = (rule.headers.find(h => h.key.toLowerCase() === 'cache-control') || {}).value || '';
  const maxAge = Number((cc.match(/max-age=(\d+)/) || [])[1]);
  const fingerprinted = SCRIPTS.some(f => /\.[0-9a-f]{8,}\.js$/.test(f));
  assert.ok(fingerprinted || maxAge === 0 || /no-cache|no-store/.test(cc),
    'unhashed filenames plus max-age=' + maxAge + ' lets a browser run old JS ' +
    'against new HTML for ' + maxAge + ' seconds after a deploy');
  assert.ok(/must-revalidate|no-cache|no-store/.test(cc),
    'without must-revalidate a stale response may still be served');
});

test('every data-act in the markup has a handler in the script', () => {
  const pairs = [['pre-call.html', 'assets/pre-call.js'], ['post-call.html', 'assets/post-call.js']];
  for (const [page, script] of pairs) {
    const src = read(script);
    const acts = [...new Set([...html[page].matchAll(/data-act="([^"]+)"/g)].map(m => m[1]))];
    const missing = acts.filter(a => !new RegExp("['\"]?" + a.replace(/-/g, '\\-') + "['\"]?\\s*:").test(src));
    assert.deepStrictEqual(missing, [],
      page + ': buttons with no handler are dead on click — ' + missing.join(', '));
  }
});

console.log('\nthings the markup says are hidden are actually hidden');
/* Found by screenshotting a page rather than asserting on it, which is
   the only reason it was found at all. `.hidden` is one class, so any
   later single-class rule that sets display beats it on source order —
   and .draftnote and .viz each set display:flex several hundred lines
   below. POST-CALL painted an empty 26px turquoise strip on every fresh
   load. Nothing threw, no rule was violated, no assertion existed to
   fail; the page simply had a box in it that nobody had put there.

   This checks the collision statically, so it holds without a browser
   and holds for classes that only become visible in states no test has
   thought to enter yet. */
const CSS_FOR = { 'index.html': 'assets/entry.css', 'pre-call.html': 'assets/pre-call.css',
                  'post-call.html': 'assets/post-call.css' };

test('the .hidden utility beats every rule that could contradict it', () => {
  Object.values(CSS_FOR).forEach(f => {
    const m = read(f).match(/\.hidden\s*\{([^}]*)\}/);
    assert.ok(m, f + ' has no .hidden rule at all');
    assert.ok(/display\s*:\s*none\s*!important/.test(m[1]),
      f + ': .hidden is a plain single-class rule, so anything below it that sets ' +
      'display wins on source order — it needs !important to do its one job');
  });
});

PAGES.forEach(page => {
  test(page + ': nothing carrying .hidden is contradicted lower down', () => {
    /* Belt and braces: even with !important above, name the collisions,
       because a future edit that drops the !important should fail loudly
       here rather than quietly repaint a box. */
    const css = read(CSS_FOR[page]);
    const withHidden = new Set();
    for (const m of html[page].matchAll(/class\s*=\s*"([^"]*)"/g)) {
      const cs = m.group ? [] : m[1].split(/\s+/);
      if (cs.includes('hidden')) cs.forEach(c => c && c !== 'hidden' && withHidden.add(c));
    }
    const hiddenAt = css.indexOf('.hidden{');
    const clashes = [];
    withHidden.forEach(c => {
      const re = new RegExp('(?<![\\w.-])\\.' + c.replace(/[-[\]{}()*+?.,\\^$|#]/g, '\\$&') +
                            '\\s*\\{([^}]*)\\}', 'g');
      for (const m of css.matchAll(re))
        if (/display\s*:/.test(m[1]) && m.index > hiddenAt)
          clashes.push('.' + c + ' sets display after .hidden');
    });
    /* The two known ones are allowed to exist — they are why the
       !important is there — but a third appearing means someone added a
       component without knowing the rule, and should read this. */
    assert.ok(clashes.length <= 2,
      page + ': ' + clashes.length + ' rules override .hidden — ' + clashes.join(', ') +
      '. That is fine only because .hidden is !important; keep it that way.');
  });
});

console.log('\nthis is a product, and the repository says so');
/* The repository is public and was, for its whole life, unlicensed —
   which under copyright means all rights reserved, and which to anyone
   reading it means "open source that nobody got around to tidying". Those
   two readings are very far apart, and the second one is the one a public,
   forkable, licence-free repository invites.

   Worth stating plainly because this project's own comments are the thing
   most worth protecting: the pricing model, the effort model and the scope
   catalogue all ship with their reasoning attached. That is deliberate —
   it is what makes the product maintainable and auditable — and it is not
   an invitation. */
test('a licence exists and says the software is not open source', () => {
  const p = path.join(root, 'LICENSE');
  assert.ok(fs.existsSync(p), 'no LICENSE file — a public repo without one reads as unfinished open source');
  const t = fs.readFileSync(p, 'utf8');
  assert.ok(/all rights reserved/i.test(t), 'the licence does not reserve any rights');
  assert.ok(/not open source/i.test(t), 'the licence never says what it is not, which is the ambiguity it exists to remove');
  ['pricing model', 'effort', 'scope'].forEach(k =>
    assert.ok(new RegExp(k, 'i').test(t),
      'the licence does not name the ' + k + ' — the reasoning in the comments is the asset, ' +
      'and a licence that only covers "the code" invites the argument that it does not cover them'));
});

test('the README leads with the licence rather than burying it', () => {
  const r = read('README.md');
  assert.ok(/\[LICENSE\]\(LICENSE\)/.test(r), 'the README never links the licence');
  const head = r.slice(0, 700);
  assert.ok(/קנייני|לא קוד פתוח/.test(head),
    'the licence notice is below the fold of the README, where a reader reaches it ' +
    'after three screens of architecture — which is three screens too late');
});

/* PAGES is the three tool pages. privacy.html is deliberately outside it —
   it has no scripts and its own section of checks further up — and this is
   the one rule where leaving it out was a real hole: the copyright line
   went onto all four pages and the test only guarded three, so deleting it
   from privacy.html left the suite green. Found in review. */
const SHIPPED = [...PAGES, 'privacy.html'];
const pageText = p => html[p] || read(p);

SHIPPED.forEach(page => {
  test(page + ' carries a copyright line', () => {
    const t = pageText(page);
    assert.ok(/class="copy"/.test(t),
      page + ' has no copyright notice — the pages are the product, and they are ' +
      'what somebody sees before they ever reach the repository');
    assert.ok(/©\s*\d{4}/.test(t), page + ' has a copyright element with no year in it');
  });
});

test('no page tells a visitor the code is open', () => {
  /* privacy.html said "כל הקוד פתוח כאן" — literally "all the code is
     open here" — three commits after the licence said the opposite, and
     on the one page whose whole argument is that you can verify its
     claims. Anyone landing there instead of the README got the reverse
     licensing message, which is precisely the ambiguity the licence
     exists to remove.

     The claim that page needs is verifiability, not openness, and those
     are different words. This asserts the difference across every shipped
     page rather than only the one that got it wrong. */
  /* Comments stripped first, or the note explaining the fix trips the
     rule the note is about — which is how a comment containing id="ledger"
     once registered as a duplicate id in this same file. */
  const noComments = s => s.replace(/<!--[\s\S]*?-->/g, '');
  const bad = [];
  SHIPPED.forEach(page => {
    const t = noComments(pageText(page));
    if (/קוד\s+פתוח|open\s+source/i.test(t)) bad.push(page);
  });
  assert.deepStrictEqual(bad, [],
    'these pages describe the code as open, which contradicts LICENSE: ' + bad.join(', ') +
    '. The verifiable claim is that the code can be read, not that it may be used.');
});

console.log('\nwhat gets deployed is not simply what is in the repository');
/* There is no build step, so every file in the repository is a candidate
   for the public site, and .vercelignore is the only thing between the two.
   That was learned by fetching one: /assets/model.test.js answered 200 in
   production, and had done since the first deploy — roughly 200KB of test
   files and fixtures served to everyone, on a product that is sold. */
test('.vercelignore exists and keeps the tests off the public site', () => {
  const p = path.join(root, '.vercelignore');
  assert.ok(fs.existsSync(p),
    'no .vercelignore — without one, every test file in this repo is served in production');
  const lines = fs.readFileSync(p, 'utf8').split('\n')
    .map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  assert.ok(lines.includes('*.test.js'),
    'the ignore list does not cover test files, which is the reason it exists');
  assert.ok(lines.some(l => l.replace(/\/$/, '') === 'tools'),
    'the ignore list does not cover tools/ — dev tooling is not part of the product');
});

test('every test file in the repository is covered by the ignore list', () => {
  /* Named as a rule rather than a list, so a suite added in a new
     directory tomorrow is covered without anyone remembering to come
     back here. This asserts the rule is the one in force. */
  const patterns = fs.readFileSync(path.join(root, '.vercelignore'), 'utf8')
    .split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  const covers = f => patterns.some(p =>
    p === '*.test.js' ? f.endsWith('.test.js')
      : f === p || f.startsWith(p.replace(/\/$/, '') + '/'));
  const walk = d => fs.readdirSync(path.join(root, d), { withFileTypes: true })
    .flatMap(e => e.name === '.git' || e.name === 'node_modules' ? []
      : e.isDirectory() ? walk(path.join(d, e.name))
      : [path.join(d, e.name)]);
  const uncovered = walk('.').map(f => f.replace(/^\.\//, ''))
    .filter(f => f.endsWith('.test.js')).filter(f => !covers(f));
  assert.deepStrictEqual(uncovered, [],
    'these test files would be deployed: ' + uncovered.join(', '));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
