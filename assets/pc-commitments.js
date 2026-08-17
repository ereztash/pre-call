/* ============================================================
   POST-CALL · commitment readiness
   Pure: no DOM, no storage, no reads of anything outside its argument.

   The question this replaces is "which field is still empty". That question
   has one answer for the whole deal, and it is the wrong shape: a proposal is
   not ready or unready, it is a stack of separate promises, and they fail
   separately. A missing ROI figure says nothing about whether you know which
   systems connect. A silence about SLA says nothing about the delivery date.
   Rolling those into one boolean means the tool either blocks a proposal it
   had no reason to block, or lets a promise through that nothing supports —
   and it has no way to tell you which of the two it just did.

   So readiness is per commitment. Each one carries what it would be claiming,
   what would have to be true to claim it, and — when it is not ready — what
   goes wrong if it ships anyway.

   Four rules the assessment holds, none of which are about pricing:

     No commitment beyond evidence.  A promise may not be stronger than what
     supports it. That is the whole file in one line.

     A default is not evidence.  The product supplies starting numbers so
     there is something to correct. Something to correct is not something the
     client said, and the two must never arrive at the proposal wearing the
     same face.

     An answer given after the call is not a client quote.  It is usually
     right and it is still the operator's. It can carry a commitment. It
     cannot carry a claim about what the client told you.

     No system authority beyond system certainty.  A regex that matched the
     word "security" has found a topic, not a decision about it.
   ============================================================ */
