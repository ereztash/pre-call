/* node assets/pre-call-page.test.js — PRE-CALL's own wiring, driven by clicking it.

   pre-call.test.js next door is the Node suite: 58 assertions on parsing, the
   anchor sentence, and the private/public split. This is the page — the
   functions that only a click can reach.

   The same v8 measurement that produced post-call.test.js, pointed at the
   other tool: 24 of pre-call.js's 46 named functions were entered by the whole
   journey, and 22 were never entered once. A worse ratio than POST-CALL had
   before it got a suite, and the dark half includes call mode — which is the
   reason this tool exists at all. A script you cannot read while talking is a
   document, and there are enough of those.

   One engine, its own page, and the harness shared with post-call.test.js. */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const H = require('../tools/page-harness.js');

const playwright = H.resolvePlaywright();
if (!playwright) {
  console.log('\n  skipped — playwright not resolvable here.');
  console.log('  install it, or set PW_ROOT to a directory that has it.\n');
  process.exit(0);
}
const { test, state } = H.runner();

/* A profile and a prospect, enough for build() to produce a real script.
   Invented, like every fixture here. */
const BIZ = {
  f_what: 'מסדר תהליכי גבייה לעסקים קטנים',
  f_who: 'משרדי רואי חשבון עד עשרה עובדים',
  f_gain: 'כ-40,000 ₪ תזרים, אחרי שקיצר את זמן הגבייה מ-60 ל-25 יום',
  f_edge: 'הבעיה אף פעם לא בתוכנה, היא בזה שאף אחד לא הוגדר כאחראי על המעקב'
};

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
  const { fresh } = H.profiles(browser, base, '/pre-call.html', errors);

  const buildScript = async (p) => {
    for (const [id, v] of Object.entries(BIZ)) await p.fill('#' + id, v);
    /* Two buttons carry go2 — "continue" on the first panel and "back to
       editing" on the third — and only one of them is on screen at a time. */
    await p.click('[data-act="go2"]:visible');
    await p.fill('#p_name', 'דנה');
    await p.fill('#p_co', 'מסעדת הדר');
    await p.click('[data-act="build"]');
    await p.waitForTimeout(300);
    return p;
  };

  const inCallMode = p => p.evaluate(() => document.body.classList.contains('callmode'));

  console.log('\nthe mode the tool exists for');

  await test('call mode strips the page down and gives back a bar to leave by', async () => {
    const p = await buildScript(await fresh());
    assert.strictEqual(await inCallMode(p), false, 'the page started in call mode');
    await p.click('[data-act="callmode-on"]');
    await p.waitForTimeout(200);
    assert.strictEqual(await inCallMode(p), true, 'the button did not enter call mode');
    assert.ok(await p.locator('#callbar').isVisible(), 'there is no way out on screen');
    await p.click('[data-act="callmode-off"]');
    await p.waitForTimeout(200);
    assert.strictEqual(await inCallMode(p), false, 'the way out did not work');
    assert.strictEqual(await p.locator('#callbar').isVisible(), false, 'the call bar stayed after the call');
    await p.close();
  });

  await test('the script is still readable in call mode, and the asides are not', async () => {
    /* The whole design of the mode: what you say stays, what explains why you
       say it goes. Both halves matter — a mode that hid the lines would be
       useless, and one that hid nothing would be a button that does nothing. */
    const p = await buildScript(await fresh());
    const visible = () => p.evaluate(() =>
      [...document.querySelectorAll('#outArea *')].filter(e => e.offsetHeight > 0).length);
    const before = await visible();
    await p.click('[data-act="callmode-on"]');
    await p.waitForTimeout(250);
    const after = await visible();
    assert.ok(after > 0, 'call mode emptied the script it is meant to make readable');
    assert.ok(after < before, 'call mode hid nothing — it is a button that does nothing');
    await p.close();
  });

  await test('copying from inside call mode gives the whole script, not the visible half', async () => {
    /* Written into cpText() as the reason it drops the class for one
       synchronous read: innerText is what the eye sees, so copying while the
       asides are hidden would emit a quietly truncated document — no error, no
       warning, just a shorter script than the one on the page. Same silent
       class as the CSP that killed every button.

       Worth recording precisely, because writing the test found something the
       comment does not say: the copy control is not on screen during a call.
       The bar that replaces the header carries the calendar file, the way out,
       and the reading card, and nothing that copies. So the hazard is real,
       the guard is right, and today nothing in the interface can reach it —
       which is exactly the state where a guard quietly stops being true. The
       click is dispatched rather than pressed for that reason, and the test
       below pins the unreachability separately so that if a copy button ever
       joins that bar, this pair still says what happens. */
    const p = await buildScript(await fresh());
    const copied = [];
    await p.exposeFunction('__copied', t => copied.push(t));
    await p.evaluate(() => {
      navigator.clipboard.writeText = async (t) => { window.__copied(String(t)); };
    });
    await p.click('[data-act="cp-out"]');
    await p.waitForTimeout(250);
    await p.click('[data-act="callmode-on"]');
    await p.waitForTimeout(250);
    await p.locator('[data-act="cp-out"]').dispatchEvent('click');
    await p.waitForTimeout(250);

    assert.strictEqual(copied.length, 2, 'the copy button did not reach the clipboard');
    assert.ok(copied[0].length > 200, 'the script copied outside call mode is barely anything');
    assert.strictEqual(copied[1], copied[0],
      'the copy taken during the call is ' + copied[1].length + ' characters and the one taken ' +
      'before it is ' + copied[0].length + ' — call mode truncated the script on its way out');
    assert.strictEqual(await inCallMode(p), true, 'copying left the operator out of call mode mid-call');
    await p.close();
  });

  await test('and the call bar offers nothing that could produce a half copy', async () => {
    const p = await buildScript(await fresh());
    await p.click('[data-act="callmode-on"]');
    await p.waitForTimeout(250);
    const onScreen = await p.$$eval('[data-act]', els => els
      .filter(e => e.offsetHeight > 0)
      .map(e => e.dataset.act));
    assert.deepStrictEqual(onScreen.filter(a => /^cp-|^copy/.test(a)), [],
      'a copy control is reachable during the call: ' + onScreen.join(', '));
    await p.close();
  });

  await test('the reading card is out of reach during the call and one click away after it', async () => {
    const p = await buildScript(await fresh());
    await p.click('[data-act="callmode-on"]');
    await p.waitForTimeout(250);
    assert.strictEqual(await p.locator('#afterCall').isVisible(), false,
      'what to do after the call was on screen during it');
    await p.click('[data-act="to-card"]');
    await p.waitForTimeout(300);
    assert.strictEqual(await inCallMode(p), false, 'ending the call left the page in call mode');
    assert.ok(await p.locator('#afterCall').isVisible(), 'the call ended and the card never appeared');
    await p.close();
  });

  await test('ending the call is the one line that says a call actually happened', async () => {
    /* The transition this product scores worst on, and the button recorded
       nothing for as long as it existed. Without the line, a visit to
       POST-CALL that followed a real call is indistinguishable from a visit
       that followed nothing at all. */
    const p = await buildScript(await fresh());
    await p.click('[data-act="callmode-on"]');
    await p.waitForTimeout(200);
    await p.click('[data-act="to-card"]');
    await p.waitForTimeout(300);
    const entries = await p.evaluate(() =>
      PC.journal.list().filter(e => e.what === 'session' && e.to === 'call-ended'));
    assert.strictEqual(entries.length, 1,
      'the end of the call left ' + entries.length + ' marks in the journal');
    await p.close();
  });

  await test('call mode is a state and not a setting, so a reload comes back normal', async () => {
    /* Deliberate, and written down as such: call mode is where you are for
       twenty-five minutes, and a page that reopened with its header missing
       would look broken rather than focused. */
    const p = await buildScript(await fresh());
    await p.click('[data-act="callmode-on"]');
    await p.waitForTimeout(200);
    await p.reload();
    await p.waitForTimeout(400);
    assert.strictEqual(await inCallMode(p), false, 'the page reopened with its header missing');
    await p.close();
  });

  console.log('\nthe profile, which is the half that persists');

  await test('a pasted profile fills the fields rather than being read by hand', async () => {
    const p = await fresh();
    /* Behind a disclosure: running a prompt somewhere else and pasting the
       answer back is the optional route, not the one the page opens on. */
    await p.click('details.aihelper summary');
    await p.waitForTimeout(150);
    const answer = [
      'מה אני מוכר: מסדר תהליכי גבייה לעסקים קטנים',
      'למי: משרדי רואי חשבון עד עשרה עובדים',
      'מה הלקוח הרוויח: כ-40,000 ₪ תזרים',
      'מה רק אני רואה: אף אחד לא מוגדר כאחראי על המעקב'
    ].join('\n');
    await p.fill('#pasteBiz', answer);
    await p.click('[data-act="parse"]');
    await p.waitForTimeout(250);
    assert.ok((await p.locator('#f_what').inputValue()).includes('גבייה'),
      'the pasted profile did not reach the field it names');
    assert.ok((await p.locator('#f_who').inputValue()).includes('רואי חשבון'),
      'only the first field was filled');
    await p.close();
  });

  await test('the business survives a new prospect, and the prospect does not', async () => {
    /* The one separation this page is built around: your business is a
       standing fact and the person across the table is not. A "new call"
       button that cleared the profile would make the tool useless on the
       second call of the day. */
    const p = await buildScript(await fresh());
    await p.click('[data-act="go2"]:visible');
    await p.waitForTimeout(200);
    await p.click('[data-act="newprospect"]');
    await p.waitForTimeout(250);
    assert.strictEqual(await p.locator('#p_name').inputValue(), '', 'the previous prospect stayed');
    assert.strictEqual(await p.locator('#p_co').inputValue(), '', 'the previous business stayed');
    assert.strictEqual(await p.locator('#f_what').inputValue(), BIZ.f_what,
      'starting a new call wiped the operator\'s own profile');
    await p.close();
  });

  await test('the saved profile can be deleted, and stays deleted', async () => {
    /* The page says "saved in this browser" beside the fields, so the promise
       includes being able to take it back. */
    const p = await fresh();
    for (const [id, v] of Object.entries(BIZ)) await p.fill('#' + id, v);
    await p.waitForTimeout(700);
    await p.reload();
    await p.waitForTimeout(400);
    assert.strictEqual(await p.locator('#f_what').inputValue(), BIZ.f_what,
      'the profile did not persist in the first place');
    p.on('dialog', d => d.accept());
    await p.click('[data-act="clearprofile"]');
    await p.waitForTimeout(400);
    await p.reload();
    await p.waitForTimeout(400);
    assert.strictEqual(await p.locator('#f_what').inputValue(), '',
      'the deleted profile came back on the next load');
    await p.close();
  });

  console.log('\ngetting it off this machine');

  await test('the backup round trips through PRE-CALL\'s own controls', async () => {
    /* Same module as POST-CALL, a second set of buttons, and the wiring is
       what is different between them. */
    const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'pre-backup-'));
    const p1 = await fresh({ acceptDownloads: true });
    for (const [id, v] of Object.entries(BIZ)) await p1.fill('#' + id, v);
    await p1.waitForTimeout(700);
    const [dl] = await Promise.all([
      p1.waitForEvent('download'),
      p1.click('[data-act="backup-export"]')
    ]);
    const file = path.join(tmp, dl.suggestedFilename());
    await dl.saveAs(file);
    await p1.close();

    const p2 = await fresh();
    assert.strictEqual(await p2.locator('#f_what').inputValue(), '', 'the second browser was not empty');
    p2.on('dialog', d => d.accept());
    await p2.setInputFiles('#backupFile', file);
    await p2.waitForTimeout(1400);
    assert.strictEqual(await p2.locator('#f_what').inputValue(), BIZ.f_what,
      'the profile did not come across');
    await p2.close();
  });

  await test('a file that is not a backup is refused and changes nothing', async () => {
    const junk = path.join(require('os').tmpdir(), 'pre-not-a-backup.json');
    fs.writeFileSync(junk, '{"hello":"world"}');
    const p = await fresh();
    await p.fill('#f_what', BIZ.f_what);
    await p.waitForTimeout(700);
    let asked = false;
    p.on('dialog', d => { asked = true; d.accept(); });
    await p.setInputFiles('#backupFile', junk);
    await p.waitForTimeout(600);
    assert.strictEqual(asked, false, 'a file that is not a backup reached the overwrite prompt');
    assert.strictEqual(await p.locator('#f_what').inputValue(), BIZ.f_what,
      'a rejected file cleared the profile anyway');
    fs.unlinkSync(junk);
    await p.close();
  });

  console.log('\nnothing threw');
  await test('no error anywhere on the page', () => {
    assert.deepStrictEqual(errors, []);
  });
  await test('and nothing was caught quietly either', async () => {
    /* pageerror only sees what reached the window; this page has the same
       error boundary POST-CALL does, and a renderer that failed inside it
       would be a box on the screen and nothing else. */
    const p = await buildScript(await fresh());
    await p.click('[data-act="callmode-on"]');
    await p.waitForTimeout(250);
    assert.strictEqual(await p.locator('#errBoundary').isVisible(), false,
      'a renderer failed and only the boundary knew: ' + await p.textContent('#errBoundary'));
    await p.close();
  });

  await browser.close();
  srv.close();
  console.log('\n' + state.pass + ' passed, ' + state.fail + ' failed\n');
  process.exit(state.fail ? 1 : 0);
})();
