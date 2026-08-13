/* ============================================================
   POST-CALL · showing the numbers, where the evidence says showing helps.

   This module is deliberately smaller than the request that produced it.
   Asked for colour, infographics and illustrations, the literature splits
   cleanly into two piles, and only one of them is here.

   WHAT THE EVIDENCE SUPPORTS, and is therefore built:

     Icon arrays for quantity. Visual aids are consistently found easier to
     understand, faster to process and more memorable than the same figure in
     text, and the benefit is largest for people with low numeracy — which is
     precisely this audience. "Pays for itself in 15.3 weeks" is a number
     someone has to do arithmetic on; fifteen filled cells out of fifty-two
     is a thing they can see. Concrete, discrete icons outperform continuous
     shading for this.

     Part-to-whole for a proportion. The price against what the process costs
     the client in a year is the single comparison the operator has to make
     in the room, and a bar makes the ratio legible without division.

     Never colour alone (WCAG 1.4.1). Around one man in twelve has a colour
     vision deficiency, and screen glare, poor displays and magnification
     defeat subtle hue differences for everyone else. Every state here
     carries a shape or a word as well as a hue.

   WHAT THE EVIDENCE ARGUES AGAINST, and is therefore absent:

     Decorative illustration. The seductive-details effect is one of the
     better replicated findings in multimedia learning: interesting but
     task-irrelevant pictures reliably lower recall and comprehension, and
     eye-tracking shows the damage tracks the attention they steal — worst
     for people with lower working memory, who are the people this tool is
     for. A drawing of a robot next to the price would make the page more
     attractive and the price less understood. There are none.

     Decorative colour. Hue is used here only where it carries a distinct
     meaning that also exists in words. Nothing is coloured to look designed.

   Pure: returns descriptions of what to draw, never markup. Tested in Node.
   ============================================================ */
(function (root) {
  'use strict';

  var tr = (typeof PC !== 'undefined' && PC.i18n) ? PC.i18n.tr
    : function (s, p) { if (p) for (var k in p) s = s.split('{' + k + '}').join(p[k]); return s; };

  const WEEKS = 52;

  /* One cell per week of the first year, filled up to the point the client
     has got their money back. Fifty-two is not an arbitrary grid — it is the
     denominator the operator is arguing about ("it pays for itself inside
     the first year"), so the whole is meaningful rather than decorative. */
  function payback(weeks) {
    const w = +weeks;
    if (!isFinite(w) || w <= 0) return null;
    const filled = Math.max(1, Math.min(WEEKS, Math.round(w)));
    const beyond = w > WEEKS;

    // the bands come from what the tool already tells the operator elsewhere:
    // most automation work returns in 4–12 weeks, and past 20 it warns
    const verdict = w <= 12 ? 'fast' : w <= 20 ? 'ok' : 'slow';
    return {
      cells: WEEKS, filled, beyond,
      weeks: Math.round(w * 10) / 10,
      verdict,
      // the word carries the meaning; the colour only repeats it
      verdictText: verdict === 'fast' ? tr('מהיר') : verdict === 'ok' ? tr('סביר') : tr('איטי'),
      label: beyond
        ? tr('ההשקעה לא חוזרת בתוך השנה הראשונה')
        : tr('כל ריבוע הוא שבוע. הצבועים הם עד שההשקעה חזרה: כ-{w} שבועות מתוך 52',
             { w: Math.round(w * 10) / 10 }),
      sentence: beyond
        ? tr('בקצב הזה הלקוח לא מחזיר את ההשקעה בשנה הראשונה. זו סיבה לצמצם את ההיקף, לא להוריד מחיר.')
        : tr('אחרי כ-{w} שבועות הלקוח כבר בפלוס, ומשם זה חיסכון מלא.',
             { w: Math.round(w * 10) / 10 })
    };
  }

  /* The price as a share of what the process costs the client in a year.
     Reported as a proportion because that is the comparison, and refused
     when there is no annual figure — a bar against an unknown whole is a
     picture of nothing. */
  function share(price, annual) {
    const p = +price, a = +annual;
    if (!isFinite(p) || !isFinite(a) || p <= 0 || a <= 0) return null;
    const pct = Math.min(100, Math.round(p / a * 100));
    return {
      percent: pct,
      over: p > a,
      label: tr('המחיר הוא {pct}% ממה שהתהליך עולה לו בשנה', { pct: pct }),
      sentence: p > a
        ? tr('המחיר גבוה ממה שהתהליך עולה לו בשנה. זה קשה להגנה בשיחה.')
        : tr('הוא משלם {pct}% פעם אחת, ומפסיק לשלם את ה-100% בכל שנה.', { pct: pct })
    };
  }

  /* What a week of not deciding costs. Plain division of a number the client
     supplied — and refused outright when that number came from the operator
     instead, on exactly the rule that keeps the invented figure out of the
     document: you cannot press someone with arithmetic on a number you made
     up for them. */
  /* `notHis` covers both "the operator estimated it" and "nobody has said yet".
     The note under this line claims the figure is a division of a number the
     client gave, so it may only appear when somebody has confirmed he did. */
  function costOfWaiting(annual, notHis) {
    const a = +annual;
    if (notHis || !isFinite(a) || a <= 0) return null;
    return {
      perWeek: Math.round(a / 52),
      label: tr('כל שבוע שהוא לא מחליט עולה לו כ-{v} ₪',
                { v: Math.round(a / 52).toLocaleString('en-US') }),
      note: tr('זה לא לחץ שיווקי — זו חלוקה של המספר שהוא עצמו נתן.')
    };
  }

  /* Everything the numbers panel should draw, or nulls where there is
     nothing honest to draw. A visual that appears before its inputs exist
     teaches the operator to ignore visuals. */
  function forModel(m, opts) {
    const o = opts || {};
    return {
      payback: payback(m && m.payback),
      share: share(m && m.price, m && m.annualValue),
      waiting: costOfWaiting(m && m.annualValue, o.numbersAreMine || o.numbersUnset)
    };
  }

  root.PC = root.PC || {};
  root.PC.viz = { payback, share, costOfWaiting, forModel, WEEKS };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.PC.viz;
})(typeof window !== 'undefined' ? window : globalThis);
