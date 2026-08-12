/* node assets/a11y.test.js — axe-core against the real rendered pages.

   The accessibility work done so far was done by reading: contrast ratios
   computed by hand, touch targets measured against the spec, aria
   attributes added where they were obviously missing. That is worth
   something and it is not the same as testing, because it only ever
   checked the things somebody thought to check.

   This checks the pages as they are actually painted, and — the part that
   matters — in the states they are actually used in. A form on first load
   is the one state nobody operates in: the guide has not rendered, the
   drawers are shut, the proposal is a placeholder, the ledger is empty.
   Every interesting piece of this product appears after something happens,
   so every scan below happens after something happens.

     PW_ENGINES=chromium   which engine to paint in (one is enough for axe)
     PW_ROOT=/path         where to resolve playwright from

   Skips with exit 0 if playwright or axe-core cannot be resolved: an
   absent harness is an environment problem, not a product defect. A failing
   rule, on the other hand, fails the run.

   Except in CI, where that leniency was the whole problem. This file ran
   on every push for weeks and never once scanned anything — the workflow
   installed playwright and not axe-core, the resolve failed, and the step
   exited 0 with a printed reason nobody read. Four pull requests claimed
   "8 axe scans · 0 violations" on the strength of a local run. A skip that
   looks identical to a pass is worse than no check at all, so under
   A11Y_REQUIRED the missing dependency is a failure. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');

function resolveFrom(name) {
  try { return require.resolve(name); } catch (e) {}
  if (process.env.PW_ROOT) {
    try { return require.resolve(path.join(process.env.PW_ROOT, 'node_modules', name)); } catch (e) {}
  }
  return null;
}

const pwPath = resolveFrom('playwright');
const axePath = resolveFrom('axe-core/axe.min.js') || resolveFrom('axe-core');
if (!pwPath || !axePath) {
  const required = !!process.env.A11Y_REQUIRED;
  console.log('\n  ' + (required ? 'FAILED' : 'skipped') +
    ' — need both playwright and axe-core resolvable here.');
  console.log('  playwright: ' + (pwPath || 'not found') + ', axe-core: ' + (axePath || 'not found'));
  if (required) console.log('  A11Y_REQUIRED is set, so this is a broken harness, not an absent one.');
  console.log('');
  process.exit(required ? 1 : 0);
}
const { chromium, firefox, webkit } = require(pwPath);
const AXE_SRC = fs.readFileSync(
  axePath.endsWith('.js') && axePath.includes('axe.min') ? axePath
    : path.join(path.dirname(axePath), 'axe.min.js'), 'utf8');

let pass = 0, fail = 0;
const test = async (name, fn) => {
  try { await fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n' + e.message); }
};

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
               '.css': 'text/css; charset=utf-8' };
function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const clean = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
      const rel = clean === '/' ? '/index.html' : clean;
      const file = path.join(root, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(fs.readFileSync(file));
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, base: 'http://127.0.0.1:' + srv.address().port }));
  });
}

/* WCAG 2.1 A and AA only. Best-practice rules are real advice but they are
   not the standard the product claims to meet, and mixing them in would
   make a conformance failure indistinguishable from a style opinion. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/* Conformance is a property of the states a page rests in, not of the
   200ms it spends fading between them. The transient "saved"/"copied"
   confirmations cross partial opacity on their way in and out, and axe
   measuring mid-fade reports a contrast figure for a state no one is
   expected to read. Waiting for them to settle is not looking away from a
   defect — the settled states above and below are both scanned. */
async function settle(page) {
  // every running animation and transition on the document, not a list of
  // the ones we happen to know about — panel fades and confirmation
  // fade-outs were each found separately by scanning too early, and a
  // per-case wait would only have postponed finding the third one
  await page.waitForFunction(
    () => document.getAnimations().every(a => a.playState === 'finished' || a.playState === 'idle'),
    null, { timeout: 5000 }
  ).catch(() => {});
}

async function scan(page, label) {
  await settle(page);
  await page.addScriptTag({ content: AXE_SRC });
  const result = await page.evaluate(tags =>
    window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] })
      .then(r => r.violations.map(v => ({
        id: v.id, impact: v.impact, help: v.help,
        nodes: v.nodes.slice(0, 4).map(n => n.target.join(' '))
      }))), TAGS);

  if (!result.length) return;
  const lines = result.map(v =>
    '       [' + (v.impact || 'n/a') + '] ' + v.id + ' — ' + v.help +
    '\n         ' + v.nodes.join('\n         '));
  throw new Error('       ' + label + ': ' + result.length + ' violation type(s)\n' + lines.join('\n'));
}

/* PW_SCHEME=dark repaints every state below in the dark theme and holds
   it to the same standard. A contrast ratio is a property of a pairing,
   not of a page, and the dark ramp re-pairs every one of them — so a
   scan that only ever ran in light mode has checked exactly half the
   product. CI runs this file once per scheme. */
const SCHEME = process.env.PW_SCHEME === 'dark' ? 'dark' : 'light';

