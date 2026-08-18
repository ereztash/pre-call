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

   With this file the same measurement reads 72 of 78. Two other files came
   along with it: pc-gate.js — the one paid door, 41 assertions in Node and
   never once a key pasted into the field — from 12 of 19 to 17, and
   pc-followup.js to 11 of 13.

   What it found on the way there: a rate arriving in the field that means
   "what one mistake costs", a system the operator confirmed reaching no chip
   at all, and one deal missing one date turning the whole ledger into an error
   box. None of the three threw anything a person would see.

   What is still dark, in all three files: the clipboard, the print dialog, the
   file picker, the FileReader error branch, the payment button that has no
   payment link behind it yet, and the tr() shims that only run when pc-i18n.js
   is absent. A test for those would be asserting the harness.

   One engine. Nothing here is about rendering or about a browser quirk — it is
   about whether clicking a button reaches a function and whether that function
   changes the form. The journey is what runs in three engines; running this in
   three would triple the CI time to re-answer a question it already answers.

   The server, the playwright lookup and the one-profile-per-test rule live in
   tools/page-harness.js, shared with the suite that does the same for
   PRE-CALL. journey.test.js, a11y.test.js and perf.test.js still carry their
   own copies and are left alone: they are green, and rewriting three passing
   suites to share a file is churn with no behavioural gain. */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const H = require('../tools/page-harness.js');

