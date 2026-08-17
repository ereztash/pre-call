/* node tools/action-contract.test.js — buttons promise outcomes, not mechanisms.

   FIELD feedback exposed two failures that ordinary unit tests can miss:
   an internal term can leak into a button even when the underlying feature works,
   and an export action can lead somewhere the label never warned about.

   This suite pins the user contract instead of the implementation vocabulary:
   what the control says, what destination is disclosed before leaving the app,
   and whether the requested export survives the key gate and resumes afterward. */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const stripComments = s => s.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const text = s => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const post = read('post-call.html');
const pre = read('pre-call.html');
const postJs = read('assets/post-call.js');
const preJs = read('assets/pre-call.js');
const gate = read('assets/pc-gate.js');
const boot = read('assets/pc-boot.js');
const contract = read('assets/action-contract-ui.js');

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

function buttonLabel(html, act) {
  const re = new RegExp('<button[^>]*data-act=["\\\']' + act + '["\\\'][^>]*>([\\s\\S]*?)<\\/button>', 'i');
  const m = html.match(re);
  assert.ok(m, 'missing button for data-act=' + act);
  return text(m[1]);
}

console.log('\naction labels describe the thing the user is trying to do');
test('proposal actions still say copy, PDF and send', () => {
  assert.match(buttonLabel(post, 'copy'), /העתק.*הצעה/);
  assert.match(buttonLabel(post, 'print'), /PDF/);
  assert.match(buttonLabel(post, 'send'), /שלח.*לקוח/);
});

test('the cross-product contract layer is loaded on every booted product page', () => {
  assert.match(boot, /assets\/action-contract-ui\.js/);
});

test('POST-CALL transcript entry uses proposal-task language, not extraction language', () => {
  assert.match(contract, /setButton\(['\"]trlocal['\"],\s*['\"]מצא מה חשוב להצעה['\"]\)/);
  assert.match(contract, /השתמש בפרטים שאישרתי/);
  assert.match(contract, /על מה המחיר נשען/);
});

test('PRE-CALL pasted profile action says what the user gets', () => {
  assert.match(contract, /מלא את הפרופיל מהטקסט/);
  assert.match(contract, /המשך להכנת השיחה/);
  assert.match(contract, /שלב 2 · מי מולכם/);
});

console.log('\ninternal evidence vocabulary does not become a required action');
test('no evidence-candidate jargon is visible in shipped button markup', () => {
  const buttonText = [post, pre].map(s => {
    const buttons = s.match(/<button[\s\S]*?<\/button>/g) || [];
    return buttons.map(text).join('\n');
  }).join('\n');
  assert.doesNotMatch(buttonText, /מועמד(?:י|ים)?\s+ראי(?:ה|ות)|ראיות?\s+מועמד/);
});

test('the contract layer does not introduce evidence-candidate jargon either', () => {
  assert.doesNotMatch(stripComments(contract), /מועמד(?:י|ים)?\s+ראי(?:ה|ות)|ראיות?\s+מועמד/);
});

console.log('\nexport labels and external destinations keep the same contract');
test('a locked export raises the in-product wall before any external navigation', () => {
  const m = gate.match(/function requireKey\(fn\)\{([\s\S]*?)\n\}/);
  assert.ok(m, 'requireKey not found');
  const body = m[1];
  assert.match(body, /pendingExport\s*=\s*fn/);
  assert.match(body, /show\(['\"]wall['\"],\s*true\)/);
  assert.doesNotMatch(body, /openContact|window\.open|location\./);
});

test('WhatsApp is named before a manual key request changes channel', () => {
  assert.match(contract, /פתח WhatsApp לבקשת מפתח/);
  assert.match(contract, /contactChannel\(\)/);
  assert.match(contract, /buyContact/);
});

test('unlock resumes exactly the export the user originally asked for', () => {
  assert.match(gate, /if \(pendingExport\) \{ const f = pendingExport; pendingExport = null; f\(\); \}/);
});

console.log('\ncontract language is applied to dynamic UI, not only initial markup');
test('a mutation observer reapplies the contract after transcript review and gate renders', () => {
  assert.match(contract, /new MutationObserver\(schedule\)/);
  assert.match(contract, /characterData:\s*true/);
  assert.match(contract, /makeExternalRouteExplicit\(\)/);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
