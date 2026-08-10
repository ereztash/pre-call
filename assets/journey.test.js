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
    assert.ok(/שעות עבודה/.test(ics), 'the reminder must ask for the hours, or calibration never fills');
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
      controls: document.querySelectorAll('#scopeBox button').length,
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
       the change would be meaningless. */
    const total = await fresh.evaluate(() =>
      [...document.querySelectorAll('button,a,input,select,textarea,[tabindex]')]
        .filter(e => e.checkVisibility
          ? e.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true,
                                visibilityProperty: true })
          : (() => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })())
        .length);
    assert.ok(total <= 95,
      'POST-CALL paints ' + total + ' controls (ceiling 95, measured 92 on the corrected ' +
      'filter, where the same page measured 128 on the old one). ' +
      'Raise this deliberately or move something behind a disclosure.');

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

    const heights = [...new Set(t.map(f => f.doc))];
    assert.strictEqual(heights.length, 1,
      'the document changed height mid-scroll (' + heights.join(', ') +
      ') — that is what makes the page bounce');

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
