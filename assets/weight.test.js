/* node assets/weight.test.js — no browser, no deps.

   A budget, not a benchmark. There is no build step here, so nothing
   minifies, tree-shakes or code-splits on the way out: whatever is written
   is what a phone on a bad connection downloads, byte for byte. That is a
   good property and it is a fragile one — it holds only as long as nobody
   adds a library, and the way it usually stops holding is that the first
   dependency arrives for a good reason and no single commit ever looks
   expensive.

   The numbers below are ceilings with room in them, not targets to grow
   into. A failure here is not "the product is slow" — it is "the weight
   changed enough that somebody should say out loud whether they meant to".

   Budgeted on compressed bytes, because that is what the user pays. This
   file used to budget on raw bytes and the difference is not a rounding
   error: post-call.html is 321KB written and 95KB over the wire, so the
   old ceiling overstated a visitor's cost by 3.4x.

   A correction, because the sentence that used to follow was measured and
   is false. It said comments "compress to almost nothing", and therefore
   that budgeting raw quietly taxed the documentation. Stripped with a
   tokenizer that respects strings, templates and regex literals, and each
   result handed to `new vm.Script()` so the measurement is of a file that
   still parses — a stripper that ate a quote would show up as a syntax
   error, not a smaller number:

     code    431.1K raw -> 116.7K wire   3.69x
     prose   279.8K raw ->  96.8K wire   2.89x

   Prose compresses WORSE than code, and it is 45% of the compressed asset
   weight. Both halves of the old claim were wrong, and the second one was
   load-bearing: it was the reason nobody looked at what the ceiling was
   actually holding.

   Revised once already, by review rather than by anyone re-running the
   measurement: the first cut of the stripper below copied a template
   literal through as one opaque string, so a comment sitting inside a
   ${...} interpolation compressed as prose but counted as code, and a
   template nested inside another lost the scanner's place entirely. Both
   are why the JS path is two mutually recursive functions rather than one
   loop — an interpolation can hold a nested template and a template can
   hold another interpolation, and both now run through the same tokenizer
   instead of a second, divergent copy of it. The numbers above are from
   the corrected scanner; the first version overstated post-call.html's
   code alone by 13.4KB — 10.4 of it in post-call.js, the rest in
   pc-ledger.js and pc-proposal.js, the three files with a template
   nested inside another template's interpolation.

   Which is why there are two ceilings now. Under one combined number a
   paragraph of documentation and a first dependency look identical — the
   thing this file says at the top it exists to catch is the dependency, and
   it had no way to tell them apart. CODE below is the machine only. The
   total stays budgeted too, because prose is not free and the visitor pays
   for it either way; what changes is that a failure now names which half
   moved, which is the whole of "somebody should say out loud whether they
   meant to".

   Raw weight is still reported on every run. It is the honest signal for
   "is this file getting out of hand as a thing to read", which is a real
   question; it is just not the question a transfer budget answers. */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const vm = require('vm');
const assert = require('assert');

const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

const kb = bytes => Math.round(bytes / 1024 * 10) / 10;
const size = f => fs.statSync(path.join(root, f)).size;

/* Everything a browser actually fetches for one page: the HTML, plus every
   stylesheet and script it links.

   Test files are not counted here, and the first version of this comment
   also said they "are not shipped". That half was wrong for the whole life
   of the project: fetching /assets/model.test.js in production answered
   200. A file being deployed and a file being loaded are different things,
   and only the second was ever measured — so the budget was honest and the
   sentence next to it was not. .vercelignore now makes the sentence true,
   and markup.test.js asserts the list stays complete. */
function pageWeight(page) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  const assets = [
    ...[...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]),
    ...[...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m => m[1])
  ];
  const parts = assets.map(a => ({ f: a, bytes: size(a), wire: wire(a), code: codeWire(a) }));
  const total = parts.reduce((s, p) => s + p.bytes, 0) + size(page);
  const overWire = parts.reduce((s, p) => s + p.wire, 0) + wire(page);
  const code = parts.reduce((s, p) => s + p.code, 0) +
    zlib.brotliCompressSync(Buffer.from(strip(html, 'html'))).length;
  return { total, overWire, code, prose: overWire - code, parts, assets };
}

