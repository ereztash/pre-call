/* node tools/readme-audit.js — no browser, no deps.

   README.md is not documentation. Nobody will contribute to a proprietary
   repository and no user reads a repository to use a web page, so the file
   has exactly one reader: someone deciding whether the person who wrote
   this is worth talking to. That reader arrived from a link, scans for
   under a minute, and forms one judgement.

   Which means the failure mode here is NOT the product's failure mode, and
   the model in docs/words.md does not transfer. In the product the enemy is
   length: every word costs milliseconds, milliseconds cost survival, and
   the losses are additive. In a README the enemy is being unbacked. One
   paragraph asserting something on nothing discredits the twenty next to it
   that carry a number, and that damage is multiplicative rather than
   additive — a reader who catches one claim standing on air re-reads
   everything else as sales copy. Length still hurts, but it hurts by a
   different route: it does not make the reader leave, it dilutes the first
   screen, which for this reader is the only screen.

   So: four numbers, in the shape of tools/design-audit.js and for the same
   reason. That file exists because "crowded, harsh, simply bad" was a true
   verdict nobody could act on, and turning it into four thresholds made it
   arguable once instead of relitigated forever. "The README is too long"
   and "this reads like a pitch" are the same kind of true and the same kind
   of unactionable.

   What this cannot do: tell you the writing is good. It can tell you that a
   paragraph is standing on nothing, that the first screen is over budget,
   that the reader waits too long to learn what the thing is for, and that
   the strongest evidence in the repository is linked from a place nobody
   reaches. That last one is not hypothetical — docs/ was referenced exactly
   once, in a parenthesis, on line 610 of 660, and two of the three files
   were not linked at all.

   The thresholds are opinions. They are written here so they get argued
   once, explicitly, instead of in every edit. */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const FILE = process.argv[2] || 'README.md';
const src = fs.readFileSync(path.join(root, FILE), 'utf8');
const lines = src.split('\n');

/* ---------- thresholds, and what each one is an opinion about ---------- */
const T = {
  /* Zero, not "few". A single unbacked claim above the fold is the whole
     failure this file exists to catch, and a budget of one is a budget for
     the exact paragraph somebody most wants to write. Below the fold it is
     reported and not enforced: depth is allowed to include a transition
     sentence, and enforcing there would only teach everyone to bolt a
     number onto a connective. */
  unbackedAboveFold: 0,
  /* About a minute of scanning for a reader who is not yet invested. The
     number is not precise and does not need to be — what it does is make
     "should this paragraph be up top" a question with an answer, which it
     was not before. */
  firstScreenWords: 250,
  /* The reader should learn what the thing is for before they have decided
     whether to keep reading. Thirty words is a title, a licence line, and
     nothing else. */
  wordsToPurpose: 30,
  /* Every file in docs/ is an argument that took real work. If the first
     link to one sits below the fold, it exists for people who already
     decided to read — which is the audience that needed convincing least. */
  evidenceAboveFold: true
};

/* ---------- the fold ----------
   Where a scanning reader stops without a scroll. Taken as the first
   horizontal rule, and failing that the first section heading — the two
   ways this file has ever marked "the opening is over". */
function foldLine() {
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') return i;
    if (/^##? /.test(lines[i])) return i;
  }
  return lines.length;
}

/* Markdown punctuation is not read aloud and should not be charged. Words
   of one character are dropped: Hebrew single letters are prefixes
   (ו, ב, ל, ה) that belong to the word after them, and counting them would
   inflate a Hebrew page against an English threshold. */
function words(text) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[|`>#*_\[\]()·—–-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1).length;
}

/* ---------- 1 · prose standing on nothing ----------
   A prose block is backed when it carries at least one of three things a
   reader can check: a number, a link, or a reference to a file in this
   repository. Anything else is an assertion, however well phrased.

   Deliberately mechanical and deliberately crude. A subtler rule would be
   arguable in every case, which is the property this whole file exists to
   remove. Headings, code, tables and blockquotes are skipped — headings
   carry no claim on their own, code is evidence by construction, tables in
   this document are always evidence, and the licence blockquote is a legal
   notice rather than a claim about the work. */
function proseBlocks() {
  const out = [];
  let buf = [], start = 0, fence = false;
  const flush = () => {
    if (buf.length) out.push({ line: start + 1, text: buf.join(' ') });
    buf = [];
  };
  lines.forEach((l, i) => {
    const t = l.trim();
    if (t.startsWith('```')) { fence = !fence; flush(); return; }
    if (fence) return;
    if (!t || t.startsWith('#') || t.startsWith('|') || t.startsWith('>') || t === '---') {
      flush(); return;
    }
    if (!buf.length) start = i;
    buf.push(t);
  });
  flush();
  return out;
}

/* Four things a reader can go and check: a number, a link, a file in this
   repository, or a named identifier from the code. Inline code counts for
   the same reason a filename does — `copy`, `print`, `send` name real gate
   actions, and a sentence pointing at them is answerable. Leaving it out
   cost 26 false positives on the first run and would have made the
   below-fold count untrustworthy, which is the one thing a reported number
   cannot afford to be. */
