/* ============================================================
   POST-CALL · the conductor.

   Everything before this assumed an operator who could drive a workspace:
   who knows what a scope is, can choose between four pricing methods, and
   knows what to do once a document appears on screen. That is a tool for
   someone who already knows how to write a proposal — which is not who this
   is for. 118 controls visible at rest is "here is everything, help
   yourself."

   This module inverts it. At any moment it answers one question — what
   should this person do right now, and why, in one sentence of plain Hebrew
   — and the interface is built around that answer instead of around a form.

   Three rules it enforces:

     1. Exactly one next action. Never two, never zero. A finished state is
        still an action ("send it"), because a screen with nothing to do is
        where a first-time user stops and closes the tab.
     2. No vocabulary the user has to already own. No scope, no ROI, no
        triangulation, no provenance. If a word needs a glossary it needs a
        rewrite.
     3. Never blame the user for not knowing where something is. A step that
        lives behind a closed drawer carries the instruction to open it, so
        "go fill question 6" is never something they have to decode.

   Pure: takes a state object, returns what to say. No DOM, tested in Node.
   ============================================================ */
(function (root) {
  'use strict';

  /* Ordered. Each step knows what counts as done, where it lives on the
     page, and — the part that matters for someone who has never priced a
     job — why it is worth answering at all. `why` is written as what it buys
     the user, never as what the tool needs. */
  const STEPS = [
    {
      id: 'process',
      short: 'התהליך',
      title: 'ספר מה קורה אצלו היום',
      ask: 'תאר את מה שהם עושים ביד — מה נכנס, מי מקליד, לאן זה הולך.',
      why: 'זה מה שהופך להיות "מה נכלל" בהצעה. בלי זה ההצעה מדברת כללית והלקוח לא מזהה את עצמו בה.',
      cta: 'לתיאור התהליך',
      anchor: 'q_process',
      fields: ['q_process'],
      done: s => !!(s.process || '').trim()
    },
    {
      id: 'volume',
      short: 'כמה וכמה זמן',
      title: 'כמה פעמים ביום זה קורה, וכמה זמן זה לוקח',
      ask: 'שני מספרים. אם הוא אמר "המון", שאל אותו כמה בערך ביום.',
      why: 'שני המספרים האלה הם כל המחיר. בלעדיהם אין לך על מה להישען מול "זה יקר לי".',
      cta: 'למספרים',
      anchor: 'q_freq',
      fields: ['q_freq', 'q_minutes'],
      done: s => s.freq > 0 && s.minutes > 0
    },
    {
      id: 'systems',
      short: 'תוכנות',
      title: 'סמן באילו תוכנות זה נוגע',
      ask: 'וואטסאפ, אקסל, מערכת חשבוניות — כל מה שהוזכר בשיחה.',
      why: 'ככל שיש יותר תוכנות, העבודה ארוכה יותר, והמחיר עולה בהתאם. זה מה שקובע כמה זמן תשקיע.',
      cta: 'לרשימת התוכנות',
      anchor: 'sysChips',
      done: s => (s.systems || []).length > 0
    },
    {
      id: 'breaks',
      short: 'תקלות',
      title: 'מה קורה כשזה מתפספס',
      ask: 'כמה פעמים בחודש משהו נופל, וכמה זה עולה להם בכל פעם.',
      why: 'זה בדרך כלל גדול יותר מחיסכון הזמן, וזה מה שמצדיק את המחיר בעיני הלקוח. אם תדלג, ההצעה תצא זולה בלי סיבה.',
      cta: 'פתח ומלא',
      anchor: 'q_err_freq',
      fields: ['q_err_freq', 'q_err_cost'],
      done: s => s.errFreq > 0 && s.errCost > 0,
      optional: true
    },
    {
      id: 'scope',
      short: 'מה כלול',
      title: 'עבור על מה שאתה מתחייב אליו',
      ask: 'כל שורה כבר מסומנת בהמלצה. שנה רק מה שלא מתאים, ואז אשר.',
      why: 'זה החלק שחוסך לך ויכוחים אחר כך. מה שלא כתוב שהוא בחוץ — הלקוח יניח שהוא בפנים.',
      cta: 'לרשימה',
      anchor: 'scopeBox',
      done: s => !!s.scopeConfirmed
    },
    {
      id: 'client',
      short: 'הלקוח',
      title: 'שם הלקוח, ומי מאשר אצלו',
      ask: 'השם נכנס לכותרת. מי שמאשר קובע כמה זמן ההצעה בתוקף.',
      why: 'הצעה בלי שם נראית כמו תבנית. ומי שמאשר קובע אם שבועיים מספיקים או שצריך שלושה.',
      cta: 'לפרטי הלקוח',
      anchor: 'q_client',
      fields: ['q_client', 'q_decider'],
      done: s => !!(s.client || '').trim()
    },
    {
      id: 'send',
      short: 'שליחה',
      title: 'ההצעה מוכנה',
      ask: 'עבור עליה פעם אחת מלמעלה למטה, ואז שלח.',
      why: '',
      cta: 'שלח ללקוח',
      anchor: 'proposal',
      done: s => !!s.sent,
      terminal: true
    }
  ];

  /* Numbers that cannot be true. Written as an observation with the
     arithmetic shown, never as "invalid input" — someone who does not know
     why 15 hours a day is impossible learns nothing from a red border. */
  function sanity(s) {
    const out = [];
    const runs = (+s.freq || 0) * (+s.freqUnit || 0);
    const hours = runs * (+s.minutes || 0) / 60;

    if (hours > 2000) {
      out.push({ id: 'toomuch', field: 'q_minutes',
        text: 'לפי מה שהזנת, התהליך לוקח כ-' + Math.round(hours).toLocaleString('en-US') +
              ' שעות בשנה — יותר מעובד אחד במשרה מלאה. כנראה שאחד משני המספרים גבוה מדי. ' +
              'שווה לבדוק: באמת ' + (+s.minutes) + ' דקות בכל פעם?' });
    }
    if (hours > 0 && hours < 5) {
      out.push({ id: 'toolittle', field: 'q_freq',
        text: 'לפי מה שהזנת, כל התהליך לוקח כ-' + Math.round(hours) +
              ' שעות בשנה. זה מעט מדי מכדי שמישהו ישלם על אוטומציה שלו. ' +
              'אולי זה קורה יותר פעמים ממה שרשמת, או שכדאי לתמחר תהליך אחר.' });
    }
    if (+s.errCost > 0 && +s.errCost >= 20000) {
      out.push({ id: 'bigerr', field: 'q_err_cost',
        text: 'רשמת ' + Math.round(+s.errCost).toLocaleString('en-US') +
              ' ₪ לכל תקלה. זה מספר גדול, והמחיר כולו יישען עליו. ' +
              'לפני שאתה שולח, בקש מהלקוח דוגמה אחת ספציפית לתקלה כזאת.' });
    }
    if (s.numbersAreMine && (+s.errCost > 0 || +s.freq > 0)) {
      out.push({ id: 'mine', field: 'q_provenance',
        text: 'סימנת שאתה הערכת את המספרים במקום הלקוח. זה בסדר, אבל אז הם לא נכנסים למסמך ' +
              'כהצדקה — כי אם הוא ישאל "מאיפה זה?", אין תשובה. עדיף לשלוח לו שאלה אחת ולקבל מספר משלו.' });
    }
    return out;
  }

  /* The whole point of the module. Returns exactly one instruction. */
  function next(state) {
    const s = state || {};
    const steps = STEPS.map(st => Object.assign({}, st, { complete: !!st.done(s) }));
    const required = steps.filter(st => !st.optional && !st.terminal);
    const doneCount = required.filter(st => st.complete).length;

    // the first thing not done, optional steps included so they get offered
    // once rather than never — but they never block the finish
    const pending = steps.find(st => !st.terminal && !st.complete && !st.optional)
                 || steps.find(st => !st.terminal && !st.complete && st.optional)
                 || steps[steps.length - 1];

    const ready = required.every(st => st.complete);
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
      optional: !!pending.optional,
      ready,
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

  /* Which pricing method to use, decided for the operator instead of by
     them. Four chips asking someone to pick between value, market rate,
     cost-plus and comparable is a question only a person who already prices
     work can answer — and getting it wrong costs them money. The tool picks
     and says why in one plain sentence; changing it stays available but off
     the main path. */
  function pickMethod(s) {
    const hasClientNumbers = (+s.freq > 0 && +s.minutes > 0) && !s.numbersAreMine;
    if (hasClientNumbers) return { method: 'value',
      because: 'המחיר נבנה ממה שהתהליך עולה ללקוח בשנה, כי הוא נתן לך את המספרים. ' +
               'זו הדרך שמחזיקה הכי טוב בשיחה: אתה לא מדבר על השעות שלך, אלא על הכסף שלו.' };
    if (+s.comparableLast > 0) return { method: 'comparable',
      because: 'המחיר נבנה מעבודה דומה שכבר עשית, מותאם להיקף כאן. ' +
               'זה מספר שאתה יכול להגן עליו כי הוא באמת קרה.' };
    if (s.numbersAreMine) return { method: 'market',
      because: 'המספרים הם הערכה שלך ולא של הלקוח, אז המחיר נבנה מהטווח המקובל בשוק לעבודה כזאת. ' +
               'ברגע שתקבל ממנו מספר אמיתי, הכלי יעבור לחשב לפי הערך אצלו וזה בדרך כלל יעלה את המחיר.' };
    return { method: 'market',
      because: 'עוד אין מספיק מספרים מהלקוח, אז בינתיים המחיר לפי הטווח המקובל בשוק. ' +
               'מלא כמה פעמים זה קורה וכמה זמן זה לוקח, והמחיר יתחיל להישען על העסק שלו.' };
  }

  root.PC = root.PC || {};
  root.PC.guide = { STEPS, next, sanity, pickMethod };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.PC.guide;
})(typeof window !== 'undefined' ? window : globalThis);
