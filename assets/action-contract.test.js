/* node assets/action-contract.test.js — buttons promise outcomes, not mechanisms.

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
test('proposal actions say copy, PDF and send', () => {
  assert.match(buttonLabel(post, 'copy'), /העתק.*הצעה/);
  assert.match(buttonLabel(post, 'print'), /PDF/);
  assert.match(buttonLabel(post, 'send'), /שלח.*לקוח/);
});

test('transcript entry describes a recognisable transcript task', () => {
  const label = buttonLabel(post, 'trlocal');
  assert.match(label, /תמלול/);
  assert.doesNotMatch(label, /ראי(?:ה|ות)|מועמד/);
});

test('PRE-CALL actions stay in task language', () => {
  assert.match(buttonLabel(pre, 'build'), /בנה.*תסריט/);
  assert.match(buttonLabel(pre, 'print'), /PDF|הדפס/);
});

console.log('\ninternal evidence vocabulary does not become user-facing controls');
test('no evidence-candidate jargon is visible or emitted as UI copy', () => {
  const shipped = [post, pre, postJs, preJs].map(stripComments).join('\n');
  assert.doesNotMatch(shipped, /מועמד(?:י|ים)?\s+ראי(?:ה|ות)|ראיות?\s+מועמד/);
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

test('the manual purchase control names WhatsApp before opening WhatsApp', () => {
  assert.match(gate, /function contactChannel\(\)[\s\S]*wa\\\.me[\s\S]*tr\(['\"]וואטסאפ['\"]\)/);
  assert.match(gate, /setText\(['\"]payBtn['\"],[\s\S]*channel/);
});

test('unlock resumes exactly the export the user originally asked for', () => {
  assert.match(gate, /if \(pendingExport\) \{ const f = pendingExport; pendingExport = null; f\(\); \}/);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
