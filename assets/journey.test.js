/* node assets/journey.test.js — the whole product, in a real browser, in
   every engine that will actually be used to open it.

   Everything else in this directory tests a module, a contract, or a piece
   of markup. This tests the thing the operator does: land on the entry
   page not knowing what either tool is, say which situation they are in,
   and come out the other side with a proposal. Two of the bugs this
   project has shipped were only ever visible from that altitude, and both
   were found by walking it rather than by any assertion above this file.

   Engines: whichever of chromium/firefox/webkit are installed. Nothing is
   skipped silently — an engine that is missing is named in the output, so
   "passed" never quietly means "passed on one engine".

     PW_ENGINES=chromium,firefox,webkit   pick engines explicitly
     PW_BASE=http://127.0.0.1:8940        point at an already-running server

   Requires playwright; if it is not resolvable the file exits 0 with a
   printed reason rather than failing CI on an environment problem. The
   engines are what this test is about, so a missing engine is reported —
   but a missing playwright is an absent harness, not a product defect. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');

let playwright;
try {
  playwright = require('playwright');
} catch (e) {
  try {
    playwright = require(path.join(process.env.PW_ROOT || '', 'node_modules', 'playwright'));
  } catch (e2) {
    console.log('\n  skipped — playwright not resolvable here.');
    console.log('  install it, or set PW_ROOT to a directory that has it, to run the journey.\n');
    process.exit(0);
  }
}

let pass = 0, fail = 0;
const results = [];
const test = async (name, fn) => {
  try { await fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

/* A static server good enough for three HTML files and a directory of
   assets. Deliberately not a dependency: the product is a static site, so
   the harness that proves it should not need a stack the product does not. */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
               '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
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

const WANTED = (process.env.PW_ENGINES || 'chromium,firefox,webkit').split(',').map(s => s.trim());

async function usableEngines() {
  const out = [];
  for (const name of WANTED) {
    const type = playwright[name];
    if (!type) { results.push({ engine: name, status: 'unknown engine name' }); continue; }
    try {
      const b = await type.launch();
      await b.close();
      out.push(name);
    } catch (e) {
      results.push({ engine: name, status: 'not installed here — ' + e.message.split('\n')[0].slice(0, 70) });
    }
  }
  return out;
}