const root = H.root;
const playwright = H.resolvePlaywright();
if (!playwright) {
  console.log('\n  skipped — playwright not resolvable here.');
  console.log('  install it, or set PW_ROOT to a directory that has it.\n');
  process.exit(0);
}
const { test, state } = H.runner();

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
  const { srv, base } = await H.serve();
  const engine = process.env.PW_ENGINE || 'chromium';
  let browser;
  try {
    browser = await playwright[engine].launch();
  } catch (e) {
    console.log('\n  skipped — ' + engine + ' is not installed here: ' + e.message.split('\n')[0]);
    srv.close(); process.exit(0);
  }
  const errors = [];
  const { open: contexts, fresh } = H.profiles(browser, base, '/post-call.html', errors);

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

  console.log('\nstarting from a known process');

  /* The template row is the other front door, and the faster one: one click
     sets systems, typical numbers, and every scope decision for that kind of
     job. Seven of the functions behind it were never entered by any test —
     which for a path that rewrites the whole form at once is the least
     comfortable place on the page to have no coverage. */

  const templates = page => page.locator('#tplChips .tpl');
  const scopeState = page => page.$$eval('#scopeBox .scope-g', gs => {
    const out = {};
    gs.forEach(g => {
      const state = [...g.classList].find(c => /^scope-g-/.test(c)).replace('scope-g-', '');
      g.querySelectorAll('.scope-row .smove').forEach(b => { out[b.dataset.i] = state; });
    });
    return out;
  });

  await test('one click fills the systems, the numbers and the scope, and prices it', async () => {
    const p = await fresh();
    await templates(p).first().click();
    await p.waitForTimeout(200);
    const on = await chipsOn(p);
    assert.ok(on.length >= 2, 'a template that names three systems selected ' + on.length);
    assert.ok((await val(p, 'q_freq')).length > 0, 'the template left the volume empty');
    assert.ok((await val(p, 'q_minutes')).length > 0, 'the template left the duration empty');
    const price = await p.textContent('#s_price');
    assert.ok(/\d/.test(price), 'a filled form produced no price: ' + JSON.stringify(price));
    await p.close();
  });

  await test('the numbers say they are typical and not measured', async () => {
    /* The whole template idea is defensible only with this sentence attached.
       Without it the tool hands over a page of confident figures nobody
       collected, which is the thing it argues against everywhere else. */
    const p = await fresh();
    await templates(p).first().click();
    await p.waitForTimeout(200);
    const note = await p.textContent('#tplNote');
    assert.ok(/לא נמדדו/.test(note), 'the template presented invented numbers as findings');
    await p.close();
  });

  await test('the note names each row it moved, where it went, and why', async () => {
    const p = await fresh();
    await templates(p).first().click();
    await p.waitForTimeout(200);
    const moves = await p.$$eval('#tplNote .tpl-move-moved', els => els.map(e => ({
      row: e.querySelector('.tpl-move-t').textContent.trim(),
      to: e.querySelector('.tpl-move-s').textContent.trim(),
      why: e.querySelector('.tpl-move-w').textContent.trim()
    })));
    assert.ok(moves.length > 0, 'a template that moves scope rows explained none of them');
    moves.forEach(m => {
      assert.ok(m.row.length > 3, 'a move with no row name: ' + JSON.stringify(m));
      assert.ok(m.to.length > 0, m.row + ' moved somewhere the note does not name');
      assert.ok(m.why.length > 15, m.row + ' moved with a label instead of a reason: ' + m.why);
    });
    await p.close();
  });

  await test('the scope list agrees with the note that describes it', async () => {
    /* Two renderings of one decision, and nothing but this makes them match:
       the note reads the template's scope object and the list reads the state
       the page is holding. A template that set one and not the other would
       show a reason for a move that never happened. */
    const p = await fresh();
    await templates(p).first().click();
    await p.waitForTimeout(200);
    const said = await p.$$eval('#tplNote .tpl-move-moved .tpl-move-t', els => els.map(e => e.textContent.trim()));
    const labels = await p.$$eval('#scopeBox .scope-g', gs => {
      const out = {};
      gs.forEach(g => {
        const state = g.querySelector('.scope-g-h').textContent.trim();
        g.querySelectorAll('.scope-row').forEach(r => {
          out[r.querySelector('.scope-t').childNodes[0].textContent.trim()] = state;
        });
      });
      return out;
    });
    said.forEach(row => assert.ok(row in labels,
      'the note explains moving "' + row + '" and the scope list does not show it at all'));
    await p.close();
  });

  await test('a second template replaces the first instead of layering on it', async () => {
    /* Written into applyTemplate as "applied over the defaults, never over
       whatever the last template left". A template that only adds would leave
       an operator who tried two of them with a scope belonging to neither. */
    const p = await fresh();
    await templates(p).nth(1).click();
    await p.waitForTimeout(200);
    const second = await scopeState(p);

    const q = await fresh();
    await templates(q).first().click();
    await q.waitForTimeout(150);
    await templates(q).nth(1).click();
    await q.waitForTimeout(200);
    const afterBoth = await scopeState(q);

    assert.deepStrictEqual(afterBoth, second,
      'picking a template after another one left a scope belonging to neither');
    await p.close(); await q.close();
  });

  await test('the chosen template is the one shown as chosen', async () => {
    const p = await fresh();
    await templates(p).nth(1).click();
    await p.waitForTimeout(200);
    const pressed = await p.$$eval('#tplChips .tpl',
      els => els.map(e => e.getAttribute('aria-pressed')));
    assert.strictEqual(pressed.filter(x => x === 'true').length, 1,
      'expected exactly one template marked chosen, got: ' + pressed.join(','));
    assert.strictEqual(pressed[1], 'true', 'the mark is on a template nobody clicked');
    await p.close();
  });

  await test('confirming the scope moves the operator on rather than staying put', async () => {
    const p = await fresh();
    await templates(p).first().click();
    await p.waitForTimeout(200);
    const before = await p.textContent('#guideBar');
    await p.click('[data-act="confirmscope"]');
    await p.waitForTimeout(200);
    assert.notStrictEqual(await p.textContent('#guideBar'), before,
      'confirming the scope changed nothing the operator can see');
    await p.close();
  });

  console.log('\ngetting the data out, and back in');

  /* The product keeps everything in one browser and says so on every page, and
     the backup is the entire answer to "so what happens when I clear my
     cookies". pc-backup.js is tested in Node; every function that connects it
     to a button was dark. A round trip through the actual controls is the only
     thing that shows the two halves are connected. */

  const seedDeal = page => page.evaluate(() => {
    localStorage.setItem('postcall_deals_v1', JSON.stringify([{
      id: 'D-TEST-1', client: 'בדיקה', status: 'sent',
      estimatedHours: 24, priceQuoted: 7200, method: 'value', pricedBy: 'value'
    }]));
  });

  /* Saved out rather than read where it lands: playwright deletes a download
     when its context closes, and these contexts are closed as the suite moves
     on. The file has to outlive the browser it came from, which is the whole
     point of a backup anyway. */
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'pc-backup-'));
  const takeBackup = async () => {
    const p = await fresh({ acceptDownloads: true });
    await seedDeal(p);
    await p.reload();
    const [dl] = await Promise.all([
      p.waitForEvent('download'),
      p.click('[data-act="backup-export"]')
    ]);
    const dest = path.join(tmp, dl.suggestedFilename());
    await dl.saveAs(dest);
    return { page: p, file: dest, name: dl.suggestedFilename() };
  };

  await test('the export button produces a file with the deals in it', async () => {
    const b = await takeBackup();
    assert.ok(/\.json$/.test(b.name), 'the backup came down as ' + b.name);
    const body = fs.readFileSync(b.file, 'utf8');
    assert.ok(body.includes('D-TEST-1'), 'the backup does not contain the deal it was taken of');
    await b.page.close();
  });

  await test('a backup taken on one machine restores on another', async () => {
    /* Two contexts is two browsers as far as storage is concerned, which is
       the situation the feature exists for. */
    const { page: p1, file } = await takeBackup();
    await p1.close();

    const p2 = await fresh();
    assert.strictEqual(await p2.evaluate(() => localStorage.getItem('postcall_deals_v1')), null,
      'the second browser was not empty to begin with');
    p2.on('dialog', d => d.accept());
    await p2.setInputFiles('#backupFile', file);
    await p2.waitForTimeout(1200);
    const deals = await p2.evaluate(() => localStorage.getItem('postcall_deals_v1'));
    assert.ok(deals && deals.includes('D-TEST-1'), 'the restore did not bring the deal across');
    await p2.close();
  });

  await test('a file that is not a backup says so and destroys nothing', async () => {
    /* The dangerous direction. An operator picking the wrong file must lose a
       click, never a ledger. */
    const junk = path.join(require('os').tmpdir(), 'not-a-backup.json');
    fs.writeFileSync(junk, '{"hello":"world"}');
    const p = await fresh();
    await seedDeal(p);
    await p.reload();
    let asked = false;
    p.on('dialog', d => { asked = true; d.accept(); });
    await p.setInputFiles('#backupFile', junk);
    await p.waitForTimeout(600);
    assert.strictEqual(asked, false, 'a file that is not a backup got as far as asking to overwrite');
    assert.ok(/גיבוי תקין/.test(await p.textContent('#backupMsg')),
      'nothing on the screen said the file was rejected');
    const deals = await p.evaluate(() => localStorage.getItem('postcall_deals_v1'));
    assert.ok(deals && deals.includes('D-TEST-1'), 'a rejected file still cleared the ledger');
    fs.unlinkSync(junk);
    await p.close();
  });

  await test('restoring over existing work says what it is about to overwrite', async () => {
    const { page: p1, file } = await takeBackup();
    await p1.close();

    const p2 = await fresh();
    await p2.evaluate(() => localStorage.setItem('postcall_deals_v1', JSON.stringify([{ id: 'OTHER', status: 'sent' }])));
    await p2.reload();
    let message = '';
    p2.on('dialog', d => { message = d.message(); d.dismiss(); });
    await p2.setInputFiles('#backupFile', file);
    await p2.waitForTimeout(600);
    assert.ok(/ידרוס/.test(message),
      'the operator was asked to overwrite without being told what: ' + JSON.stringify(message));
    const still = await p2.evaluate(() => localStorage.getItem('postcall_deals_v1'));
    assert.ok(still.includes('OTHER'), 'saying no to the overwrite overwrote anyway');
    await p2.close();
  });

  await test('one record missing a field does not take the whole ledger down', async () => {
    /* Found by accident and worth keeping on purpose. A seeded deal without
       `created` — which save() always writes, and which a restored file from an
       older shape need not carry — made the row renderer throw. The error
       boundary caught it and the entire ledger became a failure box, on one
       missing date in one deal out of however many. */
    const p = await fresh();
    await p.evaluate(() => localStorage.setItem('postcall_deals_v1', JSON.stringify([
      { id: 'FULL', client: 'שלמה', status: 'sent', priceQuoted: 5000,
        estimatedHours: 20, created: '2026-02-02T00:00:00.000Z' },
      { id: 'THIN', client: 'חסר' }
    ])));
    await p.reload();
    await p.waitForTimeout(300);
    assert.strictEqual(await p.locator('#errBoundary').isVisible(), false,
      'a record missing a field put the whole page into its failure state');
    const box = await p.textContent('#ledgerBox');
    assert.ok(/שלמה/.test(box), 'the complete deal disappeared along with the incomplete one');
    assert.ok(/חסר/.test(box), 'the incomplete deal was dropped rather than shown short');
    await p.close();
  });

  console.log('\ndeals that happened before the tool existed');

  /* The tool's advice is worth what its track record says, and a new operator
     has no track record inside it — only outside it. This is the form that
     lets them put the last few jobs in, and its whole value is refusing the
     entries that would poison the calibration. All of it was dark. */

  const addPast = async (p, { client, quoted, closed, lost }) => {
    /* Behind a disclosure on purpose — entering past deals is a one-time job,
       not part of the flow — so it has to be opened before it can be used. */
    await p.click('#retroDrawer summary');
    await p.waitForTimeout(80);
    if (client !== undefined) await p.fill('#rp_client', client);
    if (quoted !== undefined) await p.fill('#rp_quoted', String(quoted));
    if (closed !== undefined) await p.fill('#rp_closed', String(closed));
    await p.click(lost ? '[data-act="retrolost"]' : '[data-act="retroadd"]');
    await p.waitForTimeout(150);
    return p.textContent('#retroFlag');
  };

  await test('a past deal goes in and comes back as a row in the ledger', async () => {
    const p = await fresh();
    const said = await addPast(p, { client: 'מאפייה', quoted: 8000, closed: 7000 });
    assert.ok(/מאפייה/.test(said), 'nothing confirmed the deal was added: ' + JSON.stringify(said));
    const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('postcall_deals_v1') || '[]'));
    assert.strictEqual(stored.length, 1, 'the past deal did not reach storage');
    assert.strictEqual(stored[0].outcome.closedPrice, 7000);
    assert.ok(/מאפייה/.test(await p.textContent('#ledgerBox')), 'the ledger does not show it');
    await p.close();
  });

  await test('the form empties itself so the next one can be typed straight in', async () => {
    /* Three deals is three, and a form that keeps the last client name is a
       form that records the same job twice. */
    const p = await fresh();
    await addPast(p, { client: 'מאפייה', quoted: 8000, closed: 7000 });
    assert.strictEqual(await val(p, 'rp_client'), '');
    assert.strictEqual(await val(p, 'rp_quoted'), '');
    await p.close();
  });

  await test('a deal with no price is refused, and says which number is missing', async () => {
    const p = await fresh();
    const said = await addPast(p, { client: 'בלי מחיר' });
    assert.ok(/המחיר שנקבת/.test(said), 'the refusal did not name the missing number: ' + said);
    const stored = await p.evaluate(() => localStorage.getItem('postcall_deals_v1'));
    assert.ok(!stored || JSON.parse(stored).length === 0, 'a deal with no price was recorded anyway');
    await p.close();
  });

  await test('a deal that closed above what was quoted is questioned, not swallowed', async () => {
    /* It is not impossible, it is unlikely — and a single reversed pair moves
       every discount figure the track record reports. */
    const p = await fresh();
    const said = await addPast(p, { client: 'הפוך', quoted: 5000, closed: 9000 });
    assert.ok(/שווה לבדוק/.test(said), 'a closed price above the quote went in unremarked: ' + said);
    await p.close();
  });

  await test('a deal that never closed is recorded without inventing a price for it', async () => {
    const p = await fresh();
    const said = await addPast(p, { client: 'לא נסגרה', quoted: 6000, lost: true });
    assert.ok(/לא נסגרה/.test(said), 'the loss was not confirmed: ' + said);
    const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('postcall_deals_v1') || '[]'));
    assert.strictEqual(stored.length, 1, 'the lost deal was not recorded');
    assert.notStrictEqual(stored[0].status, 'won', 'a deal that never closed was recorded as won');
    await p.close();
  });

  console.log('\nstarting over');

  /* The button only exists once something is saved, which is right — "a new
     proposal instead" is meaningless with nothing to replace. So the state has
     to be built before the control can be reached. */
  const withSavedDeal = async () => {
    const p = await fresh();
    await seedDeal(p);
    await p.reload();
    return p;
  };

  await test('starting a new proposal over unsaved work asks first, and means it', async () => {
    const p = await withSavedDeal();
    await p.fill('#q_freq', '40');
    await p.waitForTimeout(700);   // the draft saves on a debounce
    p.on('dialog', d => d.dismiss());
    await p.click('[data-act="newdeal"]');
    await p.waitForTimeout(300);
    assert.strictEqual(await val(p, 'q_freq'), '40', 'saying no to clearing the form cleared it');
    await p.close();
  });

  await test('and clears it when the answer is yes', async () => {
    const p = await withSavedDeal();
    await p.fill('#q_freq', '40');
    await p.waitForTimeout(700);
    p.on('dialog', d => d.accept());
    await p.click('[data-act="newdeal"]');
    await p.waitForTimeout(400);
    assert.strictEqual(await val(p, 'q_freq'), '', 'saying yes left the old numbers in place');
    await p.close();
  });

  await test('an untouched form starts a new proposal without asking anything', async () => {
    /* A confirm dialog for a decision with no consequence is how people learn
       to dismiss confirm dialogs. */
    const p = await withSavedDeal();
    let asked = false;
    p.on('dialog', d => { asked = true; d.accept(); });
    await p.click('[data-act="newdeal"]');
    await p.waitForTimeout(300);
    assert.strictEqual(asked, false, 'clearing an empty form asked for confirmation');
    await p.close();
  });

  console.log('\nthe rest of the controls a person actually presses');

  await test('a restored draft can be thrown away, and says so before it is', async () => {
    /* The draft fills the form on load without being asked, which is right and
       is also exactly why the way out has to work: a form that filled itself is
       indistinguishable from a form showing the wrong client, and the operator
       is about to send whatever is on it. */
    const p = await fresh();
    await p.fill('#q_freq', '40');
    await p.fill('#q_minutes', '9');
    await p.waitForTimeout(700);
    await p.reload();
    await p.waitForTimeout(300);
    assert.ok(await p.locator('#draftNote').isVisible(), 'an unfinished draft came back unannounced');
    assert.strictEqual(await val(p, 'q_freq'), '40', 'the draft did not come back at all');
    await p.click('[data-act="discard"]');
    await p.waitForTimeout(300);
    assert.strictEqual(await val(p, 'q_freq'), '', 'throwing the draft away kept the numbers');
    await p.reload();
    await p.waitForTimeout(300);
    assert.strictEqual(await p.locator('#draftNote').isVisible(), false,
      'the discarded draft came back on the next load');
    await p.close();
  });

  await test('the scope reasons open and close, and the button keeps the keyboard', async () => {
    /* One control for nineteen rows rather than a disclosure triangle per row,
       which is a decision the design file argues for — so the one control has
       to work in both directions. And the re-render replaces the button that
       was just pressed: without moving focus back, a keyboard user is returned
       to the top of the document by their own click. */
    const p = await fresh();
    await templates(p).first().click();
    await p.waitForTimeout(200);
    const shown = () => p.evaluate(() => document.querySelector('#scopeBox').classList.contains('show-why'));
    assert.strictEqual(await shown(), false, 'the reasons started out open');
    const label = await p.textContent('#scopeWhyT');

    await p.click('#scopeWhyT');
    await p.waitForTimeout(200);
    assert.strictEqual(await shown(), true, 'the reasons did not open');
    assert.notStrictEqual(await p.textContent('#scopeWhyT'), label,
      'the button still offers to do what it has already done');
    assert.strictEqual(await p.evaluate(() => document.activeElement && document.activeElement.id),
      'scopeWhyT', 'the button that was pressed lost the keyboard to the re-render');

    await p.click('#scopeWhyT');
    await p.waitForTimeout(200);
    assert.strictEqual(await shown(), false, 'the toggle only went one way');
    await p.close();
  });

  await test('an optional step can be skipped, and the guide moves on', async () => {
    /* One step is optional — what it costs them when something falls over —
       and the guide deliberately will not block on it: once nothing required
       is missing the instruction becomes "send", and the optional question is
       offered alongside it rather than in front of it. So it appears only
       after every required step is answered, which is exactly the state a real
       operator is in when they decide to skip it. */
    const p = await fresh();
    await p.fill('#q_process', 'הקלדת הזמנות');
    await p.fill('#q_freq', '30');
    await p.fill('#q_minutes', '8');
    await p.locator('#sysChips button').first().click();
    await p.fill('#q_client', 'מאפייה');
    await p.click('[data-act="confirmscope"]');
    await p.waitForTimeout(400);

    /* The suggestion is folded away while the guide is pinned — the pinned bar
       is deliberately short, so it carries the instruction and not the
       optional extra. Scrolling back to it is what a person does to act on it,
       so the test does that rather than reaching into a collapsed element. */
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.waitForFunction(
      () => !document.querySelector('#guideBar').classList.contains('stuck'), null, { timeout: 5000 });
    const skip = p.locator('[data-act="skip"][data-step]:visible');
    assert.ok(await skip.count(),
      'every required step was answered and the optional one was never offered — ' +
      'the guide is now at: ' + (await p.textContent('#guideBar')).slice(0, 60));
    const step = await skip.first().getAttribute('data-step');
    const before = await p.textContent('#guideBar');
    await skip.first().click();
    await p.waitForTimeout(300);
    assert.notStrictEqual(await p.textContent('#guideBar'), before,
      'skipping ' + step + ' left the guide where it was');
    await p.close();
  });

  console.log('\none field, two facts');

  /* c_last holds either what the operator charged for a job like this one or a
     reference price the client named. The engine prices both the same way and
     that is fine; what was not fine is that three of the four surfaces the
     operator reads described the first while holding the second. */
  /* Labelled, because that is the only way the tool can know whose figure it
     is. Written unlabelled first, and the client's own "אני צלם" reads as the
     seller — which is right: on a transcript with no labels nobody can say who
     spoke, and speakerOf() treats first person as the operator. */
  const ANCHOR_CALL = [
    'אני: ספר לי איך העסק נראה היום.',
    'לקוח: אני צלם. פרויקט פה ופרויקט שם, בלי שום דבר קבוע.',
    'אני: ומה זה שווה לך, לדעתך?',
    'לקוח: אני מסתכל על זה כמו פגישה עם יועץ מס, זה 300 שקל לפגישה.'
  ].join('\n');
  const ANCHOR_UNLABELLED = ANCHOR_CALL.replace(/^(לקוח|אני): /gm, '');

  const cLastLabel = p => p.locator('label[for="c_last"]').first().textContent();

  await test('a price the client named is not described as work the operator did', async () => {
    const p = await fresh();
    await readLocally(p, ANCHOR_CALL);
    await p.click('[data-act="trapply"]');
    await p.waitForTimeout(600);
    await p.evaluate(() => document.querySelectorAll('details').forEach(d => d.open = true));
    await p.waitForTimeout(200);
    assert.strictEqual(await val(p, 'c_last'), '300', 'the figure the client named never reached the field');

    const label = (await cLastLabel(p)).trim();
    const hint = (await p.textContent('#methodHint')).trim();
    assert.ok(!/גבית/.test(label),
      'the field holding the client\'s number is labelled as money the operator charged: ' + label);
    assert.ok(!/דורש היסטוריה/.test(hint),
      'the hint promises accuracy from history the operator does not have: ' + hint);
    assert.ok(/הלקוח/.test(label) && /הלקוח/.test(hint), 'neither label says whose number this is');
    await p.close();
  });

  await test('and a comparable job of the operator\'s own still reads as one', async () => {
    /* The other meaning has to survive the fix. */
    const p = await fresh();
    await p.evaluate(() => document.querySelectorAll('details').forEach(d => d.open = true));
    await p.waitForTimeout(200);
    await p.locator('#methodChips button', { hasText: 'עסקה דומה' }).first().click();
    await p.waitForTimeout(400);
    await p.fill('#c_last', '6000');
    await p.waitForTimeout(300);
    const label = (await cLastLabel(p)).trim();
    assert.ok(/גבית/.test(label),
      'a number the operator typed about their own past work is described as the client\'s: ' + label);
    assert.ok(/דורש היסטוריה/.test((await p.textContent('#methodHint')).trim()),
      'the hint stopped warning that this method needs history');
    await p.close();
  });

  await test('an unlabelled call does not get to say the client named the price', async () => {
    /* The whole reason the check is on the speaker and not on the row. Twelve
       real transcripts carry no labels, so an anchor lifted out of one is a
       figure somebody said — and the tool does not know who. Claiming the
       client said it would be the same claim-beyond-evidence the ladder above
       spends its length refusing. */
    const p = await fresh();
    await readLocally(p, ANCHOR_UNLABELLED);
    await p.click('[data-act="trapply"]');
    await p.waitForTimeout(600);
    await p.evaluate(() => document.querySelectorAll('details').forEach(d => d.open = true));
    await p.waitForTimeout(200);
    assert.strictEqual(await val(p, 'c_last'), '300', 'the figure never reached the field at all');
    assert.ok(/גבית/.test((await cLastLabel(p)).trim()),
      'an unlabelled transcript was described as the client naming the price');
    await p.close();
  });

  await test('and the operator saying who spoke is what changes it', async () => {
    /* The row asks. Answering it is evidence, and the label follows evidence. */
    const p = await fresh();
    await readLocally(p, ANCHOR_UNLABELLED);
    const btn = p.locator('[data-act="trwho"][data-key="anchor"][data-who="client"]');
    assert.ok(await btn.count(), 'the row never offered the question');
    await btn.first().click();
    await p.waitForTimeout(200);
    await p.click('[data-act="trapply"]');
    await p.waitForTimeout(600);
    await p.evaluate(() => document.querySelectorAll('details').forEach(d => d.open = true));
    await p.waitForTimeout(200);
    assert.ok(!/גבית/.test((await cLastLabel(p)).trim()),
      'the operator said the client named it and the label still says otherwise');
    await p.close();
  });

  console.log('\nwhen the call says less than the form does');

  /* The ladder decides what a price may rest on, and it decided once, from the
     transcript, and then went quiet. An operator who did exactly what the panel
     told them to do — "there is nothing here to fill in from the call itself" —
     got a price built on cost while the form in front of them held everything
     value pricing needs. Same numbers, 2.9x apart, depending only on whether a
     transcript had been pasted first. */

  const SOFT_CALL = SOFT;
  const fillByHand = async (p) => {
    await p.evaluate(() => document.querySelectorAll('details').forEach(d => d.open = true));
    await p.waitForTimeout(150);
    await p.fill('#q_process', 'הקלדת הזמנות מהמייל');
    await p.fill('#q_freq', '30');
    await p.fill('#q_minutes', '8');
    await p.fill('#q_err_freq', '4');
    await p.fill('#q_err_cost', '500');
    await p.selectOption('#q_provenance', 'unprompted');
    await p.locator('#sysChips button').first().click();
    await p.waitForTimeout(600);
    return (await p.textContent('#s_price')).trim();
  };

  await test('a call that carried nothing still prices on the call, and says so', async () => {
    const p = await fresh();
    await readLocally(p, SOFT_CALL);
    const priced = await fillByHand(p);
    const offer = p.locator('.tri-offer');
    assert.ok(await offer.count(), 'the price was held down and nothing on screen said why');
    const text = await offer.first().textContent();
    assert.ok(/נשען על מה שהשיחה נשאה/.test(text), 'the note does not say what the price rests on');
    assert.ok(/₪/.test(text), 'the note does not show what the other reading would be');
    assert.ok(await p.locator('.tri-offer [data-act="usemine"]').count(),
      'the note explains the trade and offers no way to take it');
    assert.ok(priced.length > 1, 'no price at all');
    await p.close();
  });

  await test('the offer is a trade — it names what the choice costs', async () => {
    /* A button that only revealed a bigger number would be pressed every time
       and the ladder would be decoration. */
    const p = await fresh();
    await readLocally(p, SOFT_CALL);
    await fillByHand(p);
    const text = await p.locator('.tri-offer').first().textContent();
    assert.ok(/לא נאמרו בשיחה/.test(text), 'the note does not say the numbers were absent from the call');
    assert.ok(/טענה שלך/.test(text),
      'marked unprompted, the note does not say pressing makes the claim the operator\'s');
    await p.close();
  });

  await test('taking the offer changes the price and the sentence under it', async () => {
    const p = await fresh();
    await readLocally(p, SOFT_CALL);
    const held = await fillByHand(p);
    await p.click('.tri-offer [data-act="usemine"]');
    await p.waitForTimeout(600);
    const taken = (await p.textContent('#s_price')).trim();
    assert.notStrictEqual(taken, held, 'the offer was taken and the price did not move');
    const why = await p.textContent('#methodWhy');
    assert.ok(/ידנית/.test(why),
      'the price moved and the line explaining it still describes the tool\'s own choice: ' + why);
    assert.strictEqual(await p.locator('.tri-offer').count(), 0,
      'the offer is still on screen after it was taken');
    await p.close();
  });

  await test('the same numbers with no transcript are priced the same as the taken offer', async () => {
    /* The property the whole thing is for: once the operator has said the
       numbers are the client's, pasting a transcript earlier must not change
       what the work is worth. */
    const a = await fresh();
    await readLocally(a, SOFT_CALL);
    await fillByHand(a);
    await a.click('.tri-offer [data-act="usemine"]');
    await a.waitForTimeout(600);
    const afterOffer = (await a.textContent('#s_price')).trim();
    await a.close();

    const b = await fresh();
    const neverPasted = await fillByHand(b);
    await b.close();

    assert.strictEqual(afterOffer, neverPasted,
      'pasting a transcript first still changes the price after the operator overrode it: ' +
      afterOffer + ' vs ' + neverPasted);
  });

  await test('a call that carried the numbers makes no offer at all', async () => {
    /* Nothing to decide when the ladder and the form agree. */
    const p = await fresh();
    await readLocally(p, CALL);
    await p.click('[data-act="trapply"]');
    await p.waitForTimeout(600);
    assert.strictEqual(await p.locator('.tri-offer').count(), 0,
      'the tool offered an alternative to a reading nobody disputed');
    await p.close();
  });

  console.log('\nthe one paid door, opened by hand');

  /* Three actions put the proposal in front of the client — copy, PDF, send —
     and all three are behind a key. pc-gate.js has 41 assertions in Node on
     what makes a key valid; nothing had ever pasted one into the box and
     pressed the button. The gap matters more here than anywhere else on the
     page, because the failure mode is a person who has paid and cannot get in.

     No server here, which is the case the minting tool exists for: fetch
     fails, the checksum decides, and a key that satisfies only the server's
     allowlist would lock its buyer out on file://, offline, or after a
     cleared browser — all three of which the README promises work. */
  const MINTED = require('child_process')
    .execFileSync('node', [path.join(root, 'tools', 'mint-key.js')], { encoding: 'utf8' })
    .trim().split('\n')[0].trim();

  const reachWall = async p => {
    await templates(p).first().click();
    await p.waitForTimeout(250);
    await p.click('[data-act="copy"]');
    await p.waitForTimeout(250);
  };

  await test('a minted key opens the wall and is still open after a reload', async () => {
    const p = await fresh();
    await reachWall(p);
    assert.ok(await p.locator('#wall').isVisible(), 'the paid action was not gated at all');
    await p.fill('#keyIn', MINTED);
    await p.click('[data-act="unlock"]');
    await p.waitForTimeout(600);
    assert.strictEqual(await p.locator('#wall').isVisible(), false,
      'a key that satisfies the shipped checksum did not open the wall');
    await p.reload();
    await p.waitForTimeout(300);
    await reachWall(p);
    assert.strictEqual(await p.locator('#wall').isVisible(), false,
      'the buyer was asked for their key again on the next page load');
    await p.close();
  });

  await test('a key of the wrong shape is refused without spending an attempt', async () => {
    /* Ten attempts per ten minutes on the server. A string that the regex
       already rejects must not cost one of them, so this never leaves the
       page — which also means it has to say so itself. */
    const p = await fresh();
    await reachWall(p);
    let calls = 0;
    await p.route('**/api/**', r => { calls++; r.abort(); });
    await p.fill('#keyIn', 'not-a-key');
    await p.click('[data-act="unlock"]');
    await p.waitForTimeout(400);
    assert.ok(await p.locator('#keyErr').isVisible(), 'a rejected key said nothing');
    assert.strictEqual(calls, 0, 'a malformed key was sent to the server anyway');
    assert.ok(await p.locator('#wall').isVisible(), 'a malformed key opened the wall');
    await p.close();
  });

  await test('a well-formed key that is not one is refused too', async () => {
    /* The shape is eight characters and a check digit; getting the shape right
       is not the same as having bought anything. */
    const wrong = MINTED.slice(0, -1) + (MINTED.slice(-1) === 'Z' ? 'Y' : 'Z');
    const p = await fresh();
    await reachWall(p);
    await p.fill('#keyIn', wrong);
    await p.click('[data-act="unlock"]');
    await p.waitForTimeout(600);
    assert.ok(await p.locator('#wall').isVisible(),
      'a key with a broken check digit opened the wall');
    assert.ok(await p.locator('#keyErr').isVisible(), 'and it was refused silently');
    await p.close();
  });

  await test('the key is offered ahead of time, and the offer can be turned down', async () => {
    /* The key is sent by hand today, so asking for it at the moment of sending
       means waiting at exactly the wrong moment. The note appears once there is
       a real price on the screen. */
    const p = await fresh();
    await templates(p).first().click();
    await p.waitForTimeout(300);
    assert.ok(await p.locator('#keyAhead').isVisible(),
      'a priced proposal never offered to sort the key out early');
    await p.click('[data-act="laterkey"]');
    await p.waitForTimeout(200);
    assert.strictEqual(await p.locator('#keyAhead').isVisible(), false, 'the offer would not go away');
    await p.close();
  });

  await test('the dismissal lasts the session and not longer, which is worth knowing', async () => {
    /* `keyAheadDismissed` is a variable, not a stored preference, so a reload
       brings the note back. Pinned rather than changed: on a new proposal that
       is the right behaviour, and on a restored draft — the same proposal, the
       same operator, the second time today — it is a note that will not take no
       for an answer. Which of those matters more is a call for whoever is
       selling with it, and the point of this test is that it is now a decision
       rather than an omission nobody had noticed. */
    const p = await fresh();
    await templates(p).first().click();
    await p.waitForTimeout(300);
    await p.click('[data-act="laterkey"]');
    await p.waitForTimeout(200);
    await p.reload();
    await p.waitForTimeout(500);
    assert.ok(await p.locator('#keyAhead').isVisible(),
      'the dismissal now survives a reload — if that was deliberate, this test is the place to say so');
    await p.close();
  });

  await test('with no payment link configured, the buyer is sent to a person and never to example.com', async () => {
    /* PAYMENT_URL still holds its placeholder, so this is the shipping state,
       not a hypothetical one. configuredPayment() rejects anything containing
       example.com, which routes the sale to the contact address instead — and
       the only way to know that reaches the button is to press the button.

       The failure this forbids is a buyer, at the moment they decided to pay,
       landing on example.com. */
    const p = await fresh();
    const opened = [];
    await p.exposeFunction('__opened', u => opened.push(u));
    /* window.open only. location.href cannot be redefined in chromium, and it
       is not the branch this configuration takes: openContact() navigates for
       a mailto: route and opens a tab for anything else, and the configured
       route here is a WhatsApp link. If that ever becomes a mailto the
       assertion below fails on the count rather than passing quietly. */
    await p.evaluate(() => { window.open = (u) => { window.__opened(String(u)); return null; }; });
    await templates(p).first().click();
    await p.waitForTimeout(300);
    await p.click('[data-act="askkey"]');
    await p.waitForTimeout(300);
    assert.strictEqual(opened.length, 1, 'asking for a key opened ' + opened.length + ' things');
    assert.ok(!/example\.com/.test(opened[0]),
      'the buyer was sent to the placeholder link: ' + opened[0]);
    const contact = await p.evaluate(() => PC.contact && PC.contact.ROUTE);
    assert.strictEqual(opened[0], contact,
      'asking for a key went somewhere other than the configured contact route');
    await p.close();
  });

  console.log('\nnothing threw');
  await test('no error anywhere in the panel', () => {
    assert.deepStrictEqual(errors, []);
  });
  await test('and nothing was caught quietly either', async () => {
    /* pageerror only sees what reached the window. The product wraps its own
       renderers in an error boundary, so a throw inside one of them is a
       console line and a box on the screen and nothing else — which is how a
       ledger that rendered as a failure state passed a suite watching for
       uncaught errors. The boundary's own surface is the thing to read. */
    const p = await fresh();
    await readLocally(p, CALL);
    await p.click('[data-act="trapply"]');
    await p.waitForTimeout(250);
    assert.strictEqual(await p.locator('#errBoundary').isVisible(), false,
      'a renderer failed and only the boundary knew: ' + await p.textContent('#errBoundary'));
    await p.close();
  });

  for (const c of contexts) await c.close();
  await browser.close();
  srv.close();
  console.log('\n' + state.pass + ' passed, ' + state.fail + ' failed\n');
  process.exit(state.fail ? 1 : 0);
})();
