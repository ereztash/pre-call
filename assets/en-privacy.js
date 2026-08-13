/* English dictionary — see assets/pc-i18n.js for how these are keyed:
   the Hebrew string as it appears in the markup or the module IS the
   key, normalized to single spaces. assets/i18n.test.js walks the
   shipped pages and modules and fails when a Hebrew string has no
   entry here, so a copy edit cannot silently ship untranslated. */
if (typeof PC !== 'undefined' && PC.i18n) PC.i18n.reg({
  'טבלת המפתחות שנשמרים בדפדפן': 'Table of the keys stored in the browser',
  'טבלת נקודות הקצה בשרת': 'Table of the server endpoints',
  /* ---------- head + header ---------- */
  'פרטיות · PRE-CALL / POST-CALL': 'Privacy · PRE-CALL / POST-CALL',
  'מה קורה בפועל עם המידע שעובר דרך PRE-CALL ו-POST-CALL':
    'What actually happens to the data that passes through PRE-CALL and POST-CALL',
  'הדף הזה נגזר מהקוד עצמו, לא מתבנית משפטית. כל טענה כאן — ניתן לבדוק אותה מול הקבצים בפרויקט. אם אתם רוצים לבדוק בעצמכם:':
    'This page is derived from the code itself, not from a legal template. Every claim here can be checked against the files in the project. If you want to verify it yourself:',
  'כל הקוד גלוי לקריאה כאן': 'all the code is readable here',

  /* ---------- the principle ---------- */
  'העיקרון': 'The principle',
  'שני הכלים האלה לא שולחים תוכן שיחה, פרטי לקוח, או פרטים עסקיים לשום שרת. הכול — הפרופיל העסקי, תסריט השיחה, טופס התמחור, פנקס העסקאות — נשאר בדפדפן שבו פתחתם את הכלי, ונמחק ברגע שמנקים אותו. אין שרת שמאחסן תוכן, אין חשבון משתמש, ואין דרך בשבילנו לראות מה כתבתם. שלוש נקודות קטנות בהמשך הן היוצא מן הכלל, והן מתוארות בדיוק כפי שהן, בלי לרכך.':
    'These two tools send no call content, client details, or business details to any server. Everything — the business profile, the call script, the pricing form, the deal ledger — stays in the browser you opened the tool in, and is gone the moment you clear it. There is no server storing content, no user account, and no way for us to see what you wrote. Three small exceptions follow, described exactly as they are, with no softening.',

  /* ---------- what is stored ---------- */
  'מה נשמר, ואיפה בדיוק': 'What is stored, and where exactly',
  'שבעה מפתחות, כולם ב-localStorage של הדפדפן — לא בענן, לא בשרת, לא מסונכרן בין מכשירים:':
    'Seven keys, all in the browser\'s localStorage — not in a cloud, not on a server, not synced between devices:',
  'מפתח': 'Key',
  'מה יש בו': 'What it holds',
  'איפה': 'Where',
  'הפרופיל העסקי שלכם (מה מוכרים, למי, עסקה אחרונה)':
    'Your business profile (what you sell, to whom, last deal)',
  'פנקס העסקאות שנשמרו, כולל תוצאות ושעות בפועל':
    'The ledger of saved deals, including outcomes and actual hours',
  'הטופס הנוכחי שלא נשמר עדיין כעסקה':
    'The current form, not yet saved as a deal',
  'יומן שינויים: מה זז בעסקה, ממה למה ומתי — סטטוסים, מחירים ומספר סעיפים בהיקף. בלי שמות ובלי טקסט חופשי, כדי שהמחיר שירד לפני שההצעה נשלחה יהיה נראה בכלל':
    'A change journal: what moved in a deal, from what to what and when — statuses, prices, and the number of scope items. No names and no free text, so that a price that dropped before the proposal went out is visible at all',
  'מי שולח את ההצעה — השם, העסק והדרכים ליצור קשר שמודפסים על המסמך':
    'Who sends the proposal — the name, business, and contact details printed on the document',
  'מפתח הרישיון, אם הוזן (לא כלול בגיבוי — ראו למטה)':
    'The license key, if entered (not included in backups — see below)',
  'מתי המפתח אומת לאחרונה מול השרת':
    'When the key was last verified against the server',
  '"הצד השני" בשיחה (שלב 2 ב-PRE-CALL) לא נשמר ולא נשלח — לא ב-localStorage, לא לשרת — ונמחק בסגירת הדף, בכוונה: אלה פרטים על אדם ספציפי לכל שיחה, לא משהו שצריך לחזור אליו.':
    'The "other side" of the call (step 2 in PRE-CALL) is never stored and never sent — not to localStorage, not to a server — and is erased when the page closes, deliberately: these are details about a specific person for one call, not something to come back to.',
  'יוצא דופן אחד, ורק בבחירה שלכם:': 'One exception, and only by your choice:',
  'אם תלחצו "הורד קובץ יומן" בשלב 3, שם העסק או האדם נכתב בכותרת האירוע — כדי שהתזכורת תדע על מה היא. הקובץ יורד למחשב שלכם ונכנס ליומן שלכם, ולא עובר דרכנו. בלי הלחיצה הזאת השם לא יוצא מהטאב.':
    'if you click "Download calendar file" in step 3, the business or person\'s name is written into the event title — so the reminder knows what it is about. The file downloads to your computer and goes into your calendar, and never passes through us. Without that click the name does not leave the tab.',

  /* ---------- what is sent ---------- */
  'מה נשלח לשרת, בדיוק': 'What is sent to the server, exactly',
  'שלוש נקודות קצה, ושום דבר מעבר להן:': 'Three endpoints, and nothing beyond them:',
  'נקודת קצה': 'Endpoint',
  'מתי': 'When',
  'מה נשלח': 'What is sent',
  'פעולות כמו פתיחת הדף, טעינת תבנית, שמירת עסקה':
    'Actions like opening the page, loading a template, saving a deal',
  /* data-i18n block: the whole cell, because three bold "לא" sit
     mid-sentence and the first one opens a sentence — fragment-by-fragment
     the capitalization cannot come out right in English. */
  'שם האירוע, שיטת התמחור, מספר המערכות, סכום המחיר, ומקור המספר (unprompted/prompted/mine). <b>לא</b> שם לקוח, <b>לא</b> טקסט חופשי, <b>לא</b> תוכן השיחה.':
    'The event name, the pricing method, the system count, the price amount, and the number\'s provenance (unprompted/prompted/mine). <b>No</b> client name, <b>no</b> free text, <b>no</b> call content.',
  'לחיצה על "הפעל את המפתח"': 'Clicking "Activate the key"',
  'המפתח שהוקלד, לבדיקה מול רשימת מפתחות תקפים. הבדיקה עצמה (תוצאה + IP) נרשמת בלוג השרת;':
    'The key you typed, checked against the list of valid keys. The check itself (result + IP) is written to the server log;',
  'המפתח שהוקלד עצמו לא נכתב ללוג': 'the key itself is never written to the log',
  '— רק אם הניסיון תקין, לא תקין, או לא בפורמט הנכון.':
    '— only whether the attempt was valid, invalid, or malformed.',
  'נדיר, בעיקר לבדיקת תקינות': 'Rare, mostly health checks',
  'שום דבר אישי — רק האם מערכת הרישיונות מוגדרת בכלל.':
    'Nothing personal — only whether the license system is configured at all.',
  'כל שלוש נקודות הקצה מוגבלות בקצב בקשות ובגודל גוף הבקשה, מזהות מבקש לפי כתובת ה-IP שהקצה של הרשת מדווח (לא לפי כותרת שאפשר לזייף מהצד), ולא שומרות עוגיות (cookies) — אין מנגנון מעקב בין ביקורים.':
    'All three endpoints are limited in request rate and body size, identify a caller by the IP address the network edge reports (not by a header anyone can spoof), and set no cookies — there is no tracking mechanism between visits.',

  /* ---------- the transcript and the AI ---------- */
  'התמלול והבינה המלאכותית — האחריות שלכם, לא של הכלי':
    'The transcript and the AI — your responsibility, not the tool\'s',
  'זה החלק הכי חשוב לקרוא. ב-POST-CALL אפשר להדביק תמלול שיחה ולקבל פרומפט לחילוץ מספרים ממנו. הפרומפט הזה':
    'This is the most important part to read. In POST-CALL you can paste a call transcript and get a prompt that extracts the numbers from it. That prompt',
  'לא נשלח משום מקום על ידי הכלי': 'is never sent anywhere by the tool',
  '— אתם מעתיקים אותו, ומריצים אותו בעצמכם בחשבון ה-Claude, ChatGPT, או כלי אחר שאתם כבר משתמשים בו. זה אומר שהתמלול — שעשוי להכיל שם, מספר טלפון, פרטים עסקיים של הצד השני בשיחה, שלא הסכים לשום דבר בקשר לכלי הזה — עובר תחת תנאי הפרטיות של הכלי החיצוני שבחרתם, לא תחת אלה. זו בחירה שלכם, ואתם אחראים עליה. הכלי לא מכריח שימוש בתמלול בכלל — יש גם דרך למלא ידנית, ודרך היוריסטית בלי בינה מלאכותית בכלל ("נסה בלי בינה מלאכותית").':
    '— you copy it, and run it yourself in the Claude, ChatGPT, or other account you already use. That means the transcript — which may hold a name, a phone number, business details of the other side of the call, who agreed to nothing regarding this tool — passes under the privacy terms of the external tool you chose, not under these. That is your choice, and you are responsible for it. The tool does not force transcript use at all — there is a manual path, and a heuristic path with no AI at all ("try without AI").',

  /* ---------- backup ---------- */
  'גיבוי': 'Backup',
  'שני הדפים מאפשרים להוריד קובץ JSON עם ארבעת מפתחות התוכן (הפרופיל, פנקס העסקאות, הטיוטה, ופרטי השולח) — לגיבוי אצלכם, לא לענן שלנו. מפתח הרישיון (':
    'Both pages let you download a JSON file with the four content keys (the profile, the deal ledger, the draft, and the sender details) — a backup you keep, not a cloud of ours. The license key (',
  'לעולם לא נכלל בקובץ הזה': 'is never included in this file',
  ', גם אם הוא קיים בדפדפן ברגע ההורדה — כדי שקובץ גיבוי שאתם שולחים למישהו, או מדביקים בפניה לתמיכה, לא יוכל להעביר איתו מפתח בתשלום.':
    ', even if it exists in the browser at the moment of download — so a backup file you send someone, or paste into a support thread, cannot carry a paid key with it.',

  /* ---------- security ---------- */
  'אבטחה, בקצרה': 'Security, briefly',
  'מדיניות אבטחת תוכן (CSP) קשיחה — הדף לא טוען שום סקריפט, גופן, או תמונה ממקור חיצוני.':
    'A strict Content Security Policy (CSP) — the page loads no script, font, or image from any external source.',
  '— שום טופס בדף לא יכול לשלוח נתונים לשום מקום אחר מלבד שלוש נקודות הקצה הפנימיות.':
    '— no form on the page can send data anywhere except the three internal endpoints.',
  '— הדף לא יכול להיטען בתוך iframe באתר אחר.':
    '— the page cannot be loaded inside an iframe on another site.',
  '— קליק על קישור החוצה לא חושף מאיפה הגעתם.':
    '— clicking an outbound link does not reveal where you came from.',
  'שום ספריית מעקב, אנליטיקס חיצוני, או פיקסל פרסום — אין כאלה בקוד בכלל.':
    'No tracking library, external analytics, or ad pixel — there are none in the code at all.',

  /* ---------- deleting everything ---------- */
  'למחוק הכול': 'Deleting everything',
  'אין כפתור "מחק את כל הנתונים שלי" כי אין צורך בו — הנתונים לא נמצאים אצלנו מלכתחילה. ניקוי היסטוריית הגלישה/נתוני האתרים של הדפדפן עבור הדומיין הזה מוחק את הכול באופן מיידי ובלתי הפיך. אם יש לכם עסקאות ששווה לשמור, הורידו גיבוי לפני כן.':
    'There is no "delete all my data" button because there is no need for one — the data was never with us in the first place. Clearing the browser\'s history/site data for this domain deletes everything, immediately and irreversibly. If you have deals worth keeping, download a backup first.',

  /* ---------- footer ---------- */
  'דף הפתיחה': 'Home',
  'איך הכלי עובד ולמה — המסמך המלא': 'How the tool works and why — the full document'
});
