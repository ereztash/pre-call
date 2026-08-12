/* Measures the real funnel and prices its words.
   node tools/attention-report.js  [--json]

   The model in tools/attention.js is pure and knows nothing about this
   product. This file is the part that reads the actual shipped copy —
   post-call.html, pre-call.html and the strings the JS renders — turns it
   into a funnel, and runs the model over it.

   Extraction is deliberately crude and deliberately visible: strip comments
   and scripts, pull placeholder and option text back into the flow because a
   placeholder is read like any other word, strip tags, count Hebrew tokens.
   It will be a few percent off. That is fine — the question this answers is
   "which screen is carrying 300 words", and no plausible extraction error
   changes that answer. What it must never do is silently miss a whole
   region, so every region it maps is printed with its word count and the
   unmapped remainder is printed too. */
const fs = require('fs');
const path = require('path');
const A = require('./attention.js');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

/* ---------- text extraction ---------- */

const HEB = /[֐-׿]+(?:['"׳״]?[֐-׿]+)*/g;
const words = s => (s.match(HEB) || []).length;

function visible(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    /* placeholders, aria-labels and titles are read by someone */
    .replace(/(?:placeholder|aria-label|title)="([^"]*)"/gi, ' $1 ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ');
}

/* Every balanced <div class="…cls…"> block in the document, in order.
   The first version of this file did the opposite — given a control id it
   searched backwards for the nearest opening tag and walked forward. That
   silently returned the wrong block often enough that only 13 of this page's
   38 controls were being charged to any step, which the report presented as
   a set of confident numbers. Scanning the whole document once and asking
   which block a control landed in cannot fail that way: a control is inside
   exactly one block or inside none, and both are checkable. */
function blocksOf(html, cls) {
  const open = new RegExp('<div class="[^"]*\\b' + cls + '\\b[^"]*"[^>]*>', 'g');
  const out = [];
  let m;
  while ((m = open.exec(html))) {
    let depth = 0, i = m.index;
    const tag = /<\/?div\b[^>]*>/g;
    tag.lastIndex = m.index;
    let t;
    while ((t = tag.exec(html))) {
      depth += t[0][1] === '/' ? -1 : 1;
      i = t.index + t[0].length;
      if (depth === 0) break;
    }
    const frag = html.slice(m.index, i);
    out.push({ start: m.index, end: i, html: frag, ids: controlIds(frag) });
    open.lastIndex = i;            // no nested re-entry: blocks are disjoint
  }
  return out;
}

/* Returns the ids of every control in a fragment, not just how many. The
   count alone cannot be audited: a region that accidentally swallows its
   neighbour reports a bigger number and looks like a heavier screen rather
   than like a bug. The ids make double-counting and gaps visible, and
   coverage() below turns that into a hard check. */
function controlIds(frag) {
  return [...frag.matchAll(/<(?:input|textarea|select)\b[^>]*\bid="([^"]+)"/gi)].map(m => m[1]);
}

function countIn(frag) {
  if (!frag) return { words: 0, fields: 0, choices: 0, blocks: 0, ids: [] };
  const v = visible(frag);
  const ids = controlIds(frag);
  return {
    words: words(v),
    fields: ids.length,
    choices: (frag.match(/<option\b/gi) || []).length +
             (frag.match(/type="(radio|checkbox)"/gi) || []).length,
    blocks: (frag.match(/<(p|div class="why"|h[23]|label)\b/gi) || []).length || 1,
    ids
  };
}

/* Every control in the page must be claimed by exactly one step. Anything
   claimed twice inflates that step; anything claimed by nobody is a screen
   the model never charged for. Both are silent failures that make the report
   look more confident than it is, so they are printed every run. */
function coverage(page, funnel, optional) {
  const html = read(page).replace(/<!--[\s\S]*?-->/g, ' ');
  const all = controlIds(html);
  const opt = optional || {};
  const seen = new Map();
  for (const s of funnel) for (const id of s.ids || []) {
    seen.set(id, (seen.get(id) || []).concat([s.id]));
  }
  return {
    total: all.length,
    claimed: seen.size,
    declaredOptional: all.filter(id => opt[id]).length,
    dupes:  [...seen.entries()].filter(([, v]) => v.length > 1),
    missed: all.filter(id => !seen.has(id) && !opt[id]),
    ghosts: [...seen.keys()].filter(id => !all.includes(id)),
    staleOptional: Object.keys(opt).filter(id => !all.includes(id))
  };
}

/* Hebrew words inside the string literals of a JS module — what that module
   renders. Comments are stripped first; this repo is a third comments and
   they are not shipped to anyone's eyes. */
function jsCopy(file) {
  const raw = read(file).replace(/\/\*[\s\S]*?\*\//g, ' ');
  let n = 0;
  for (const m of raw.match(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g) || []) n += words(m);
  return n;
}

/* ---------- POST-CALL funnel ---------- */

/* Controls that exist on the page but are NOT on the path to a first
   proposal. The guide (assets/pc-guide.js STEPS) is the product's own
   statement of what is required, so anything outside it is optional
   refinement or a secondary surface. Listing them by hand rather than
   letting them fall off the edge is the point: the audit demands that every
   control be either charged to a step or named here, so a genuinely new
   required field cannot enter the page unnoticed. */
const POST_CALL_OPTIONAL = {
  trIn: 'transcript paste — an alternative way in, not a required step',
  keyIn: 'licence key — only touched at export, after the proposal exists',
  q_role: 'pricing detail — has a default', q_rate_custom: 'pricing detail — has a default',
  q_trigger: 'pricing detail — has a default', q_integration: 'pricing detail — has a default',
  q_edge: 'pricing detail — has a default', q_prev: 'pricing detail — has a default',
  q_provenance: 'pricing detail — has a default',
  q_deadline: 'proposal detail — optional', q_success: 'proposal detail — optional',
  c_last: 'calibration surface', c_scale: 'calibration surface',
  c_margin: 'calibration surface', c_deals: 'calibration surface',
  a_myrate: 'advanced settings', a_capture: 'advanced settings', a_maint: 'advanced settings',
  rp_client: 'follow-up reporting, after delivery', rp_quoted: 'follow-up reporting, after delivery',
  rp_closed: 'follow-up reporting, after delivery', rp_conc: 'follow-up reporting, after delivery',
  backupFile: 'backup restore'
};

function postCallFunnel() {
  const html = read('post-call.html').replace(/<!--[\s\S]*?-->/g, ' ');
  const qa = blocksOf(html, 'qa');
  /* the block that contains a given control, whichever one it turns out to be */
  const owning = id => qa.filter(b => b.ids.includes(id));
  const forIds = (...ids) => {
    const bs = [...new Set(ids.flatMap(owning))];
    const frag = bs.map(b => b.html).join('\n');
    const c = countIn(frag);
    /* charge only the ids this step claims; a block holding two steps' fields
       would otherwise bill both of them for all of them */
    return { ...c, fields: ids.filter(i => c.ids.includes(i)).length, ids: ids.slice() };
  };

  /* Always-on chrome: everything above the first question. Paid by every
     single visitor before they have answered anything, which makes it the
     most expensive copy in the product per word. */
  const firstQ = qa.length ? qa[0].start : html.length;
  const chrome = { ...countIn(html.slice(0, firstQ)), fields: 0, ids: [] };

  /* Guide copy: the guide shows one step's title+ask+why+cta at a time. */
  const guide = read('assets/pc-guide.js').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const stepCopy = {};
  const block = guide.slice(guide.indexOf('const STEPS'), guide.indexOf('];', guide.indexOf('const STEPS')));
  for (const m of block.matchAll(/id:\s*'([a-z]+)'([\s\S]*?)(?=\n\s*\},\s*\n\s*\{|\n\s*\}\s*$)/g)) {
    let n = 0;
    for (const q of m[2].match(/'[^'\n]*'/g) || []) n += words(q);
    stepCopy[m[1]] = n;
  }

  /* The systems step renders its options from the catalog rather than the
     markup, so its choice count comes from there. */
  const sysChoices = (read('assets/pc-catalog.js').match(/\n\s*\{\s*id:\s*'/g) || []).length || 12;

  const steps = [
    { id: 'landing', label: 'נחיתה · כותרת, הסבר, תבניות', ...chrome },
    { id: 'process', label: 'שלב 1 · התהליך',       ...forIds('q_process') },
    { id: 'volume',  label: 'שלב 2 · כמה וכמה זמן',  ...forIds('q_freq', 'q_freq_unit', 'q_minutes') },
    { id: 'systems', label: 'שלב 3 · תוכנות',        words: 0, fields: 0, ids: [],
      choices: sysChoices, blocks: 2, rendered: true },
    { id: 'breaks',  label: 'שלב 4 · תקלות',         ...forIds('q_err_freq', 'q_err_cost') },
    { id: 'scope',   label: 'שלב 5 · מה כלול',       words: Math.round(jsCopy('assets/pc-catalog.js') * 0.25),
      fields: 0, ids: [], choices: 12, blocks: 12, rendered: true },
    { id: 'sender',  label: 'שלב 6 · מי שולח (פעם אחת)',
      ...forIds('s_name', 's_business', 's_phone', 's_email', 's_attr') },
    { id: 'client',  label: 'שלב 7 · הלקוח',         ...forIds('q_client', 'q_phone', 'q_email', 'q_decider') },
    { id: 'send',    label: 'שלב 8 · ההצעה מוכנה',   words: jsCopy('assets/pc-send.js') + jsCopy('assets/pc-sender.js'),
      fields: 0, ids: [], choices: 4, blocks: 4, rendered: true, value: true }
  ];

  /* the guide's own words ride along on each step it narrates */
  for (const s of steps) if (stepCopy[s.id]) { s.words += stepCopy[s.id]; s.blocks += 3; }

  /* The document builds live from step 1 — that is the product's central
     design decision and the model has to see it, not just the send button.
     Charged at a third of the document's words because it is glanced at
     while filling, not read through. */
  const doc = blocksOf(html, 'doc')[0];
  steps[1].value = true;
  if (doc) steps[1].words += Math.round(countIn(doc.html).words * 0.3);

  return steps.map(s => ({ ...s, words: Math.round(s.words) }));
}

/* ---------- PRE-CALL funnel ---------- */

const PRE_CALL_OPTIONAL = {
  backupFile: 'backup restore — outside the four steps',
  pasteBiz: 'fast path — an alternative to typing the nine profile fields, not an extra demand',
  p_paste: 'fast path — an alternative to typing the seven research fields'
};

function preCallFunnel() {
  const html = read('pre-call.html').replace(/<!--[\s\S]*?-->/g, ' ');
  const panel = n => {
    const a = html.indexOf('id="p' + n + '"');
    const b = n < 4 ? html.indexOf('id="p' + (n + 1) + '"') : html.indexOf('id="callbar"');
    const c = countIn(html.slice(a, b > a ? b : html.length));
    /* the paste shortcuts are alternatives to the fields beside them, so they
       are not charged as additional demands */
    const ids = c.ids.filter(i => !PRE_CALL_OPTIONAL[i]);
    return { ...c, fields: ids.length, ids };
  };
  const head = { ...countIn(html.slice(0, html.indexOf('<div class="steps">'))), fields: 0, ids: [] };
  return [
    { id: 'landing', label: 'נחיתה', ...head },
    /* exits: this step's instruction is "copy this prompt, run it in Claude or
       ChatGPT, then come back and paste the result". The user leaves. */
    { id: 'p1', label: 'שלב 1 · אפיון העסק (יוצא ל-LLM חיצוני)', ...panel(1), exits: true },
    { id: 'p2', label: 'שלב 2 · הזנת הפרופיל', ...panel(2) },
    { id: 'p3', label: 'שלב 3 · הצד השני', ...panel(3) },
    { id: 'p4', label: 'שלב 4 · התסריט', ...panel(4), value: true }
  ];
}

/* ---------- report ---------- */

const pct = v => (v * 100).toFixed(1) + '%';
const sec = v => v < 90 ? v.toFixed(0) + 's' : (v / 60).toFixed(1) + 'm';
const bar = v => '█'.repeat(Math.round(v * 30)) + '·'.repeat(30 - Math.round(v * 30));

function report(name, funnel, page, optional) {
  /* Solve the one free parameter against the external benchmark, then hold it
     fixed for everything else this function prints. */
  const cap   = A.ceiling(funnel);
  const sat   = cap.completion < A.BENCHMARK_COMPLETION;
  const scale = A.calibrate(funnel);
  const over  = { weibullScale: scale };
  const r = A.simulate(funnel, over);
  const v = A.wordValue(funnel, over);
  const s = A.sensitivity(funnel);

  console.log('\n' + '='.repeat(78));
  console.log(name);
  console.log('='.repeat(78));
  console.log(`${r.totalWords} words · ${r.totalFields} fields · ${sec(r.totalSec)} of attention to finish`);
  if (sat) {
    console.log(`STRUCTURAL CEILING ${pct(cap.completion)} — BELOW the ${pct(A.BENCHMARK_COMPLETION)} benchmark.`);
    console.log(`  With every word free and infinite patience, this funnel still tops out there:`);
    console.log(`  ${cap.fields} fields cost ${pct(1 - cap.fromFields)}, ${cap.exits} hand-off(s) to another product cost ${pct(1 - cap.fromExits)}.`);
    console.log(`  Cutting words cannot reach the benchmark. Structure is the binding constraint.`);
  } else {
    console.log(`calibrated to ${pct(A.BENCHMARK_COMPLETION)} completion ` +
                `(Baymard/HubSpot avg web form) → patience scale ${scale.toFixed(0)}s`);
    console.log(`structural ceiling (words free, infinite patience): ${pct(cap.completion)}`);
  }
  console.log('');

  console.log('  step                                    words  flds   cost   alive');
  console.log('  ' + '-'.repeat(72));
  for (const st of r.steps) {
    const mark = st.exits ? ' ⇥' : st.value ? ' ◆' : '  ';
    console.log('  ' + (st.label + mark).padEnd(40).slice(0, 40) +
      String(st.words).padStart(5) + String(st.fields).padStart(6) +
      (sec(st.cost.totalMs / 1000)).padStart(7) + pct(st.survival).padStart(8) +
      '  ' + bar(st.survival));
  }

  console.log('\n  ── boundary ──');
  if (r.boundary) {
    console.log(`  The median user is gone at: ${r.boundary.label}`);
    console.log(`  Steps in front of the boundary: ${r.boundary.index} of ${r.steps.length}`);
  } else {
    console.log('  Survival never crosses 50% — the whole funnel sits inside the boundary.');
  }
  if (r.firstValue) {
    console.log(`  First value (◆) at "${r.firstValue.label.trim()}" — reaches ${pct(r.firstValue.survival)} of starters`);
  }
  console.log(`  Full value (◆) reached by: ${pct(r.valueReached)} of starters` +
              `  → before boundary: ${r.valueBeforeBoundary ? 'YES' : 'NO'}`);

  console.log('\n  ── what a word is worth ──');
  console.log(`  Completion, per 100 words cut ANYWHERE: ${(v.completionPer100 * 100).toFixed(2)} pts`);
  console.log('  (position-independent by construction — see the telescoping note in the model)\n');
  console.log('  cutting 100 words from…                 boundary moves   value reached');
  console.log('  ' + '-'.repeat(72));
  for (const p of v.perStep) {
    if (!p.words) continue;
    console.log('  ' + p.label.padEnd(40).slice(0, 40) +
      String(p.reachGain > 0 ? '+' + p.reachGain + ' steps' : '—').padStart(14) +
      ('+' + (p.valueReachedGain * 100).toFixed(2) + ' pts').padStart(16));
  }

  /* The comparison the whole exercise exists to produce. Three ways to spend
     a day of editing, priced in the same unit, so "make it shorter" has to
     compete with the alternatives instead of being assumed to be the move. */
  console.log('\n  ── levers, priced in the same unit ──');
  const drop = (mut, label) => {
    const f = mut(funnel.map(s => ({ ...s })));
    const g = A.simulate(f, over).completion - r.completion;
    console.log('  ' + label.padEnd(46) + ('+' + (g * 100).toFixed(2) + ' pts').padStart(12));
    return g;
  };
  const wordsGain = drop(f => { let n = 100; for (const s of f) { const c = Math.min(n, s.words); s.words -= c; n -= c; } return f; },
    'cut 100 words (2.5 paragraphs) of copy');
  const fieldGain = drop(f => { for (const s of f) if (s.fields) { s.fields--; break; } return f; },
    'remove ONE field (default it, or derive it)');
  const exitGain = funnel.some(s => s.exits)
    ? drop(f => { for (const s of f) s.exits = false; return f; }, 'bring the external hand-off in-product')
    : null;
  console.log('  ' + '-'.repeat(58));
  console.log(`  One field is worth ${(fieldGain / wordsGain).toFixed(1)}× as much as 100 words.`);
  if (exitGain !== null) {
    console.log(`  Removing the hand-off is worth ${(exitGain / wordsGain).toFixed(0)}× as much as 100 words` +
                ` — ${(exitGain / fieldGain).toFixed(1)}× a field.`);
  }

  /* Printed before any conclusion, because a mis-mapped region makes every
     number above it wrong in a way that still looks plausible. */
  if (page) {
    const cov = coverage(page, funnel, optional);
    console.log('\n  ── extraction audit ──');
    console.log(`  controls in ${page}: ${cov.total} · charged to a step: ${cov.claimed}` +
                ` · declared off-path: ${cov.declaredOptional}`);
    if (cov.dupes.length)  console.log('  DOUBLE-COUNTED: ' + cov.dupes.map(([id, st]) => id + ' (' + st.join(',') + ')').join(', '));
    if (cov.missed.length) console.log('  UNACCOUNTED (charge it or declare it off-path): ' + cov.missed.join(', '));
    if (cov.ghosts.length) console.log('  CLAIMED BUT NOT IN PAGE: ' + cov.ghosts.join(', '));
    if (cov.staleOptional.length) console.log('  DECLARED OFF-PATH BUT GONE FROM PAGE: ' + cov.staleOptional.join(', '));
    if (!cov.dupes.length && !cov.missed.length && !cov.ghosts.length && !cov.staleOptional.length)
      console.log('  clean — every control is charged exactly once or named off-path');
  }

  console.log('\n  ── does the finding survive the uncertainty? ──');
  console.log(`  Boundary step index across the full constant sweep: ${s.boundaryMin}–${s.boundaryMax}` +
              `  (${s.stable ? 'STABLE' : 'moves'})`);
  console.log(`  "Value lands before the boundary" holds in every sweep: ${s.valueSafeAlways ? 'YES' : 'NO'}`);
  const worst = s.rows.filter(x => x.assumed).sort((a, b) => a.boundaryIndex - b.boundaryIndex)[0];
  if (worst) console.log(`  Worst assumed-constant case: ${worst.knob}=${worst.at} → boundary at step ${worst.boundaryIndex}`);

  return { name, sim: r, value: v, sens: s };
}

const out = [report('POST-CALL', postCallFunnel(), 'post-call.html', POST_CALL_OPTIONAL),
             report('PRE-CALL',  preCallFunnel(),  'pre-call.html',  PRE_CALL_OPTIONAL)];

if (process.argv.includes('--json')) {
  fs.writeFileSync(path.join(root, 'attention.json'), JSON.stringify(out, null, 2));
  console.log('\nwrote attention.json');
}
console.log('');