/* The machine only: the same bytes with every comment removed.

   A stripper that eats a quote would measure a file that is not the file, so
   the JS path is a tokenizer rather than a regex — it walks strings, template
   literals and regex literals and only treats / / and / * as a comment where
   a comment can actually start — and every stripped result is handed to the
   parser before its size is believed. A silent failure here would not look
   like a failure, it would look like the code getting smaller. */
function strip(src, kind) {
  if (kind === 'html') return src.replace(/<!--[\s\S]*?-->/g, '');
  if (kind === 'css') {
    let out = '', i = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === '"' || c === "'") {                       // url("...") may hold anything
        const q = c; out += c; i++;
        while (i < src.length) {
          if (src[i] === '\\') { out += src[i] + src[i + 1]; i += 2; continue; }
          out += src[i]; if (src[i] === q) { i++; break; } i++;
        }
        continue;
      }
      if (c === '/' && src[i + 1] === '*') {
        i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
        i += 2; continue;
      }
      out += c; i++;
    }
    return out;
  }
  let out = '', i = 0;
  /* A / starts a regex literal only where a value may begin. After an
     identifier or a ) it is division, and treating it as a regex would
     swallow the rest of the line. */
  const prev = () => { for (let j = out.length - 1; j >= 0; j--) if (!/\s/.test(out[j])) return out[j]; return ''; };

  /* A template literal is not one string, it is text with JS spliced into it
     at every ${...}. Copying that JS through unstripped was found by review:
     a comment inside an interpolation compressed as prose but counted as
     code, so CODE_BUDGETS could be inflated by exactly the kind of paragraph
     it exists to tell apart from a dependency. scanCode() and scanTemplate()
     call each other — an interpolation can hold a nested template, and a
     template can sit inside an interpolation's own expression — so both
     depths of nesting run through the one tokenizer rather than a second,
     divergent copy of it. */
  function scanTemplate() {
    out += src[i]; i++;                                 // the opening `
    while (i < src.length) {
      if (src[i] === '\\') { out += src[i] + src[i + 1]; i += 2; continue; }
      if (src[i] === '`') { out += src[i]; i++; return; }
      if (src[i] === '$' && src[i + 1] === '{') {
        out += '${'; i += 2;
        scanCode(true);                                 // strips comments in the interpolation too
        if (src[i] === '}') { out += '}'; i++; }
        continue;
      }
      out += src[i]; i++;                                // literal text: never comment syntax
    }
  }

  /* stopAtBrace is true only inside a ${...}: scanning has to stop at that
     interpolation's own closing brace rather than run past it, and depth is
     what tells an unrelated inner `}` — an object literal, a block — apart
     from that one. False at the top level, where there is no caller waiting
     for a specific brace and every character gets consumed regardless. */
  function scanCode(stopAtBrace) {
    let depth = 0;
    while (i < src.length) {
      const c = src[i], d = src[i + 1];
      if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '/' && d === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
      if (c === '"' || c === "'") {
        const q = c; out += c; i++;
        while (i < src.length) {
          if (src[i] === '\\') { out += src[i] + src[i + 1]; i += 2; continue; }
          out += src[i]; if (src[i] === q) { i++; break; } i++;
        }
        continue;
      }
      if (c === '`') { scanTemplate(); continue; }
      if (c === '/' && '(,=:[!&|?{};+-*%~^<>'.includes(prev())) {
        out += c; i++;
        while (i < src.length) {
          if (src[i] === '\\') { out += src[i] + src[i + 1]; i += 2; continue; }
          if (src[i] === '[') { while (i < src.length && src[i] !== ']') { out += src[i]; i++; } }
          out += src[i]; if (src[i] === '/') { i++; break; } i++;
        }
        while (i < src.length && /[a-z]/.test(src[i])) { out += src[i]; i++; }
        continue;
      }
      if (c === '{') { depth++; out += c; i++; continue; }
      if (c === '}') {
        if (stopAtBrace && depth === 0) return;           // the interpolation's own close — leave it for scanTemplate
        depth--; out += c; i++; continue;
      }
      out += c; i++;
    }
  }

  scanCode(false);
  return out;
}

