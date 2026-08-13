/* English dictionary — see assets/pc-i18n.js for how these are keyed:
   the Hebrew string as it appears in the markup or the module IS the
   key, normalized to single spaces. assets/i18n.test.js walks the
   shipped pages and modules and fails when a Hebrew string has no
   entry here, so a copy edit cannot silently ship untranslated. */
if (typeof PC !== 'undefined' && PC.i18n) PC.i18n.reg({

  /* ---------- head ---------- */
  'מהשיחה להצעה · איפה אתם עכשיו?': 'From the call to the proposal · Where are you now?',

  /* ---------- header ---------- */
  'מהשיחה להצעה': 'From the call to the proposal',
  'שני כלים, מסלול אחד. אל תבחרו כלי — תגידו איפה אתם, והמערכת תיקח אתכם משם.':
    'Two tools, one path. Don\'t pick a tool — say where you are, and the system takes you from there.',
  'איפה אתם עכשיו?': 'Where are you now?',

  /* ---------- the four cards ---------- */
  'לפני השיחה': 'Before the call',
  'יש לי שיחה עם לקוח, ואני רוצה להגיע אליה מוכן':
    'I have a call with a client, and I want to walk in prepared',
  'נבנה לכם תסריט שאלות שמוציא מהלקוח את המספרים שתצטרכו כדי לתמחר. בלעדיהם תצאו מהשיחה עם תיאור, לא עם הצעה.':
    'Builds you a question script that gets the client to name the numbers you need to price. Without them you leave the call with a description, not a proposal.',
  'בונים תסריט': 'Build the script',

  'אחרי השיחה': 'After the call',
  'יצאתי עכשיו משיחה, וצריך להוציא הצעת מחיר':
    'I just got off a call, and I need to send a price proposal',
  'עונים על מה שנאמר בשיחה, והמחיר וההצעה הכתובה נבנים תוך כדי. אין שלב נפרד של כתיבה.':
    'You answer what was said on the call, and the price and the written proposal build as you go. There is no separate writing step.',
  'בונים הצעה': 'Build the proposal',

  'אחרי ששלחתם': 'After you sent',
  'שלחתי הצעות, ואני רוצה לדעת מה קרה איתן':
    'I sent proposals, and I want to know what happened to them',
  'מי ענה, מי לא, מה נסגר ובכמה. מה שתדווחו כאן הוא מה שמכייל את האומדנים שלכם לפעם הבאה.':
    'Who answered, who didn\'t, what closed and for how much. What you report here is what calibrates your estimates for next time.',
  'לפנקס ההצעות': 'To the proposal ledger',

  'רק מסתכלים': 'Just looking',
  'אני לא בטוח מה זה, רוצה לראות דוגמה':
    'I\'m not sure what this is, show me an example',
  'נטען תמלול של שיחה אמיתית לדוגמה, ותראו איך הוא הופך למחיר ולמסמך. בלי להזין כלום.':
    'Loads a transcript of a real sample call, and you watch it turn into a price and a document. Without typing a thing.',
  'מריצים דוגמה': 'Run the example',

  /* ---------- the strip ---------- */
  'איך זה עובד, בשורה אחת': 'How it works, in one line',
  'לפני': 'Before',
  '— תסריט שאלות לשיחה': '— a question script for the call',
  'בשיחה': 'On the call',
  '— הלקוח נוקב במספרים': '— the client names the numbers',
  'אחרי': 'After',
  '— המספרים שלו הופכים למחיר': '— their numbers become the price',
  'אחר כך': 'Later',
  '— מה שקרה בפועל מכייל את הבא': '— what actually happened calibrates the next one',
  'הכול נשאר בדפדפן שלכם. אין הרשמה, אין חשבון, ושום פרט על לקוח לא עוזב את המכשיר.':
    'Everything stays in your browser. No signup, no account, and no client detail ever leaves the device.',

  /* ---------- footer ---------- */
  'איך זה עובד ולמה': 'How it works and why'
});
