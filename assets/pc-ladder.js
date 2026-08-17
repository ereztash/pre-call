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

   Four rungs, ordered by how much they need from the client. Descend until
   one holds:

     1  value      a quantity of work, recurring over time, from the client
     2  comparable a similar job you have already closed
     3  market     a readable complexity
     4  cost       your own hours and rate

   Rung 4 always holds. That is the point of it — there is no bottom, so the
   ladder cannot fail to produce a price, and a call it does not understand
   gets an honest cheap answer instead of a confident wrong one.

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
    market:     [],
    cost:       []
  };

  /* A recurring quantity of work is what the value method is built on —
     compute() turns freq × freqUnit into runs and everything else follows. No
     frequency, no annual value, and therefore no rung 1. This is a stricter
     test than "a number appeared": a fee, a headcount and a year are all
     numbers, and none of them is a rate of work. */
  const FREQ = /(\d+)\s*(?:פעמים|הזמנות|לידים|פניות|בקשות|חשבוניות|טפסים|\btimes?\b|\borders?\b|\bleads?\b|\brequests?\b|\binvoices?\b)/i;
  const PER_TIME = /ביום|ליום|בשבוע|לשבוע|בחודש|לחודש|\bper\s+(?:day|week|month)\b|\ba\s+(?:day|week|month)\b/i;

  const RUNGS = [
    {
      id: 'value',
      method: 'value',
      label: tr('ערך אצל הלקוח'),
      vertical: true,
      /* Both halves, because either alone is common and neither alone is a
         process. "40 orders" with no period is a backlog; "every week" with no
         count is a habit. */
      holds: input => FREQ.test(input.text || '') && PER_TIME.test(input.text || ''),
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

  /* input: { text, systems, comparableLast }
     Everything optional. A caller with nothing gets rung 4 and a reason. */
  function assess(input) {
    const it = input || {};
    const tried = [];
    for (const rung of RUNGS) {
      if (rung.holds(it)) {
        return {
          rung: rung.id,
          method: rung.method,
          label: rung.label,
          vertical: rung.vertical,
          because: rung.because,
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
             because: null, skipped: tried, licence: [] };
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