const codeCache = {};
function codeWire(f) {
  if (codeCache[f]) return codeCache[f];
  const kind = f.endsWith('.css') ? 'css' : 'js';
  const stripped = strip(fs.readFileSync(path.join(root, f), 'utf8'), kind);
  if (kind === 'js') new vm.Script(stripped, { filename: f });   // throws if the stripper broke it
  return (codeCache[f] = zlib.brotliCompressSync(Buffer.from(stripped)).length);
}

/* brotli, which every browser this product supports has accepted for
   years and which the host negotiates by default. gzip is ~20% larger and
   would be the pessimistic figure; brotli is what actually gets sent. */
function wire(f) {
  return zlib.brotliCompressSync(fs.readFileSync(path.join(root, f))).length;
}

/* Per page, because the entry page is the one a first-time visitor pays
   for before they have decided the product is worth anything. It has a
   much tighter ceiling than the working surfaces on purpose. */
/* 16 → 21 on the two small pages, 48 → 54 and 136 → 142 on the tools,
   all on the same day and all for the same capability: a dark theme and
   a second language. What every page now carries: pc-boot.js (theme and
   direction before first paint), theme.css (the dark ramp), pc-i18n.js
   (the dictionary runtime and the preferences strip) — about 5KB over
   the wire together. What no page carries: the English dictionaries
   themselves, which pc-boot.js loads only after the visitor chooses
   English, so the default Hebrew visit pays for the toggle and not for
   the translation. That split is the difference between a 5KB raise and
   a 15KB one, and it is asserted by the orphan-module test in
   assets/markup.test.js. */
/* A third raise on the tools, and this one is named rather than absorbed:
   the tr() seam and its Hebrew keys, the tablist wiring, the skip links and
   the prefers-contrast block. The dictionaries themselves are still not in
   any of these numbers — a Hebrew visit does not download them — so what
   grew is the product, not the translation. accessibility.html is a new
   page and gets the small-page ceiling the other static page has.

   A fourth raise, 146 → 148KB, landed the same day every remaining
   POST-CALL module (pc-followup, pc-gate, pc-history, pc-ledger,
   pc-proposal, pc-transcript) finished crossing the tr() seam — the
   wrapper itself, once per module, plus every Hebrew literal now sitting
   inside a function call instead of a bare string. That is the seam's
   fixed cost, paid once per file and paid by every visitor regardless of
   language, which is exactly the kind of growth this budget exists to
   surface rather than hide: 0.2KB over on the old ceiling, for finishing
   the second language. */
