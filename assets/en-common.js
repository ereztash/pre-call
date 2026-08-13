/* English dictionary — see assets/pc-i18n.js for how these are keyed:
   the Hebrew string as it appears in the markup or the module IS the
   key, normalized to single spaces. assets/i18n.test.js walks the
   shipped pages and modules and fails when a Hebrew string has no
   entry here, so a copy edit cannot silently ship untranslated. */
if (typeof PC !== 'undefined' && PC.i18n) PC.i18n.reg({

  /* ---------- entry.js ---------- */
  'יש הצעה שלא סיימתם, של {name}.': 'You have an unfinished proposal, for {name}.',
  'יש הצעה שהתחלתם ולא סיימתם.': 'You have a proposal you started and never finished.',
  'להמשיך אותה': 'Continue it',
  'הצעה אחת נשלחה וממתינה לתשובה.': 'One proposal is out, waiting for an answer.',
  '{n} הצעות נשלחו וממתינות לתשובה.': '{n} proposals are out, waiting for an answer.',
  'לראות מה קרה': 'See what happened',
  'המשך מאיפה שהפסקתם': 'Pick up where you left off',

  /* ---------- deals.js ---------- */
  'טיוטה': 'Draft',
  'נשלחה': 'Sent',
  'נסגרה': 'Won',
  'נדחתה': 'Lost',
  'ללא מענה': 'No answer',
  'הוא נקב מעצמו': 'They named it unprompted',
  'הוא נקב אחרי שאלה': 'They named it when asked',
  'אתה הערכת': 'You estimated it',
  'לא היה מספר': 'There was no number',
  'הלקוח ביקש': 'The client asked',
  'הצעת מעצמך': 'You offered unasked',
  'לא נרשם': 'Not recorded',
  'ללא שם': 'Unnamed',
  'האומדן שלך נמוך ב-{pct}%': 'Your estimates run {pct}% low',
  'האומדן שלך גבוה ב-{pct}%': 'Your estimates run {pct}% high',

  /* ---------- model.js ---------- */
  'עלות + מרווח': 'Cost + margin',
  'מחירון שוק': 'Market rate',
  'ערך / ROI': 'Value / ROI',
  'עסקה דומה': 'Comparable deal',
  'רצפת עלות': 'Cost floor',
  'פשוט': 'Simple',
  'מורכב': 'Complex',
  'רב-מערכתי': 'Multi-system',
  'ארגוני': 'Enterprise',
  '{effort} שעות × ₪{rate} + {margin}% מרווח': '{effort} hours × ₪{rate} + {margin}% margin',
  'טווח {tier}: {lo}–{hi}': '{tier} range: {lo}–{hi}',
  '{pct}% מ{value} ערך שנתי · הטווח שניתן להגנה {lo}–{hi}':
    '{pct}% of {value} annual value · defensible range {lo}–{hi}',

  /* ---------- pc-ical.js ---------- */
  'הלקוח': 'the client',
  'שיחת אפיון · {who}': 'Discovery call · {who}',
  'לפני: תסריט השיחה מוכן ב-PRE-CALL. אחרי: תמחור ההצעה ב-POST-CALL, כל עוד השיחה עוד באוזניים.':
    'Before: your call script is ready in PRE-CALL. After: price the proposal in POST-CALL, while the call is still in your ears.',
  'הרגע שאחרי הוא הרגע שבו ההיקף עוד זכור והמחיר עוד לא נוחש.':
    'The moment right after is when the scope is still fresh and the price has not been guessed yet.',
  'בעוד {min} דקות: שיחה עם {who}': 'In {min} minutes: call with {who}',
  'השיחה עם {who} נגמרה. תמחר אותה עכשיו, לא מחר — מחר ההיקף כבר מטושטש והמחיר יוצא מהבטן.':
    'The call with {who} is over. Price it now, not tomorrow — by tomorrow the scope is blurred and the price comes from the gut.',

  /* ---------- pc-dom.js ---------- */
  'המספרים': 'the numbers',
  'המסמך': 'the document',
  'רשימת הסקופ': 'the scope list',
  'ספר העסקאות': 'the deal ledger',
  'התבניות': 'the templates',
  'חלק מהמסך לא התרענן: {names}.': 'Part of the screen did not refresh: {names}.',
  'שאר הכלי ממשיך לעבוד, והנתונים ששמרת לא נפגעו.':
    'The rest of the tool keeps working, and your saved data is intact.',
  'רענון הדף בדרך כלל פותר את זה; אם לא, פתח את הקונסולה — הפירוט שם.':
    'Reloading the page usually fixes this; if not, open the console — the details are there.',
  'כללי': 'general',

  /* ---------- pc-draft.js ---------- */
  'לפני פחות מדקה': 'less than a minute ago',
  'לפני {min} דקות': '{min} minutes ago',
  'לפני {hr} שעות': '{hr} hours ago',
  'לפני {d} ימים': '{d} days ago',

  /* ---------- shared across pages ---------- */
  'פרטיות': 'Privacy',
  '© 2026 ארז טל-שיר · כל הזכויות שמורות': '© 2026 Erez Tal-Shir · All rights reserved'
});
