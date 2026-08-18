/* POST-CALL · the conductor.
   Pure: takes a state object, returns what to say. No DOM, tested in Node.
   Why it works this way: docs/modules/pc-guide.md */
(function (root) {
  'use strict';

  var tr = (typeof PC !== 'undefined' && PC.i18n) ? PC.i18n.tr
    : function (s, p) { if (p) for (var k in p) s = s.split('{' + k + '}').join(p[k]); return s; };

  /* Ordered. Each step knows what counts as done, where it lives on the
     page, and — the part that matters for someone who has never priced a
     job — why it is worth answering at all. `why` is written as what it buys
     the user, never as what the tool needs. */
  const STEPS = [
    {
      id: 'process',
      short: tr('התהליך'),
      title: tr('מה קורה אצלו היום'),
      ask: tr('במילים פשוטות: מה נכנס, מי מקליד, לאן זה הולך.'),
      why: tr('זה מה שהופך להיות "מה נכלל" בהצעה. בלי זה ההצעה מדברת כללית והלקוח לא מזהה את עצמו בה.'),
      cta: tr('למלא את התהליך'),
      anchor: 'q_process',
      fields: ['q_process'],
      done: s => !!(s.process || '').trim()
    },
    {
      id: 'volume',
      short: tr('כמה וכמה זמן'),
      title: tr('כמה פעמים ביום זה קורה, וכמה זמן זה לוקח'),
      ask: tr('שני מספרים. אם הוא אמר "המון" — שווה לשאול כמה בערך ביום.'),
      why: tr('שני המספרים האלה הם כל המחיר. בלעדיהם אין על מה להישען כשהוא יגיד "זה יקר לי".'),
      cta: tr('למלא את המספרים'),
      anchor: 'q_freq',
      fields: ['q_freq', 'q_minutes'],
      done: s => s.freq > 0 && s.minutes > 0
    },
    {
      id: 'systems',
      short: tr('תוכנות'),
      title: tr('באילו תוכנות זה נוגע'),
      ask: tr('וואטסאפ, אקסל, מערכת חשבוניות — לסמן כל מה שעלה בשיחה.'),
      why: tr('ככל שיש יותר תוכנות, העבודה ארוכה יותר והמחיר עולה בהתאם. זה מה שקובע כמה זמן זה ייקח.'),
      cta: tr('לסמן תוכנות'),
      anchor: 'sysChips',
      done: s => (s.systems || []).length > 0
    },
    {
      id: 'breaks',
      short: tr('תקלות'),
      title: tr('מה קורה כשמשהו נופל'),
      ask: tr('כמה פעמים בחודש משהו נופל, וכמה זה עולה להם בכל פעם.'),
      why: tr('זה בדרך כלל גדול יותר מחיסכון הזמן, וזה מה שמצדיק את המחיר בעיניו. בלי זה ההצעה יוצאת זולה בלי סיבה.'),
      cta: tr('פתח ומלא'),
      anchor: 'q_err_freq',
      fields: ['q_err_freq', 'q_err_cost'],
      done: s => s.errFreq > 0 && s.errCost > 0,
      optional: true
    },
    {
      id: 'scope',
      short: tr('מה כלול'),
      title: tr('מה נכלל בעבודה ומה לא'),
      ask: tr('כל שורה כבר מסומנת בהמלצה. לשנות רק מה שלא מתאים, ואז לאשר.'),
      why: tr('זה החלק שחוסך את הוויכוחים אחר כך. מה שלא כתוב שהוא בחוץ — הלקוח יניח שהוא בפנים.'),
      cta: tr('לעבור על הרשימה'),
      anchor: 'scopeBox',
      done: s => !!s.scopeConfirmed
    },
    {
      id: 'client',
      short: tr('הלקוח'),
      title: tr('שם הלקוח ומי מאשר'),
      ask: tr('השם נכנס לכותרת ההצעה. מי שמאשר קובע כמה זמן היא בתוקף.'),
      why: tr('הצעה בלי שם נראית כמו תבנית ששלחו לעוד עשרה. ומי שמאשר קובע אם שבועיים בתוקף מספיקים.'),
      cta: tr('למלא פרטי לקוח'),
      anchor: 'q_client',
      fields: ['q_client', 'q_decider'],
      done: s => !!(s.client || '').trim()
    },
    {
      id: 'send',
      short: tr('שליחה'),
      title: tr('ההצעה מוכנה'),
      ask: tr('שווה לעבור עליה פעם אחת מלמעלה למטה. אחר כך אפשר לשלוח.'),
      why: '',
      cta: tr('שלח ללקוח'),
      anchor: 'sendBox',
      /* The last step is an action, not a destination. Pointing it at an
         element was measured landing on a hidden panel — the final
         instruction in the whole flow was a dead end. A step that names an
         `act` is dispatched through the app's own action table, which is
         also what puts it behind the same gate as every other export. */
      act: 'send',
      done: s => !!s.sent,
      terminal: true
    }
  ];

  /* How far above the operator's best-ever close counts as a stretch. Two,
     because doubling the largest number you have ever successfully charged is
     the point where "have I held this before" stops being rhetorical. */
  const STRETCH = 2;

  /* Numbers that cannot be true. Written as an observation with the
     arithmetic shown, never as "invalid input" — someone who does not know
     why 15 hours a day is impossible learns nothing from a red border. */
  function sanity(s) {
    const out = [];
    const runs = (+s.freq || 0) * (+s.freqUnit || 0);
    const hours = runs * (+s.minutes || 0) / 60;

    if (hours > 2000) {
      out.push({ id: 'toomuch', field: 'q_minutes',
        text: tr('לפי מה שהזנת, התהליך לוקח כ-{hours} שעות בשנה — יותר מעובד אחד במשרה מלאה. כנראה שאחד משני המספרים גבוה מדי. שווה לוודא: באמת {minutes} דקות בכל פעם?',
          { hours: Math.round(hours).toLocaleString('en-US'), minutes: +s.minutes }) });
    }
    if (hours > 0 && hours < 5) {
      out.push({ id: 'toolittle', field: 'q_freq',
        text: tr('לפי מה שהזנת, כל התהליך לוקח כ-{hours} שעות בשנה. זה מעט מדי מכדי שמישהו ישלם על אוטומציה שלו. אולי זה קורה יותר פעמים ממה שרשמת, או שכדאי לתמחר תהליך אחר.',
          { hours: Math.round(hours) }) });
    }
    if (+s.errCost > 0 && +s.errCost >= 20000) {
      out.push({ id: 'bigerr', field: 'q_err_cost',
        text: tr('רשמת {cost} ₪ לכל תקלה. זה מספר גדול, והמחיר כולו יישען עליו. לפני השליחה שווה לבקש ממנו דוגמה אחת ספציפית לתקלה כזאת.',
          { cost: Math.round(+s.errCost).toLocaleString('en-US') }) });
    }
    /* Not a method change and not an error — a click that is worth one line,
       because the alternative is a section quietly missing from the document
       with the reason two panels away. */
    if (s.numbersUnset && (+s.freq > 0 || +s.errCost > 0)) {
      out.push({ id: 'unset', field: 'q_provenance',
        text: tr('לא סומן מאיפה הגיע המספר השנתי, ולכן פסקת ההחזר לא נכנסת למסמך שנשלח. סימון אחד מחזיר אותה. אי-הסימון לא שינה את המחיר.') });
    }
    /* An anchor this operator has never held.

       The tool will put a number on screen that is many times anything they have
       actually closed, and two things can follow: they do not send it, or they
       send it and fold at the first push. An anchor you cannot defend is worse
       than a lower one you can.

       This is not "your price is too high" — nothing here lowers it, and the
       text is tested against reading that way. It is "you have never held a
       number like this", and it points at the question that decides whether a
       defence exists rather than at the price.

       Silent with no history, and that is the point rather than a gap: guidance
       in this product was arriving only for the operator who least needed it,
       because every threshold sensibly refuses to speak without evidence. With
       no closed deals there is no ceiling to compare against, and inventing one
       would be worse than saying nothing. Two closed deals is the floor — one is
       not a ceiling. */
    const best = +s.bestClosed || 0;
    if (+s.price > 0 && best > 0 && (+s.closedCount || 0) >= 2 && +s.price >= best * STRETCH) {
      /* "His" means the client sourced the annual figure — not the operator's own
         estimate, and not an unanswered question. Both of those leave the price
         standing on nothing the client said. */
      const defensible = !s.numbersAreMine && !s.numbersUnset;
      out.push({ id: 'stretch', field: 'q_provenance',
        text: tr('המחיר הזה גבוה פי {ratio} מהעסקה הגדולה ביותר שסגרת עד היום ({best} ₪).',
              { ratio: Math.round(+s.price / best * 10) / 10,
                best: Math.round(best).toLocaleString('en-US') }) + ' ' +
              (defensible
                ? tr('המספרים בהצעה הם שלו, ולכן יש לך תשובה כשהוא ידחוף — וכנראה שהוא ידחוף. שווה להחליט מראש מה לא תיתן.')
                : tr('לא סומן שהמספר השנתי בא ממנו, ולכן אין לך משפט אחד להגיד כשהוא ישאל "על מה זה מבוסס?". סימון אחד, או שאלה אחת אליו בשיחה הבאה.')) });
    }
    if (s.numbersAreMine && (+s.errCost > 0 || +s.freq > 0)) {
      out.push({ id: 'mine', field: 'q_provenance',
        text: tr('סומן שהמספרים הם הערכה שלכם ולא של הלקוח. זה בסדר גמור, אבל אז הם לא נכנסים למסמך כהצדקה — כי אם הוא ישאל "מאיפה זה?", אין תשובה. עדיף שאלה אחת אליו, ומספר משלו.') });
    }
    return out;
  }

  /* The whole point of the module. Returns exactly one instruction. */
  function next(state) {
    const s = state || {};
    const steps = STEPS.map(st => Object.assign({}, st, { complete: !!st.done(s) }));
    const required = steps.filter(st => !st.optional && !st.terminal);
    const doneCount = required.filter(st => st.complete).length;

    const ready = required.every(st => st.complete);

    /* Once nothing required is missing the instruction is to send, full stop.
       An earlier version offered the optional step here instead, which put a
       skippable question between the operator and the only outcome that
       matters — and measured as the guide's final button pointing at question
       six rather than at the send panel. The optional step still gets
       surfaced, as a suggestion alongside the instruction rather than as the
       instruction. */
    const pending = steps.find(st => !st.terminal && !st.complete && !st.optional)
                 || (ready ? steps[steps.length - 1] : null)
                 || steps.find(st => !st.terminal && !st.complete && st.optional)
                 || steps[steps.length - 1];

    const suggest = ready
      ? steps.find(st => !st.terminal && !st.complete && st.optional) || null
      : null;
    const problems = sanity(s);

    return {
      stepId: pending.id,
      index: Math.min(doneCount + 1, required.length),
      total: required.length,
      percent: Math.round(doneCount / required.length * 100),
      title: pending.title,
      ask: pending.ask,
      why: pending.why,
      cta: pending.cta,
      anchor: pending.anchor,
      /* A step can need more than one field. Sending the cursor to the first
         of them and stopping is how a person who does exactly what they are
         told fills one box and lands back on the same instruction — so the
         step carries all of its fields and the caller focuses the first one
         still empty. */
      fields: pending.fields || [],
      act: pending.act || null,
      optional: !!pending.optional,
      ready,
      /* Worth doing, not required, and never in the way. */
      suggestion: suggest ? { stepId: suggest.id, title: suggest.title,
                              why: suggest.why, cta: suggest.cta,
                              anchor: suggest.anchor, fields: suggest.fields || [] } : null,
      // a warning never replaces the instruction; it rides alongside it, so
      // there is still exactly one thing to do
      problems,
      steps: steps.filter(st => !st.terminal)
                  /* `short` is written per step rather than cut from the title.
                     Truncating produced labels like "עבור על מה" — a guess that
                     reads as a broken sentence on the one strip a lost user
                     scans to see where they are. */
                  .map(st => ({ id: st.id, title: st.title, short: st.short || st.title,
                                complete: st.complete, optional: !!st.optional }))
    };
  }

  root.PC = root.PC || {};
  root.PC.guide = { STEPS, next, sanity };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.PC.guide;
})(typeof window !== 'undefined' ? window : globalThis);
