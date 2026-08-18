/* node assets/post-call.test.js — the page's own wiring, driven by clicking it.

   post-call.js is 47% of the code in this repository and had no suite of its
   own. Everything under it was tested and everything above it was tested: the
   reading engine has 46 assertions in transcript.test.js, the rungs have 34 in
   ladder.test.js, and the journey walks the product end to end. What nobody
   tested was the layer between them — the functions that only a click can
   reach. Measured with v8 coverage while the journey ran: 47 of the 77 named
   functions in post-call.js were entered, and 30 were never entered once.

   The largest dark cluster was the transcript panel, which is the newest thing
   the product does and the one this month's work went into. Its engine could
   be perfect and the panel still be wired to nothing, and every suite in the
   repository would stay green. That is the exact failure mode the journey file
   was written to catch, one altitude down.

   One engine. Nothing here is about rendering or about a browser quirk — it is
   about whether clicking a button reaches a function and whether that function
   changes the form. The journey is what runs in three engines; running this in
   three would triple the CI time to re-answer a question it already answers.

   Its own static server, like a11y.test.js and perf.test.js and journey.test.js
   before it. A fourth copy is one more than a pattern should need, and
   extracting a shared harness means editing three green browser suites — worth
   doing, not worth doing in the same change that adds a suite. */
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
    console.log('  install it, or set PW_ROOT to a directory that has it.\n');
    process.exit(0);
  }
}

