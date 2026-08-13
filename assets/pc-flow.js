/* ============================================================
   POST-CALL · where the price came from.

   The citations were being thrown away. The transcript step collected, for
   every number, the sentence it came from and who said it — and then the
   operator confirmed, the form filled, and all of that evidence evaporated.
   What remained on screen was a price, which is exactly the shape of thing
   this tool exists to argue against.

   So the chain is kept and shown. Not a diagram of how the software is
   built — the operator does not care — but the arithmetic that turns four
   answers into a number they are about to send, each step in the same
   language as the room:

     what he said  →  a figure  →  a year  →  what it costs him  →  your price

   Two rules, and both matter more than the picture:

     1. The formulas here are read off the model's own output, never
        recomputed. A flow view that does its own arithmetic will eventually
        show a chain that does not end at the price beside it, and then it is
        worse than nothing — an explanation that is confidently wrong.
     2. A step whose inputs are missing is absent, not shown as zero. Zero is
        a measurement; blank is the truth.

   Pure: takes the computed model and the citations, returns rows. Tested.
   ============================================================ */
(function (root) {
  'use strict';

  var tr = (typeof PC !== 'undefined' && PC.i18n) ? PC.i18n.tr
    : function (s, p) { if (p) for (var k in p) s = s.split('{' + k + '}').join(p[k]); return s; };

  const n0 = v => Math.round(v).toLocaleString('en-US');
  const UNIT_NAME = { '365': tr('ליום'), '52': tr('לשבוע'), '12': tr('לחודש') };

  /* The steps, in the order the money actually accumulates. `from` names the
     transcript fields that fed each one, so a row can show the sentences
     behind it without the flow module knowing anything about transcripts. */
  function build(m, inputs, cites) {
    if (!m) return [];
    const i = inputs || {};
    /* Two fields can cite the same sentence — the volume and its unit both
       come out of "about forty a day" — and printing it twice under one step
       reads as two pieces of evidence where there is one. */
    const quotes = (...keys) => {
      const seen = new Set(), out = [];
      keys.forEach(k => (cites || []).filter(c => c.key === k).forEach(c => {
        if (seen.has(c.quote)) return;
        seen.add(c.quote); out.push(c);
      }));
      return out;
    };
    const rows = [];

    if (m.runs > 0) rows.push({
      id: 'runs', title: tr('כמה פעמים בשנה'),
      formula: n0(i.freq) + ' ' + (UNIT_NAME[String(i.freqUnit)] || '') + ' × ' +
               n0(i.freqUnit) + ' = ' + n0(m.runs),
      out: tr('{n} פעמים בשנה', { n: n0(m.runs) }),
      from: ['freq', 'freqUnit'], said: quotes('freq', 'freqUnit')
    });

    if (m.hours > 0) rows.push({
      id: 'hours', title: tr('כמה שעות עבודה זה'),
      formula: tr('{runs} × {mins} דקות ÷ 60 = {hours}',
                  { runs: n0(m.runs), mins: n0(m.mins), hours: n0(m.hours) }),
      out: tr('{n} שעות בשנה', { n: n0(m.hours) }),
      from: ['minutes'], said: quotes('minutes')
    });

    if (m.timeValue > 0) rows.push({
      id: 'time', title: tr('כמה הזמן הזה עולה לו'),
      formula: tr('{hours} שעות × ₪{rate} לשעה × {pct}% שבאמת ייחסך = ₪{value}',
                  { hours: n0(m.hours), rate: n0(m.rate),
                    pct: Math.round((m.capture || 0) * 100), value: n0(m.timeValue) }),
      out: tr('₪{v} בשנה', { v: n0(m.timeValue) }),
      note: tr('לא כל שעה שנחסכת הופכת לכסף, ולכן היא מוכפלת בחלק שבאמת מתפנה.'),
      from: [], said: []
    });

    if (m.errValue > 0) rows.push({
      id: 'err', title: tr('כמה התקלות עולות לו'),
      formula: tr('{n} תקלות בחודש × ₪{cost} × 12 חודשים = ₪{total}',
                  { n: n0(m.errValue / 12 / (i.errCost || 1)),
                    cost: n0(i.errCost), total: n0(m.errValue) }),
      out: tr('₪{v} בשנה', { v: n0(m.errValue) }),
      from: ['errFreq', 'errCost'], said: quotes('errFreq', 'errCost')
    });

    if (m.annualValue > 0) rows.push({
      id: 'annual', title: tr('סך הכול, מה התהליך עולה לו בשנה'),
      formula: tr('₪{time} זמן + ₪{err} תקלות = ₪{total}',
                  { time: n0(m.timeValue), err: n0(m.errValue), total: n0(m.annualValue) }),
      out: tr('₪{v} בשנה', { v: n0(m.annualValue) }),
      emphasis: true, from: [], said: []
    });

    /* The model returns an effort and a price for a completely empty form —
       the base estimate plus the default rate produce a floor out of nothing.
       The screen hides that behind a dash; this view reported it faithfully
       as "0 תוכנות → אומדן 7 שעות", which is how the flow found it. A step
       with no inputs is absent here too. */
    if (m.effort > 0 && (i.systemCount || 0) > 0) rows.push({
      id: 'effort', title: tr('כמה עבודה זה מצידך'),
      formula: tr('{n} תוכנות → אומדן {effort} שעות',
                  { n: i.systemCount || 0, effort: m.effort }),
      out: tr('{effort} שעות עבודה', { effort: m.effort }),
      note: tr('זה מה שקובע את הרצפה: מתחת ל-₪{floor} אין שום שיטה שתתמחר.',
               { floor: n0(m.costFloor) }),
      from: ['systems'], said: quotes('systems')
    });

    if (m.price > 0 && (m.annualValue > 0 || (i.systemCount || 0) > 0)) {
      const chosen = m.chosen;
      rows.push({
        id: 'price', title: tr('המחיר'),
        formula: chosen ? chosen.label + ' · ' + chosen.basis : tr('לפי העלות'),
        out: '₪' + n0(m.price),
        /* The method's own basis already prints the defensible band, and
           m.high is a different thing — the ceiling past which the client
           does not clear the investment in year one. Labelling both "the
           defensible range" put two different upper bounds side by side and
           read as the panel contradicting itself. */
        note: chosen && chosen.raised
          ? tr('השיטה עצמה נתנה ₪{raw}, והמחיר הועלה לרצפת העלות.', { raw: n0(chosen.raw) })
          : (m.high > 0
              ? tr('מעל ₪{high} הלקוח כבר לא מחזיר את ההשקעה בשנה הראשונה, וזה קשה להגנה בשיחה.',
                   { high: n0(m.high) })
              : ''),
        emphasis: true, from: [], said: []
      });
    }

    return rows;
  }

  /* One sentence for the top of the panel, in the operator's own terms.

     It takes the rows rather than recomputing from the model, so the summary
     and the chain beneath it cannot disagree — the first version could say
     "the price is built from the scope" above a panel showing no scope at
     all, because the model reports a price for an empty form and the rows
     correctly refused to. */
  function headline(m, rows) {
    if (!m || !rows || !rows.length) return null;
    if (!m.annualValue) return tr('המחיר נבנה מהיקף העבודה, כי עוד אין מספרים מהלקוח.');
    return tr('ארבע תשובות מהשיחה הפכו ל-₪{annual} שהתהליך עולה לו בשנה, ומתוכם נגזר מחיר של ₪{price}.',
              { annual: n0(m.annualValue), price: n0(m.price) });
  }

  /* How much of the whole rests on a single answer. The tool already warns
     when the error estimate dominates; here it is placed on the chain, at
     the step it actually enters, so the operator sees which link to check. */
  function weakest(m) {
    if (!m || !m.annualValue) return null;
    if (m.errShare > 0.55) return { id: 'err', share: Math.round(m.errShare * 100) };
    const timeShare = m.timeValue / m.annualValue;
    if (timeShare > 0.9) return { id: 'hours', share: Math.round(timeShare * 100) };
    return null;
  }

  /* Three sanity checks, read off state the tool already computes for the
     chain and the verdict box — nothing here is a new judgment about the
     price, only a faster way to see the ones that already exist.

     The chain answers "how was this built"; this answers "is it safe to say
     out loud", and it is meant to be readable in the second before the
     operator opens their mouth, not after they have read seven rows. A
     glance-first pass/fail row next to the price, rather than a paragraph
     the operator has to read to find out whether they should be worried, is
     the one idea worth taking from how the leaner competitors handle a
     price they also cannot fully vouch for — none of them keep the caveat
     in prose either.

     Deliberately absent until there is a real annual value: with no client
     numbers yet, every check below would trivially read "fine" — payback is
     zero, nothing is thin, nothing dominates — and a row of green checks
     over a price built on nothing but the operator's own guess is worse
     than no row at all. */
  function guardrails(m) {
    if (!m || !m.annualValue) return [];
    const weak = weakest(m);
    const paysBack = m.payback > 0 && m.payback <= 20;
    return [
      { id: 'band', ok: !m.tooThin,
        label: m.tooThin ? tr('מעל הטווח שניתן להגנה') : tr('בטווח שניתן להגנה') },
      { id: 'payback', ok: paysBack,
        label: paysBack ? tr('מחזיר את עצמו בזמן סביר') : tr('ההחזר איטי') },
      { id: 'balance', ok: !weak,
        label: weak ? tr('תלוי במספר בודד ({share}%)', { share: weak.share })
                    : tr('לא תלוי במספר בודד') }
    ];
  }

  root.PC = root.PC || {};
  root.PC.flow = { build, headline, weakest, guardrails };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.PC.flow;
})(typeof window !== 'undefined' ? window : globalThis);
