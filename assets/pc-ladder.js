/* ============================================================
   POST-CALL · which evidence this call can actually carry
   Pure: no DOM, no storage, no network.

   The tool used to read every cue at once and then choose a pricing method
   from whatever came back. That order is backwards, and it produced a specific
   failure on the first real transcript anybody ran through it: a consulting
   call with no process in it, where "300 שקל לפגישה" — the fee being agreed —
   was read as the cost of an incident, because the cue for incident cost is
   "a number next to a currency word" and that is all it is. Nothing flagged
   it. The engine would have computed a year of value from the seller's own
   price.

   So the order inverts. First decide what kind of evidence this call can
   carry, then read only the cues that kind of evidence licenses. A number
   cannot be misread as an incident cost on a call that never established a
   recurring process, because on that call nobody looks for one.

   Five rungs, ordered by how much they need from the client. Descend until
   one holds:

     1  value      a quantity of work, recurring over time, from the client
     2  comparable a similar job you have already closed
     3  anchor     a reference price the client named
     4  market     a readable complexity
     5  cost       your own hours and rate

   The bottom rung always holds. That is the point of it — there is no floor
   under it, so the ladder cannot fail to produce a price, and a call it does
   not understand gets an honest cheap answer instead of a confident wrong one.

   Rung 3 arrived from two real calls that were nothing like the automation
   work the first four rungs were written for. Positioning and branding: no
   process, no systems, no ledger history, and both landing on the bottom rung
   with the identical answer, which is a ladder that has stopped
   discriminating. What those calls did carry was a price the client named as
   their own reference — and that is a rung, because it is the client saying
   what this class of work is worth to them.

   Separately, and not a rung: both of those calls contained the buyer saying
   there was no money or no reason to start, and the tool priced them anyway.
   `stalled` carries that sentence back verbatim. It does not change the
   method. It changes what the operator is looking at when they read the
   number.

   What the ladder does NOT do is pick the price. Once the rung is known the
   engine still computes every method it has data for and says which yields
   most — that comparison is one of the more honest things in this product and
   a cascade that stopped at the first hit would delete it. The rung decides
   what may be read, not what the number is.
   ============================================================ */