let pass = 0, fail = 0;
const test = async (name, fn) => {
  try { await fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

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

/* ---------- fixtures ---------- */

/* A call with a process in it, speaker-labelled, spoken the way people speak:
   quantities in words, approximations, and the numbers spread across sentences
   rather than gathered into one. It carries a system (חשבשבת), a volume, a
   duration, an hourly rate and a per-incident cost — which is enough to reach
   the value rung and therefore to license the three cues that rung needs.

   Written to that shape and not lifted from a transcript. A fixture may carry
   the form of a real call; it may not carry a sentence somebody actually
   said. */
const CALL = [
  'לקוח: כל בוקר אני מוציא הזמנות מהמייל ומקליד אותן לחשבשבת ידנית.',
  'אני: כמה כאלה ביום?',
  'לקוח: בערך שלושים ביום, כל אחת לוקחת שמונה דקות בערך.',
  'לקוח: מי שעושה את זה עולה לי בערך תשעים שקל לשעה.',
  'לקוח: פעם בשבוע בערך יש טעות והלקוח מקבל משלוח לא נכון, וזה עולה לי סביב חמש מאות שקל בכל פעם.'
].join('\n');

/* The same call as speech-to-text actually returns it: no speaker labels at
   all. This is what twelve real transcripts look like, and the reason the
   panel asks who said it rather than deriving it. */
const UNLABELLED = CALL.replace(/^(לקוח|אני): /gm, '');

/* A call with nothing recurring in it — the soft call, which is the more
   common one. Nothing above the bottom rung holds, so no quantitative cue is
   licensed and the panel has no rows to show. What it must not do is show an
   empty box. */
const SOFT = [
  'ספר לי איך העסק נראה היום.',
  'אני צלם. פרויקט פה ופרויקט שם, בלי שום דבר קבוע.',
  'ומה זה שווה לך, לדעתך?',
  'קשה לי להגיד.'
].join('\n');

/* ---------- helpers ---------- */

const val = (page, id) => page.locator('#' + id).inputValue();
const rowKeys = page => page.$$eval('#trReview .tr-row [data-act="trtoggle"]',
  els => els.map(e => e.dataset.key));

async function paste(page, text) {
  await page.fill('#trIn', text);
}

async function readLocally(page, text) {
  await paste(page, text);
  await page.click('[data-act="trlocal"]');
  await page.waitForTimeout(120);
}

/* ---------- the suite ---------- */

(async () => {
  const { srv, base } = await serve();
  const engine = process.env.PW_ENGINE || 'chromium';
  let browser;
  try {
    browser = await playwright[engine].launch();
  } catch (e) {
    console.log('\n  skipped — ' + engine + ' is not installed here: ' + e.message.split('\n')[0]);
    srv.close(); process.exit(0);
  }
  const errors = [];
  /* A context each, not a page each. The page saves a draft to localStorage on
     every apply and offers it back on the next load, which is the behaviour the
     product wants and death to a suite that shares storage between tests: the
     second test would open onto the first one's numbers and pass or fail on
     them. Found the way it deserved to be found — a rejected row appeared to
     reach the form, and it was the previous test's row. */
  const contexts = [];
  const fresh = async () => {
    const c = await browser.newContext({ viewport: { width: 1000, height: 900 } });
    c.on('weberror', e => errors.push(String(e.error()).split('\n')[0]));
    contexts.push(c);
    const p = await c.newPage();
    p.on('pageerror', e => errors.push('pageerror: ' + e.message));
    await p.goto(base + '/post-call.html');
    await p.waitForLoadState('domcontentloaded');
    return p;
  };

  console.log('\nreading a call, through the button that reads it');

  await test('the primary button turns a pasted call into rows, each with its sentence', async () => {
    const p = await fresh();
    await readLocally(p, CALL);
    assert.ok(await p.locator('#trReview').isVisible(), 'the review panel never opened');
    const keys = await rowKeys(p);
    assert.ok(keys.length >= 3, 'expected the volume, the duration and the incident cost, got: ' + keys);
    const quotes = await p.$$eval('#trReview .tr-row .tr-q', els => els.map(e => e.textContent.trim()));
    quotes.forEach((q, i) => assert.ok(q.length > 10,
      'row ' + i + ' arrived without the sentence it came from: ' + JSON.stringify(q)));
    await p.close();
  });

  await test('nothing reaches the form until the operator says so', async () => {
    /* The whole promise of the panel is that it proposes. A row on the screen
       is not a number in the form, and the gap between them is a click. */
    const p = await fresh();
    await readLocally(p, CALL);
    assert.strictEqual(await val(p, 'q_freq'), '', 'the volume filled itself before anyone confirmed');
    assert.strictEqual(await val(p, 'q_minutes'), '', 'the duration filled itself before anyone confirmed');
    await p.click('[data-act="trapply"]');
    await p.waitForTimeout(150);
    assert.strictEqual(await val(p, 'q_freq'), '30');
    assert.strictEqual(await val(p, 'q_minutes'), '8');
    await p.close();
  });

  await test('the rate the call states does not arrive as the cost of a mistake', async () => {
    /* Two currency figures in this call: ninety an hour and five hundred a
       mistake. The incident cue matches both. Which one lands in q_err_cost is
       the difference between a defensible number and a fabricated one, and it
       is decided three files away — so it is worth checking here, where the
       operator would actually see it. */
    const p = await fresh();
    await readLocally(p, CALL);
    await p.click('[data-act="trapply"]');
    await p.waitForTimeout(150);
    assert.strictEqual(await val(p, 'q_err_cost'), '500',
      'the hourly rate reached the field that means "what one mistake costs"');
    await p.close();
  });

  await test('a row the operator removes does not reach the form', async () => {
    const p = await fresh();
    await readLocally(p, CALL);
    await p.click('#trReview [data-act="trtoggle"][data-key="errCost"]');
    await p.waitForTimeout(80);
    assert.ok(await p.locator('#trReview .tr-row.off').count() > 0, 'the removed row does not read as removed');
    await p.click('[data-act="trapply"]');
    await p.waitForTimeout(150);
    assert.strictEqual(await val(p, 'q_err_cost'), '', 'a rejected row filled the form anyway');
    assert.strictEqual(await val(p, 'q_freq'), '30', 'rejecting one row took the others with it');
    await p.close();
  });

  await test('putting a removed row back restores it', async () => {
    const p = await fresh();
    await readLocally(p, CALL);
    const sel = '#trReview [data-act="trtoggle"][data-key="freq"]';
    await p.click(sel); await p.waitForTimeout(60);
    await p.click(sel); await p.waitForTimeout(60);
    await p.click('[data-act="trapply"]');
    await p.waitForTimeout(150);
    assert.strictEqual(await val(p, 'q_freq'), '30', 'a row put back stayed out');
    await p.close();
  });

  const chipsOn = page => page.$$eval('#sysChips [aria-pressed="true"]',
    els => els.map(e => e.textContent.trim()));

  await test('the system the call named ends up selected, not just mentioned', async () => {
    /* observe() proposes it as an ordinary row, so it goes through the same
       review the figures do — and then it has to actually reach the chips,
       which is a different function in a different file. The chip is the
       category, never the product: the call says חשבשבת and the row the
       operator confirms is ERP, which is the chip that carries the premium-
       connector warning this integration is going to need. */
    const p = await fresh();
    await readLocally(p, CALL);
    const keys = await rowKeys(p);
    assert.ok(keys.includes('systems'), 'the call named a system and no row offered it: ' + keys);
    await p.click('[data-act="trapply"]');
    await p.waitForTimeout(150);
    assert.deepStrictEqual(await chipsOn(p), ['ERP'],
      'the confirmed system did not reach the chip that carries it');
    await p.close();
  });

  await test('a system with no category of its own still selects something', async () => {
    /* The failure this replaces was silent: a row proposed, a row confirmed,
       and no chip moved anywhere. A category the tool does not have is a
       reason to say "another system", never a reason to drop the answer. */
    const p = await fresh();
    await readLocally(p, 'לקוח: כל השעות של הצוות נרשמות בתוגל ומשם אני מוציא חשבוניות.');
    await p.click('[data-act="trapply"]');
    await p.waitForTimeout(150);
    const on = await chipsOn(p);
    assert.ok(on.length > 0, 'a confirmed system the catalog has no chip for vanished');
    assert.ok(on.includes('אחר'), 'expected the "other" chip, got: ' + on.join(', '));
    await p.close();
  });

  console.log('\nwho said it — asked, because it cannot be derived');

  await test('an unlabelled call asks the question on the row itself', async () => {
    const p = await fresh();
    await readLocally(p, UNLABELLED);
    const body = await p.textContent('#trReview');
    assert.ok(/מי אמר את זה/.test(body), 'a call with no speaker labels did not ask who spoke');
    await p.close();
  });

  await test('answering it changes what the tool concludes about the number', async () => {
    /* provenance() decides client-said versus operator-guessed on this field
       alone, and everything downstream turns on it: which method prices the
       deal, whether the ROI paragraph survives into the document. An
       unanswered call collapses to "mine". */
    const p = await fresh();
    await readLocally(p, UNLABELLED);
    await p.click('[data-act="trapply"]');
    await p.waitForTimeout(150);
    const before = await val(p, 'q_provenance');

    const q = await fresh();
    await readLocally(q, UNLABELLED);
    for (const k of await rowKeys(q)) {
      const btn = q.locator('[data-act="trwho"][data-key="' + k + '"][data-who="client"]');
      if (await btn.count()) { await btn.first().click(); await q.waitForTimeout(50); }
    }
    await q.click('[data-act="trapply"]');
    await q.waitForTimeout(150);
    const after = await val(q, 'q_provenance');

    assert.notStrictEqual(after, before,
      'saying the client said it changed nothing — provenance stayed ' + JSON.stringify(before));
    assert.strictEqual(before, 'mine', 'an unanswered call did not collapse to the weakest reading');
    await p.close(); await q.close();
  });

  await test('clicking the answer again puts the row back to undecided', async () => {
    /* Written into setSpeaker() on purpose: a control that cannot be undone is
       a control that gets answered carelessly the first time. */
    const p = await fresh();
    await readLocally(p, UNLABELLED);
    const key = (await rowKeys(p))[0];
    const sel = '[data-act="trwho"][data-key="' + key + '"][data-who="client"]';
    await p.click(sel); await p.waitForTimeout(60);
    assert.strictEqual(await p.getAttribute(sel, 'aria-pressed'), 'true');
    await p.click(sel); await p.waitForTimeout(60);
    assert.strictEqual(await p.getAttribute(sel, 'aria-pressed'), 'false',
      'the answer could be given and never taken back');
    await p.close();
  });

  await test('a labelled call is not asked, and says so instead of asking', async () => {
    const p = await fresh();
    await readLocally(p, CALL);
    const body = await p.textContent('#trReview');
    assert.ok(!/מי אמר את זה/.test(body), 'a call that says who spoke was asked anyway');
    assert.ok(!/הפעילו זיהוי דוברים/.test(body),
      'a labelled transcript was told to turn on diarization it already has');
    await p.close();
  });

  await test('an unlabelled call names the setting that fixes it', async () => {
    const p = await fresh();
    await readLocally(p, UNLABELLED);
    const body = await p.textContent('#trReview');
    assert.ok(/זיהוי דוברים/.test(body),
      'the panel reported the gap without naming what closes it');
    await p.close();
  });

  console.log('\nwhat the panel does when there is nothing to fill');

  await test('an empty transcript is told to paste one, and opens no review', async () => {
    const p = await fresh();
    await p.click('[data-act="trlocal"]');
    await p.waitForTimeout(120);
    assert.strictEqual(await p.locator('#trReview').isVisible(), false,
      'a review opened for a transcript that does not exist');
    assert.ok(/הדבק/.test(await p.textContent('#cpFlag')), 'nothing said what was missing');
    await p.close();
  });

  await test('a call with no process shows the reason, not an empty box', async () => {
    /* The rows are empty because nothing above the bottom rung was licensed —
       and that is the single most useful thing on the screen for this call, so
       hiding the panel hides it. */
    const p = await fresh();
    await readLocally(p, SOFT);
    assert.strictEqual((await rowKeys(p)).length, 0, 'a soft call produced figures');
    assert.ok(await p.locator('#trReview').isVisible(),
      'the panel hid the one thing worth reading on this call');
    const body = await p.textContent('#trReview');
    assert.ok(/על מה נשען המחיר/.test(body), 'the panel did not say what the price rests on');
    assert.ok(/מה חסר/.test(body), 'the panel did not say what to go back and ask');
    await p.close();
  });

  console.log('\nthe other path — the prompt, and what comes back from it');

  await test('the prompt carries the transcript, and never as markup', async () => {
    /* textContent, not innerHTML, with the reason written beside it in the
       source: the prompt contains the call verbatim, and a call is text
       somebody else produced. */
    const p = await fresh();
    const hostile = 'לקוח: אנחנו עובדים עם <b>מערכת</b> אחת, ו-<script>alert(1)</script> זה השם שלה.';
    await paste(p, hostile);
    await p.click('[data-act="trprompt"]');
    await p.waitForTimeout(120);
    const txt = await p.textContent('#trPromptText');
    assert.ok(txt.includes('<b>מערכת</b>'), 'the transcript did not reach the prompt intact');
    assert.strictEqual(await p.locator('#trPromptText b').count(), 0,
      'a tag in the transcript became an element in the page');
    assert.strictEqual(await p.locator('#trPromptText script').count(), 0,
      'a script tag in the transcript became a script tag in the page');
    await p.close();
  });

  await test('an answer pasted back becomes rows with quotes', async () => {
    const p = await fresh();
    await paste(p, CALL);
    await p.click('[data-act="trprompt"]');
    await p.waitForTimeout(120);
    const answer = await p.evaluate(() => window.PC.example.EXTRACTION);
    await p.fill('#trOut', answer);
    await p.click('[data-act="trparse"]');
    await p.waitForTimeout(150);
    assert.ok(await p.locator('#trReview').isVisible(), 'a parsed answer produced no review');
    assert.ok((await rowKeys(p)).length > 0, 'a parsed answer produced no rows');
    await p.close();
  });

  await test('an answer that is not one says so rather than filling nothing quietly', async () => {
    const p = await fresh();
    await paste(p, CALL);
    await p.click('[data-act="trprompt"]');
    await p.waitForTimeout(120);
    await p.fill('#trOut', 'סליחה, לא הבנתי את הבקשה.');
    await p.click('[data-act="trparse"]');
    await p.waitForTimeout(120);
    assert.ok((await p.textContent('#cpFlag')).length > 0, 'an unreadable answer said nothing at all');
    await p.close();
  });

  await test('reading the same call twice does not stack rows', async () => {
    /* trCandidates is module state and renderReview() rebuilds from it, so a
       second read has to replace the first rather than append to it. */
    const p = await fresh();
    await readLocally(p, CALL);
    const first = (await rowKeys(p)).length;
    await p.click('[data-act="trlocal"]');
    await p.waitForTimeout(120);
    assert.strictEqual((await rowKeys(p)).length, first, 'a second read doubled the rows');
    await p.close();
  });

  console.log('\nnothing threw');
  await test('no error anywhere in the panel', () => {
    assert.deepStrictEqual(errors, []);
  });

  for (const c of contexts) await c.close();
  await browser.close();
  srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})();