(async () => {
  const { srv, base } = await serve();
  const engineName = (process.env.PW_ENGINES || 'chromium').split(',')[0].trim();
  const engine = { chromium, firefox, webkit }[engineName] || chromium;
  const browser = await engine.launch();
  console.log('\naxe-core · WCAG 2.1 A + AA · painted in ' + engineName +
              ' · ' + SCHEME + ' scheme\n');

  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 },
                                         colorScheme: SCHEME });

  console.log('the entry page');
  await test('as a first-time visitor sees it', async () => {
    const p = await ctx.newPage();
    await p.goto(base + '/');
    await scan(p, 'index.html · cold');
    await p.close();
  });

  console.log('\nPRE-CALL');
  await test('every step panel, including the built script', async () => {
    const p = await ctx.newPage();
    await p.goto(base + '/pre-call.html');
    await scan(p, 'pre-call.html · step 1');
    await p.click('.stepbtn[data-s="2"]');
    await p.fill('#f_what', 'מסדר תהליכי גבייה לעסקים קטנים');
    await p.fill('#f_gain', 'כ-40,000 ₪ תזרים');
    await p.fill('#f_no', 'לא ליווי חודשי');
    await scan(p, 'pre-call.html · step 2, filled');
    await p.click('[data-act="go3"]');
    await p.fill('#p_name', 'דנה');
    await scan(p, 'pre-call.html · step 3');
    await p.click('[data-act="build"]');
    await p.waitForTimeout(200);
    await scan(p, 'pre-call.html · step 4, script built');   // the output nobody had scanned
    await p.close();
  });

  await test('the script on a phone, and the same script in call mode', async () => {
    /* Two states that change structure rather than only colour, so neither is
       covered by scanning the desktop script or a cold page at 320px.

       Below 600px the reading tables stop being tables in layout terms —
       display:block strips a table of its semantics for assistive technology
       unless the roles are named explicitly, and reading the stylesheet cannot
       tell you whether they survived. Call mode then removes most of the page,
       which is the other way to break a document: what is left has to still
       have a heading order, a focusable way out, and contrast against the
       ground it is now sitting on alone. */
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 },
                                             colorScheme: SCHEME });
    const p = await phone.newPage();
    await p.goto(base + '/pre-call.html');
    await p.click('.stepbtn[data-s="2"]');
    await p.fill('#f_what', 'מסדר תהליכי גבייה לעסקים קטנים');
    await p.fill('#f_gain', 'כ-40,000 ₪ תזרים');
    await p.click('[data-act="go3"]');
    await p.fill('#p_own', 'אני מנחש שאצלכם אף אחד לא מוגדר כאחראי על המעקב');
    await p.click('[data-act="build"]');
    await p.waitForTimeout(200);
    await scan(p, 'pre-call.html · script at 390px, tables stacked');
    await p.click('[data-act="callmode-on"]');
    await p.waitForTimeout(150);
    await scan(p, 'pre-call.html · call mode');
    await p.close();
    await phone.close();
  });

  console.log('\nPOST-CALL');
  await test('the working surface, with a real proposal on it', async () => {
    const p = await ctx.newPage();
    await p.goto(base + '/post-call.html');
    await scan(p, 'post-call.html · cold');

    await p.fill('#q_process', 'הזמנות מגיעות בוואטסאפ ומוקלדות ידנית לגיליון');
    await p.fill('#q_freq', '40');
    await p.selectOption('#q_freq_unit', '365');
    await p.fill('#q_minutes', '8');
    await p.fill('#q_client', 'יבואן ציוד למטבחים');
    await p.click('#sysChips .chip >> nth=0');
    await p.click('#sysChips .chip >> nth=1');
    await p.waitForTimeout(300);
    // the guide, the guardrail chips, the client read, the chain, the
    // visuals and the document are all on screen only now
    await scan(p, 'post-call.html · priced, document rendered');

    await p.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
    await p.waitForTimeout(200);
    await scan(p, 'post-call.html · every drawer open');

    /* The payback grid, which the scans above never reached. It only renders
       once the provenance question says the client produced the number — the
       rule that keeps an invented figure out of a client-facing document — so
       the fixture has to answer it. Fifty-two elements is the largest single
       piece of generated markup in the document, and a scan that silently skips
       it reports a clean bill for markup it never saw. */
    await p.selectOption('#q_provenance', 'unprompted');
    await p.fill('#a_myrate', '280');
    await p.waitForTimeout(400);
    const drawn = await p.evaluate(() => document.querySelectorAll('.pbk-c').length);
    assert.strictEqual(drawn, 52,
      'the fixture did not produce the payback grid, so this scan proves nothing about it');
    await scan(p, 'post-call.html · the payback drawn in the document');
    await p.close();
  });

  await test('the ledger with saved proposals in it', async () => {
    const p = await ctx.newPage();
    await p.goto(base + '/post-call.html');
    await p.fill('#q_process', 'תהליך לדוגמה');
    await p.fill('#q_client', 'לקוח א');
    await p.click('#sysChips .chip >> nth=0');
    await p.waitForTimeout(200);
    await p.click('[data-act="save"]');
    await p.waitForTimeout(200);
    await p.click('.sbtn[data-status="won"]');   // opens the outcome inputs
    await p.waitForTimeout(200);
    await scan(p, 'post-call.html · ledger with a won deal and outcome fields');
    await p.close();
  });

  /* The scan above catches the track record in its countdown state — one
     saved deal and nothing delivered. This one catches it with findings
     in it, which is where the new colours live: four verdict panels, a
     table, and numbers on tinted backgrounds. The colour that carries
     "your estimate is systematically low" is the one nobody would think
     to check by hand, because it looks fine. */
  await test('the track record with real findings in it', async () => {
    const p = await ctx.newPage();
    await p.goto(base + '/privacy.html');
    await p.evaluate(() => {
      const deals = [0, 1, 2, 3, 4, 5].map(i => ({
        id: 'h' + i, client: 'לקוח ' + (i + 1), status: i === 5 ? 'lost' : 'won',
        priceQuoted: 12000, pricedBy: i < 3 ? 'value' : 'market',
        estimatedHours: 10, created: '2026-0' + (i + 1) + '-01T09:00:00.000Z',
        outcome: { actualHours: [18, 17, 16, 13, 13, 12][i],
                   closedPrice: i === 1 ? 9000 : 12000,
                   at: '2026-0' + (i + 1) + '-20T09:00:00.000Z' }
      }));
      localStorage.setItem('postcall_deals_v1', JSON.stringify(deals));
      /* The journal too, because seeding the ledger alone leaves the funnel
         panel hidden — and a scan that silently skips a whole section is a scan
         that reports a clean bill for markup it never saw. Written straight to
         the key rather than through append(), which stamps `at` with the clock
         and would give every line the same millisecond. */
      const at = (d, h, m) => '2026-08-0' + d + 'T' + h + ':' + m + ':00.000Z';
      localStorage.setItem('postcall_journal_v1', JSON.stringify([
        { at: at(1, '09', '00'), what: 'session', to: 'post-call' },
        { at: at(2, '09', '00'), what: 'session', to: 'post-call' },
        { at: at(2, '09', '05'), what: 'deal.status', to: 'draft', ref: 'h0' },
        { at: at(2, '09', '05'), what: 'deal.price', to: 14000, ref: 'h0' },
        { at: at(2, '09', '12'), what: 'deal.price', from: 14000, to: 12000, ref: 'h0' },
        { at: at(2, '09', '25'), what: 'deal.status', from: 'draft', to: 'sent', ref: 'h0' },
        { at: at(3, '10', '00'), what: 'deal.status', to: 'draft', ref: 'h1' },
        { at: at(3, '10', '30'), what: 'deal.status', from: 'draft', to: 'sent', ref: 'h1' },
        { at: at(3, '11', '00'), what: 'deal.closed', from: 12000, to: 9000, ref: 'h1' },
        { at: at(4, '10', '00'), what: 'deal.status', to: 'draft', ref: 'h2' },
        { at: at(4, '10', '40'), what: 'deal.status', from: 'draft', to: 'sent', ref: 'h2' },
        { at: at(5, '10', '00'), what: 'deal.status', to: 'won', ref: 'h5', retro: true }
      ]));
    });
    await p.goto(base + '/post-call.html#ledger');
    await p.waitForTimeout(500);
    const painted = await p.evaluate(() =>
      !!document.querySelector('.hist-find') && !!document.querySelector('.hist-t'));
    assert.ok(painted, 'the fixture produced no findings, so this scan proves nothing');
    const funnel = await p.evaluate(() => {
      const s = document.getElementById('funnelSec');
      return !!s && !s.classList.contains('hidden') &&
             !!document.querySelector('#funnelBox .hist-t');
    });
    assert.ok(funnel, 'the funnel panel stayed hidden, so this scan never saw it');
    await scan(p, 'post-call.html · the track record and the funnel, with findings');
    await p.close();
  });

  await test('the transcript review, which is generated markup', async () => {
    const p = await ctx.newPage();
    await p.goto(base + '/post-call.html?demo=1');
    await p.waitForTimeout(800);
    await scan(p, 'post-call.html · extracted values under review');
    await p.close();
  });

  await test('the paywall, which is the one screen that blocks a task', async () => {
    const p = await ctx.newPage();
    await p.goto(base + '/post-call.html');
    await p.evaluate(() => document.getElementById('wall').classList.remove('hidden'));
    await p.waitForTimeout(150);
    await scan(p, 'post-call.html · export wall');
    await p.close();
  });

  console.log('\nprivacy');
  await test('the privacy page', async () => {
    const p = await ctx.newPage();
    await p.goto(base + '/privacy.html');
    await scan(p, 'privacy.html');
    await p.close();
  });

  console.log('\nnarrow viewport · 320px');
  await test('the entry and both tools at the narrowest phone width', async () => {
    const narrow = await browser.newContext({ viewport: { width: 320, height: 720 },
                                              colorScheme: SCHEME });
    for (const page of ['/', '/pre-call.html', '/post-call.html', '/privacy.html']) {
      const p = await narrow.newPage();
      await p.goto(base + page);
      await p.waitForTimeout(200);
      await scan(p, page + ' @320px');
      await p.close();
    }
    await narrow.close();
  });

  await browser.close();
  srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})();
