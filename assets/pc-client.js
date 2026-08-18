/* POST-CALL · reading the specific client.
   Pure, no DOM, tested in Node.
   Why it works this way: docs/modules/pc-client.md */
(function (root) {
  'use strict';

  var tr = (typeof PC !== 'undefined' && PC.i18n) ? PC.i18n.tr
    : function (s, p) { if (p) for (var k in p) s = s.split('{' + k + '}').join(p[k]); return s; };

  /* Systems that only appear once somebody bought a system: a business with
     an ERP has a finance function, and a business with a finance function
     has a payment process you do not control. The two Hebrew names go
     through tr() because the values they must match — the catalog chips the
     operator picked — render through the same dictionary, so both sides of
     the comparison translate together or not at all. */
  const HEAVY = ['ERP', tr('מערכת סליקה'), tr('מערכת ייעודית')];

  /* The decider free text is typed in the interface language, so the
     English words sit beside the Hebrew ones rather than replacing them. */
  const ALONE = /אף אחד|אני מחליט|אני לבד|רק אני|בעצמי|אני הבעלים|אני$|\bno ?one\b|\bnobody\b|\bjust me\b|\bonly me\b|\bmyself\b|\bi decide\b|^me$|^i$/i;
  const MANY  = /ועד|דירקטוריון|הנהלה|רכש|ועדה|כמה אנשים|צוות|שותפ|מנכ"ל ו|סמנכ|\bboard\b|\bcommittee\b|\bprocurement\b|\bmanagement\b|\bpartner\b|\bteam\b|\bseveral people\b|\bfew people\b|\bceo and\b|\bcfo\b/i;

  function read(sig) {
    const s = sig || {};
    const systems = s.systems || [];
    const runs = (+s.freq || 0) * (+s.freqUnit || 0);
    const heavy = systems.filter(x => HEAVY.includes(x)).length;
    const decider = (s.decider || '').trim();

    /* Size is a proxy for how the client pays and how long it takes them to
       decide — not for how much they are worth. It is deliberately coarse:
       three buckets from thin evidence is honest, seven would not be. */
    let size = 'small';
    if (heavy > 0 || systems.length >= 5 || runs >= 5000) size = 'mid';
    else if (systems.length <= 2 && runs > 0 && runs < 500) size = 'solo';

    let decision = 'unknown';
    if (decider) decision = MANY.test(decider) ? 'committee'
                          : ALONE.test(decider) ? 'single' : 'shared';

    /* 'unset', not 'none'. 'none' is an answer — the client named no figure —
       and defaulting to it meant an absent value was read as somebody having
       said so. Nothing recorded is its own state, and it is the one the form
       now starts in. */
    const numbers = s.provenance || 'unset';
    const burned = !!(s.prev || '').trim();
    const urgency = (s.trigger || '').trim() ? 'event'
                  : (s.deadline || '').trim() ? 'deadline' : 'none';

    /* Confidence is reported, not used to gate anything. The operator should
       be able to see that a read resting on one filled field is a read
       resting on one filled field. */
    /* `numbers !== 'unset'` rather than `!!s.provenance`. The form passes its
       value verbatim, so with an explicit unanswered default it passes a
       non-empty string, and a truthiness check counted a question nobody had
       answered as a filled field — a form with one number in it reported 40%
       confidence. Raised in review. */
    const known = [systems.length > 0, runs > 0, !!decider, numbers !== 'unset',
                   burned || urgency !== 'none'].filter(Boolean).length;

    const evidence = [];
    if (heavy) evidence.push(tr('יש {systems} — עסק שקנה מערכת כזאת כבר עבר את השלב שבו הבעלים משלם מהכרטיס שלו',
      { systems: systems.filter(x => HEAVY.includes(x)).join(', ') }));
    else if (systems.length >= 5) evidence.push(tr('{n} מערכות בתהליך אחד', { n: systems.length }));
    else if (size === 'solo') evidence.push(tr('מעט מערכות ונפח נמוך — נראה עסק קטן שמנוהל ישירות'));
    if (runs >= 5000) evidence.push(tr('התהליך רץ כ-{n} פעמים בשנה',
      { n: Math.round(runs).toLocaleString('en-US') }));
    if (decision === 'committee') evidence.push(tr('"{decider}" — יותר מאדם אחד מחליט', { decider: decider }));
    if (decision === 'single') evidence.push(tr('"{decider}" — מי שיושב מולך גם חותם', { decider: decider }));
    if (burned) evidence.push(tr('כבר ניסו משהו והוא לא נתפס'));
    if (numbers === 'mine') evidence.push(tr('המספרים בהצעה הם שלך, לא שלו'));

    return { size, decision, burned, urgency, numbers, runs,
             confidence: +(known / 5).toFixed(2), evidence };
  }

  /* An override is not a nicety. A derived read that cannot be corrected is
     worse than no read: the operator has no way to fix a document that is
     confidently wrong about who they are selling to. */
  function applyOverride(profile, override) {
    if (!override || override === 'auto') return profile;
    const p = Object.assign({}, profile, { overridden: true });
    if (override === 'solo')  { p.size = 'solo'; }
    if (override === 'small') { p.size = 'small'; }
    if (override === 'mid')   { p.size = 'mid'; p.decision =
      p.decision === 'single' ? 'single' : 'committee'; }
    p.evidence = [tr('נקבע ידנית — הקריאה האוטומטית נדרסה')];
    return p;
  }

  function adapt(profile) {
    const p = profile;
    const changes = [];
    const clauses = [];
    const focus = [];

    /* An offer that expires before the people who have to agree can meet
       does not create urgency, it creates a re-quote — and a re-quote starts
       the anchoring from zero, usually lower. */
    let validityDays = 14;
    if (p.decision === 'committee' || (p.size === 'mid' && p.decision === 'unknown')) {
      validityDays = 21;
      changes.push(tr('תוקף ההצעה הוארך ל-21 יום. אצל לקוח שההחלטה בו עוברת יותר מאדם אחד, 14 יום פשוט פוקעים לפני שהם נפגשים — ואז מתמחרים מחדש, בדרך כלל נמוך יותר.'));
      focus.push('q_decider');
    }

    /* A company pays on its terms, not on yours. Writing 50/50 and nothing
       else does not make procurement pay faster; it means you find out after
       delivery, when you have no leverage left. */
    let terms = tr('תשלום חד-פעמי, לא כולל מע"מ. 50% בהתחלה, 50% במסירה.');
    if (p.size === 'mid') {
      terms = tr('תשלום חד-פעמי, לא כולל מע"מ. 50% עם האישור, 50% במסירה, שוטף+30 מיום החשבונית. תחילת העבודה מותנית בהזמנת רכש חתומה.');
      changes.push(tr('תנאי התשלום הותאמו לעסק עם תהליך רכש: שוטף+30 והזמנת רכש לפני התחלה. זה לא ויתור — זה מונע את המצב שבו סיימת, ואז מגלים שלא נפתחה הזמנה ואין למי לחייב.'));
      clauses.push({ id: 'access', h: tr('גישות והרשאות'),
        p: tr('נדרש איש קשר אחד מצד הלקוח שאחראי על פתיחת גישות והרשאות למערכות. עיכוב בגישות דוחה את לוח הזמנים ביום על כל יום המתנה. זה הסעיף שהכי מעכב פרויקטים בארגונים, ולכן הוא כתוב ולא מובן מאליו.') });
      changes.push(tr('נוסף סעיף גישות עם אחראי בשם ועם השלכה על לוח הזמנים.'));
    }

    /* The strongest adaptation here, and the one most worth resisting the
       urge to skip. If the annual cost figure came out of the operator's own
       head, quoting it back to the client as the justification is not value
       pricing — it is cost pricing wearing a number the client never said.
       The client will ask where it came from, and there is no answer. */
    let suppressRoi = false;
    if (p.numbers === 'mine') {
      suppressRoi = true;
      changes.push(tr('פסקת ה-ROI הוסרה מהמסמך שנשלח. המספר השנתי הוא הערכה שלך, ולצטט אותו ללקוח כאילו הוא אמר אותו זו שאלה אחת ("מאיפה המספר?") שאין עליה תשובה. המחיר נשאר; ההצדקה עוברת להיקף. המספר עדיין מוצג לך על המסך.'));
      focus.push('q_err_cost', 'q_provenance');
    /* The same rule, on the case that used to slip through it. The form's
       default was 'prompted', so a question nobody had answered arrived here
       looking answered and the paragraph went out on the strength of it. An
       unanswered question is not a claim that the number is the operator's —
       it is the absence of any claim — and the tool cannot attribute a figure
       to the client on the absence of one. Fail closed, and say which of the
       two reasons it is, because "you estimated it" and "nobody said" call for
       different next moves: the first is a decision, the second is a click. */
    } else if (p.numbers === 'unset') {
      suppressRoi = true;
      /* Suppressing is unconditional; explaining is not. The paragraph only
         exists in the document when there is an annual value (see
         pc-proposal.js), so on a form nobody has filled in there is nothing
         being withheld and a line saying so would be noise on an empty page.
         Once the client has said how often the process runs, there is. */
      if (p.runs > 0) changes.push(
        tr('פסקת ההחזר לא נכנסה למסמך, כי לא סימנת מאיפה הגיע המספר השנתי. זה לא אומר שהמספר לא טוב — זה אומר שהכלי לא יכול לייחס אותו ללקוח בלי שמישהו אמר לו. סמן, והפסקה חוזרת. אי-הסימון לא שינה את המחיר, רק את מה שנכנס למסמך.'));
      focus.push('q_provenance');
    } else if (p.numbers === 'prompted') {
      focus.push('q_provenance');
    }

    /* Somebody who has been burned is not buying the automation. They are
       buying the assurance that this time it will still be running when you
       are gone — which is a clause, not a sentence in the cover note. */
    if (p.burned) {
      clauses.push({ id: 'handover', h: tr('מה נשאר אצלכם בסוף'),
        p: tr('בסיום המסירה נשארים אצלכם: תיעוד כתוב של התהליך, הגישות והחשבונות על שמכם, והרשאה מלאה לערוך את האוטומציה בעצמכם או דרך מישהו אחר. הכלי לא נשאר תלוי בי כדי להמשיך לרוץ.') });
      changes.push(tr('נוסף סעיף מסירה. מי שכבר נשרף פעם לא קונה את האוטומציה — הוא קונה את זה שהיא תמשיך לעבוד גם בלעדיך, וזה צריך להיות סעיף ולא הבטחה בשיחה.'));
      focus.push('q_prev');
    }

    if (p.urgency === 'event') focus.push('q_trigger');

    return { validityDays, terms, clauses, suppressRoi,
             focus: [...new Set(focus)], changes };
  }

  root.PC = root.PC || {};
  root.PC.client = { read, adapt, applyOverride, HEAVY };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.PC.client;
})(typeof window !== 'undefined' ? window : globalThis);