/* ---------- the journey, once per engine ---------- */
async function journey(engineName, base) {
  const browser = await playwright[engineName].launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  const errors = [];
  ctx.on('weberror', e => errors.push(String(e.error()).split('\n')[0]));

  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  const label = s => '[' + engineName + '] ' + s;

  // --- the entry page, arriving cold ---
  await test(label('the entry page opens and asks where you are, not which tool you want'), async () => {
    await page.goto(base + '/');
    await page.waitForLoadState('domcontentloaded');
    const body = await page.textContent('body');
    assert.ok(/איפה אתם/.test(body), 'the entry does not ask the situational question');
    const cards = await page.locator('.card').count();
    assert.strictEqual(cards, 4, 'expected four situations, found ' + cards);
  });

  await test(label('a first visit shows nothing to resume — that box must not cry wolf'), async () => {
    const visible = await page.locator('#resumeBox').isVisible();
    assert.strictEqual(visible, false, 'a cold visit showed a "pick up where you left off" box');
  });

  // --- situation: about to have a call ---
  await test(label('"I have a call coming up" lands on the script builder'), async () => {
    await page.goto(base + '/');
    await page.click('a[href="pre-call.html"]');
    await page.waitForLoadState('domcontentloaded');
    assert.ok(page.url().endsWith('/pre-call.html'), 'landed on ' + page.url());
    assert.ok(await page.locator('#f_what').count() > 0, 'the profile form is not present');
  });

  await test(label('a script builds end to end and carries the business into the output'), async () => {
    await page.click('.stepbtn[data-s="2"]');
    await page.fill('#f_what', 'מסדר תהליכי גבייה לעסקים קטנים');
    await page.fill('#f_gain', 'כ-40,000 ₪ תזרים');
    await page.click('[data-act="go3"]');
    await page.fill('#p_name', 'דנה');
    await page.click('[data-act="build"]');
    const out = await page.textContent('#outArea');
    assert.ok(out.includes('מסדר תהליכי גבייה'), 'the business never reached the script');
    assert.ok(out.includes('דנה'), 'the prospect name never reached the script');
    assert.ok(out.includes('40,000'), 'the price anchor never reached the script');
  });

  // --- situation: just came out of a call ---
  await test(label('"I just got off a call" lands on the proposal builder'), async () => {
    await page.goto(base + '/');
    await page.click('a[href="post-call.html"]');
    await page.waitForLoadState('domcontentloaded');
    assert.ok(page.url().endsWith('/post-call.html'), 'landed on ' + page.url());
  });

  await test(label('four fields produce a real price and a real document'), async () => {
    await page.fill('#q_process', 'הזמנות מגיעות בוואטסאפ ומוקלדות ידנית לגיליון');
    await page.fill('#q_freq', '40');
    await page.selectOption('#q_freq_unit', '365');
    await page.fill('#q_minutes', '8');
    await page.click('#sysChips .chip >> nth=0');
    await page.waitForTimeout(250);
    const price = (await page.textContent('#s_price_top')).trim();
    assert.ok(/₪[\d,]+/.test(price), 'no price after a full set of answers, got: ' + price);
    const doc = await page.textContent('#proposal');
    assert.ok(doc.includes('הזמנות מגיעות בוואטסאפ'), 'the process never reached the document');
    assert.ok(/₪[\d,]+/.test(doc), 'the document carries no price');
  });

  await test(label('the price is traceable — the chain explains where it came from'), async () => {
    const flowVisible = await page.locator('#flowBox').isVisible();
    assert.ok(flowVisible, 'the "where did this price come from" chain never appeared');
    const flow = await page.textContent('#flowBox');
    assert.ok(flow.length > 40, 'the chain rendered empty');
  });

  /* --- situation: just looking ---
     In its own context, because localStorage is what this route branches
     on. Sharing the journey's context would mean testing the demo against
     whatever the previous step happened to leave behind — which is how the
     first version of this route shipped broken. */
  await test(label('"show me an example" loads the example on a clean arrival'), async () => {
    const clean = await browser.newContext();
    const fresh = await clean.newPage();
    await fresh.goto(base + '/post-call.html?demo=1');
    await fresh.waitForTimeout(700);
    const transcript = await fresh.inputValue('#trIn');
    assert.ok(transcript.length > 200, 'the demo transcript did not load (len ' + transcript.length + ')');
    const reviewVisible = await fresh.locator('#trReview').isVisible();
    assert.ok(reviewVisible, 'the extracted-values review never appeared for the demo');
    await clean.close();
  });

  await test(label('"show me an example" asks before replacing work in progress, and honours "no"'), async () => {
    const busy = await browser.newContext();
    const fresh = await busy.newPage();
    await fresh.goto(base + '/post-call.html');
    await fresh.fill('#q_process', 'הצעה שאני באמצע');
    await fresh.waitForTimeout(900);                   // debounced draft save

    fresh.once('dialog', d => d.dismiss());            // the operator says no
    await fresh.goto(base + '/post-call.html?demo=1');
    await fresh.waitForTimeout(700);
    assert.strictEqual(await fresh.inputValue('#q_process'), 'הצעה שאני באמצע',
      'declining the prompt still destroyed the unfinished proposal');
    assert.strictEqual((await fresh.inputValue('#trIn')).length, 0,
      'declining the prompt still loaded the demo');

    fresh.once('dialog', d => d.accept());             // and now says yes
    await fresh.goto(base + '/post-call.html?demo=1');
    await fresh.waitForTimeout(700);
    assert.ok((await fresh.inputValue('#trIn')).length > 200,
      'accepting the prompt did not load the demo');
    await busy.close();
  });

  // --- situation: chasing sent proposals ---
  await test(label('"what happened to my proposals" lands on the ledger, not the top of a form'), async () => {
    const fresh = await ctx.newPage();
    await fresh.goto(base + '/post-call.html#ledger');
    await fresh.waitForTimeout(600);
    const onScreen = await fresh.evaluate(() => {
      const b = document.getElementById('ledgerBox');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0;
    });
    assert.strictEqual(onScreen, true, 'the ledger was not scrolled into view');
    await fresh.close();
  });

  // --- returning mid-flow ---
  await test(label('an unfinished proposal is offered back on the entry page'), async () => {
    const fresh = await ctx.newPage();
    await fresh.goto(base + '/post-call.html');
    await fresh.fill('#q_process', 'תהליך שלא סיימתי');
    await fresh.fill('#q_client', 'לקוח חוזר');
    await fresh.waitForTimeout(900);          // the draft save is debounced
    await fresh.goto(base + '/');
    await fresh.waitForTimeout(250);
    const visible = await fresh.locator('#resumeBox').isVisible();
    assert.ok(visible, 'the entry did not notice an unfinished proposal');
    const text = await fresh.textContent('#resumeBox');
    assert.ok(text.includes('לקוח חוזר'), 'the resume line does not name the client it is about');
    await fresh.close();
  });

  await test(label('nothing threw anywhere in the whole journey'), async () => {
    assert.deepStrictEqual(errors, [], 'uncaught errors during the journey');
  });

  await browser.close();
}

(async () => {
  const { srv, base } = await serve();
  console.log('\nserving ' + root + ' at ' + base);

  const engines = await usableEngines();
  if (!engines.length) {
    console.log('\n  no browser engine could be launched — nothing was verified.');
    results.forEach(r => console.log('  · ' + r.engine + ': ' + r.status));
    srv.close();
    process.exit(1);
  }

  for (const e of engines) {
    console.log('\n' + e);
    await journey(e, base);
  }

  if (results.length) {
    console.log('\nengines not run here:');
    results.forEach(r => console.log('  · ' + r.engine + ': ' + r.status));
  }
  console.log('\nengines verified: ' + engines.join(', '));
  console.log(pass + ' passed, ' + fail + ' failed\n');
  srv.close();
  process.exit(fail ? 1 : 0);
})();
