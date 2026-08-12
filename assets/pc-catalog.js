/* ============================================================
   POST-CALL · the catalog — everything the tool knows before you type.

   No DOM in this file, on purpose: the scope list and the templates are the
   product's actual content, and content that can only be checked by clicking
   through a browser does not get checked. Runs in Node, has its own tests.
   ============================================================ */
(function (root) {
  'use strict';

  const SYSTEMS = ['וואטסאפ','אימייל','גיליונות Google','Excel','CRM','חשבונית ירוקה / מורנינג',
                   'מערכת סליקה','אתר / טפסים','ERP','Monday / Asana','מערכת ייעודית','אחר'];

  const METHODS = {
    value:      { name: 'ערך / ROI',    hint: 'המחיר נגזר ממה שהתהליך עולה ללקוח בשנה. הכי חזק בשיחה, אבל דורש שהוא ייתן לך מספרים. אם הוא מנחש אותם, המחיר מנחש איתו.' },
    market:     { name: 'מחירון שוק',   hint: 'המחיר לפי טווח מקובל לעבודה מהסוג הזה. תמיד זמין, לא דורש היסטוריה ולא מספרים מהלקוח. חלש כשהעבודה חריגה.' },
    cost:       { name: 'עלות + מרווח', hint: 'אומדן השעות שלך × התעריף שלך, ועוד מרווח. הכי בטוח מבחינתך, אבל תקוע על הוותק שלך ולא על מה שהעבודה שווה.' },
    comparable: { name: 'עסקה דומה',    hint: 'מה שגבית על עבודה דומה, מותאם להיקף. מדויק כשבאמת עשית משהו דומה. דורש היסטוריה.' }
  };

  /* ---------- scope decisions ----------
     Boilerplate in/out lists look like they solve this and don't: the hard part
     is deciding, per job, what you are committing to. Each row carries a default
     and the reason behind it, so the work becomes confirming rather than
     composing. `extra` is a third state on purpose — most of what a beginner
     silently absorbs is sellable, not merely excludable.
     `when` hides rows that don't apply to the systems actually selected. */
  const SCOPE_ITEMS = [
    { id:'map',      t:'מיפוי התהליך הקיים ותיעוד שלו',                         d:'in' },
    { id:'build',    t:'בנייה והטמעה של האוטומציה בסביבת הלקוח',                 d:'in' },
    { id:'errors',   t:'טיפול בשגיאות והתראה כשתהליך נופל',                      d:'in',
      why:'בלי זה הלקוח מגלה תקלות מהלקוחות שלו, ומאשים אותך.' },
    { id:'test',     t:'בדיקה על נתונים אמיתיים לפני מעבר לייצור',                d:'in' },
    { id:'train',    t:'הדרכה אחת לצוות, עד שעה',                                d:'in',
      why:'תחום את זה למספר. "הדרכה" בלי גבול היא סעיף פתוח.' },
    { id:'support',  t:'שבועיים ליווי אחרי העלייה לאוויר',                        d:'in' },

    { id:'license',  t:'מנוי לכלי האוטומציה ועלות המשימות (tasks)',              d:'out',
      why:'אין תמחור משווק ואין תתי-חשבונות ללקוחות. עדיף שהחשבון יהיה על שם הלקוח ובכרטיס שלו.' },
    { id:'overage',  t:'חריגה ממכסת המשימות בשימוש בפועל',                       d:'out',
      why:'כל שלב נספר כמשימה. תהליך בן 5 שלבים צורך 5 בכל הרצה, והצריכה בפועל גבוהה מההערכה בכ-50%.' },
    { id:'premium',  t:'תוספת עלות לאפליקציות פרימיום בכלי האוטומציה',           d:'out',
      when:s=>['CRM','ERP','מערכת סליקה','מערכת ייעודית'].some(x=>s.has(x)),
      why:'מערכות כמו Salesforce, HubSpot ו-NetSuite דורשות מסלול יקר יותר. זו עלות של הלקוח, לא שלך.' },
    { id:'access',   t:'הרשאות, גישות ומשתמשי מערכת — באחריות הלקוח',            d:'out',
      why:'זה גם התלות שהכי מעכבת פרויקטים. כתוב את זה, ותוכל להצדיק דחייה בלוח הזמנים.' },
    { id:'cleanup',  t:'ניקוי או המרה של נתונים קיימים',                          d:'out',
      why:'כמעט תמיד מתגלה כעבודה בפני עצמה. אל תבלע אותה בפרויקט.' },
    { id:'edge',     t:'מקרי קצה שלא עלו במיפוי',                                d:'out',
      why:'זה הסעיף שמציל אותך. בלעדיו כל חריג הופך לוויכוח.' },
    { id:'redesign', t:'שינוי בתהליך העסקי עצמו',                                d:'out',
      why:'אתה מאטמט את מה שקיים. לעצב אותו מחדש זו עבודה אחרת.' },
    { id:'apichange',t:'התאמות בעקבות שינוי ב-API של ספק צד שלישי',              d:'out',
      why:'לא בשליטתך, וקורה. שייך לתחזוקה, לא לאחריות.' },
    { id:'newsys',   t:'הוספת מערכת שלא נכללה במיפוי',                            d:'out',
      why:'"רק עוד מערכת אחת" הוא הביטוי שמפוצץ פרויקטי אוטומציה.' },
    { id:'scale',    t:'גדילה מעבר לנפח שהוגדר בהצעה',                            d:'out' },

    { id:'maint',    t:'תחזוקה שוטפת אחרי תקופת הליווי',                          d:'extra',
      why:'זו ההכנסה החוזרת שלך. אל תוותר עליה בשקט — הצע אותה.' },
    { id:'monitor',  t:'ניטור חודשי ודוח תקלות',                                  d:'extra' },
    { id:'wa',       t:'אישור WhatsApp Business API מול ספק',                     d:'extra',
      when:s=>s.has('וואטסאפ'),
      why:'תהליך מול ספק חיצוני שלוקח זמן ולא תלוי בך. תמחר בנפרד או החרג.' }
  ];
  const SCOPE_LABEL = { in:'כלול', out:'לא כלול', extra:'בתוספת' };

  /* ---------- one-tap presets and example fills ----------
     Two different frictions. Closed/numeric fields cost a keyboard; presets cut
     that to one tap. Open fields cost composition, not typing — the blank page is
     the expense — so the example is offered as content that lands IN the field and
     gets edited, rather than as ghost placeholder text. */
  const PRESETS = {
    q_freq:     [5, 10, 20, 50, 100],
    q_minutes:  [3, 5, 10, 20, 45],
    q_err_freq: [1, 2, 5, 10],
    q_err_cost: [200, 500, 1000, 2500]
  };
  const EXAMPLES = {
    q_process: 'כל הזמנה שנכנסת בוואטסאפ מוקלדת ידנית לגיליון, ואז נפתחת חשבונית במערכת',
    q_trigger: 'בחודש שעבר פספסנו שתי הזמנות, ולקוח קבוע עבר למתחרה',
    q_prev:    'קנינו תוסף אבל אף אחד לא הטמיע אותו עד הסוף',
    q_success: 'שאף הזמנה לא תיפול בין הכיסאות'
  };

  /* ---------- templates ----------
     The time does not burn in typing. It burns in writing the scope and in
     deciding what to leave out — so a template that only filled in numbers
     would be answering the wrong question. Each one carries scope decisions
     for its vertical: which rows move out of the default position, and why
     that row in particular is the one that bites in this kind of job.

     Everything a template sets is a starting position, not an answer. The
     numbers are typical, not researched — they are there so a document exists
     within seconds and can be corrected against the client, which is a far
     better prompt than an empty field. `note` says that out loud on screen.

     `scope` holds only the deviations from the default. A template that
     restated all nineteen rows would drift from SCOPE_ITEMS the first time a
     row changed, and the test below asserts every id here still exists. */
  const TEMPLATES = [
    {
      id: 'orders',
      name: 'הזמנות מוואטסאפ לחשבונית',
      blurb: 'הזמנה נכנסת בהודעה, מישהו מקליד אותה ופותח חשבונית',
      systems: ['וואטסאפ','גיליונות Google','חשבונית ירוקה / מורנינג'],
      fields: {
        q_process: 'כל הזמנה שנכנסת בוואטסאפ מוקלדת ידנית לגיליון, ואז נפתחת חשבונית במערכת ונשלחת ללקוח.',
        q_success: 'שאף הזמנה לא תיפול בין הכיסאות, וכל חשבונית תצא באותו יום'
      },
      numbers: { q_freq: 20, q_freq_unit: '52', q_minutes: 7, q_err_freq: 3, q_err_cost: 400 },
      scope: {
        edge:      'extra',
        cleanup:   'extra',
        apichange: 'extra'
      },
      note: {
        moves: {
          edge:      'טקסט חופשי נכתב אחרת בכל פעם. החריגים הם עבודה שאפשר למכור.',
          cleanup:   'ההזמנות הישנות צריכות המרה לפני ההרצה הראשונה.',
          apichange: 'ספקי וואטסאפ משנים תדיר. עדיף תחזוקה מאשר ויכוח בעוד חצי שנה.'
        }
      }
    },
    {
      id: 'leads',
      name: 'לידים מהאתר ל-CRM',
      blurb: 'טופס באתר מגיע למייל, ומישהו מקליד ל-CRM ומשייך נציג',
      systems: ['אתר / טפסים','CRM','אימייל'],
      fields: {
        q_process: 'ליד שממלא טופס באתר מגיע למייל, מישהו מקליד אותו ל-CRM, משייך נציג ושולח מייל ראשון.',
        q_success: 'שכל ליד ייענה תוך שעה ולא יישאר בלי בעלים'
      },
      numbers: { q_freq: 40, q_freq_unit: '52', q_minutes: 4, q_err_freq: 5, q_err_cost: 900 },
      scope: {
        monitor: 'in',
        cleanup: 'extra'
      },
      note: {
        moves: {
          monitor: 'ליד שנופל בשקט לא מייצר תלונה. הניטור הוא ההוכחה שהתהליך עובד.',
          cleanup: 'ייבוא הרשימה הקיימת הוא עבודה בפני עצמה.'
        },
        watch: {
          premium: 'Salesforce ו-HubSpot דורשים מסלול יקר יותר. עלות חוזרת של הלקוח.'
        }
      }
    },
    {
      id: 'collect',
      name: 'גבייה ותזכורות תשלום',
      blurb: 'מישהו עובר על החשבוניות הפתוחות ושולח תזכורות ידנית',
      systems: ['חשבונית ירוקה / מורנינג','אימייל','וואטסאפ'],
      fields: {
        q_process: 'בסוף כל חודש מישהו מוציא דוח חשבוניות פתוחות, עובר עליהן אחת-אחת ושולח תזכורת במייל או בוואטסאפ.',
        q_success: 'שזמן הגבייה הממוצע יירד, ושאף חוב לא יישכח'
      },
      numbers: { q_freq: 1, q_freq_unit: '12', q_minutes: 180, q_err_freq: 2, q_err_cost: 2500 },
      scope: {
        monitor: 'in',
        cleanup: 'extra'
      },
      note: {
        moves: {
          monitor: 'גבייה שנעצרת לא מייצרת שגיאה אלא כסף שלא נכנס, ומתגלה חודש אחרי.',
          cleanup: 'התאמת החשבוניות הפתוחות לפני ההרצה הראשונה.'
        },
        watch: {
          redesign: '"מתי נשלחת תזכורת שנייה" היא מדיניות של הלקוח, לא באג שלך.'
        }
      }
    },
    {
      id: 'report',
      name: 'דוח שבועי מכמה מקורות',
      blurb: 'מישהו מוריד קבצים, מדביק לאקסל ובונה את אותו דוח כל שבוע',
      systems: ['Excel','גיליונות Google','CRM'],
      fields: {
        q_process: 'כל שבוע מישהו מוריד נתונים מכמה מערכות, מדביק אותם לאקסל, מנקה ובונה את הדוח לישיבה.',
        q_success: 'שהדוח יהיה מוכן לפני הישיבה בלי שאף אחד ייגע בו'
      },
      numbers: { q_freq: 1, q_freq_unit: '52', q_minutes: 120, q_err_freq: 1, q_err_cost: 600 },
      scope: {
        cleanup:   'extra',
        apichange: 'extra'
      },
      note: {
        moves: {
          cleanup:   'בדוחות זה כמעט תמיד נדרש. עדיף להציע מאשר לגלות באמצע.',
          apichange: 'דוח שואב מכמה מערכות, וכל אחת משתנה מתישהו.'
        }
      }
    },
    {
      id: 'booking',
      name: 'תיאום פגישות ותזכורות',
      blurb: 'תיאום ידני בהודעות, ואז תזכורת שמישהו זוכר לשלוח',
      systems: ['אימייל','וואטסאפ','Monday / Asana'],
      fields: {
        q_process: 'לקוח מבקש פגישה, מישהו בודק יומן, מתאם בהודעות, מזין ליומן ושולח תזכורת יום לפני.',
        q_success: 'שאחוז אי-ההגעות יירד ושאף אחד לא יתאם ידנית'
      },
      numbers: { q_freq: 15, q_freq_unit: '52', q_minutes: 6, q_err_freq: 4, q_err_cost: 350 },
      scope: {
        train:   'extra',
        cleanup: 'extra'
      },
      note: {
        moves: {
          train:   'תחלופת אנשים הופכת "הדרכה אחת" לשלוש. עדיף למכור ליווי מאשר לספוג.',
          cleanup: 'ייבוא היומן ואנשי הקשר הקיימים.'
        },
        tip: 'עלות אי-הגעה מצדיקה את הפרויקט, והיא הכי נוטה לניחוש. שאל כמה פגישות התפספסו בחודש שעבר.'
      }
    }
  ];

  /* Rows whose `when` does not match the systems actually chosen are not
     shown and not counted — a WhatsApp clause in a job with no WhatsApp is
     noise in a client-facing document. */
  const visibleScope = systems => SCOPE_ITEMS.filter(i => !i.when || i.when(systems));

  const defaultScopeState = () => {
    const s = {};
    SCOPE_ITEMS.forEach(i => { s[i.id] = i.d; });
    return s;
  };

  /* A template's scope block is applied over the defaults, never merged into
     a state a previous template left behind — otherwise picking two templates
     in a row leaves a hybrid nobody chose. */
  const scopeStateFor = template => {
    const s = defaultScopeState();
    if (template && template.scope) Object.assign(s, template.scope);
    return s;
  };

  root.PC = root.PC || {};
  root.PC.catalog = { SYSTEMS, METHODS, SCOPE_ITEMS, SCOPE_LABEL, PRESETS, EXAMPLES,
                      TEMPLATES, visibleScope, defaultScopeState, scopeStateFor };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.PC.catalog;
})(typeof window !== 'undefined' ? window : globalThis);