const BUDGETS = {
  'index.html':          21 * 1024,
  'privacy.html':        21 * 1024,
  'accessibility.html':  21 * 1024,
  /* The two marketing pages, which shipped without a ceiling. They are the most
     literal case this file argues about — a link pasted into WhatsApp, opened
     on a phone, by somebody who has not decided to want this yet — and they
     were the only served HTML with nothing holding them. A landing page is
     also the easiest thing in any repository to grow by one more section, so
     the ceiling is the same tight one the other first-visit pages carry rather
     than a comfortable one set from whatever they happen to weigh today. */
  'post-call-landing.html': 21 * 1024,
  'product-landing.html':   21 * 1024,
  'pre-call.html':       58 * 1024,
  /* 120 → 128 → 136KB, and the second raise happened the same day as the first,
     which is worth saying plainly rather than burying: a budget moved twice in a
     day by 13% is not holding anything back yet.

     What landed in between, all of it real: three journal verbs and the funnel
     derivation, the panel that reads them, the parser for the date the client
     named, and the iCalendar split. That last one is the reason to trust the
     rest — pre-call.html was over its own budget at 48.7KB, and instead of
     raising it the module it was loading for one function got split, which took
     that page to 45.4KB. Splitting is what the accidental case looks like when
     it is found; raising is for the case where the page does more.

     The line to hold: if this page needs a third raise without a matching
     capability, the growth has stopped being features and the trim is overdue.
     index.html and pre-call.html keep their tight ceilings either way — they are
     what a first visit pays for.

     A fifth raise, 148 → 149KB, and it is the awkward one: this page does not
     do anything new for it. pc-contact.js holds the address a buyer opens, and
     it exists because that address was written in two places — here and in the
     landing page — with a test asserting they matched. A test like that reports
     a divergence after somebody has already shipped a page pointing at the
     wrong chat, so it is not one source of truth, it is two with an alarm on
     them.

     By the rule above this raise should have been a trim, and it was: the
     module went from 53 lines to 37, and the opening sentence each page sends
     moved out to the page that sends it — the wall asks for a key, the landing
     page asks for a transcript, and shipping either sentence to everyone who
     loads the tool was the wrong default. That took 148.4 down to 148.1 and no
     further without deleting the fork warning, which is load-bearing: a copy of
     this repository that forgets to change the address sends its buyers here.

     So: 0.1KB over, and the smallest raise in this file's history, bought for a
     configuration that can no longer disagree with itself. If the next raise is
     also correctness rather than capability, that is the signal the trim is
     overdue — not this one.

     A sixth raise, 149 → 151KB, and this one is the ordinary kind: the page
     does more. Reading a transcript used to mean finding figures, which is
     what pricing needs and a fraction of what a proposal promises. observe()
     reads what is not a number — which systems the call named, what the client
     said the connection should produce, and whether a subject was raised and
     left open — and carries each one back with the sentence it came from.
     Without it a locally-read call could be priced and still could not be
     assessed, which left the readiness engine with nothing to read.

     It was 1.1KB of dead weight for about ten minutes first: the module shipped
     before anything called it, and this budget is what said so. Wiring it into
     the local extraction path is what made the raise honest rather than a
     rounding-up.

     A seventh raise, 151 → 154KB, and the page does something it could not do
     before: decide what kind of evidence a call can carry before reading a
     single number out of it. The order used to be the other way round — read
     every cue, then pick a pricing method from whatever came back — and the
     first real transcript anybody ran through this tool showed what that
     costs. A consulting call with no process in it, where the fee being agreed
     in the room, "300 שקל לפגישה", came back as the cost of an incident,
     because the cue for incident cost is a number beside a currency word and
     that is the whole of it. pc-ladder.js inverts the order: four rungs, and
     the rung licenses which cues may be read at all, so on a call that
     established no recurring process nobody looks for one.

     And the same trap as the sixth raise, caught by the same test: the module
     shipped with eleven sentences of operator-facing copy — which rung the
     call reached, and what was absent from every rung above it — and none of
     them rendered. The licence was wired, the reasons were not. That is the
     second time this budget has caught copy paying rent without being on the
     screen, which is a pattern in how these modules get written and worth
     naming rather than fixing quietly. The reasons render now, including on
     the case that matters most: a call that yields no rows at all yields none
     for a reason, and the list of skipped rungs is the list of what to go back
     and ask about.

     An eighth raise, 154 → 157KB, from running two real soft calls through the
     thing. Positioning and branding work: no process, no systems, no ledger
     history, both landing on the bottom rung with the identical answer — which
     is a ladder that has stopped telling calls apart. What those calls did
     carry was a price the client named as his own reference ("like a session
     with a psychologist"), and a buyer saying out loud that there was no
     money. The page now reads both: a fifth rung for the first, and a
     quote-backed warning above the rung for the second, because a confident
     number for a deal the other person already declined in the room is the
     most expensive quiet this tool has.

     Also in this raise, and cheaper than either: the ladder now reads the
     client's lines rather than the whole transcript when the transcript says
     who is speaking. Half a discovery call is the seller describing their own
     business, and every cue in that file was written for the other side of the
     table. Neither real transcript carries a single speaker label, so the page
     also had to learn to say that out loud rather than quietly resting a rung
     on the operator's own sentence.

     A ninth raise, 157 -> 159KB, and it is the smallest kind of change with
     the largest evidence behind it. 200 generated calls through the engines
     and 200 more through a real browser said three things: the method chip was
     naming a method the data could not price in 72% of calls, the anchor rung
     named `comparable` while the number stayed in a quote and never reached
     the field, and the one entry card written for somebody who does not know
     what the product is was the only route of five that never reached a price.
     What the page carries now is the fix to all three — a cue that lands the
     client's reference price in the field the engine reads, a guard that
     refuses to select a method compute() cannot run, and a sentence saying so
     when it happens.

     A tenth raise, 159 -> 163KB, for the page learning to hear a number. Every
     quantitative cue in this product was written around \d+, which is true of
     a form and false of a transcript: speech-to-text writes what it hears, so
     "forty orders a day" comes back as "ארבעים הזמנות ביום" and no cue could
     see it. Measured across 200 generated calls, the value rung was reached 30
     times out of 104 when the numbers arrived as digits and 0 times out of 96
     when they arrived as words. Not rarely. Never — and this repository's own
     demo transcript is written in words, which is why one field out of
     thirteen looked like a thin transcript rather than a deaf reader.

     pc-numerals.js is the whole raise and it is a parser, not copy: it rewrites
     spoken numbers to digits once, before anything reads them, so freq,
     minutes, errCost and the client's reference rate each keep the single
     regular expression they already had. The quote stays the sentence that was
     actually said.

     Also in it, and small: the review rows now ask who said each number. That
     field decides the pricing method and whether the ROI paragraph survives,
     it is derived from speaker labels, and neither real transcript anybody has
     run through this tool carries one. It could not be derived and the
     operator was in the room, so it is asked — on the row, beside the
     sentence.

     An eleventh raise, 163 -> 164KB, for the market rung learning the
     difference between a tool being named and a tool being in a process. It
     used to admit any mention. Measured on twelve real discovery calls, none
     of them an automation project: a system was detected in ten of them and
     the rung held on eight — a website the prospect built for herself, the
     chat app the call was happening on, an email address, a CRM in passing —
     each priced against MARKET_TIERS, whose ranges are keyed on how many
     systems connect. All eight produced the identical sentence saying the
     complexity had been read from the call, and the identical 1,500–4,000₪
     band. That is the failure this product exists to prevent: not a missing
     price, a confident one with a derivation that is not there.

     What the KB buys is one expression in pc-transcript.js requiring the
     mention to share a line with something moving, the rung asking that same
     question, and the line itself shown to the operator instead of the claim
     alone. Eight false positives to zero, and six shapes a real automation
     call uses still admitted — two of which the first draft missed on Hebrew
     morphology and are now pinned in ladder.test.js.

     Worth saying and not burying: zero of the twelve is an automation call, so
     the true-positive side is pinned on constructed lines only. It is measured
     against real speech in one direction and not the other.

     A twelfth raise, 164 -> 165KB, and the second in one day. It buys two
     things in pc-numerals.js, both found by testing digitize() against Hebrew
     number forms drawn up independently of its own tables instead of against
     its own vocabulary. First, a multiplier with nothing counting it was read
     as its own value: "מאות שקלים לשעה" — a client declining to name a figure
     — came back as 100 and filled both the anchor and the incident field, each
     quoting that sentence as though it sourced them. Second, only ו came off
     the front of a number, so "כחמישים הזמנות ביום" read as nothing at all,
     and an approximation is how a quantity is usually given out loud.

     The second raise in a day is itself the finding. This page is 546KB raw,
     and v8 coverage says 283 of 633 functions never run from any entry route.
     The budget is not what needs to move — that is.

     A thirteenth raise, 165 -> 166KB, for ten bytes. The note shown when a
     transcript carries no speaker labels used to name the problem and ask the
     operator to proof-read the quotes, without mentioning that one setting in
     their transcription tool removes it. All twelve real transcripts are
     unlabelled, and the single wrong rung in that corpus disappears the moment
     its line is labelled, so this sentence is worth more than most features
     here. It is now an instruction rather than a description.

     Ten bytes is not a budget problem, and having said twice today that the
     page is what should move, I looked before raising a third time: every
     module post-call.html loads is referenced from another module, so there is
     no orphan to delete and no cheap win. The 283 unreachable functions are
     inside modules that are genuinely loaded. That is a decomposition job, not
     a deletion, and it is still not done.

     A fourteenth raise, 166 -> 168KB, for 1,234 bytes. It buys the map from a
     product name to the chip that carries it. The chip row is twelve
     categories, a transcript names products, and the only thing joining them
     was a word they happened to share — which works for מורנינג, whose product
     name sits inside its chip label, and fails for everything else. Failed
     silently: the panel proposed the system, the operator confirmed it, and no
     chip moved and nothing said why.

     Found by the first test that clicks the confirm button rather than calling
     the function behind it, which is the same measurement that produced the
     new suite: 47 of post-call.js's 77 functions were entered by the whole
     journey, and 30 were never entered once. Silent no-ops are what lives in
     the gap between a tested engine and an untested wire.

     Not raised for the prose. The trim that avoided the previous raise is
     still in force — this is the map, the lookup, and the reason each entry is
     where it is, which is the part that stops the next person from moving
     חשבשבת onto the invoicing chip without knowing it turns off a warning.

     A fifteenth raise, 168 -> 169KB, for 116 bytes. It buys the dark theme
     having surfaces at all. --charcoal-2 is what every panel, card, box and
     input in the product sits on, and mirroring it into the dark ramp landed
     it at ratio 1.012 against the page — the two colours differ in hue and
     not in value, because both sit at the floor of the ramp. Measured across
     the three pages: 28 authored surfaces that painted nothing, including
     every input in both tools and all four cards on the entry page.

     Trimmed four times before raising, and the prose that survived is the
     part that stops someone restoring the mirrored token as a tidy-up. What
     is left of the growth is the override itself, .nums becoming a surface,
     and the transparent card edge that lets three border-color declarations
     paint for the first time.

     Found by a person looking at a screenshot, which is the part worth
     recording: the design audit reported "distinct surfaces 1 (max 4)" and
     called it ok, because every rule in that file is a ceiling. There is a
     floor now.

     A sixteenth raise, 169 -> 170KB, for 135 bytes after a trim. It buys the
     offer under the price: when the ladder holds a price below what the form
     would support, the panel now says which rung it is resting on, what the
     other reading would come to, and what taking it costs. The measurement
     that made it necessary is that the same numbers priced 2.9x apart
     depending only on whether a transcript had been pasted first — the ladder
     decided once, from the call, and the editable form it governs was never
     re-read.

     The alternative price itself is free: compute() has always returned all
     four methods on every keystroke and shown one. What is paid for here is
     the sentence that makes taking it a decision rather than a discovery.

     A seventeenth raise, 170 -> 171KB, for 165 bytes after a trim, and the
     third on this page today — which is worth naming rather than burying.
     All three bought a capability, which is the test this file sets, but a
     page that moved 168 -> 171 in one session is a page whose next raise
     should be refused until something is split.

     This one: the progress bar survives the pinned collapse, and the gap
     between major regions goes to --sp-9, the token whose own comment has
     said "the gap between major regions of a long page" since it was
     written. Twenty-two panels here carry the same fill, the same border and
     the same radius, so distance is the only thing saying where one group
     ends — and at 32 against 16 it read as a single mass. Measured after: 48
     between sections, 20 within one.

     The bar is the smaller half and the sharper one. Everything else the
     collapse hides is a paragraph or a row of six dots; the fill is three
     pixels and the only thing on the pinned bar that moves as the work gets
     done. It read 40% and was on screen at the top of the page and
     display:none at every scroll position after — which is every position
     where the operator is actually working. */
  'post-call.html':     171 * 1024
};

