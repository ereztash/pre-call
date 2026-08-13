/* ============================================================
   POST-CALL · a real call to try it on.

   An "example" that is a filled-in form teaches the form. An example that is
   a transcript teaches the product — because the whole claim is that the
   price comes out of what was said in the room, and you cannot demonstrate
   that with a form.

   This one is written to contain the exact things the tool is opinionated
   about, so a first run shows them rather than describing them:

     - a volume figure the client gives ONLY after being asked for it, so the
       provenance derivation lands on "prompted" and the operator sees the
       warning about a number that may be measuring the question
     - a cost-per-incident the client volunteers unasked, which is the case
       the tool treats as strongest
     - a previous failed attempt, which adds the handover clause
     - more than one decision maker, which extends the offer's validity
     - a WhatsApp step, which surfaces the API-approval scope row

   It is fiction, and labelled as such on screen. The numbers are plausible
   for a small Israeli importer, not measured.
   ============================================================ */
(function (root) {
  'use strict';

  var tr = (typeof PC !== 'undefined' && PC.i18n) ? PC.i18n.tr
    : function (s, p) { if (p) for (var k in p) s = s.split('{' + k + '}').join(p[k]); return s; };

  const TRANSCRIPT = tr(`מוכר: תודה שמצאת זמן. לפני שאני מציע משהו — ספר לי מה קורה אצלכם היום, צעד אחר צעד.

לקוח: אז תראה, אנחנו יבואנים של ציוד למטבחים מקצועיים. רוב ההזמנות מגיעות אלינו בוואטסאפ, מהמסעדות עצמן. מישהי אצלנו במשרד לוקחת את ההודעה, מקלידה את הפרטים לגיליון בגוגל, ואז נכנסת למורנינג ופותחת חשבונית ידנית. אחר כך היא שולחת את החשבונית חזרה בוואטסאפ.

מוכר: ומי זאת המישהי?

לקוח: רינת, היא רכזת תפעול אצלנו. חצי מהיום שלה זה זה.

מוכר: כמה הזמנות כאלה נכנסות בערך ביום?

לקוח: אה... בערך ארבעים ביום. אולי קצת יותר בתחילת השבוע.

מוכר: וכמה זמן לוקח לה כל אחת, מרגע שההודעה נכנסת עד שהחשבונית יצאה?

לקוח: שמונה דקות בערך. לפעמים יותר, כי צריך לחפש את הלקוח במערכת.

לקוח: אבל תשמע, הבעיה הגדולה היא לא הזמן. בחודש שעבר פספסנו שתי הזמנות שנפלו בין הכיסאות, אחת מהן של לקוח קבוע שעבד איתנו שבע שנים. הוא עבר למתחרה. אני מעריך שכל טעות כזאת עולה לנו בסביבות אלף שמונה מאות שקל, בין המשלוח הדחוף לפיצוי.

מוכר: כמה פעמים בחודש קורה משהו כזה?

לקוח: שלוש, ארבע פעמים. לא תמיד מגיע לזה שלקוח עוזב, אבל תקלות יש.

מוכר: ניסיתם לפתור את זה קודם?

לקוח: כן. קנינו לפני שנה איזה תוסף שאמור היה לחבר את וואטסאפ לגיליון. אף אחד לא הטמיע אותו עד הסוף, וזה פשוט מת. שילמנו והוא יושב שם.

מוכר: מי צריך לאשר החלטה כזאת אצלכם?

לקוח: אני והשותף שלי, ואם זה מעל עשרת אלפים אז גם רואה החשבון אומר את דעתו.

מוכר: יש תאריך שאתה מכוון אליו?

לקוח: הייתי רוצה שזה יעבוד לפני עונת החגים, זאת אומרת אמצע ספטמבר.

מוכר: ואם זה יעבוד, מה יגיד לך שזה הצליח?

לקוח: שאף הזמנה לא תיפול, ושרינת תעשה משהו אחר בחצי יום הזה.`);

  /* What a correct extraction of the transcript above looks like. This is
     not a shortcut around the language model — it is what the demo pastes so
     the first run works with no account, no key and no network, and it is
     what the tests assert against so the parser is checked on the shape a
     model actually returns rather than on a shape invented for testing. */
  /* The fence stays outside the tr() seam: the dictionary key is the JSON
     body alone, so neither language's entry carries backticks. */
  const EXTRACTION = '```json\n' + tr(`{
  "fields": {
    "process": { "value": "הזמנות מגיעות בוואטסאפ מהמסעדות, מוקלדות ידנית לגיליון בגוגל, ואז נפתחת חשבונית במורנינג ונשלחת חזרה בוואטסאפ", "quote": "רוב ההזמנות מגיעות אלינו בוואטסאפ, מהמסעדות עצמן. מישהי אצלנו במשרד לוקחת את ההודעה, מקלידה את הפרטים לגיליון בגוגל, ואז נכנסת למורנינג ופותחת חשבונית ידנית", "speaker": "לקוח" },
    "freq": { "value": 40, "quote": "בערך ארבעים ביום", "speaker": "לקוח" },
    "freqUnit": { "value": "יום", "quote": "בערך ארבעים ביום", "speaker": "לקוח" },
    "minutes": { "value": 8, "quote": "שמונה דקות בערך", "speaker": "לקוח" },
    "systems": { "value": ["וואטסאפ", "גיליונות Google", "חשבונית ירוקה / מורנינג"], "quote": "מקלידה את הפרטים לגיליון בגוגל, ואז נכנסת למורנינג ופותחת חשבונית ידנית", "speaker": "לקוח" },
    "errFreq": { "value": 3, "quote": "שלוש, ארבע פעמים", "speaker": "לקוח" },
    "errCost": { "value": 1800, "quote": "אני מעריך שכל טעות כזאת עולה לנו בסביבות אלף שמונה מאות שקל", "speaker": "לקוח" },
    "client": { "value": "יבואן ציוד למטבחים", "quote": "אנחנו יבואנים של ציוד למטבחים מקצועיים", "speaker": "לקוח" },
    "decider": { "value": "אני והשותף שלי, ומעל עשרת אלפים גם רואה החשבון", "quote": "אני והשותף שלי, ואם זה מעל עשרת אלפים אז גם רואה החשבון אומר את דעתו", "speaker": "לקוח" },
    "trigger": { "value": "בחודש שעבר פספסו שתי הזמנות, ולקוח קבוע של שבע שנים עבר למתחרה", "quote": "בחודש שעבר פספסנו שתי הזמנות שנפלו בין הכיסאות, אחת מהן של לקוח קבוע שעבד איתנו שבע שנים. הוא עבר למתחרה", "speaker": "לקוח" },
    "prev": { "value": "קנו תוסף שיחבר וואטסאפ לגיליון, אף אחד לא הטמיע אותו והוא לא בשימוש", "quote": "קנינו לפני שנה איזה תוסף שאמור היה לחבר את וואטסאפ לגיליון. אף אחד לא הטמיע אותו עד הסוף, וזה פשוט מת", "speaker": "לקוח" },
    "deadline": { "value": "לפני עונת החגים, אמצע ספטמבר", "quote": "הייתי רוצה שזה יעבוד לפני עונת החגים, זאת אומרת אמצע ספטמבר", "speaker": "לקוח" },
    "success": { "value": "שאף הזמנה לא תיפול, ושרכזת התפעול תתפנה לחצי יום עבודה אחר", "quote": "שאף הזמנה לא תיפול, ושרינת תעשה משהו אחר בחצי יום הזה", "speaker": "לקוח" }
  }
}`) + '\n```';

  root.PC = root.PC || {};
  root.PC.example = { TRANSCRIPT, EXTRACTION };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.PC.example;
})(typeof window !== 'undefined' ? window : globalThis);
