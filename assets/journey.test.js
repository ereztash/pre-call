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

  /* The two preferences the page carries: a theme and a language. The theme
     button cycles auto → dark → light and each choice must survive a
     reload, because a preference that resets is a control that lied. The
     language button reloads the page left-to-right — the dictionaries'
     completeness is i18n.test.js's job; the journey's job is that the
     mechanism actually turns the page around and comes back. */
  await test(label('the theme toggle cycles, applies, and survives a reload'), async () => {
    await page.goto(base + '/');
    await page.waitForLoadState('domcontentloaded');
    const btn = page.locator('.prefs button').first();
    await btn.click();                       // auto → dark
    let theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    assert.strictEqual(theme, 'dark', 'first click should pin the dark theme');
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    assert.strictEqual(theme, 'dark', 'the chosen theme did not survive a reload');
    await page.locator('.prefs button').first().click();   // dark → light
    await page.locator('.prefs button').first().click();   // light → auto
    theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    assert.strictEqual(theme, null, 'the cycle must come back to following the system');
  });

  await test(label('the language button turns the page around and back'), async () => {
    await page.goto(base + '/');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('.prefs button').nth(1).click();    // עברית → English
    await page.waitForLoadState('domcontentloaded');
    const dir = await page.evaluate(() => document.documentElement.dir);
    const lang = await page.evaluate(() => document.documentElement.lang);
    assert.strictEqual(dir, 'ltr', 'English must lay out left-to-right');
    assert.strictEqual(lang, 'en', 'the document language must say what it is');
    await page.locator('.prefs button').nth(1).click();    // English → עברית
    await page.waitForLoadState('domcontentloaded');
    assert.strictEqual(await page.evaluate(() => document.documentElement.dir), 'rtl',
      'the way back to Hebrew must restore right-to-left');
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
    // the profile IS step 1 now — no navigation before the first field
    await page.fill('#f_what', 'מסדר תהליכי גבייה לעסקים קטנים');
    await page.fill('#f_gain', 'כ-40,000 ₪ תזרים');
    await page.click('[data-act="go2"]');
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

  /* --- the loop, driven rather than seeded ---

     Every other ledger test here writes postcall_deals_v1 straight into
     localStorage and then checks what renders. That covers the read path and
     leaves the write path — the loop the product is built around — never
     executed: price a call, save it as a deal, report what it actually took,
     and let the comparison against the locked estimate turn the effort table
     from fitted-backwards into measured. pc-ledger.js is 663 lines with no
     suite of its own precisely because it is DOM and could not be reached
     from Node, and v8 coverage put 83% of it, and of deals.js, pc-history.js
     and pc-followup.js, outside every entry route.

     This drives it through the buttons a person would press. */
  await test(label('a call priced, saved, won and reported comes back as a claim the tool may now make'), async () => {
    const loop = await ctx.newPage();
    await loop.goto(base + '/post-call.html');
    /* Taking the document out of the page is what the key is for, and sending
       is one of those exits — so the loop cannot be driven at all without one.
       A locally valid key from tools/mint-key.js is enough: rehydrateKey()
       unlocks on the checksum and the server round-trip returns no verdict
       here, which it is written to treat as "leave it as it was". */
    await loop.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('postcall_key', 'PC-C2B3-3F3A');
    });
    await loop.goto(base + '/post-call.html');
    await loop.waitForTimeout(400);

    /* a process with a quantity and a duration is what the value method needs */
    await loop.fill('#q_client', 'מסעדה');
    await loop.fill('#q_process', 'כל הזמנה שנכנסת בוואטסאפ מוקלדת ידנית לגיליון');
    await loop.fill('#q_freq', '40');
    await loop.fill('#q_minutes', '8');
    await loop.waitForTimeout(500);

    const priced = await loop.evaluate(() => {
      const m = (typeof model === 'function') ? model() : null;
      return m && m.price > 0 ? m.price : null;
    });
    assert.ok(priced, 'the form did not reach a price, so nothing downstream is being tested');

    await loop.click('[data-act="save"]');
    await loop.waitForTimeout(400);
    const saved = await loop.evaluate(() => PC.deals.list().length);
    assert.strictEqual(saved, 1, 'pressing save did not put a deal in the ledger');

    const id = await loop.evaluate(() => PC.deals.list()[0].id);

    /* sent, and then the offer that only exists because it was sent: the
       document carries an expiry and the ledger offers a reminder before it
       runs out. The only way in is picking a send route — marking sent is a
       side effect of sending, never a button of its own, which is why writing
       this test found ACTIONS.sent sitting in the dispatch table with no
       markup anywhere that could reach it. `copy` is the route that does not
       open a window. */
    await loop.click('[data-act="send"]');
    await loop.waitForTimeout(300);
    await loop.click('[data-route="copy"]');
    await loop.waitForTimeout(400);
    const sent = await loop.evaluate(() => ({
      status: PC.deals.list()[0].status,
      sentAt: !!PC.deals.list()[0].sentAt,
      offer:  (document.getElementById('draftNote') || {}).textContent || '',
      ics:    document.querySelectorAll('[data-status="__ics"]').length
    }));
    assert.strictEqual(sent.status, 'sent', 'the sent button did not move the deal');
    assert.ok(sent.sentAt, 'nothing recorded when it went out, so no reminder can be dated');
    assert.ok(sent.ics > 0,
      'a proposal went out and the ledger offered no reminder before it expires: ' + sent.offer);

    /* mark it won, then report what it actually took */
    await loop.click(`[data-deal="${id}"][data-status="won"]`);
    await loop.waitForTimeout(300);
    assert.strictEqual(await loop.evaluate(() => PC.deals.list()[0].status), 'won',
      'the status button did not move the deal');

    const reported = await loop.evaluate(id => {
      const h = document.getElementById('oc_hours_' + id);
      const p = document.getElementById('oc_price_' + id);
      if (!h || !p) return 'no outcome controls rendered for a won deal';
      h.value = '30'; p.value = String(PC.deals.list()[0].priceQuoted);
      document.querySelector(`[data-deal="${id}"][data-status="__outcome"]`).click();
      return null;
    }, id);
    assert.strictEqual(reported, null, reported || '');
    await loop.waitForTimeout(300);

    const done = await loop.evaluate(() => ({
      hours: PC.deals.list()[0].outcome && PC.deals.list()[0].outcome.actualHours,
      est:   PC.deals.list()[0].estimatedHours,
      delivered: PC.history.deliveries(PC.deals.list()).length
    }));
    assert.strictEqual(Number(done.hours), 30, 'the reported hours never reached the record');
    assert.ok(done.est > 0, 'the estimate was not locked at save time, so nothing can be compared to it');
    assert.strictEqual(done.delivered, 1,
      'the loop ran and produced no measured delivery, which is the only thing that ' +
      'can turn the effort table from fitted-backwards into measured');
    await loop.close();
  });

  /* One delivery crosses nothing, and that is correct: MIN_DELIVERIES is 5,
     because an estimate cannot be called accurate from a single job. So the
     part worth pinning is that the loop leads somewhere — that the fifth one
     makes the tool able to say something the fourth could not. Four are
     seeded and the fifth is driven, so the announcement path runs for real. */
  await test(label('the fifth delivery is the one that lets the tool say something new'), async () => {
    const five = await ctx.newPage();
    await five.goto(base + '/post-call.html');
    await five.evaluate(() => {
      const mk = i => ({ id: 'seed' + i, client: 'c' + i, status: 'won',
        estimatedHours: 24, priceQuoted: 5000, method: 'value', pricedBy: 'value',
        outcome: { actualHours: 26 + i, closedPrice: 5000, at: '2026-0' + (i + 1) + '-01' } });
      localStorage.setItem('postcall_deals_v1',
        JSON.stringify([mk(0), mk(1), mk(2), mk(3)]));
    });
    await five.goto(base + '/post-call.html#ledger');
    await five.waitForTimeout(500);

    const gained = await five.evaluate(() => {
      const snap = () => PC.history.report(PC.deals.list(), PC.model.METHOD_LABEL,
                                           PC.PROVENANCE_LABEL, PC.deals.priceHold());
      const before = snap();
      const list = PC.deals.list();
      list.push({ id: 'fifth', client: 'c5', status: 'won', estimatedHours: 24,
        priceQuoted: 5000, method: 'value', pricedBy: 'value',
        outcome: { actualHours: 30, closedPrice: 5000, at: '2026-05-01' } });
      localStorage.setItem('postcall_deals_v1', JSON.stringify(list));
      return { crossed: PC.history.crossed(before, snap()).map(String),
               delivered: PC.history.deliveries(PC.deals.list()).length };
    });
    assert.strictEqual(gained.delivered, 5, 'the fifth delivery was not counted');
    assert.ok(gained.crossed.length > 0,
      'five measured deliveries and the tool still cannot say anything it could not before — ' +
      'the ledger leads nowhere');
    await five.close();
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

  /* Both of these come from simulating ten arrivals at the entry page.
     Neither was visible from reading the code, and both are the same
     mistake in different places: the product answering a question this
     particular person did not ask. */
  await test(label('arriving to review sent proposals does not get told to start a new one'), async () => {
    const c = await browser.newContext();
    const fresh = await c.newPage();
    await fresh.goto(base + '/privacy.html');
    await fresh.evaluate(() => localStorage.setItem('postcall_deals_v1', JSON.stringify([{
      id: '1', client: 'מסעדת הדר', status: 'sent', created: '2026-08-01T09:00:00.000Z',
      priceQuoted: 12000, estimatedHours: 20, form: { fields: {}, systems: [], scope: {} }
    }])));
    await fresh.goto(base + '/post-call.html#ledger');
    await fresh.waitForTimeout(700);
    const guideText = await fresh.evaluate(() =>
      (document.querySelector('#guideBar .guide-ask')?.textContent || '').trim());
    assert.strictEqual(guideText, '',
      'the sticky guide told a ledger visitor to describe a process — an instruction ' +
      'for work they did not come to do, pinned to the top of the screen the whole time');

    // and it comes back the moment they actually start one
    await fresh.fill('#q_process', 'תהליך חדש בכל זאת');
    await fresh.waitForTimeout(400);
    const backAgain = await fresh.evaluate(() =>
      (document.querySelector('#guideBar .guide-ask')?.textContent || '').trim());
    assert.ok(backAgain.length > 0, 'the guide must return once they do start building');
    await c.close();
  });

  await test(label('someone who picked the wrong card can see the way across, not only back'), async () => {
    const c = await browser.newContext();
    const fresh = await c.newPage();
    await fresh.goto(base + '/pre-call.html');
    await fresh.waitForTimeout(300);
    const visible = await fresh.evaluate(() =>
      [...document.querySelectorAll('a[href="post-call.html"]')]
        .some(a => a.getBoundingClientRect().height > 0));
    assert.ok(visible,
      'the only PRE-CALL→POST-CALL link sits in step 4, which is display:none on arrival — ' +
      'a wrong turn had no visible route across');
    await c.close();
  });

  /* The guide is the spine of the page and earns its size at rest. Pinned
     it was 298px — 35% of an iPhone 14 and 45% of an SE, permanently,
     with four controls underneath it. Half of that was self-inflicted: a
     min-height added to stop a layout shift turned a varying height into
     a fixed one. This holds the collapsed state to something a phone can
     afford. */
  /* The only trigger this product can build without a channel of its own, and it
     had no test driving it. Splitting the calendar module moved callIcs from
     PC.followup to PC.ical, PRE-CALL kept reaching for the old name, and the
     button silently produced nothing — found by a probe, not by this suite. The
     download is the whole feature, so the download is what gets asserted. */
  await test(label('PRE-CALL builds the calendar file for the call it is preparing you for'), async () => {
    const c = await browser.newContext({ acceptDownloads: true });
    const fresh = await c.newPage();
    const errs = [];
    fresh.on('pageerror', e => errs.push(e.message));
    await fresh.goto(base + '/pre-call.html');
    await fresh.fill('#f_what', 'מסדר תהליכי גבייה');
    await fresh.click('[data-act="go2"]');
    await fresh.fill('#p_co', 'מסעדת הדר');
    await fresh.click('[data-act="build"]');
    await fresh.waitForTimeout(400);
    await fresh.evaluate(() => { document.querySelector('.callcal').open = true; });

    // refuses before it has a date, rather than producing a file that opens nothing
    await fresh.click('[data-act="cal-dl"]');
    await fresh.waitForTimeout(250);
    assert.ok(/חסר/.test(await fresh.textContent('#calMsg')),
      'with no date it should say so, not silently do nothing');

    await fresh.fill('#cal_date', '2026-08-20');
    await fresh.fill('#cal_time', '14:30');
    await fresh.fill('#cal_len', '45');
    const [dl] = await Promise.all([
      fresh.waitForEvent('download'), fresh.click('[data-act="cal-dl"]')
    ]);
    const ics = fs.readFileSync(await dl.path(), 'utf8');
    const unfolded = ics.replace(/\r\n[ \t]/g, '');
    assert.ok(/TRIGGER;RELATED=END:PT15M/.test(unfolded),
      'the alarm is not anchored to the end of the call, which is the entire point');
    assert.strictEqual((ics.match(/BEGIN:VALARM/g) || []).length, 2, 'expected two alarms');
    assert.ok(/מסעדת הדר/.test(unfolded), 'the reminder does not say which call it is about');
    const name = dl.suggestedFilename();
    assert.ok(name.endsWith('.ics') && !/[^\x00-\x7F]/.test(name),
      'a non-ASCII filename is dropped whole by the browser: ' + name);
    assert.deepStrictEqual(ics.split('\r\n').filter(l => Buffer.byteLength(l, 'utf8') > 75), [],
      'lines over 75 octets — some calendar clients render those as mojibake');
    assert.deepStrictEqual(errs, [], 'the page threw while building the file');
    await c.close();
  });

  await test(label('the pinned guide collapses instead of owning a third of the phone'), async () => {
    const c = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const fresh = await c.newPage();
    await fresh.goto(base + '/post-call.html');
    await fresh.waitForTimeout(500);

    const atRest = await fresh.evaluate(() => {
      const g = document.getElementById('guideBar');
      return { stuck: g.classList.contains('stuck'),
               hasAsk: !!g.querySelector('.guide-ask')?.offsetHeight };
    });
    assert.strictEqual(atRest.stuck, false, 'the guide should not be collapsed at rest');
    assert.ok(atRest.hasAsk, 'the full instruction must be visible at rest');

    await fresh.evaluate(() => window.scrollBy(0, 800));
    await fresh.waitForTimeout(400);

    const pinned = await fresh.evaluate(() => {
      const g = document.getElementById('guideBar');
      const r = g.getBoundingClientRect();
      const covered = [...document.querySelectorAll('button,input,select,textarea,a')]
        .filter(el => { const b = el.getBoundingClientRect();
          return b.height > 0 && b.top < r.bottom && b.bottom > r.top && !g.contains(el); }).length;
      return { stuck: g.classList.contains('stuck'),
               pct: Math.round(r.height / window.innerHeight * 100),
               covered,
               keepsAction: !!g.querySelector('.guide-acts .act')?.offsetHeight,
               keepsTitle: !!g.querySelector('.guide-t')?.offsetHeight };
    });
    assert.strictEqual(pinned.stuck, true, 'the guide never collapsed on scroll');
    assert.ok(pinned.pct <= 15,
      'the pinned guide takes ' + pinned.pct + '% of the smallest common phone screen (limit 15%)');
    assert.ok(pinned.covered <= 2,
      'the pinned guide covers ' + pinned.covered + ' controls');
    assert.ok(pinned.keepsTitle && pinned.keepsAction,
      'collapsing must keep what to do and the button that does it');

    /* And then the operator does the obvious next thing: types. This walk
       stopped one step short of that, which is exactly how the collapse
       shipped broken — renderGuide rebuilds the bar's className on every
       keystroke, the observer had already fired and would not fire again,
       and the guide sprang back to 349px (52% of this screen) on the first
       character typed. Scrolling is not the end of the journey; scrolling
       and then working is. */
    await fresh.fill('#q_process', 'משהו שהמפעיל מקליד אחרי שגלל');
    await fresh.fill('#q_client', 'לקוח');
    await fresh.waitForTimeout(400);

    const working = await fresh.evaluate(() => {
      const g = document.getElementById('guideBar');
      return { stuck: g.classList.contains('stuck'),
               pct: Math.round(g.getBoundingClientRect().height / window.innerHeight * 100) };
    });
    assert.strictEqual(working.stuck, true,
      'the guide un-collapsed as soon as the operator typed — a re-render dropped the state');
    assert.ok(working.pct <= 15,
      'after typing, the pinned guide is back to ' + working.pct + '% of the screen (limit 15%)');
    await c.close();
  });

  /* The product computed an expiry for every proposal, printed it in the
     client's document, and did nothing with it — while the calibration it
     argues it exists for needs five delivered jobs reported back, and
     nothing ever asked. This is the asking. */
  await test(label('a proposal that has gone quiet says so, and offers a way to be reminded'), async () => {
    const c = await browser.newContext({ acceptDownloads: true });
    const fresh = await c.newPage();
    await fresh.goto(base + '/privacy.html');
    await fresh.evaluate(() => {
      const ago = n => new Date(Date.now() - n * 864e5).toISOString();
      const deal = (id, client, days) => ({
        id, client, status: 'sent', created: ago(days), sentAt: ago(days),
        priceQuoted: 9000, estimatedHours: 14, form: { fields: {}, systems: [], scope: {} } });
      localStorage.setItem('postcall_deals_v1', JSON.stringify(
        [deal('a', 'שותקת', 6), deal('b', 'עומדת לפוג', 12), deal('c', 'פג תוקפה', 20)]));
    });
    await fresh.goto(base + '/post-call.html#ledger');
    await fresh.waitForTimeout(700);

    const seen = await fresh.evaluate(() => ({
      ask: (document.querySelector('.ledger-act') || {}).textContent || '',
      states: [...document.querySelectorAll('.deal-due')]
        .map(n => (n.className.match(/due-(\w+)/) || [])[1]).sort(),
      flagged: document.querySelectorAll('.deal.deal-act').length,
      calendarButtons: document.querySelectorAll('[data-status="__ics"]').length
    }));
    assert.deepStrictEqual(seen.states, ['closing', 'expired', 'quiet'],
      'the ledger cannot tell a proposal sent this morning from one sent three weeks ago');
    assert.strictEqual(seen.flagged, 3);
    assert.ok(/מחכות לך/.test(seen.ask), 'nothing asks the operator for anything');
    assert.ok(seen.calendarButtons >= 3, 'no way to be reminded once the tab is closed');

    const [dl] = await Promise.all([
      fresh.waitForEvent('download'),
      fresh.click('[data-status="__ics"] >> nth=0')
    ]);
    const ics = require('fs').readFileSync(await dl.path(), 'utf8');
    assert.ok(ics.startsWith('BEGIN:VCALENDAR'), 'the calendar file is not a calendar file');
    /* Unfolded first, as any real calendar client does. RFC 5545 breaks long
       lines with CRLF plus a space and these lines are Hebrew, so this passing
       on the raw text would only mean a fold happened not to land inside the
       phrase — luck rather than a test. */
    assert.ok(/שעות עבודה/.test(ics.replace(/\r\n[ \t]/g, '')),
      'the reminder must ask for the hours, or calibration never fills');
    /* The filename as the BROWSER resolved it, which is the only place this
       could be checked. Chromium discards an <a download> value containing any
       non-ASCII character and saves the file as "download" with no extension —
       so the Hebrew name this used to build never once reached a real download,
       and what the operator got would not open in a calendar. Node cannot see
       that; a real download can. */
    const name = dl.suggestedFilename();
    assert.ok(name.endsWith('.ics'),
      'a calendar file without the extension opens nothing: ' + name);
    assert.ok(!/[^\x00-\x7F]/.test(name),
      'a non-ASCII filename is dropped whole by the browser: ' + name);
    await c.close();
  });

  /* The price used to move on every keystroke, and the cost was never the
     problem — 14.8ms median on a throttled phone. What it produced was. Typing
     "120" into "how often" showed ₪7,390, then ₪9,930, then ₪99,280; typing "45"
     into "minutes each" showed ₪49,640 and then ₪558,450. Three confident,
     fully formatted, wrong prices, with the document rebuilt around each. For an
     audience the product itself describes as having low numerical literacy, half
     a million shekels flashing past is worse than a blank.

     Numbers only. A truncated number is a different number; a truncated sentence
     is a shorter sentence, and the document showing less text as you type is
     honest. */
  await test(label('a half-typed number never becomes a price'), async () => {
    const c = await browser.newContext();
    const fresh = await c.newPage();
    await fresh.goto(base + '/post-call.html');
    await fresh.fill('#q_process', 'הזמנות מגיעות בוואטסאפ ומוקלדות ידנית לגיליון');
    await fresh.fill('#q_minutes', '8');
    await fresh.selectOption('#q_freq_unit', '365');
    await fresh.fill('#q_freq', '40');
    await fresh.click('#sysChips .chip >> nth=0');
    await fresh.waitForTimeout(700);
    const settled = await fresh.textContent('#s_price_top');
    assert.ok(/₪[\d,]+/.test(settled), 'no starting price to compare against: ' + settled);

    // type a three-digit number the way a person does, and watch the price
    const seen = await fresh.evaluate(async () => {
      const f = document.getElementById('q_freq');
      f.value = '';
      f.dispatchEvent(new Event('input', { bubbles: true }));
      const out = [];
      for (const ch of '120') {
        f.value += ch;
        f.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 130));
        out.push(document.getElementById('s_price_top').textContent.trim());
      }
      await new Promise(r => setTimeout(r, 800));      // the pause after typing
      out.push(document.getElementById('s_price_top').textContent.trim());
      return out;
    });
    const during = seen.slice(0, 3), after = seen[3];
    assert.deepStrictEqual([...new Set(during)], [settled.trim()],
      'the price moved while a number was still being typed: ' + JSON.stringify(during));
    assert.notStrictEqual(after, settled.trim(),
      'it never settled on the finished number either: ' + after);

    /* And the timer must never be the only way through. `change` fires when a
       field loses focus, so moving on has to settle it at once — otherwise the
       delay is felt by anyone who types and immediately looks up. */
    const instant = await fresh.evaluate(async () => {
      const f = document.getElementById('q_freq');
      f.value = '200';
      f.dispatchEvent(new Event('input', { bubbles: true }));
      f.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 80));       // far inside the debounce
      return document.getElementById('s_price_top').textContent.trim();
    });
    assert.notStrictEqual(instant, after,
      'leaving the field did not settle the price immediately: ' + instant);
    await c.close();
  });

  /* Question 12's own help text promises the answer "goes into the proposal as a
     timeline and as a decision date". Measured across eleven layers, it reached
     the document and one confidence counter — the decision date did not exist.
     This drives the whole chain in the running page: a date typed into the form,
     read at save, stored on the record, and used by the panel that chases. */
  await test(label('the date the client named reaches the panel that chases, not only the page'), async () => {
    const c = await browser.newContext();
    const fresh = await c.newPage();
    await fresh.goto(base + '/post-call.html');
    await fresh.fill('#q_process', 'הזמנות מגיעות בוואטסאפ ומוקלדות ידנית לגיליון');
    await fresh.fill('#q_freq', '40');
    await fresh.selectOption('#q_freq_unit', '365');
    await fresh.fill('#q_minutes', '8');
    await fresh.fill('#q_client', 'מסעדת הדר');
    /* Two days out, inside the closing window, and written the way somebody
       answers out loud rather than as an ISO string. */
    // question 12 lives behind the "the rest of the questions" drawer, which is
    // closed at rest on purpose — so it has to be opened, exactly as a person would
    await fresh.evaluate(() => {
      const d = [...document.querySelectorAll('details')]
        .find(x => x.querySelector('#q_deadline'));
      if (d) d.open = true;
    });
    await fresh.waitForTimeout(200);
    const soon = new Date(Date.now() + 2 * 864e5);
    const p2 = n => String(n).padStart(2, '0');
    const soonISO = soon.getFullYear() + '-' + p2(soon.getMonth() + 1) + '-' + p2(soon.getDate());
    await fresh.fill('#q_deadline', 'צריך שזה יעבוד עד ' + soon.getDate() + '/' + (soon.getMonth() + 1));
    await fresh.waitForTimeout(400);
    await fresh.click('[data-act="save"]');
    await fresh.waitForTimeout(400);

    const stored = await fresh.evaluate(() => {
      const d = PC.deals.list()[0] || {};
      return { deadline: d.clientDeadline || null, id: d.id };
    });
    assert.ok(stored.deadline,
      'the deadline was typed and read and still never reached the record');
    assert.strictEqual(stored.deadline, soonISO,
      'the stored date is not the one that was typed: ' + stored.deadline);

    await fresh.click('.sbtn[data-status="sent"]');
    await fresh.waitForTimeout(500);
    const row = await fresh.evaluate(() => {
      const el = document.querySelector('.deal-due');
      return { label: el ? el.textContent.trim() : '', state: el ? el.className : '' };
    });
    assert.ok(/closing/.test(row.state),
      'a proposal the client needs working in two days reads as fresh: ' + JSON.stringify(row));
    assert.ok(/הלקוח/.test(row.label),
      'the row says the offer is lapsing when what is closing is the client\'s own ' +
      'date — two different facts: ' + row.label);
    await c.close();
  });

  /* A price that moved is the one thing a deal row cannot get from the deal.
     The record holds the current price and nothing else — every earlier value
     was overwritten by the save that replaced it — so a quote that started at
     12,000 and went out at 10,000 reads, from the ledger, exactly like one that
     was 10,000 all along.

     Driven through the running page rather than asserted on the source,
     because everything load-bearing here is wiring: deals.js captures the
     journal once, at the moment its own file is evaluated. Get the script
     order wrong and every call below still succeeds, the save still returns a
     deal, nothing throws — and no transition is recorded. Only a browser that
     actually boots the page in order can tell the difference. */
  await test(label('a price that moved before the quote went out says so on the row'), async () => {
    const c = await browser.newContext();
    const fresh = await c.newPage();
    await fresh.goto(base + '/post-call.html');
    await fresh.waitForTimeout(400);
    const before = await fresh.evaluate(() => document.querySelectorAll('.deal-mv').length);
    assert.strictEqual(before, 0, 'a page with no deals on it claimed something moved');

    const wired = await fresh.evaluate(() => {
      const d = PC.deals.save({ client: 'מסעדת הדר', priceQuoted: 12000, estimatedHours: 20,
                                form: { fields: {}, systems: [], scope: {} } });
      PC.deals.save({ id: d.id, priceQuoted: 10000 });   // thought better of it
      PC.deals.setStatus(d.id, 'sent');                  // and only then sent it
      return { id: d.id, journalled: PC.journal.forDeal(d.id).length };
    });
    assert.ok(wired.journalled >= 3,
      'the running page recorded ' + wired.journalled + ' transitions for three ' +
      'mutations — deals.js was built before the journal was a global');

    await fresh.reload();
    await fresh.waitForTimeout(600);
    const row = await fresh.evaluate(() =>
      (document.querySelector('.deal-mv') || {}).textContent || '');
    assert.ok(/12,000/.test(row) && /10,000/.test(row),
      'the row shows one price where two existed: "' + row + '"');
    assert.ok(/לפני/.test(row),
      'a discount given before anyone asked reads the same as one that was ' +
      'negotiated, which is the distinction worth having: "' + row + '"');
    await c.close();
  });

  await test(label('#ledger works as an in-page link too, not only across a reload'), async () => {
    const c = await browser.newContext();
    const fresh = await c.newPage();
    await fresh.goto(base + '/post-call.html');
    await fresh.waitForTimeout(400);
    await fresh.evaluate(() => { location.hash = '#ledger'; });
    await fresh.waitForTimeout(400);
    const onScreen = await fresh.evaluate(() => {
      const b = document.getElementById('ledgerBox').getBoundingClientRect();
      return b.top < window.innerHeight && b.bottom > 0;
    });
    assert.strictEqual(onScreen, true,
      'a fragment change does not reload, so the route silently did nothing');
    await c.close();
  });

  /* All three found by an external review, and all three the same shape:
     the entry page re-deriving a rule that already had an owner elsewhere,
     and quietly disagreeing with it. */
  await test(label('an unanswered proposal still counts as waiting on the entry page'), async () => {
    const c = await browser.newContext();
    const fresh = await c.newPage();
    await fresh.goto(base + '/privacy.html');
    await fresh.evaluate(() => localStorage.setItem('postcall_deals_v1', JSON.stringify([{
      id: 'n', client: 'לא ענה', status: 'no_answer',
      created: new Date(Date.now() - 9 * 864e5).toISOString(),
      sentAt: new Date(Date.now() - 9 * 864e5).toISOString(),
      priceQuoted: 8000, estimatedHours: 12, form: { fields: {}, systems: [], scope: {} }
    }])));
    await fresh.goto(base + '/');
    await fresh.waitForTimeout(300);
    const visible = await fresh.locator('#resumeBox').isVisible();
    assert.ok(visible,
      'the ledger chases no_answer and the entry page ignored it — three files, three ideas of "waiting"');
    await c.close();
  });

  /* A draft is restored automatically at boot — no button, no confirmation — and
     applyDraft writes every stored value straight onto its element with no check
     that the element can hold it. Give a <select> a value that is not among its
     options and selectedIndex becomes -1, selectedOptions becomes empty, and
     readInputs() throws reading .text off undefined.

     readInputs() feeds model(), and model() feeds the price, the document, the
     guide and the save. So one stale string in one dropdown produces: no price,
     a document of zero characters, and a save button that silently does nothing
     — on load, every load, because the draft persists.

     Worse than the crash is what the operator is told. The error boundary
     catches it and says "the rest of the tool keeps working, and your saved data
     is intact", which is reassuring and, here, false.

     The realistic trigger is not corruption. It is the option list changing in
     any future version, or a backup file restored from an older one — and every
     operator holding a draft would then open a dead page. */
  await test(label('a dropdown value the page no longer offers does not kill the page'), async () => {
    const c = await browser.newContext();
    const fresh = await c.newPage();
    await fresh.goto(base + '/privacy.html');
    await fresh.evaluate(() => localStorage.setItem('postcall_draft_v1', JSON.stringify({
      at: new Date().toISOString(),
      fields: { q_process: 'הזמנות מגיעות בוואטסאפ ומוקלדות ידנית לגיליון',
                q_freq: '40', q_freq_unit: '365', q_minutes: '8', q_client: 'מסעדת הדר',
                c_scale: '3' },     // 0.7 / 1 / 1.5 / 2.2 are the options
      systems: [], scope: {}
    })));
    await fresh.goto(base + '/post-call.html');
    await fresh.waitForTimeout(700);
    const state = await fresh.evaluate(() => ({
      price: (document.getElementById('s_price_top') || {}).textContent.trim(),
      docChars: (document.getElementById('proposal').innerText || '').length,
      boundary: (document.getElementById('errBoundary') || {}).textContent.trim(),
      selectedIndex: document.getElementById('c_scale').selectedIndex
    }));
    /* Both mechanisms, pinned separately on purpose. Either guard alone makes the
       page survive, so asserting only "the page still works" would let a future
       edit delete one of them silently — the shape of test that passes for the
       wrong reason. This line pins applyDraft: the select must never be left in
       the unselectable state at all. The price and document below pin the
       defensive read, which has to hold whatever the cause. */
    assert.notStrictEqual(state.selectedIndex, -1,
      'the draft was applied to a select that cannot hold the value, leaving ' +
      'selectedIndex at -1 — every reader of that element is now one line from throwing');
    assert.ok(/₪[\d,]+/.test(state.price),
      'a stale dropdown value left the page with no price at all: ' + JSON.stringify(state));
    assert.ok(state.docChars > 200,
      'the document came back empty (' + state.docChars + ' chars) from one stale value');
    assert.strictEqual(state.boundary, '',
      'the error boundary fired on a plain page load: ' + state.boundary);
    await fresh.click('[data-act="save"]');
    await fresh.waitForTimeout(500);
    assert.strictEqual(await fresh.evaluate(() => PC.deals.list().length), 1,
      'the save button did nothing, and said nothing');
    await c.close();
  });

  /* The same state, reached without going through applyDraft — because the guard
     in readInputs exists to survive it whatever produced it, and with applyDraft
     filtering, that guard is never exercised by the test above. Forced here
     deliberately: a browser extension, a future feature that writes to the form,
     or any code path that has not learned this lesson gets the same one line
     wrong, and the page must still price and still save. */
  await test(label('an unselectable dropdown, however it got that way, still prices'), async () => {
    const c = await browser.newContext();
    const fresh = await c.newPage();
    await fresh.goto(base + '/post-call.html');
    await fresh.fill('#q_process', 'הזמנות מגיעות בוואטסאפ ומוקלדות ידנית לגיליון');
    await fresh.fill('#q_freq', '40');
    await fresh.selectOption('#q_freq_unit', '365');
    await fresh.fill('#q_minutes', '8');
    await fresh.waitForTimeout(400);
    const forced = await fresh.evaluate(() => {
      const s = document.getElementById('c_scale');
      s.value = 'nonsense-no-option-has-this';
      s.dispatchEvent(new Event('change', { bubbles: true }));
      // and nudge the chain, the way any edit would
      const t = document.getElementById('q_minutes');
      t.value = '9'; t.dispatchEvent(new Event('input', { bubbles: true }));
      return s.selectedIndex;
    });
    assert.strictEqual(forced, -1, 'the fixture failed to create the state under test');
    await fresh.waitForTimeout(600);
    const after = await fresh.evaluate(() => ({
      price: (document.getElementById('s_price_top') || {}).textContent.trim(),
      docChars: (document.getElementById('proposal').innerText || '').length,
      boundary: (document.getElementById('errBoundary') || {}).textContent.trim()
    }));
    assert.ok(/₪[\d,]+/.test(after.price), 'no price: ' + JSON.stringify(after));
    assert.ok(after.docChars > 200, 'the document emptied: ' + after.docChars + ' chars');
    assert.strictEqual(after.boundary, '', 'the error boundary fired: ' + after.boundary);
    await c.close();
  });

  await test(label('a draft of numbers alone is still offered back'), async () => {
    const c = await browser.newContext();
    const fresh = await c.newPage();
    await fresh.goto(base + '/post-call.html');
    // no process, no client — only figures and a system, which pc-draft.js
    // counts as content and the entry page used to miss entirely
    await fresh.fill('#q_freq', '40');
    await fresh.fill('#q_minutes', '8');
    await fresh.click('#sysChips .chip >> nth=0');
    await fresh.waitForTimeout(900);
    await fresh.goto(base + '/');
    await fresh.waitForTimeout(300);
    const seen = await fresh.evaluate(() => {
      const b = document.getElementById('resumeBox');
      return { visible: !b.classList.contains('hidden'), text: b.textContent };
    });
    assert.ok(seen.visible, 'POST-CALL would restore this draft; the entry page pretended it was empty');
    assert.ok(/לא סיימת/.test(seen.text), seen.text);
    await c.close();
  });

  await test(label('a genuinely untouched form still shows nothing to resume'), async () => {
    const c = await browser.newContext();
    const fresh = await c.newPage();
    await fresh.goto(base + '/post-call.html');
    await fresh.click('#sysChips .chip >> nth=0');   // touch, then untouch
    await fresh.click('#sysChips .chip >> nth=0');
    await fresh.waitForTimeout(900);
    await fresh.goto(base + '/');
    await fresh.waitForTimeout(300);
    assert.strictEqual(await fresh.locator('#resumeBox').isVisible(), false,
      'widening the rule must not make the box cry wolf on an empty form');
    await c.close();
  });

  await test(label('sending without a name warns loudly and still lets it through'), async () => {
    const c = await browser.newContext();
    const fresh = await c.newPage();
    await fresh.goto(base + '/post-call.html');
    await fresh.fill('#q_process', 'תהליך כלשהו');
    await fresh.fill('#q_client', 'לקוח');
    await fresh.click('#sysChips .chip >> nth=0');
    await fresh.waitForTimeout(400);
    await fresh.evaluate(() => { renderSend(); document.getElementById('sendBox').classList.remove('hidden'); });
    await fresh.waitForTimeout(200);
    const warned = await fresh.evaluate(() => {
      const w = document.querySelector('.send-anon');
      const routes = [...document.querySelectorAll('#sendBox [data-route]')];
      return { shown: !!w, text: w ? w.textContent : '',
               routesStillEnabled: routes.some(r => !r.disabled) };
    });
    assert.ok(warned.shown, 'no warning before an anonymous document goes out');
    assert.ok(/אין שם/.test(warned.text), warned.text);
    assert.ok(warned.routesStillEnabled,
      'this product warns and never blocks — the same rule that governs implausible numbers');

    await fresh.fill('#s_name', 'דנה לוי');
    await fresh.waitForTimeout(300);
    await fresh.evaluate(() => renderSend());
    assert.strictEqual(await fresh.evaluate(() => !!document.querySelector('.send-anon')), false,
      'the warning must clear the moment a name exists');
    await c.close();
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

  /* POST-CALL carries more controls than every other page put together,
     and one section used to hold 37% of them: seventeen scope rows of
     three buttons each, fifty-one in all. The argument against that was
     never the count — it was that the section's own copy said "כל שורה
     כבר מסומנת ... משנים רק מה שלא מתאים" and "רוב הפעמים אין מה לשנות",
     while the layout asked seventeen equally-weighted questions.

     Grouped by state, each row carries only the moves available to it,
     and the state is legible from which list an item is in rather than
     from decoding a lit chip seventeen times. This holds the shape: the
     three groups must exist, and no row may offer a move to where it
     already is. */
  /* How many choices are in front of you AT ONE DECISION — which is a different
     number from how many are on the page, and the difference is the whole point.

     This used to be a page total with a ceiling of 95, tacked onto the tail of
     the scope test. Two things were wrong with that. It measured the wrong thing:
     Hick's law is about the size of the choice set at a decision, and the
     research qualifying it is explicit that option complexity, relevance and
     presentation all confound a raw count — so 91 controls spread across seven
     sections is not the same situation as 91 in one place, and only the second is
     a problem. And the lineage the ceiling implied was worse than no lineage:
     Miller's 7±2 is the usual justification for capping visible items, Miller
     never studied menus, and the actual working-memory limit is nearer four
     (Cowan 2001) or three (LeCompte 1999). Nothing in this repo ever encoded a
     7-item rule, and nothing should.

     So: the primary ceiling is the busiest single section, measured at 44 on the
     form — the section where the operator is actually deciding. The page total
     stays as a looser second guard, because a page that grows without bound is
     still worse than one that does not, but it is no longer the headline. */
  const SECTION_CONTROL_CEILING = 48;   // measured 44 in the proposal form
  /* 95 → 97, and the two are named rather than absorbed: the theme toggle
     and the language toggle, which sit on every page of the product. They
     are real decisions and Hick's law does not care that they are chrome —
     so the ceiling moves by exactly two and not by "a bit of room". The
     section ceiling below is the one that matters and it did not move:
     these two are not in any section. */
  const PAGE_CONTROL_CEILING = 97;      // measured 91, then 93 across the whole page

  await test(label('no single section puts more choices in front of you than it has to'), async () => {
    /* Its own context at a pinned viewport, because the number is meaningless
       without one — the same page measured 91 at 390px and 98 at whatever size
       the shared context happened to be, and the old ceiling was set against an
       inherited size nobody had chosen. 390x844 is the size the perf harness
       already uses, for the reason written there: the target user is on a phone
       right after a meeting, not on the machine this was written on. */
    const own = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const fresh = await own.newPage();
    await fresh.goto(base + '/post-call.html');
    await fresh.fill('#q_process', 'מעקב אחרי לקוחות בגוגל שיטס');
    await fresh.waitForTimeout(400);
    const m = await fresh.evaluate(() => {
      const SEL = 'button,a,input,select,textarea,[tabindex]';
      /* checkVisibility, not a bounding rect: Chromium renders a closed
         <details> with content-visibility on the slot, which PRESERVES the
         layout boxes of its contents — so a rect filter counts controls that
         are not painted, cannot take focus and cannot be hit-tested, and the
         advice "move something behind a disclosure" could not reduce the number
         by one. */
      const vis = e => e.checkVisibility
        ? e.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true,
                              visibilityProperty: true })
        : (() => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })();
      const count = el => [...el.querySelectorAll(SEL)].filter(vis).length;
      return {
        total: [...document.querySelectorAll(SEL)].filter(vis).length,
        sections: [...document.querySelectorAll('main > .sec')]
          .map(s => ({ head: ((s.querySelector('h2') || {}).textContent || s.id || '?').trim().slice(0, 40),
                       n: count(s) }))
          .filter(x => x.n > 0).sort((a, b) => b.n - a.n)
      };
    });
    const worst = m.sections[0] || { head: 'none', n: 0 };
    const shown = m.sections.map(x => x.n + ' · ' + x.head).join(' | ');
    assert.ok(worst.n <= SECTION_CONTROL_CEILING,
      'one section paints ' + worst.n + ' controls at once ("' + worst.head + '"), over the ' +
      SECTION_CONTROL_CEILING + ' ceiling. That is the number a person faces at a ' +
      'single decision. Split it, or put part of it behind a disclosure. Sections: ' + shown);
    assert.ok(m.total <= PAGE_CONTROL_CEILING,
      'the page paints ' + m.total + ' controls in total, over the ' + PAGE_CONTROL_CEILING +
      ' ceiling. Sections: ' + shown);
    await own.close();
  });

  await test(label('the scope reads as three lists, not as seventeen questions'), async () => {
    const c = await browser.newContext();
    const fresh = await c.newPage();
    await fresh.goto(base + '/post-call.html');
    await fresh.fill('#q_process', 'כל הזמנה שנכנסת בוואטסאפ מוקלדת ידנית לגיליון');
    await fresh.click('#sysChips .chip >> nth=0');
    await fresh.waitForTimeout(400);

    const shape = await fresh.evaluate(() => ({
      groups: [...document.querySelectorAll('#scopeBox .scope-g')].map(g => ({
        state: [...g.classList].find(c => c.startsWith('scope-g-')),
        rows: g.querySelectorAll('.scope-row').length,
        counted: +g.querySelector('.scope-n').textContent })),
      /* .smove, not every button in the box. The reasons toggle lives here
         too and is not a move — counting it made "two moves per row" read 37
         against 36 and fail for a control that has nothing to do with the
         claim. */
      controls: document.querySelectorAll('#scopeBox .smove').length,
      rows: document.querySelectorAll('#scopeBox .scope-row').length,
      /* a row must never offer to send an item where it already is */
      selfMoves: [...document.querySelectorAll('#scopeBox .scope-g')].flatMap(g => {
        const s = [...g.classList].find(c => c.startsWith('scope-g-')).replace('scope-g-', '');
        return [...g.querySelectorAll('.smove')].filter(b => b.dataset.s === s)
          .map(b => s + ' offers ' + b.dataset.s);
      }),
      unlabelled: [...document.querySelectorAll('#scopeBox .smove')]
        .filter(b => !(b.getAttribute('aria-label') || '').includes('העבר')).length
    }));

    assert.ok(shape.groups.length >= 2,
      'the scope collapsed back to a single undifferentiated list');
    shape.groups.forEach(g => assert.strictEqual(g.rows, g.counted,
      g.state + ' shows ' + g.rows + ' rows and claims ' + g.counted));
    assert.deepStrictEqual(shape.selfMoves, [],
      'a row offers a move to the state it is already in');
    assert.strictEqual(shape.unlabelled, 0,
      'a move button reads as bare "כלול" out of context — it needs its row in the name');
    assert.strictEqual(shape.controls, shape.rows * 2,
      'expected two moves per row, got ' + shape.controls + ' across ' + shape.rows + ' rows');

    /* And the whole page, because this section is where it concentrates.

       The filter was a non-zero bounding rect, and it was counting controls that
       are not painted. Chromium renders a closed <details> with
       content-visibility on the slot, which PRESERVES the layout boxes of the
       contents — so every closed drawer on this page contributed its controls to
       a number whose own message says "paints". Measured while chasing an
       overrun: "שאר השאלות" alone was handing over 21, and the controls in a
       closed drawer were confirmed neither focusable (focus() did not take) nor
       hit-testable (elementFromPoint returned nothing).

       That made the ceiling self-consistent but its advice false: "move something
       behind a disclosure", the remedy this message suggests, could not reduce the
       number by one. checkVisibility() knows about content-visibility, so the
       count now means what the sentence claims, and a disclosure is worth
       something again.

       Re-baselined on the corrected filter rather than carried over: the old
       numbers (137, then 125) counted a different population and comparing across
       the change would be meaningless.

       The count itself moved out of this test's tail and into one of its own
       below, where it also stopped being a page total. */

    /* What the grouping cost, and had to give back. Moving an item is now
       a structural change instead of a chip lighting up, and the first
       version lost two things the old three-button row had for free:
       pressing Enter on a move put focus on <body>, and where the old row
       toggled aria-pressed — which a screen reader announces — nothing
       said anything at all. Neither breaks a rule, and axe reads markup
       rather than what happens after an interaction, so neither would
       ever have surfaced on its own. */
    const moved = await fresh.evaluate(() => {
      const btn = document.querySelector('.scope-g-in .smove-out');
      const id = btn.dataset.i;
      btn.focus();
      btn.click();
      const a = document.activeElement;
      return {
        onBody: a === document.body,
        followsItem: !!(a && a.dataset && a.dataset.i === id),
        announced: (document.getElementById('scopeLive') || {}).textContent || '',
        landedIn: (() => { const b = document.querySelector('[data-i="' + id + '"]');
          return b ? b.closest('.scope-g').className : 'gone'; })()
      };
    });
    assert.strictEqual(moved.onBody, false,
      'focus fell to <body> after a move — the row has meanwhile gone to another group, ' +
      'so there is nothing to tab back to');
    assert.ok(moved.followsItem,
      'focus went somewhere, but not to the item that moved');
    assert.ok(/הועבר/.test(moved.announced),
      'the move is silent to a screen reader: ' + JSON.stringify(moved.announced));
    assert.ok(/scope-g-out/.test(moved.landedIn),
      'the item did not land in the group it was sent to');
    await c.close();
  });

  /* The largest UX number in the product that was out of band, and one
     nothing else could have caught: it breaks no rule, fails no contrast
     check, and at a 920px container the layout looks perfectly sensible.

     Measured before the cap, on a desktop viewport: POST-CALL's
     explanatory paragraphs ran a median of 131 characters per line,
     against a typographic guideline of 45-75 and an outer bound near 90
     where the eye starts losing its way back to the start of the next
     line. Every page was over it. That is the specific mechanism behind
     dense prose reading as a wall of text rather than as writing.

     Measured here rather than in CSS because the number that matters is
     the painted one — it depends on the font, the container, the padding
     and the viewport at once, and no static rule about max-width can
     stand in for it. */
  await test(label('no line of prose runs past the width an eye can track'), async () => {
    const c = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    for (const url of ['/', '/pre-call.html', '/post-call.html', '/privacy.html']) {
      const p = await c.newPage();
      await p.goto(base + url);
      await p.waitForTimeout(400);
      const wide = await p.evaluate(() => {
        /* Characters per line measured with the element's own font rather
           than estimated from font-size — the `ch` unit is the width of
           "0", which is not what Hebrew prose is made of. */
        const cv = document.createElement('canvas').getContext('2d');
        const chars = e => {
          const s = getComputedStyle(e);
          cv.font = s.fontWeight + ' ' + s.fontSize + ' ' + s.fontFamily;
          const glyph = cv.measureText('אבגדהוזחטיכלמנסעפצקרשת ').width / 23;
          const box = e.getBoundingClientRect().width -
            parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
          return Math.round(box / glyph);
        };
        /* Only elements that actually hold the text themselves. A flex row
           whose prose lives in a capped child is as wide as the row, and
           measuring it reports a line length nobody ever sees — the
           grouped scope list tripped exactly that and named thirteen
           false positives at 99ch while the text inside them was capped
           at 64. Same class of error as measuring an inline element's
           clientWidth: the box is not the line. */
        const ownText = e => [...e.childNodes]
          .filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').length;
        return [...document.querySelectorAll('p, li, .lead, .hint-p, .sub')]
          .filter(e => { const r = e.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; })
          .filter(e => ownText(e) > 60)
          .map(e => ({ c: (e.className || e.tagName).toString().slice(0, 24), n: chars(e) }))
          .filter(x => x.n > 90)
          .map(x => x.c + ' at ' + x.n + 'ch');
      });
      await p.close();
      assert.deepStrictEqual(wide, [],
        url + ' has prose past 90 characters per line: ' + wide.join(', '));
    }
    await c.close();
  });

  /* Reported as "the demo screen jumps", and it did. Loading ?demo=1
     starts a 1048px smooth scroll; partway through it the guide passed
     its sentinel and collapsed, which removed ~240px from the flow, which
     moved the scroll target, which moved the page, which un-collapsed the
     guide. Measured: the scroll position went backwards three times and
     the guide changed size four times in 180ms.

     Cumulative layout shift stayed at 0.003 the whole time, because CLS
     excludes shifts within 500ms of a scroll — the one metric watching
     this corner is blind to it by design. So this asserts the two things
     that actually characterise the fault: the document must not change
     height when the guide collapses, and a scroll animation must never
     run backwards. */
  await test(label('loading the example scrolls once, without the page fighting it'), async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const fresh = await c.newPage();
    await fresh.addInitScript(() => {
      window.__t = [];
      const tick = () => {
        window.__t.push({ y: Math.round(window.scrollY),
                          doc: document.documentElement.scrollHeight });
        if (performance.now() < 2600) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await fresh.goto(base + '/post-call.html?demo=1');
    await fresh.waitForTimeout(3000);

    /* Only the frames from the moment the scroll starts. Before that the
       page is still being filled by the demo, and growing then is exactly
       what a page is supposed to do. */
    const all = await fresh.evaluate(() => window.__t);
    const start = all.findIndex(f => f.y > 0);
    assert.ok(start > -1, 'the demo never scrolled at all');
    const t = all.slice(start);

    /* A tolerance, not an exact match, and the size of it is the whole point.

       The fault this was written for is the pinned guide collapsing mid-scroll
       and taking ~240px of document with it. What webkit actually does on this
       page is finish laying out 21px later than it starts — 15,064 to 15,085,
       0.14% of the document — every run, on the base branch and on this one,
       byte for byte the same two numbers. Chromium and firefox do not.

       Demanding a single height made the suite red on all three engines for a
       settle no eye can see, on a page nobody had changed. 40px is under a
       fifth of the fault and about one line of text, so the collapse still
       fails here and the settle does not.

       The strict half stays strict: a scroll that runs backwards is the page
       actually fighting the animation, and that assertion passes on all three
       engines today. It is the one that would catch the fault first. */
    const heights = [...new Set(t.map(f => f.doc))];
    const spread = Math.max(...heights) - Math.min(...heights);
    const SETTLE = 40;
    assert.ok(spread <= SETTLE,
      'the document changed height by ' + spread + 'px mid-scroll (' + heights.join(', ') +
      ') — over the ' + SETTLE + 'px a late layout settle can explain, which is what makes the page bounce');

    /* A smooth scroll only ever moves one way. Any backward step is the
       animation being fought by a layout change. A one-pixel tolerance
       covers sub-pixel rounding in the engines. */
    const back = [];
    for (let i = 1; i < t.length; i++)
      if (t[i].y < t[i - 1].y - 1) back.push(t[i - 1].y + ' -> ' + t[i].y);
    assert.deepStrictEqual(back, [],
      'the scroll ran backwards: ' + back.join(', '));
    await c.close();
  });

  /* The product spends a lot of words being honest that its numbers are
     defaults rather than measurements. This panel is where some of that
     stops being an assertion. What it must never do is grow quiet as it
     learns: the questions it still cannot answer have to stay on screen
     next to the ones it can, or its silence starts reading as agreement. */
  await test(label('the track record shows what it knows and what it still cannot say'), async () => {
    const c = await browser.newContext();
    const fresh = await c.newPage();

    await fresh.goto(base + '/post-call.html');
    await fresh.waitForTimeout(300);
    const empty = await fresh.evaluate(() => {
      const s = document.getElementById('historySec');
      return !s || s.getBoundingClientRect().height === 0;
    });
    assert.ok(empty, 'with nothing saved, a panel explaining what it would show is still empty furniture');

    await fresh.evaluate(() => {
      localStorage.setItem('postcall_deals_v1', JSON.stringify(
        [0, 1, 2, 3, 4, 5].map(i => ({
          id: 'j' + i, client: 'לקוח ' + (i + 1), status: 'won',
          priceQuoted: 12000, pricedBy: i < 3 ? 'value' : 'market',
          estimatedHours: 10, created: '2026-0' + (i + 1) + '-01T09:00:00.000Z',
          outcome: { actualHours: [18, 17, 16, 13, 13, 12][i], closedPrice: 12000,
                     at: '2026-0' + (i + 1) + '-20T09:00:00.000Z' }
        }))));
    });
    /* reload(), not goto('...#ledger'): navigating from post-call.html to
       post-call.html#ledger differs only by fragment, so the browser does
       a same-document navigation and never re-runs a line of script. The
       first version of this test did exactly that and reported the panel
       missing when the panel was fine. */
    await fresh.reload();
    await fresh.waitForTimeout(500);

    const panel = await fresh.evaluate(() => {
      const box = document.getElementById('historyBox');
      return {
        shown: !!box && box.getBoundingClientRect().height > 0,
        findings: document.querySelectorAll('.hist-find').length,
        methodRows: document.querySelectorAll('.hist-t tbody tr').length,
        gaps: document.querySelectorAll('.hist-gap-l li').length,
        text: box ? box.innerText : ''
      };
    });
    assert.ok(panel.shown, 'six delivered jobs and the track record never appeared');
    assert.ok(panel.findings >= 1, 'six deliveries produced no finding at all');
    assert.strictEqual(panel.methodRows, 2, 'both pricing methods reached the threshold and should be listed');
    assert.ok(panel.gaps >= 1,
      'the panel found something and then went silent about what it still cannot say');
    assert.ok(!/NaN|undefined|\[object/.test(panel.text),
      'a raw JS value reached the screen: ' + panel.text.slice(0, 200));

    /* A four-column table is exactly the shape that has broken the
       narrowest phone width in this project before — the comparison
       tables in PRE-CALL did, and nothing noticed until someone opened
       one at 320px. The other scans reach this width with an empty
       ledger, so the panel is hidden and unmeasured there. */
    await fresh.setViewportSize({ width: 320, height: 800 });
    await fresh.waitForTimeout(300);
    const narrow = await fresh.evaluate(() => {
      const doc = document.documentElement;
      return {
        page: doc.scrollWidth - doc.clientWidth,
        parts: [...document.querySelectorAll('#historyBox *')]
          /* clientWidth is defined as 0 for non-replaced inline elements,
             so scrollWidth - clientWidth is the element's whole width for
             every <b> and <span> on the page. Chromium and WebKit happened
             to report 0 here and Firefox reported the truth, which made a
             correct layout look broken in one engine only. Measure the
             boxes that can actually overflow. */
          .filter(e => getComputedStyle(e).display !== 'inline')
          .map(e => ({ c: e.className || e.tagName, over: e.scrollWidth - e.clientWidth }))
          .filter(x => x.over > 1)
      };
    });
    assert.strictEqual(narrow.page, 0,
      'the track record pushes the page sideways at 320px');
    assert.deepStrictEqual(narrow.parts, [],
      'something inside the track record overflows at 320px');
    await c.close();
  });

  /* The static half of this lives in markup.test.js. This is the half a
     stylesheet cannot answer: whether anything the page decided to hide
     at runtime is nevertheless painted. POST-CALL shipped an empty 26px
     turquoise strip above the guide on every fresh load — .draftnote
     carried class="hidden" and set display:flex four hundred lines
     further down, so the utility lost on source order. It was found by
     taking a screenshot and looking at it, which is not a method that
     scales; this is. */
  await test(label('nothing the page marked hidden is painted anyway'), async () => {
    for (const url of ['/', '/pre-call.html', '/post-call.html', '/privacy.html']) {
      const c = await browser.newContext();
      const p = await c.newPage();
      await p.goto(base + url);
      await p.waitForTimeout(400);
      const painted = await p.evaluate(() =>
        [...document.querySelectorAll('.hidden')]
          .filter(el => el.getBoundingClientRect().height > 0)
          .map(el => (el.id || el.className) + ' · ' +
                     Math.round(el.getBoundingClientRect().height) + 'px'));
      await c.close();
      assert.deepStrictEqual(painted, [],
        url + ' paints elements it marked hidden: ' + painted.join(', '));
    }
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