console.log('\nper-page transfer weight, compressed as it is served');
const measured = {};
for (const [page, budget] of Object.entries(BUDGETS)) {
  test(page + ' stays under ' + kb(budget) + 'KB over the wire', () => {
    const w = pageWeight(page);
    measured[page] = w;
    const worst = [...w.parts].sort((a, b) => b.wire - a.wire).slice(0, 3)
      .map(p => p.f + ' ' + kb(p.wire) + 'KB').join(', ');
    assert.ok(w.overWire <= budget,
      page + ' is ' + kb(w.overWire) + 'KB compressed (' + kb(w.total) + 'KB raw), over the ' +
      kb(budget) + 'KB budget. Heaviest: ' + worst + '. Raise the budget deliberately or trim.');
  });
}

/* The machine-only half of the ceiling above: the same page with every
   comment stripped and the result reparsed, so a raise here can only mean
   new code — a library, a parser, a feature — never a paragraph. Comments
   are not free, which is why BUDGETS above still bounds the total; they
   were just never what this file was built to catch. A long explanation
   cannot make a page slow. A dependency can, silently, in a commit that
   looks like a two-line diff, and under one combined number the two were
   indistinguishable.

   Set the same way the ceilings above are: current measured code weight,
   rounded up to the next whole KB. Room for the next commit, not a target
   to grow into. */