(function (root) {
  'use strict';

  var tr = (typeof PC !== 'undefined' && PC.i18n) ? PC.i18n.tr
    : function (s, p) { if (p) for (var k in p) s = s.split('{' + k + '}').join(p[k]); return s; };

  /* Which cue keys each rung is allowed to read out of a transcript. The
     licence is the whole mechanism: below rung 1 the quantitative cues are not
     merely unused, they are not looked for. */
  const LICENCE = {
    value:      ['freq', 'minutes', 'errCost'],
    comparable: [],
    /* The one rung below value that licenses a cue, and it licenses exactly
       one: the rate the client named. Without it the rung names `comparable`
       and the engine cannot price comparable, because the number stays in a
       quote and never reaches the field. Measured across 200 runs: that gap
       was 12% of every call the ladder assessed. */
    anchor:     ['anchor'],
    market:     [],
    cost:       []
  };

  /* A recurring quantity of work is what the value method is built on —
     compute() turns freq × freqUnit into runs and everything else follows. No
     frequency, no annual value, and therefore no rung 1.

     This used to be two independent tests, a quantity somewhere and a period
     somewhere, and that is not a test of anything on a real transcript. Run
     against five actual discovery calls of 24 to 42 thousand characters, it
     held on four of them — every one of which had no process in it at all. A
     thirty-thousand-character document contains a number beside a noun and it
     contains the word "בחודש", and neither fact says they have anything to do
     with each other. What the two that extracted something matched was the
     seller talking: "אנחנו מדברים 20 דקות" — the length of the call — and
     "60 בשבוע 240 בחודש" — the seller's own arithmetic about the client's
     working hours, on a call about search engine optimisation.

     It only ever looked safe because real transcripts had no digits in them,
     and pc-numerals.js removed that accident. So the rung now asks the same
     question the cue answers, with the same expression: a quantity and a
     period, adjacent, in one line. One regex, in pc-transcript.js with the
     other cues, because a rung that holds while nothing fills the fields it
     licensed is worse than a rung that never holds. */
  const FREQ = () => root.PC.transcript.FREQ_RE();

  /* A price the client names as their own reference — "like a session with a
     psychologist, 300 a session". On the soft calls this is the only priced
     thing anybody says out loud, and the four rungs above could not read it:
     there is no process to value, no closed job in your ledger, and no systems
     to place in a range.

     Three parts, all required, and the third is what keeps this from being the
     old bug wearing a new name. A number beside a currency word is what read
     the fee in the room as the cost of an incident. A number beside a currency
     word *per unit of engagement* — a session, an hour, a month — is a rate,
     and a rate is the one shape a stray figure in a discovery call does not
     accidentally take.

     One definition, and it lives in pc-transcript.js with the other cues. The
     rung's admission test and the cue that fills the field have to be the same
     expression — two copies would drift, and the copy that drifted would be the
     one deciding whether a rung rests on a number the form never received.
     Resolved at call time rather than at load: pc-transcript.js loads first in
     the page, and in Node whichever file is required first still has the other
     in place by the time assess() runs. */
  const RATE = () => root.PC.transcript.ANCHOR_RE;

  /* The buyer said there is no money, or no reason to start. Both soft calls
     behind this file end that way and the tool priced them anyway, which is
     the most expensive kind of quiet: a confident number for a deal that the
     other person already declined, in the room, out loud.

     This is not a rung. It does not change which method wins — you may still
     want the figure for your own records — it changes what the screen says
     above it. Kept deliberately narrow: a stated absence of budget or reason,
     not a hesitation, not "I need to think", not a soft postponement. Those
     are ordinary and reading them as refusal would make the warning noise. */
  const STALL = /אין לי\s+(?:אף\s+)?(?:כסף|תקציב|אינסנטיב|תמריץ|סיבה)|\bno\s+budget\b|can'?t\s+afford/i;

  /* Spoken numbers as digits, for matching only — never for a quote. Resolved
     at call time so this module still loads where pc-numerals.js is absent,
     with the reading it had before rather than a crash. */
  function numeric(s) {
    const N = root.PC && root.PC.numerals;
    return N ? N.digitize(s) : s;
  }

  /* Who the ladder is allowed to listen to.

     Every cue here is about what the CLIENT's business looks like, and a
     discovery call is half the seller talking about their own. The seller
     describing their own posting cadence, their own rate, their own last
     project — each of those trips a cue that was written for the other side of
     the table.

     So when the transcript carries speaker labels the ladder reads the client
     lines and nothing else. When it does not — and neither of the real
     transcripts this was built from carries a single one — it reads
     everything, reports `labelled: false`, and the operator gets told rather
     than quietly handed a rung that may rest on their own sentence. */
  function heard(it) {
    const lines = it.lines;
    const all = String(it.text || '');
    if (!Array.isArray(lines) || !lines.length) return { text: all, labelled: false };
    if (!lines.some(l => l && l.speaker && l.speaker !== 'unknown')) return { text: all, labelled: false };
    return { text: lines.filter(l => l.speaker === 'client').map(l => l.line).join('\n'), labelled: true };
  }

  /* The sentence, verbatim, or null. The ladder hands over the quote and never
     the number parsed out of it — same rule the extraction rows follow, and
     for the same reason: a figure you cannot trace is what this tool exists to
     keep out of a price. */
  function firstMatch(text, re) {
    /* The line is found on the digitized reading and returned as it was said.
       A quote is what somebody said; rewriting "שלוש מאות" to 300 inside it
       would be a normalisation the operator never authorised, on the one panel
       whose whole job is to show the sentence a number came from. */
    const line = String(text || '').split(/\n|(?<=[.!?])\s+/)
      .map(l => l.trim()).find(l => re.test(numeric(l)));
    if (!line) return null;
    if (!re.test(line)) {
      /* The digits are not in the original, so there is no match offset to
         window around. Find where the quantity is spoken instead. */
      if (line.length <= 200) return line;
      const at = line.search(/\d|[֐-׿]{2,}\s*(?:שקל|מאות|אלפים|דקות|פעמים)/);
      const from = Math.max(0, at - 70);
      return (from > 0 ? '…' : '') + line.slice(from, from + 180).trim() + '…';
    }
    if (line.length <= 200) return line;
    /* Speech-to-text returns paragraph-long "sentences" with no punctuation in
       them — the line this cue matched in the call it was written from is 570
       characters, and a 570-character quote is not a quote anybody reads. So
       it is windowed around the match: the middle stays verbatim and stays
       searchable in the transcript, and the ellipses say plainly that the rest
       was cut rather than that the client said only this. */
    const m = line.match(re), at = line.indexOf(m[0]);
    let from = Math.max(0, at - 70), to = Math.min(line.length, at + m[0].length + 70);
    while (from > 0 && !/\s/.test(line[from])) from--;
    while (to < line.length && !/\s/.test(line[to])) to++;
    return (from > 0 ? '…' : '') + line.slice(from, to).trim() + (to < line.length ? '…' : '');
  }

  const RUNGS = [
    {
      id: 'value',
      method: 'value',
      label: tr('ערך אצל הלקוח'),
      vertical: true,
      /* Both halves, because either alone is common and neither alone is a
         process. "40 orders" with no period is a backlog; "every week" with no
         count is a habit. */
      holds: input => FREQ().test(numeric(heard(input).text)),
      because: tr('הלקוח נקב בכמות עבודה שחוזרת על עצמה, ולכן אפשר לגזור מה התהליך עולה לו בשנה.'),
      missing: tr('לא נמצאה בשיחה כמות עבודה שחוזרת על עצמה — כמה פעמים ביום, בשבוע או בחודש. בלי זה אין ערך שנתי לגזור ממנו.')
    },
    {
      id: 'comparable',
      method: 'comparable',
      label: tr('עסקה דומה שלכם'),
      vertical: false,
      /* Needs nothing from the client at all — it is your own history. That is
         why it sits above market: a job you actually did and got paid for is
         better evidence than a published range. */
      holds: input => +(input.comparableLast || 0) > 0,
      because: tr('יש בפנקס שלכם עבודה דומה שנסגרה, והמחיר נגזר ממנה מותאם להיקף כאן.'),
      missing: tr('אין בפנקס עסקה דומה שנסגרה, ולכן אין ממה לגזור.')
    },
    {
      id: 'anchor',
      /* The engine has no fifth method and does not need one: a single
         reference price is priced the same way a closed job of yours is, by
         adjusting it to the scope here. What differs is where the number came
         from, and that difference is the whole reason this is its own rung
         rather than a second way into the one above — your ledger is evidence
         that a price cleared, the client's reference is evidence of what they
         expect to pay. The operator should never be unable to tell which one
         is under their number. */
      method: 'comparable',
      label: tr('מחיר ייחוס של הלקוח'),
      vertical: false,
      holds: input => RATE().test(numeric(heard(input).text)),
      because: tr('הלקוח נקב במחיר ייחוס משלו לעבודה דומה בעיניו, והמחיר נגזר ממנו מותאם להיקף כאן.'),
      missing: tr('הלקוח לא נקב במחיר ייחוס — כמה עבודה דומה בעיניו עולה, לפגישה, לשעה או לחודש.')
    },
    {
      id: 'market',
      method: 'market',
      label: tr('טווח מקובל'),
      vertical: true,
      /* Vertical-bound despite looking generic: MARKET_TIERS is keyed on how
         many systems connect and its ranges are automation-project ranges.
         Reading complexity for a different kind of work needs a different
         metric and different numbers, not a translation of these. */
      holds: input => (input.systems || []).length > 0,
      because: tr('אפשר לקרוא את המורכבות מהשיחה, והמחיר נגזר מהטווח המקובל לעבודה כזאת.'),
      missing: tr('לא נקראה מהשיחה מורכבות שאפשר למקם בטווח מקובל.')
    },
    {
      id: 'cost',
      method: 'cost',
      label: tr('העבודה הצפויה'),
      vertical: false,
      /* The floor, and it is deliberate that it cannot fail. A call the tool
         does not understand still gets a price — an honest cheap one, from the
         work you expect to do, rather than a confident wrong one from a number
         it misread. */
      holds: () => true,
      because: tr('המחיר נגזר מהעבודה שאתם צפויים להשקיע ומהתעריף שלכם, בלי להישען על מספר של הלקוח.'),
      missing: null
    }
  ];

  /* input: { text, lines, systems, comparableLast }
     Everything optional. A caller with nothing gets the bottom rung and a
     reason. `lines` is the output of PC.transcript.withSpeakers() — pass it
     and the ladder listens to the client only; omit it and it listens to the
     whole room and says so. */
  function assess(input) {
    const it = input || {};
    const h = heard(it);
    /* Independent of the rung, and reported even when the rung is the top one:
       a call can carry perfectly good evidence and still have ended in a no. */
    const stalled = firstMatch(h.text, STALL);
    const tried = [];
    for (const rung of RUNGS) {
      if (rung.holds(it)) {
        return {
          rung: rung.id,
          method: rung.method,
          label: rung.label,
          vertical: rung.vertical,
          because: rung.because,
          /* The sentence the rung rests on, when it rests on one it read out of
             the call rather than out of your ledger. */
          quote: rung.id === 'anchor' ? firstMatch(h.text, RATE()) : null,
          stalled: stalled,
          labelled: h.labelled,
          /* Everything above it that did not hold, with the reason. This is
             what the operator reads when they want to know why the price is
             not resting on something stronger — and it is the list of what to
             go back and ask about. */
          skipped: tried,
          licence: LICENCE[rung.id] || []
        };
      }
      tried.push({ rung: rung.id, label: rung.label, missing: rung.missing });
    }
    /* Unreachable while rung 4 holds unconditionally, and returned rather than
       thrown so that a future edit to that condition degrades instead of
       taking the page down. */
    return { rung: null, method: 'cost', label: null, vertical: false,
             because: null, quote: null, stalled: stalled, labelled: h.labelled,
             skipped: tried, licence: [] };
  }

  /* Whether a cue may be read at all under a given licence. The default when
     no ladder has run is permissive, so existing callers keep working — the
     ladder narrows, it does not become a second gate nobody asked for. */
  function licences(licence, key) {
    return !licence || licence.indexOf(key) !== -1;
  }

  root.PC = root.PC || {};
  root.PC.ladder = { RUNGS, LICENCE, assess, licences };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.PC.ladder;
})(typeof window !== 'undefined' ? window : globalThis);