(function (root) {
  'use strict';

  var tr = (typeof PC !== 'undefined' && PC.i18n) ? PC.i18n.tr
    : function (s, p) { if (p) for (var k in p) s = s.split('{' + k + '}').join(p[k]); return s; };

  /* Where a fact came from, strongest first. The order is load-bearing: a
     commitment reports the weakest source holding it up, because that is the
     one that gives way. */
  const SOURCES = {
    clientSaid:   'transcript-verified',   // in the transcript, in the client's line, approved
    heard:        'transcript-candidate',  // extracted, not yet approved by anybody
    operatorSaid: 'post-call-user',        // typed in after the call. true, and not the client
    inferred:     'inference',             // the tool worked it out. never a claim about the client
    fallback:     'default',               // a starting number, present so it can be corrected
    absent:       'missing'
  };

  const RANK = [SOURCES.clientSaid, SOURCES.operatorSaid, SOURCES.inferred,
                SOURCES.heard, SOURCES.fallback, SOURCES.absent];
  const weakest = list => (list || []).slice()
    .sort((a, b) => RANK.indexOf(b.source) - RANK.indexOf(a.source))[0];

  const READY = 'READY', CONDITIONAL = 'CONDITIONAL', BLOCKED = 'BLOCKED';

  /* A commitment is only worth modelling if getting it wrong costs something
     the operator would recognise. consequenceIfWrong is not decoration — it is
     the test of whether an entry belongs in this list at all, and it is what
     the question shown to the operator is built from. */
  const CATALOG = [
    {
      id: 'systems',
      label: tr('אילו מערכות מתחברות'),
      claim: tr('הפרויקט מחבר בין המערכות האלה'),
      material: true,
      consequenceIfWrong: tr('הצעה שמתארת חיבור אחר ממה שנבנה — הפער מתגלה אחרי החתימה'),
      assess: d => d.systems && d.systems.length >= 2
        ? ok(d.systems.join(' · '), d.systemsSource || SOURCES.heard)
        : no(tr('עוד לא אושרו שני צדדים שמתחברים'))
    },
    {
      id: 'delivery',
      label: tr('מה צריך לקרות ביניהן'),
      claim: tr('זו התוצאה שהפרויקט מייצר'),
      material: true,
      consequenceIfWrong: tr('אותן מערכות בדיוק יכולות להיות סנכרון, ניטור או אישור — שלוש עבודות שונות'),
      assess: d => d.delivery
        ? ok(d.delivery, d.deliverySource || SOURCES.operatorSaid)
        : no(tr('שמות המערכות ידועים, התוצאה שהחיבור מייצר עוד לא'))
    },
    {
      id: 'exception-owner',
      label: tr('מי מטפל במה שלא ניתן לפענוח'),
      claim: tr('זה מי שנושא באחריות לקלט חריג'),
      material: true,
      /* Only exists once the transcript says edge cases exist. A commitment
         nobody has a reason to make is not blocked, it is absent — and a list
         that shows every possible promise as BLOCKED teaches the operator to
         ignore the word. */
      when: d => d.signals && d.signals.freeText,
      consequenceIfWrong: tr('אם זה נופל עליכם ולא סוכם — זו עבודה שלא תומחרה, בכל חודש מחדש'),
      assess: d => d.decisions && d.decisions.exceptionOwner
        ? ok(d.decisions.exceptionOwner === 'client'
              ? tr('הלקוח מטפל, והחריג מוחרג במפורש')
              : tr('האוטומציה מטפלת, והעבודה נכנסת להיקף'),
             SOURCES.operatorSaid)
        : no(tr('השיחה מזכירה קלט חריג ולא נאמר מי מטפל בו'))
    },
    {
      id: 'enterprise-risk',
      label: tr('אבטחה · רמת שירות · טיפול בכשל'),
      claim: tr('אלה הגבולות שהפרויקט מתחייב אליהם'),
      material: true,
      when: d => d.signals && d.signals.enterpriseOpen,
      consequenceIfWrong: tr('התחייבות עמומה לזמינות או לאבטחה היא התחייבות פתוחה'),
      assess: d => {
        const c = (d.decisions || {}).risk;
        if (!c) return no(tr('השיחה אומרת שהנושא פתוח, ואין החלטה עליו'));
        if (c === 'exclude')
          return maybe(tr('מוחרג במפורש מההצעה הנוכחית'), SOURCES.operatorSaid);
        return (d.decisions.riskDetail)
          ? ok(d.decisions.riskDetail, SOURCES.operatorSaid)
          : no(tr('נבחר לכלול, ובלי ניסוח זו התחייבות בלי גבול'));
      }
    },
    {
      id: 'value-claim',
      label: tr('הטענה על מה זה שווה ללקוח'),
      claim: tr('זה מה שהתהליך עולה לו היום'),
      material: false,
      consequenceIfWrong: tr('מספר שהמצאתם, מצוטט ללקוח — שאלה אחת ("מאיפה זה?") ואין תשובה'),
      /* The one place the four rules bite hardest. A value claim is a claim
         about the client's business, so only the client can source it. An
         operator estimate is not a weaker version of that — it is a different
         thing, and it may carry a price without carrying the sentence. */
      assess: d => d.provenance === 'unprompted' || d.provenance === 'prompted'
        ? ok(tr('נשען על מספר שהלקוח עצמו נקב'), SOURCES.clientSaid)
        : no(d.provenance === 'mine'
              ? tr('המספרים הם הערכה שלכם, ולא של הלקוח')
              : tr('עוד לא סומן מאיפה הגיעו המספרים'))
    }
  ];

  function ok(reason, source)    { return { status: READY, reason, source }; }
  function maybe(reason, source) { return { status: CONDITIONAL, reason, source }; }
  function no(reason)            { return { status: BLOCKED, reason, source: SOURCES.absent }; }

  /* The deal, as anything can build it: the product from its form and its
     approved transcript rows, the landing page from a pasted call and nothing
     else. Missing keys are missing evidence, never defaults — a function that
     invents inputs would break the second rule in this file's own header. */
  function assess(deal) {
    const d = deal || {};
    return CATALOG
      .filter(c => !c.when || c.when(d))
      .map(c => {
        const r = c.assess(d);
        return {
          id: c.id,
          label: c.label,
          candidateClaim: c.claim,
          material: !!c.material,
          consequenceIfWrong: c.consequenceIfWrong,
          status: r.status,
          reason: r.reason,
          source: r.source
        };
      });
  }

  /* What actually stops a proposal, as opposed to what is merely unknown. A
     value claim with no client figure is BLOCKED and the deal is fine without
     it — the document simply does not make that claim, and the price comes
     from a method that never needed it. Blocking a proposal over a missing ROI
     is the failure this separation exists to prevent. */
  function blocking(list) {
    return (list || []).filter(c => c.material && c.status === BLOCKED);
  }

  /* Which promises may reach the document. CONDITIONAL travels, because an
     explicit exclusion is a promise the operator can stand behind — it is the
     unexamined ones that must not. */
  function admissible(list) {
    return (list || []).filter(c => c.status === READY || c.status === CONDITIONAL);
  }

  root.PC = root.PC || {};
  root.PC.commitments = { SOURCES, READY, CONDITIONAL, BLOCKED, CATALOG,
                          assess, blocking, admissible, weakest };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.PC.commitments;
})(typeof window !== 'undefined' ? window : globalThis);