const CODE_BUDGETS = {
  'index.html':              9 * 1024,
  'privacy.html':            10 * 1024,
  'accessibility.html':      10 * 1024,
  'post-call-landing.html':  5 * 1024,
  'product-landing.html':    6 * 1024,
  'pre-call.html':           28 * 1024,
  /* Raised from 84KB on 19-08, deliberately and for eight lines: the fourth
     provenance reading, `unknown`, and the branch that renders it. What it
     buys is that a transcript labelled the way every real one is — Zoom and
     Teams head a turn with the speaker's name, not their role — stops coming
     back "no figure in the call was said by the client" about a client who
     said one out loud. A wrong answer costs more than a kilobyte. */
  'post-call.html':          85 * 1024
};

console.log('\nper-page code weight, comments stripped and the result reparsed');
for (const [page, budget] of Object.entries(CODE_BUDGETS)) {
  test(page + ' code stays under ' + kb(budget) + 'KB over the wire', () => {
    const w = measured[page] || pageWeight(page);
    assert.ok(w.code <= budget,
      page + ' is ' + kb(w.code) + 'KB of code compressed — prose is a separate ' +
      kb(w.prose) + 'KB of the ' + kb(w.overWire) + 'KB total — over the ' + kb(budget) +
      'KB code budget. Raise it deliberately or trim the code, not the comments.');
  });
}

