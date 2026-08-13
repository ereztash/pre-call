/* English dictionary — see assets/pc-i18n.js for how these are keyed:
   the Hebrew string as it appears in the markup or the module IS the
   key, normalized to single spaces. assets/i18n.test.js walks the
   shipped pages and modules and fails when a Hebrew string has no
   entry here, so a copy edit cannot silently ship untranslated. */
if (typeof PC !== 'undefined' && PC.i18n) PC.i18n.reg({
  'הצהרת נגישות · PRE-CALL / POST-CALL': 'Accessibility statement · PRE-CALL / POST-CALL',
  'הצהרת נגישות': 'Accessibility statement',
  'מה נבדק, באיזה כלי, ומה עוד לא': 'What is tested, with what, and what is not',
  'הדף הזה נגזר מהבדיקות שרצות בפועל, לא מתבנית משפטית. כל טענה כאן מתאימה לצעד בקובץ הבדיקות של הפרויקט, וניתן לפתוח אותו ולראות. מה שעוד לא נבדק כתוב כאן באותה מידה של פירוט כמו מה שכן.':
    'This page is derived from the checks that actually run, not from a legal template. Every claim below corresponds to a step in the project’s test workflow, and anyone can open it. What is not yet tested is written here in the same detail as what is.',

  'רמת הנגישות': 'Conformance level',
  'האתר נבנה לעמידה ב-<b>WCAG 2.1 ברמה AA</b> — התקן שאליו מפנה התקן הישראלי ת"י 5568, ושעליו נשענות תקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות). ארבעת הדפים באתר נבדקים מול הרמה הזאת אוטומטית, בכל שינוי בקוד.':
    'The site is built to meet <b>WCAG 2.1 Level AA</b> — the standard referenced by Israeli Standard 5568, which the Equal Rights for Persons with Disabilities (Accessibility Adjustments to Service) Regulations rest on. Every page here is checked against that level automatically, on every change to the code.',

  'מה נבדק אוטומטית, בכל דחיפה': 'What runs automatically, on every push',
  'לא בדיקה חד-פעמית לפני השקה. הבדיקות האלה רצות על כל שינוי, וכישלון שלהן עוצר את הפריסה:':
    'Not a one-off audit before launch. These run on every change, and a failure stops the deploy:',
  '<b>axe-core מול WCAG 2.1 A ו-AA</b> — על כל דף, ולא במצב הפתיחה שלו אלא במצבים שבהם באמת משתמשים בו: טופס מלא, תסריט בנוי, הצעה מתומחרת, פנקס עם עסקאות, מסך התשלום. מצב הפתיחה הוא המצב היחיד שאף אחד לא עובד בו.':
    '<b>axe-core against WCAG 2.1 A and AA</b> — on every page, and not in its opening state but in the states people actually work in: a filled form, a built script, a priced proposal, a ledger with deals in it, the payment screen. The opening state is the one state nobody operates in.',
  '<b>שלוש הרצות נפרדות</b> — בערכה בהירה, בערכה כהה, ובאנגלית. יחס ניגודיות הוא תכונה של <em>צמד</em> צבעים, והערכה הכהה מזווגת מחדש את כולם; תרגום משנה אורכי תוויות ופריסה. בדיקה שרצה רק במצב אחד בדקה שליש מהמוצר.':
    '<b>Three separate runs</b> — light theme, dark theme, and English. A contrast ratio is a property of a <em>pairing</em>, and the dark theme re-pairs all of them; a translation changes label lengths and layout. A scan that only ran in one mode checked a third of the product.',
  '<b>ניווט מקלדת מקצה לקצה</b> — שה-Tab הראשון מגיע לקישור דילוג ושהוא באמת מעביר לתוכן, שלכל אלמנט שאפשר להגיע אליו יש טבעת פוקוס נראית, שחצי המקלדת מפעילים את ניווט השלבים, ושמעבר שלב מזיז את הפוקוס ולא רק את הגלילה.':
    '<b>Keyboard navigation, end to end</b> — that the first Tab reaches a skip link and that it genuinely moves you into the content, that every reachable element shows a visible focus ring, that the arrow keys drive the step navigation, and that changing step moves focus rather than only the scroll position.',
  '<b>ריווח טקסט של הקורא (קריטריון 1.4.12)</b> — הדף נטען מחדש עם הריווח שהתקן מגדיר (גובה שורה 1.5, ריווח אותיות 0.12em, ריווח מילים 0.16em), ונבדק שאף טקסט לא נחתך.':
    '<b>The reader’s own text spacing (SC 1.4.12)</b> — each page is repainted with the spacing the criterion specifies (line height 1.5, letter spacing 0.12em, word spacing 0.16em), and checked that no text is clipped.',
  '<b>זרימה מחדש בהגדלה של 400% (קריטריון 1.4.10)</b> — הדפים נבדקים ברוחב 320 פיקסלים, ואסור שהמסמך יגלול לרוחב. תוכן רחב מטבעו, כמו טבלה, גולל בתוך אזור משלו שאפשר להגיע אליו במקלדת.':
    '<b>Reflow at 400% zoom (SC 1.4.10)</b> — pages are checked at a 320px viewport, and the document must not scroll sideways. Content that is wide by nature, such as a table, scrolls inside its own region, which is reachable by keyboard.',
  '<b>Core Web Vitals על טלפון מווסת</b> — דף שנטען לאט הוא דף פחות נגיש, במיוחד למי שמשתמש בקורא מסך שממתין ל-DOM יציב.':
    '<b>Core Web Vitals on a throttled phone</b> — a page that loads slowly is a less accessible page, especially for someone using a screen reader that waits for a settled DOM.',

  'מה נבנה בכוונה בשביל זה': 'What was built deliberately for this',
  '<b>קישור דילוג בכל דף</b>, ראשון בסדר ה-Tab, שמעביר את הפוקוס עצמו לאזור התוכן.':
    '<b>A skip link on every page</b>, first in the tab order, which moves focus itself into the content region.',
  '<b>ניווט השלבים ב-PRE-CALL הוא tablist אמיתי</b> — עצירה אחת בסדר ה-Tab ולא שלוש, חצים שנעים לפי כיוון הקריאה בעברית ובאנגלית, Home ו-End, ו-aria-selected שמדווח מה נבחר. מעבר שלב מעביר את הפוקוס אל הפאנל, כדי שקורא מסך יקרא את השלב החדש ולא את זה שהוסתר.':
    '<b>PRE-CALL’s step navigation is a real tablist</b> — one stop in the tab order rather than three, arrows that follow the reading direction in both Hebrew and English, Home and End, and aria-selected reporting which step is current. Changing step moves focus into the panel, so a screen reader reads the new step rather than the one just hidden.',
  '<b>מצב כהה שהוא מראה של סולם הצבעים</b>, כך שהמרחק בין כל שני גוונים שורד את ההיפוך — ולא ערכה שנייה שנבנתה בעין.':
    '<b>A dark theme that mirrors the colour ramp</b>, so the distance between any two steps survives the flip — rather than a second palette built by eye.',
  '<b>תמיכה ב-prefers-contrast: more</b> — מי שביקש ניגודיות גבוהה במערכת ההפעלה מקבל טקסט משני בעוצמת טקסט רגיל, קווי הפרדה נראים, וטבעת פוקוס עבה יותר.':
    '<b>Support for prefers-contrast: more</b> — anyone who asked their system for higher contrast gets secondary text at body strength, separators that are actually visible, and a thicker focus ring.',
  '<b>כיבוד prefers-reduced-motion</b> — גלילות ואנימציות נעצרות למי שביקש את זה במערכת.':
    '<b>prefers-reduced-motion is honoured</b> — scrolling and animation stop for anyone who asked their system for that.',
  '<b>שני מסמכי התוצר עוברים לשפת הממשק</b> — מפעיל שעבד באנגלית שולח הצעה באנגלית, ולא מסמך מעורב.':
    '<b>Both output documents follow the interface language</b> — an operator working in English sends an English proposal, not a mixed document.',

  'מה עוד לא נבדק, ואיך זה משפיע': 'What is not tested, and what that costs',
  'בדיקה אוטומטית תופסת חלק מהקריטריונים ולא את כולם. אלה הפערים הידועים, בלי לרכך:':
    'Automated testing decides some criteria and not others. These are the known gaps, unsoftened:',
  '<b>לא נערכה בדיקה עם משתמשים אמיתיים שמשתמשים בטכנולוגיה מסייעת.</b> זה הפער המשמעותי ביותר כאן. הבדיקות מריצות מנוע דפדפן, לא אדם עם NVDA, JAWS או VoiceOver, ויש דברים שרק שימוש אמיתי חושף.':
    '<b>No testing has been done with real users of assistive technology.</b> This is the most significant gap here. The tests drive a browser engine, not a person using NVDA, JAWS or VoiceOver, and there are things only real use surfaces.',
  '<b>בדיקת קורא מסך ידנית לא בוצעה באופן שיטתי.</b> מבנה הכותרות, שמות האזורים והסדר שבו הדברים מוקראים נבדקו מול הכללים, לא מול האוזן.':
    '<b>Manual screen-reader testing has not been done systematically.</b> Heading structure, region names and reading order were checked against the rules, not against the ear.',
  '<b>המסמכים שהכלי מייצר</b> — התסריט וההצעה — נבדקים כפי שהם מוצגים במסך. קובץ PDF שנוצר דרך הדפסת הדפדפן אינו מתויג (tagged PDF), ולכן נגישותו תלויה בדפדפן שהפיק אותו.':
    '<b>The documents the tool produces</b> — the script and the proposal — are checked as they appear on screen. A PDF produced through the browser’s print dialog is not tagged, so its accessibility depends on the browser that made it.',
  '<b>ת"י 5568 דורש גם היבטים ארגוניים</b> — רכז נגישות, נהלים — שרלוונטיים לארגון ולא לאתר סטטי המופעל על ידי יחיד. ההצהרה כאן מכסה את האתר.':
    '<b>IS 5568 also requires organisational measures</b> — an accessibility coordinator, written procedures — which apply to an organisation rather than to a static site run by one person. This statement covers the site.',

  'נתקלתם במשהו שלא עובד': 'Something here does not work for you',
  'אם משהו באתר לא נגיש לכם — טקסט שלא נקרא, פעולה שאי אפשר להגיע אליה במקלדת, ניגודיות שלא מספיקה — זה באג, ואפשר לדווח עליו כמו על כל באג אחר:':
    'If something here is not accessible to you — text that is not read out, an action you cannot reach by keyboard, contrast that is not enough — that is a bug, and it can be reported like any other:',
  'במייל: <a href="mailto:erez2812345@gmail.com">erez2812345@gmail.com</a>':
    'By email: <a href="mailto:erez2812345@gmail.com">erez2812345@gmail.com</a>',
  'או כתקלה בפרויקט:': 'Or as an issue on the project:',
  'דיווח ב-GitHub': 'Report on GitHub',
  'שווה לציין מה ניסיתם לעשות, באיזה דף, ובאיזו טכנולוגיה מסייעת — זה מה שהופך דיווח למשהו שאפשר לשחזר ולתקן.':
    'It helps to say what you were trying to do, on which page, and with which assistive technology — that is what turns a report into something reproducible and fixable.',

  'איך לבדוק את מה שכתוב כאן': 'How to check what this page claims',
  'כל הבדיקות שההצהרה הזאת מתארת נמצאות בקוד הפתוח לקריאה, ואפשר להריץ אותן: <code>assets/a11y.test.js</code> מריץ את axe-core ואת בדיקות המקלדת, הריווח והזרימה מחדש; <code>.github/workflows/test.yml</code> מראה מה רץ על כל דחיפה ובאילו שלוש הרצות. <a href="https://github.com/ereztash/pre-call" target="_blank" rel="noopener">הקוד גלוי לקריאה כאן</a>.':
    'Every check this statement describes is in the code, readable and runnable: <code>assets/a11y.test.js</code> runs axe-core plus the keyboard, text-spacing and reflow checks; <code>.github/workflows/test.yml</code> shows what runs on every push and in which three passes. <a href="https://github.com/ereztash/pre-call" target="_blank" rel="noopener">The code is open to read here</a>.',

  'עודכן לאחרונה: אוגוסט 2026 · ההצהרה מתייחסת לארבעת דפי האתר.':
    'Last reviewed: August 2026 · This statement covers every page of the site.',
  'נגישות': 'Accessibility'
});
