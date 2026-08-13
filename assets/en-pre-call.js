/* English dictionary — see assets/pc-i18n.js for how these are keyed:
   the Hebrew string as it appears in the markup or the module IS the
   key, normalized to single spaces. assets/i18n.test.js walks the
   shipped pages and modules and fails when a Hebrew string has no
   entry here, so a copy edit cannot silently ship untranslated. */
if (typeof PC !== 'undefined' && PC.i18n) PC.i18n.reg({

  /* ---------- page title and header ---------- */
  'PRE-CALL · תסריט שאלות לשיחת אפיון': 'PRE-CALL · Question script for the discovery call',
  'בונה תסריט שאלות לשיחת האפיון, לפני שאתם כותבים הצעת מחיר':
    'Builds the question script for the discovery call, before you write a pricing proposal',
  'ההצעה לא נתקעת בכתיבה. היא נתקעת בזה שיצאתם מהשיחה בלי המספרים שאתם צריכים כדי לכתוב אותה. הכלי הזה מייצר את השאלות שמוציאות אותם, ואת כרטיס הקריאה למה שתשמעו.':
    'The proposal does not get stuck in the writing. It gets stuck because you left the call without the numbers you need to write it. This tool produces the questions that extract them, and the reading card for what you will hear.',

  /* ---------- step bar ---------- */
  'שלב 1': 'Step 1',
  'הפרופיל העסקי': 'The business profile',
  'שלב 2': 'Step 2',
  'הצד השני': 'The other side',
  'שלב 3': 'Step 3',
  'התסריט': 'The script',

  /* ---------- step 1 · the business profile ---------- */
  'שלב 1 · הפרופיל העסקי': 'Step 1 · The business profile',
  'ממלאים פעם אחת — נשמר בדפדפן הזה ומשמש כל שיחה. ארבעה שדות מספיקים לתסריט חד; שדות ריקים לא שוברים כלום, הם רק מכהים אותו.':
    'Fill it in once — it is saved in this browser and serves every call. Four fields are enough for a sharp script; empty fields break nothing, they only dull it.',
  'הפרופיל': 'The profile',
  '✓ נשמר בדפדפן': '✓ Saved in the browser',
  'מה אתם מוכרים, במילים שלכם': 'What you sell, in your own words',
  'משפט אחד. לא סלוגן.': 'One sentence. Not a slogan.',
  'למשל: מסדר תהליכי גבייה לעסקים קטנים': 'e.g.: sorts out collections processes for small businesses',
  'למי': 'To whom',
  'הקהל שבפועל שילם, לא הקהל שאתם רוצים.': 'The audience that actually paid, not the audience you want.',
  'למשל: משרדי רו״ח עד 10 עובדים': 'e.g.: accounting firms of up to 10 employees',
  'מה הלקוח האחרון הרוויח מזה, במספר': 'What the last client gained from it, as a number',
  'התחילו במספר או בטווח, ואז הקשר קצר אם צריך. זה נכנס ישירות למשפט העוגן בשיחה — בלעדיו שאלה 11 נשארת עם סוגריים ריקים.':
    'Start with a number or a range, then brief context if needed. It goes straight into the anchor sentence of the call — without it, question 11 is left with empty brackets.',
  'למשל: כ-40,000 ₪ תזרים, אחרי שקיצר את זמן הגבייה מ-60 ל-25 יום':
    'e.g.: ~40,000 ₪ in cash flow, after cutting collection time from 60 to 25 days',
  'מה רק אתם רואים אצל הלקוחות שלכם, שאחרים לא רואים': 'What only you see in your clients, that others do not',
  'זה מה שהופך את שאלת הבעלות בשיחה למדויקת. שתיים או שלוש שורות.':
    'This is what makes the ownership question in the call precise. Two or three lines.',
  'למשל: שהבעיה אף פעם לא בתוכנה, היא בזה שאף אחד לא הוגדר כאחראי על המעקב':
    'e.g.: that the problem is never the software — it is that nobody was made owner of the follow-up',
  'עוד חמישה שדות שמחדדים את התסריט': 'Five more fields that sharpen the script',
  'היחידה התחומה שלכם, אם יש': 'Your bounded unit, if you have one',
  'פורמט + תוצר. אם אין, השאירו ריק. זה משנה את התסריט.':
    'Format + deliverable. If you have none, leave it empty. It changes the script.',
  'למשל: 3 מפגשים, יוצא מהם נוהל גבייה כתוב': 'e.g.: 3 sessions, producing a written collections procedure',
  'מחיר היחידה, אם יש': 'The unit price, if there is one',
  'הרצפה הפנימית שלכם. לא נאמרת בשיחה, רק תזכורת לכם לפני שאלה 11.':
    'Your internal floor. Never said in the call — a reminder to you before question 11.',
  'למשל: 6,500 ₪': 'e.g.: 6,500 ₪',
  'העסקה האחרונה, סכום': 'The last deal, amount',
  'לא נכנס לשיחה בקול, רק לכיול הפנימי שלכם מול מה שהרוויח.':
    'Never said out loud in the call — only for calibrating yourself against what the client gained.',
  'למשל: 8,000 ₪': 'e.g.: 8,000 ₪',
  'איך הלקוח האחרון הגיע אליכם': 'How the last client got to you',
  'בחרו': 'Choose',
  'הפניה או היכרות אישית': 'a referral or a personal introduction',
  'מהתוכן שאני מפרסם': 'from the content I publish',
  'מפנייה יזומה שלי': 'from my own outreach',
  'אחר': 'other',
  'מה אתם לא מוכרים': 'What you do not sell',
  'הגבול. מונע מכם להגיד כן בשיחה למשהו שתתחרטו עליו.':
    'The boundary. It keeps you from saying yes in the call to something you will regret.',
  'למשל: לא מפעיל את התהליך במקומם, לא ליווי חודשי':
    'e.g.: I do not run the process for them, no monthly retainer',
  'מחק פרופיל שמור מהדפדפן הזה': 'Delete the saved profile from this browser',
  'נמחק': 'Deleted',

  /* ---------- step 1 · the AI helper ---------- */
  'מילוי מהיר עם AI · במקום להקליד': 'Quick fill with AI · instead of typing',
  'פרומפט לאפיון העסק': 'Business-profiling prompt',
  'העתק פרומפט': 'Copy prompt',
  'הועתק': 'Copied',
  'הריצו אותו ב-Claude או ב-ChatGPT, והדביקו כאן את מה שחזר':
    'Run it in Claude or ChatGPT, and paste what comes back here',
  'הכלי יחלץ את השדות לבד וימלא את הטופס למעלה.':
    'The tool extracts the fields on its own and fills the form above.',
  'הדביקו כאן...': 'Paste here...',
  'חלץ שדות מההדבקה': 'Extract fields from the paste',
  'המשך לצד השני': 'Continue to the other side',

  /* ---------- step 2 · the other side ---------- */
  'שלב 2 · הצד השני': 'Step 2 · The other side',
  'שתי דרכים. מהירה, או מעמיקה. הפרטים כאן משנים את הניסוח של השאלות, לא את המבנה.':
    'Two ways in: quick, or deep. The details here change the wording of the questions, not the structure.',
  'שיחה חדשה · נקה פרטי לקוח קודם': "New call · clear the previous client's details",
  'אם זו הכנה לשיחה עם מישהו אחר, לחצו כאן קודם — אחרת פרטים מהשיחה הקודמת עלולים להישאר בטופס.':
    'If you are preparing for a call with somebody else, press this first — otherwise details from the previous call may linger in the form.',
  'מסלול מהיר · הדבקת פרופיל': 'Quick track · paste a profile',
  'הדביקו את הכותרת, ה-About והתפקידים מהפרופיל שלו בלינקדאין, או כל טקסט ציבורי עליו':
    'Paste the headline, About and roles from his LinkedIn profile, or any public text about him',
  'אתר, פוסט, דף שירותים. כל דבר שהוא כתב על עצמו.':
    'A website, a post, a services page. Anything he wrote about himself.',
  'מסלול מעמיק · פרומפט ל-Deep Research': 'Deep track · a Deep Research prompt',
  'מלאו את שני השדות למטה, ואז העתיקו את הפרומפט והריצו אותו במחקר מעמיק. את הפלט הדביקו בתיבה למעלה.':
    'Fill in the two fields below, then copy the prompt and run it in deep research. Paste the output into the box above.',
  'שם': 'Name',
  'שם מלא': 'Full name',
  'העסק או התפקיד': 'The business or the role',
  'שם החברה או התחום': 'Company name or field',
  'פרומפט למחקר מעמיק על הצד השני': 'Deep-research prompt about the other side',
  'העתק פרומפט מחקר': 'Copy research prompt',
  'מה שכבר ידוע לכם': 'What you already know',
  'יש טריגר ידוע': 'There is a known trigger',
  'אירוע שקרה לאחרונה ובגללו הוא מחפש עכשיו.': 'An event that happened recently and is why he is looking now.',
  'למשל: איבד לקוח גדול בחודש שעבר': 'e.g.: lost a major client last month',
  'איך הגעתם זה לזה': 'How you reached each other',
  'הוא פנה אליי': 'He approached me',
  'אני פניתי אליו': 'I approached him',
  'הפניה משלישי': 'A referral from a third party',
  'שניים או שלושה, יחיד או צמד': 'One person or a pair — who is on the call',
  'אדם אחד': 'One person',
  'שניים או יותר בשיחה': 'Two or more on the call',
  'המשפט שתגידו בשאלה 10': 'The sentence you will say in question 10',
  'שאלה 10 בודקת מי מחזיק את הבעיה, והיא עובדת רק אם קודם אמרתם לו משפט שהוא יכול לדחות. נסחו אותו עכשיו — בשיחה עצמה אין קשב פנוי לנסח.':
    'Question 10 tests who holds the problem, and it works only if you first said a sentence he can reject. Write it now — during the call itself there is no spare attention for composing.',
  'משפט אחד עליו, בגוף שני, מעט לא מדויק בכוונה':
    'One sentence about him, in the second person, slightly off on purpose',
  'אם תשאירו ריק, התסריט יבקש מכם לנסח אותו בזמן השיחה, והוא יגיד את זה במפורש.':
    'If you leave it empty, the script will ask you to compose it during the call, and it will say so explicitly.',
  'למשל: אני מנחש שאצלכם אף אחד לא באמת מוגדר כאחראי על המעקב, ולכן זה חוזר אליך':
    'e.g.: my guess is that nobody on your side actually owns the follow-up, so it keeps landing back on you',
  'בנה את התסריט': 'Build the script',

  /* ---------- step 3 · the script page chrome ---------- */
  'מצב שיחה · רק מה שאומרים': 'Call mode · only what you say',
  'העתק את התסריט כטקסט': 'Copy the script as text',
  'הדפסה או PDF': 'Print or PDF',
  'חזרה לעריכה': 'Back to editing',
  'תזכורת ליומן לשיחה הזאת': 'A calendar reminder for this call',
  'אירוע אחד ביומן שלכם עם שתי תזכורות: אחת חצי שעה לפני, ואחת <b>רבע שעה אחרי שהשיחה נגמרת</b> — לתמחר בעודה באוזניים. שם הלקוח נכתב בכותרת האירוע, כדי שהתזכורת תדע על מה היא.':
    "One event in your calendar with two reminders: one half an hour before, and one <b>fifteen minutes after the call ends</b> — to price while it is still in your ears. The client's name goes in the event title, so the reminder knows what it is about.",
  'תאריך': 'Date',
  'שעה': 'Time',
  'אורך בדקות': 'Length in minutes',
  'הורד קובץ יומן': 'Download calendar file',
  'יציאה ממצב שיחה': 'Exit call mode',
  'השיחה נגמרה · לכרטיס הקריאה': 'The call ended · to the reading card',
  'אחרי השיחה': 'After the call',
  'כשיש לכם את המספרים מהשיחה — התדירות, זמן הטיפול, התקלות — POST-CALL הופך אותם למחיר ולהצעה כתובה.':
    'Once you have the numbers from the call — the frequency, the handling time, the failures — POST-CALL turns them into a price and a written proposal.',
  'לתמחור ההצעה · POST-CALL': 'To pricing the proposal · POST-CALL',

  /* ---------- backup box ---------- */
  'גיבוי ושחזור': 'Backup and restore',
  'הפרופיל העסקי כאן, וגם פנקס העסקאות ב-POST-CALL, קיימים רק בדפדפן הזה. גיבוי הוא קובץ JSON קטן ששומרים אצלכם — לא נשלח לשום מקום.':
    'The business profile here, and the deal ledger in POST-CALL, exist only in this browser. A backup is a small JSON file you keep yourself — it is not sent anywhere.',
  'הורד גיבוי (JSON)': 'Download backup (JSON)',
  'טען גיבוי': 'Load backup',
  'בחר קובץ גיבוי': 'Choose a backup file',

  /* ---------- footer ---------- */
  'PRE-CALL · גרסה 0.1 · כלי הכנה לשיחה. אינו מייצר מחיר ואינו מייצר הצעה.':
    'PRE-CALL · version 0.1 · a call-preparation tool. It does not produce a price and it does not produce a proposal.',
  'כל הנתונים נשארים בדפדפן שלכם. שום דבר לא נשלח לשום שרת.':
    'All the data stays in your browser. Nothing is sent to any server.',
  'איך הכלי עובד ולמה — המסמך המלא': 'How the tool works and why — the full document',
  'פרטיות': 'Privacy',
  'דף הפתיחה': 'The entry page',
  'כבר הייתה לי השיחה — לתמחור': 'Already had the call — to pricing',
  '© 2026 ארז טל-שיר · כל הזכויות שמורות': '© 2026 Erez Tal-Shir · All rights reserved',

  /* ---------- pre-call-content.js · the two LLM prompts ----------
     The English business prompt mirrors the Hebrew one and pins the model
     to the fixed ENGLISH label format that parseBiz recognises alongside
     the Hebrew labels. Change a label here and the paste stops parsing —
     the labels are a format shared with assets/pre-call.js. */
  [`אני מכין את עצמי לשיחת אפיון עם לקוח פוטנציאלי, ואחריה אצטרך לכתוב לו הצעת מחיר.
לפני זה אני צריך לאפיין את העסק שלי עצמי, כדי שהשאלות שאשאל בשיחה יהיו מדויקות.

ראיין אותי. שאל אותי שאלה אחת בכל פעם, וחכה לתשובה לפני השאלה הבאה.
אל תציע לי תשובות. אם התשובה שלי כללית, בקש דוגמה אחת קונקרטית.

אלה הדברים שאתה צריך להוציא ממני:

1. מה אני מוכר, במשפט אחד ובמילים שלי. לא סלוגן.
2. למי מכרתי בפועל. לא הקהל שאני רוצה, הקהל ששילם.
3. האם יש לי יחידה תחומה, כלומר פורמט קבוע עם תוצר ומחיר, או שאני מתמחר כל פעם מחדש.
4. העסקה האחרונה שלי. כמה, ממי, ואיך הלקוח הזה הגיע אליי.
5. מה הלקוח האחרון הרוויח מזה, במספר. אם אני לא יודע, תעזור לי לאמוד את זה
   דרך מה שהשתנה אצלו: זמן שנחסך, כסף שנכנס, טעות שלא קרתה.
6. מה אני רואה אצל הלקוחות שלי שהם עצמם לא רואים. לא סיסמה, אבחנה.
   אם אני נותן תשובה כללית, בקש ממני לתאר מקרה אחד שבו זיהיתי את זה.
7. מה אני לא מוכר. איפה עובר הגבול.

בסוף, החזר לי את הפרופיל בפורמט הזה בדיוק, בלי טקסט נוסף לפניו או אחריו:

מה אני מוכר: ...
למי: ...
יחידה תחומה: ...
מחיר היחידה: ...
עסקה אחרונה: ...
מקור הלקוח האחרון: הפניה / תוכן / פנייה יזומה
מה הלקוח הרוויח: ...
מה רק אני רואה: ...
מה אני לא מוכר: ...`]:
`I am preparing for a discovery call with a prospective client, and afterwards I will need to write them a pricing proposal.
Before that I need to profile my own business, so that the questions I ask in the call are precise.

Interview me. Ask me one question at a time, and wait for my answer before the next question.
Do not suggest answers. If my answer is generic, ask for one concrete example.

These are the things you need to get out of me:

1. What I sell, in one sentence and in my own words. Not a slogan.
2. Who I have actually sold to. Not the audience I want — the audience that paid.
3. Whether I have a bounded unit, meaning a fixed format with a deliverable and a price, or I price from scratch every time.
4. My last deal. How much, from whom, and how that client got to me.
5. What the last client gained from it, as a number. If I do not know, help me estimate it
   through what changed for them: time saved, money in, a mistake that did not happen.
6. What I see in my clients that they do not see themselves. Not a slogan — an observation.
   If I give a generic answer, ask me to describe one case where I spotted it.
7. What I do not sell. Where the line is.

At the end, return my profile in exactly this format, with no extra text before or after it:

What I sell: ...
For whom: ...
Bounded unit: ...
Unit price: ...
Last deal: ...
Last client source: referral / content / outreach
What the client gained: ...
What only I see: ...
What I do not sell: ...`,

  [`מחקר הכנה לשיחת אפיון. הנושא: {who}

אני נפגש איתו בקרוב ואצטרך להבין איפה העסק שלו נעצר, לא מה הוא עושה.
חפש מקורות ציבוריים בלבד. אל תשער ואל תמלא פערים. מה שלא מצאת, כתוב "לא נמצא".

הוצא לי:

1. מה הוא אומר שהוא עושה, בציטוט מדויק מהמקור. ציין מאיפה.
2. פער בין איך הוא מתאר לקוח לבין איך הוא מתאר את עצמו, אם קיים.
3. מה מפורסם החוצה בשמו. תוכן, אתר, הרצאה, המלצה, מוצר. מתי פורסם לאחרונה.
4. סימנים לשינוי בשנה האחרונה. תפקיד חדש, גיוס, סגירה, מעבר, השקה, פרסום חריג.
5. איך נראה שלקוחות מגיעים אליו. הפניות, תוכן, פנייה יזומה, או שלא ברור.
6. האם יש עדות למחיר או ליחידה תחומה שהוא מוכר, ובאיזה ניסוח.
7. שלושה דברים שהוא לא אומר על עצמו ושהיה סביר שיאמר, בהינתן התחום שלו.

בסוף, תן לי שלוש שורות בלבד:
הצוואר הסביר ביותר: ...
מה שכנגדו: ...
מה שאני לא יכול לדעת בלי לשאול: ...`]:
`Preparation research for a discovery call. The subject: {who}

I am meeting him soon and will need to understand where his business is stuck, not what he does.
Search public sources only. Do not speculate and do not fill gaps. Whatever you did not find, write "not found".

Get me:

1. What he says he does, quoted exactly from the source. Say where it is from.
2. A gap between how he describes a client and how he describes himself, if one exists.
3. What is published under his name. Content, a website, a talk, a testimonial, a product. When it was last published.
4. Signs of change in the past year. A new role, hiring, a shutdown, a move, a launch, unusual publicity.
5. How clients appear to reach him. Referrals, content, outreach, or unclear.
6. Whether there is evidence of a price or of a bounded unit he sells, and in what wording.
7. Three things he does not say about himself that he plausibly would, given his field.

At the end, give me three lines only:
The most likely bottleneck: ...
The case against it: ...
What I cannot know without asking: ...`,

  '[שם] , [חברה]': '[name] , [company]',

  /* ---------- pre-call.js · calendar download ---------- */
  'חסר תאריך, שעה או אורך — בלעדיהם אין לאירוע מתי, ולא נוצר קובץ.':
    'Missing a date, a time, or a length — without them the event has no when, and no file was created.',
  'הקובץ ירד. פתחו אותו והאירוע ייכנס ליומן עם שתי התזכורות.':
    'The file is downloaded. Open it and the event enters your calendar with both reminders.',

  /* ---------- pre-call.js · step-2 reference line ---------- */
  'האבחנה הכללית שלכם, לגזור ממנה: "{edge}"':
    'Your general observation, to derive from: "{edge}"',
  'לא מילאתם "מה רק אתם רואים אצל הלקוחות שלכם" בשלב 1. בלי זה אין ממה לגזור את המשפט.':
    'You did not fill in "What only you see in your clients" in step 1. Without it there is nothing to derive the sentence from.',

  /* ---------- pre-call.js · error boundary, flash, storage ---------- */
  'חילוץ השדות מההדבקה': 'Extracting the fields from the paste',
  'בניית התסריט': 'Building the script',
  '{names} נכשל.': '{names} failed.',
  'שאר הכלי ממשיך לעבוד, והנתונים ששמרת לא נפגעו. רענון הדף בדרך כלל פותר את זה; אם לא, פתח את הקונסולה — הפירוט שם.':
    'The rest of the tool keeps working, and the data you saved is intact. Refreshing the page usually fixes this; if not, open the console — the details are there.',
  'כללי': 'General',
  'ההעתקה נכשלה — סמנו והעתיקו ידנית': 'Copy failed — select the text and copy manually',
  'הדפדפן חוסם שמירה — הפרופיל לא יישמר לפעם הבאה':
    'The browser is blocking storage — the profile will not survive to next time',
  'חסר השדה "מה אתם מוכרים". בלעדיו התסריט יוצא כללי, ואז הוא לא שווה יותר מרשימת שאלות באינטרנט.':
    'The "What you sell" field is missing. Without it the script comes out generic, and then it is worth no more than a list of questions off the internet.',

  /* ---------- pre-call.js · private notes and empty state ---------- */
  'לעיניכם בלבד': 'For your eyes only',
  'לא נכלל בהעתקה ולא בהדפסה. אלה המספרים שלכם, לא של השיחה.':
    "Not included when copying or printing. These are your numbers, not the call's.",
  'עוד לא נבנה תסריט.': 'No script has been built yet.',
  'מלאו את שלב 1, ואז לחצו "בנה את התסריט" בשלב 2.':
    'Fill in step 1, then press "Build the script" in step 2.',

  /* ---------- pre-call.js · source labels (sentence-embedded) ---------- */
  'התוכן שאתם מפרסמים': 'the content you publish',
  'פנייה יזומה שלכם': 'your own outreach',
  'ערוץ אחר': 'another channel',

  /* ---------- pre-call.js · the anchor sentence, three ways ---------- */
  'אצל לקוח שעבדתי איתו במצב דומה, הפער הזה היה שווה בערך {gain}. אצלך זה יותר או פחות?':
    'For a client I worked with in a similar situation, this gap was worth roughly {gain}. For you, is it more or less?',
  'לקוח שעבדתי איתו במצב דומה — {gain}. אצלך זה דומה, פחות, או יותר?':
    'A client I worked with in a similar situation — {gain}. For you, is it similar, less, or more?',
  'אצל לקוח שעבדתי איתו במצב דומה, הפער הזה היה שווה בערך [כאן נכנס המספר מהעסקה האחרונה שלכם]. אצלך זה יותר או פחות?':
    "For a client I worked with in a similar situation, this gap was worth roughly [your last deal's number goes here]. For you, is it more or less?",

  /* ---------- pre-call.js · the ownership move ---------- */
  'אמרו לו את המשפט שהכנתם, ואז שאלו:': 'Say the sentence you prepared, then ask:',
  'מה שאתם רואים אצל לקוחות כאלה, והם עצמם לא: "{edge}" — זו אבחנה כללית שלכם, לא עובדה עליו. נסחו ממנה משפט אחד עליו, בגוף שני, מעט לא מדויק בכוונה. ואז שאלו:':
    'What you see in clients like this, and they themselves do not: "{edge}" — that is your general observation, not a fact about him. Turn it into one sentence about him, in the second person, slightly off on purpose. Then ask:',
  'המשפט הזה לא הוכן.': 'This sentence was not prepared.',
  'ניסוח בזמן השיחה הוא מה שנשמע כמו קריאה מדף. חזרו לשלב 2, לשדה "המשפט שתגידו בשאלה 10", ונסחו אותו לפני שאתם מתקשרים.':
    'Composing it during the call is what sounds like reading off a page. Go back to step 2, to "The sentence you will say in question 10", and write it before you dial.',
  'נסחו לו את הצוואר שלו במשפט אחד, מעט לא מדויק בכוונה, ואז שאלו:':
    'Phrase his bottleneck for him in one sentence, slightly off on purpose, then ask:',
  'אין ממה לנסח את המשפט.': 'There is nothing to build the sentence from.',
  'מלאו את "מה רק אתם רואים" בשלב 1, ואז את המשפט עצמו בשלב 2. בלי שניהם שאלה 10 מבקשת מכם להמציא ניסוח באוויר, מול אדם שמחכה.':
    'Fill in "What only you see" in step 1, then the sentence itself in step 2. Without both, question 10 asks you to improvise phrasing out of thin air, in front of a person who is waiting.',

  /* ---------- pre-call.js · contextual openers ---------- */
  'הוא פנה אליכם. אל תסבירו מה אתם עושים. פתחו בשאלה, ותנו לו לתאר למה פנה.':
    'He approached you. Do not explain what you do. Open with a question and let him describe why he reached out.',
  'אתם פניתם אליו. תנו משפט אחד על למה פניתם דווקא אליו, ומיד עברו לשאלה. לא הצגה עצמית ארוכה.':
    'You approached him. Give one sentence on why you reached out to him specifically, then go straight to the question. No long self-introduction.',
  'הגעתם דרך הפניה. שאלו קודם מה נאמר לו עליכם. זה מגלה איזו ציפייה כבר נבנתה.':
    'You came through a referral. First ask what he was told about you. That reveals what expectation has already been built.',
  'יש טריגר ידוע: {trig}. אל תזכירו אותו ראשונים. חכו לראות אם הוא מעלה אותו בשאלה 3.':
    'There is a known trigger: {trig}. Do not mention it first. Wait to see whether he brings it up in question 3.',
  'שניים בשיחה. בשאלת הבעלות, בקשו תשובה מכל אחד בנפרד. אם ענו שונה, ההצעה מותנית בסבב שני עם שניהם.':
    'Two people on the call. On the ownership question, ask each of them to answer separately. If they answer differently, the proposal is conditional on a second round with both.',
  'יש לכם טקסט ציבורי עליו. השוו בשאלה 6 בין מה שהוא כתב על עצמו למה שהוא אומר עכשיו. הפער הוא הסימן.':
    'You have public text about him. In question 6, compare what he wrote about himself with what he says now. The gap is the signal.',
  'אין לכם יחידה תחומה. שימו לב לשאלה 8. אם גם לו אין, השיחה הזאת עוסקת בבניית יחידה, לא בהצעה רחבה.':
    'You have no bounded unit. Watch question 8. If he has none either, this call is about building a unit, not about a broad proposal.',
  'בפנקס שלכם עסקה אחת שבה ירדתם במחיר לפני שהלקוח ביקש. שאלה 12 היא המקום שזה מתחיל בו — החליטו עכשיו מה לא תיתנו, לפני שהוא שואל.':
    'Your ledger holds one deal where you dropped the price before the client asked. Question 12 is where that starts — decide now what you will not give, before he asks.',
  'בפנקס שלכם {n} עסקאות שבהן ירדתם במחיר לפני שהלקוח ביקש. שאלה 12 היא המקום שזה מתחיל בו — החליטו עכשיו מה לא תיתנו, לפני שהוא שואל.':
    'Your ledger holds {n} deals where you dropped the price before the client asked. Question 12 is where that starts — decide now what you will not give, before he asks.',
  '{n} העסקאות שסגרתם נסגרו במחיר שנקבתם, ואף אחת לא ירדה — כלומר לא בדקתם את התקרה שלכם. בשאלה 11 נקבו במספר גבוה מהאחרון, ותקשיבו לתשובה.':
    'All {n} deals you closed went at the price you named, and none came down — meaning you have not tested your ceiling. In question 11, name a number higher than your last, and listen to the answer.',
  'יש בפנקס הצעות, אבל אף אחת לא נסגרה — כלומר אין לכם מספר משלכם לעוגן. בשאלות 2 ו-8 תשמעו את המספרים שלו — הם עדיפים על אומדן שלכם.':
    'The ledger holds proposals, but none has closed — meaning you have no number of your own for the anchor. In questions 2 and 8 you will hear his numbers — they beat your estimate.',
  'הלקוח האחרון שלכם הגיע דרך {src}. בשאלה 5 תשמעו מאיפה הגיע הלקוח שלו — אם זה ערוץ אחר משלכם, זה סימן שהערוץ ששכנע אתכם לא בהכרח ישכנע אותו.':
    'Your last client came through {src}. In question 5 you will hear where his client came from — if it is a different channel than yours, that is a sign the channel that convinced you will not necessarily convince him.',

  /* ---------- pre-call.js · private calibration notes ---------- */
  'העסקה האחרונה שלכם: {last}. הרווח שהערכתם אצל הלקוח: {gain}. היחס הזה הוא הכיול שלכם בראש לפני שאלה 11.':
    'Your last deal: {last}. The gain you estimated for the client: {gain}. That ratio is the calibration to hold in your head before question 11.',
  'העסקה האחרונה שלכם: {last}.': 'Your last deal: {last}.',
  'מחיר היחידה שלכם: {price}. רצפה פנימית למה שכדאי בכלל להמשיך אליו.':
    'Your unit price: {price}. An internal floor for what is worth pursuing at all.',

  /* ---------- pre-call.js · the rendered script ---------- */
  'תסריט שיחת אפיון · {name}': 'Discovery-call script · {name}',
  'הוכן {date}': 'Prepared {date}',
  'משך מוערך 25 עד 35 דקות. סדר השאלות הוא חלק מהכלי. אל תדלגו קדימה.':
    'Estimated length 25 to 35 minutes. The order of the questions is part of the tool. Do not skip ahead.',
  'לפני שמתחילים': 'Before you start',

  'חלק א · 7 דקות': 'Part A · 7 minutes',
  'האם יש כאן בכלל עסקה': 'Is there even a deal here',
  'שלוש השאלות האלה קובעות אם שווה להמשיך. אם שתיים מהן נופלות, אין הצעה בסוף השיחה, ועדיף לדעת את זה עכשיו ולא אחרי שכתבתם מסמך.':
    'These three questions decide whether it is worth continuing. If two of them fall, there is no proposal at the end of this call — better to know now than after you have written a document.',
  'מה אתה צריך ממני?': 'What do you need from me?',
  'הפתיחה. אל תמלאו את השקט. מה שהוא אומר ראשון הוא מה שהוא באמת בא בשבילו.':
    'The opener. Do not fill the silence. Whatever he says first is what he actually came for.',
  'מתי בפעם האחרונה מישהו העביר לך כסף על זה. מתי, כמה, ממי.':
    'When was the last time somebody paid you money for this? When, how much, from whom?',
  'אתם מחפשים מספר וזהות. "היה לי פעם", "פרו בונו", "התנסות" זה לא מספר. אז שאלו: וכמה לקוחות משלמים יש לך עכשיו.':
    'You are listening for a number and a name. "I once had", "pro bono", "a pilot" is not a number. Then ask: and how many paying clients do you have right now?',
  'מה קרה לאחרונה שגרם לך לחפש פתרון דווקא עכשיו?':
    'What happened recently that made you look for a solution right now?',
  'בלי אירוע ספציפי אין דחיפות, ובלי דחיפות ההצעה תישאר פתוחה חודשים.':
    'No specific event means no urgency, and without urgency the proposal will sit open for months.',
  'בעוד שנה מהיום, איפה אתה רואה את עצמך?': 'A year from today, where do you see yourself?',
  'תשובה שמכילה משרה, ביטחון או "אחרי שאתבסס" מסמנת שהמטרה היא עבודה ולא עסק. תשובה שמכילה לקוחות, מחזור או מוצר, ממשיכים.':
    'An answer with a job, security, or "once I am established" signals the goal is employment, not a business. An answer with clients, revenue, or a product — keep going.',
  'עצירה.': 'Stop.',
  'ממשיכים רק כשיש שלושה יחד: לקוחות משלמים בהווה, אירוע שקרה, ויעד עסקי. שניים מתוך שלושה זה שיחת המשך בעוד חודשיים, לא הצעה.':
    'Continue only when all three are present: paying clients today, an event that happened, and a business goal. Two out of three means a follow-up call in two months, not a proposal.',

  'חלק ב · 12 דקות': 'Part B · 12 minutes',
  'איפה בדיוק זה נעצר אצלו': 'Where exactly it stalls for him',
  'חמש שאלות, בסדר הזה. הן חותכות בין חמש סיבות שונות לכך שעסק לא זז. הכרטיס בסוף המסמך מתרגם את התשובות.':
    'Five questions, in this order. They cut between five different reasons a business is not moving. The card at the end of this document translates the answers.',
  'מאיפה הגיע הלקוח האחרון שלך?': 'Where did your last client come from?',
  'הפניה, תוכן, או פנייה יזומה. שלוש תשובות, שלושה מסלולים שונים.':
    'Referral, content, or outreach. Three answers, three different tracks.',
  'מה מפורסם היום בחוץ שמתאר את מה שאתה עושה?':
    'What is out there today, published, that describes what you do?',
  '"כלום" זו תשובה משמעותית. "יש, אבל זה כללי" זו תשובה אחרת לגמרי.':
    '"Nothing" is a meaningful answer. "There is, but it is generic" is a completely different one.',
  'כמה שעות בשבוע הולכות לפנייה יזומה, ומתי הן ביומן?':
    'How many hours a week go to outreach, and where do they sit in your calendar?',
  'שאלו על היומן, לא על הכוונה. "אני משתדל" זה אפס.':
    'Ask about the calendar, not the intention. "I try to" means zero.',
  'כשלקוח שואל כמה זה עולה, מה אתה עונה לו?':
    'When a client asks how much it costs, what do you tell them?',
  'תעריף שעה, "תלוי", או "אני לא כל כך מבין בזה" מסמנים שאין לו יחידה. זו הסיבה השכיחה ביותר.':
    'An hourly rate, "it depends", or "I am not really good at that part" all signal he has no unit. This is the most common cause.',
  'הלקוח האחרון שסיים, מה קרה אחרי?': 'Your last client who finished — what happened after?',
  'רק אם יש לו לקוחות שסיימו. "עבר לעשות לבד" או "התשלום נגרר" הם סימן נפרד.':
    'Only if he has clients who finished. "Went on to do it himself" or "the payment dragged" is a separate signal.',
  'אם שתי סיבות מתחרות, רשמו ראשית ומשנית. אל תמזגו אותן להצעה אחת רחבה.':
    'If two causes compete, write down primary and secondary. Do not merge them into one broad proposal.',

  'חלק ג · מהלך אחד': 'Part C · one move',
  'מי מנסח את הבעיה': 'Who phrases the problem',
  'זה נשמע לך מדויק, או שאתה היית מנסח אחרת?':
    'Does that sound accurate to you, or would you put it differently?',
  'בקשו אישור על אבחנה, לא על כיוון. "הכיוון בסדר?" מקבל "כן" ומעביר נושא.':
    'Ask for confirmation of a diagnosis, not a direction. "Is the direction okay?" gets a "yes" and a change of subject.',
  'מה שהוא עושה': 'What he does',
  'מה זה אומר': 'What it means',
  'מה מותר להציע': 'What you may offer',
  'מנסח מחדש בשפתו ומוסיף חומר': 'Rephrases it in his own words and adds material',
  'הוא הבעלים של הבעיה': 'He owns the problem',
  'תהליך מלא': 'A full process',
  'דוחה ומחדד גרסה משלו': 'Rejects it and sharpens a version of his own',
  'יש בעלות, הניסוח שלכם החטיא': 'Ownership is there — your phrasing missed',
  'תהליך שמתחיל מהניסוח שלו': 'A process that starts from his phrasing',
  'מהנהן, "כן", "נכון"': 'Nods, "yes", "right"',
  'הוא לא אוחז בבעיה': 'He is not holding the problem',
  'לא תהליך. מפגש בודד או שיחת המשך.': 'Not a process. A single session or a follow-up call.',

  'חלק ד · הנעילה': 'Part D · the lock',
  'המספר, ומי מחזיק אותו': 'The number, and who holds it',
  'אל תשאלו "כמה זה שווה לך לדעתך". השאלה הזו מייצרת "אני לא יודע" כמעט תמיד, ואז הלחץ נשאר בחדר. תנו עוגן שהוא מכייל.':
    'Do not ask "what do you think this is worth to you". That question produces "I do not know" almost every time, and the pressure stays in the room. Give an anchor he calibrates.',
  'הוא מכייל מספר קיים במקום לייצר מאפס. אם הוא אומר "פחות", בקשו כמה פחות. זה עדיין מספר שלו.':
    'He calibrates an existing number instead of producing one from zero. If he says "less", ask how much less. That is still his number.',
  'אין לכם מספר לעוגן.': 'You have no number for the anchor.',
  'שאלה 11 מכילה סוגריים במקום סכום, ולכן היא מבקשת מכם להמציא מספר בזמן השיחה — וזה המספר שכל ההצעה נגזרת ממנו. מלאו "מה הלקוח האחרון הרוויח" בשלב 1.':
    'Question 11 carries brackets instead of an amount, so it asks you to invent a number during the call — and that is the number the whole proposal derives from. Fill in "What the last client gained" in step 1.',
  'עד מתי, ואיזה מספר קונקרטי צריך לזוז כדי שתגיד שזה היה שווה?':
    'By when, and which concrete number has to move for you to say this was worth it?',
  'זו הנעילה. חסר תאריך או חסר מספר, לא עוברים לדבר על מחיר.':
    'This is the lock. Missing a date or missing a number — you do not move on to price.',
  'הכלל.': 'The rule.',
  'אם בסוף החלק הזה אין מספר שהוא אמר, אין מחיר בשיחה הזאת. שלחו את ההצעה אחרי שהוא נקב, לא לפני.':
    'If this part ends without a number he said, there is no price in this call. Send the proposal after he names one, not before.',

  /* ---------- pre-call.js · the reading card ---------- */
  'כרטיס קריאה · חמש הסיבות': 'Reading card · the five causes',
  'מצאו את השורה שמתאימה לתשובות בחלק ב. העמודה האחרונה היא מה שלא לכתוב בהצעה, גם אם מתחשק.':
    'Find the row that matches the answers from part B. The last column is what not to write in the proposal, even when you are tempted.',
  'אם שמעתם': 'If you heard',
  'מה נעצר': 'What is stuck',
  'מה ההצעה מכילה': 'What the proposal contains',
  'מה לא להציע': 'What not to offer',
  'שאלה 8: תעריף שעה או "תלוי"': 'Question 8: an hourly rate or "it depends"',
  'אין לו יחידה מתומחרת': 'He has no priced unit',
  'בניית יחידה אחת. פורמט, תוצר, מחיר, רציונל.': 'Building one unit. Format, deliverable, price, rationale.',
  'תמחור לפי ערך לפני שיש יחידה. תפריט אפשרויות.': 'Value-based pricing before a unit exists. A menu of options.',
  'שאלה 5 "מהתוכן" + שאלה 6 "יש אבל כללי"': 'Question 5 "from content" + question 6 "there is, but generic"',
  'הערוץ לא נושא את הערך': 'The channel does not carry the value',
  'העברת האבחון שהוא כבר עושה בשיחה, אל תוך הערוץ. תוצר ספיר.':
    'Moving the diagnosis he already does in conversation into the channel. A countable deliverable.',
  'תוכנית תוכן. שיפור פוסטים.': 'A content plan. Better posts.',
  'שאלה 6 "כלום" + שאלה 5 "היכרות"': 'Question 6 "nothing" + question 5 "a personal contact"',
  'שום דבר לא יוצא החוצה': 'Nothing goes out the door',
  'הוצאה של נכס אחד קיים, בשבוע. עם נמען מוגדר.':
    'Shipping one existing asset, within a week. With a named recipient.',
  'בניית מוצר חדש. תיק עבודות. הוא לא צריך עוד נכס.':
    'Building a new product. A portfolio. He does not need another asset.',
  'שאלה 7 "אין שעות" ויש לו נכסים': 'Question 7 "no hours" while assets exist',
  'הקשב לא מוקצה לרכישה': 'No attention is allocated to acquisition',
  'שעה קבועה, רשימה תחומה, מדד שבועי אחד.': 'A fixed hour, a bounded list, one weekly metric.',
  'אסטרטגיה. מיצוב. זה לא הצוואר שלו.': 'Strategy. Positioning. That is not his bottleneck.',
  'שאלה 9 "עבר לעשות לבד" או "נגרר"': 'Question 9 "went on alone" or "it dragged"',
  'אין ניסוח למה עדיין צריך אותו': 'No phrasing of why he is still needed',
  'שלב שני שהוא לא המשך של הראשון, עם קריטריון סיום כתוב.':
    'A second stage that is not a continuation of the first, with a written completion criterion.',
  'ליווי חודשי. הרחבת סקופ. הבעיה היא הגבול.':
    'A monthly retainer. Scope expansion. The problem is the boundary.',

  /* ---------- pre-call.js · proposal-writing rules ---------- */
  'שלושה כללים לכתיבת ההצעה': 'Three rules for writing the proposal',
  'המספר בהצעה נגזר מהעוגן שהוא נקב בשאלה 11, לא מהשוק ולא משעות.':
    'The number in the proposal derives from the anchor he named in question 11 — not from the market, not from hours.',
  'אין הנחה יזומה. אם צריך להוריד, מורידים סקופ ולא מחיר.':
    'No unprompted discount. If something has to come down, cut scope, not price.',
  'הגבול שהגדרתם: {no}. אם ההצעה חורגת ממנו, זו כבר לא ההצעה שלכם.':
    'The boundary you set: {no}. If the proposal crosses it, it is no longer your proposal.',

  /* ---------- pre-call.js · backup / restore ---------- */
  'לא הצלחתי לקרוא את הקובץ': 'Could not read the file',
  'הקובץ לא נראה כמו גיבוי תקין מהכלי הזה': 'That file does not look like a valid backup from this tool',
  'זה ידרוס: {list}': 'This will overwrite: {list}',
  'תאריך לא ידוע': 'an unknown date',
  'לשחזר גיבוי מ-{date}?': 'Restore the backup from {date}?',
  'שוחזר. טוען מחדש...': 'Restored. Reloading...'
});