/* Raw weight is not budgeted, and it is still worth seeing: it is what a
   person reading this repository has to wade through, which is a real
   cost even though it is not the visitor's. */
test('the raw-to-wire ratio is reported, not assumed', () => {
  Object.entries(BUDGETS).forEach(([page]) => {
    const w = measured[page] || pageWeight(page);
    console.log('       ' + page.padEnd(17) + kb(w.overWire).toString().padStart(6) + 'KB wire   ' +
      kb(w.total).toString().padStart(6) + 'KB raw   ' +
      Math.round(w.overWire / w.total * 100) + '%   (code ' + kb(w.code) + 'KB, prose ' +
      kb(w.prose) + 'KB)');
  });
});

console.log('\nno dependency arrived without anyone noticing');
test('the shipped pages load nothing from another origin', () => {
  for (const page of Object.keys(BUDGETS)) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    const external = [...html.matchAll(/(?:src|href)="(https?:)?\/\/[^"]+"/g)]
      .map(m => m[0])
      .filter(s => !/rel="noopener"/.test(s));   // ordinary outbound links are fine
    const risky = external.filter(s => /^(src|href)="(https?:)?\/\//.test(s) &&
      /\.(js|css|woff2?|ttf)/.test(s));
    assert.deepStrictEqual(risky, [],
      page + ' fetches a subresource from another origin — the CSP forbids it at ' +
      'runtime, so this would be a silently broken page, not a slow one');
  }
});

test('no node_modules crept into what gets served', () => {
  assert.ok(!fs.existsSync(path.join(root, 'node_modules')),
    'a node_modules directory in the repo root would be deployed as-is — ' +
    'there is no build step to leave it behind');
});

console.log('\nthe whole product, for the record');
test('every shipped byte is accounted for and reported', () => {
  const seen = new Set();
  let total = 0;
  for (const page of Object.keys(BUDGETS)) {
    const w = pageWeight(page);
    if (!seen.has(page)) { seen.add(page); total += size(page); }
    w.assets.forEach(a => { if (!seen.has(a)) { seen.add(a); total += size(a); } });
  }
  console.log('       ' + seen.size + ' files, ' + kb(total) + 'KB uncompressed, ' +
    'zero third-party bytes');
  assert.ok(total > 0);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