const backed = t =>
  /\d/.test(t) ||
  /\]\([^)]+\)/.test(t) ||
  /[\w-]+\.(js|md|html|css|json|yml|svg|png)\b/.test(t) ||
  /`[^`]+`/.test(t);

/* A single line that is bold end to end is a heading wearing asterisks —
   a purpose statement, a label over a table. It makes no claim of its own
   and demanding evidence from it would only push writers to bolt a number
   onto a title. The first version of this file did not know that and its
   first run reported two of them, which is how the rule got written. */
const isLabel = b => !b.text.includes('\n') && /^\*\*[^*]+\*\*:?$/.test(b.text.trim());

/* ---------- 4 · evidence nobody reaches ---------- */
function evidence() {
  const dir = path.join(root, 'docs');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort().map(f => {
    const rel = 'docs/' + f;
    const at = lines.findIndex(l => l.includes('(' + rel + ')'));
    return { file: rel, line: at < 0 ? null : at + 1 };
  });
}

/* ---------- links that go nowhere ----------
   Not a threshold — a fact. A dead link in the one file that exists to be
   believed costs more than any amount of prose it sits next to. Anchors are
   resolved against this document's own headings using GitHub's slug rule:
   lowercase, drop punctuation, spaces become hyphens. Hebrew letters are
   word characters and survive it. */
const slug = h => h.replace(/^#+\s*/, '').trim().toLowerCase()
  .replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-');

function deadLinks() {
  const heads = lines.filter(l => /^#+ /.test(l)).map(slug);
  const out = [];
  for (const m of src.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const href = m[1];
    if (/^(https?:|mailto:)/.test(href)) continue;
    const at = src.slice(0, m.index).split('\n').length;
    if (href.startsWith('#')) {
      if (!heads.includes(href.slice(1).toLowerCase())) out.push({ href, line: at });
    } else if (!fs.existsSync(path.join(root, href.split('#')[0]))) {
      out.push({ href, line: at });
    }
  }
  return out;
}

/* ---------- run ---------- */
const fold = foldLine();
const firstScreen = words(lines.slice(0, fold).join('\n'));

/* The first emphasised sentence is taken as the purpose. The rule behind
   the measurement is the point: the first thing this file chooses to
   emphasise should be what the work is for. If that is not what the first
   bold line says, the number comes out large and the reason is visible. */
const boldAt = lines.findIndex(l => /^\*\*/.test(l.trim()));
const toPurpose = boldAt < 0 ? words(src) : words(lines.slice(0, boldAt).join('\n'));

const blocks = proseBlocks().filter(b => !isLabel(b));
const unbackedAbove = blocks.filter(b => b.line < fold && !backed(b.text));
const unbackedBelow = blocks.filter(b => b.line >= fold && !backed(b.text));
const ev = evidence();
const buried = ev.filter(e => e.line === null || e.line >= fold);
const dead = deadLinks();

const findings = [];
const pad = (s, n) => String(s).padEnd(n);
const line = (ok, name, got, max) =>
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + pad(name, 34) + pad(got, 22) + max);

console.log('\n' + '='.repeat(74));
console.log(FILE + '  ·  ' + lines.length + ' lines, ' + words(src) +
            ' words, fold at line ' + fold);
console.log('='.repeat(74) + '\n');

let ok = unbackedAbove.length <= T.unbackedAboveFold;
line(ok, 'prose standing on nothing', unbackedAbove.length + ' above the fold',
     'max ' + T.unbackedAboveFold);
if (!ok) { findings.push('unbacked'); unbackedAbove.forEach(b =>
  console.log('        line ' + b.line + ': ' + b.text.slice(0, 68) + '…')); }

ok = firstScreen <= T.firstScreenWords;
line(ok, 'first screen', firstScreen + ' words', 'max ' + T.firstScreenWords);
if (!ok) findings.push('firstScreen');

ok = toPurpose <= T.wordsToPurpose;
line(ok, 'words before the purpose', toPurpose + ' words', 'max ' + T.wordsToPurpose);
if (!ok) findings.push('purpose');

ok = buried.length === 0;
line(ok, 'evidence above the fold', (ev.length - buried.length) + '/' + ev.length + ' linked',
     'all of them');
if (!ok) { findings.push('evidence'); buried.forEach(e =>
  console.log('        ' + e.file + ': ' + (e.line ? 'line ' + e.line : 'never linked'))); }

ok = dead.length === 0;
line(ok, 'links that resolve', dead.length + ' dead', 'none');
if (!ok) { findings.push('deadLinks'); dead.forEach(d =>
  console.log('        line ' + d.line + ': ' + d.href)); }

/* A watch number, not a to-do list, and it is worth being exact about why.
   Below the fold this document is mostly design rationale — "the obvious
   framing is X, that is the wrong architecture for this product, here is
   what it would have cost". That genre argues rather than cites, and it is
   the right genre for the place it sits in. So a high count here is not a
   defect to drive to zero; what matters is the direction it moves. Above
   the fold the same measure is enforced, because the opening is where a
   reader decides whether any of the rest is worth believing. */
console.log('\n  reported, not enforced:');
console.log('        ' + unbackedBelow.length + ' unbacked prose blocks below the fold' +
            ' (of ' + blocks.length + ' total) — mostly design rationale, watch the trend');

console.log('\n' + '='.repeat(74));
console.log(findings.length ? findings.length + ' finding(s).' : 'no findings.');
console.log('='.repeat(74) + '\n');

process.exit(findings.length ? 1 : 0);
