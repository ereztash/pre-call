/* ============================================================
   POST-CALL — the inverse of PRE-CALL.
   PRE-CALL asked the operator for their own last deal to anchor a price,
   which is empty for anyone who hasn't closed one yet. Here every number
   comes from the client's own process plus published vertical benchmarks,
   so a first-timer gets a defensible price on their first call.
   ============================================================ */

const SYSTEMS = ['וואטסאפ','אימייל','גיליונות Google','Excel','CRM','חשבונית ירוקה / מורנינג',
                 'מערכת סליקה','אתר / טפסים','ERP','Monday / Asana','מערכת ייעודית','אחר'];

const METHODS = {
  value:      { name: 'ערך / ROI',    hint: 'המחיר נגזר ממה שהתהליך עולה ללקוח בשנה. הכי חזק בשיחה, אבל דורש שהוא ייתן לך מספרים. אם הוא מנחש אותם, המחיר מנחש איתו.' },
  market:     { name: 'מחירון שוק',   hint: 'המחיר לפי טווח מקובל לעבודה מהסוג הזה. תמיד זמין, לא דורש היסטוריה ולא מספרים מהלקוח. חלש כשהעבודה חריגה.' },
  cost:       { name: 'עלות + מרווח', hint: 'אומדן השעות שלך × התעריף שלך, ועוד מרווח. הכי בטוח מבחינתך, אבל תקוע על הוותק שלך ולא על מה שהעבודה שווה.' },
  comparable: { name: 'עסקה דומה',    hint: 'מה שגבית על עבודה דומה, מותאם להיקף. מדויק כשבאמת עשית משהו דומה. דורש היסטוריה.' }
};

const el = id => document.getElementById(id);
const num = id => { const v = parseFloat(el(id).value); return isFinite(v) && v > 0 ? v : 0; };
const txt = id => el(id).value.trim();
const ils = PC.model.ils;

/* ---------- system chips ---------- */
const chosenSystems = new Set();
SYSTEMS.forEach(s => {
  // a real button, not a styled div: a div with onclick is unreachable by keyboard
  // and announces nothing to a screen reader
  const c = document.createElement('button');
  c.type = 'button'; c.className = 'chip'; c.textContent = s;
  c.setAttribute('aria-pressed', 'false');
  c.onclick = () => { c.classList.toggle('on');
    const on = c.classList.contains('on');
    c.setAttribute('aria-pressed', String(on));
    on ? chosenSystems.add(s) : chosenSystems.delete(s);
    renderScope(); // system-conditional scope rows appear and disappear with this
    recompute(); };
  el('sysChips').appendChild(c);
});

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
const scopeState = {};
SCOPE_ITEMS.forEach(i => scopeState[i.id] = i.d);
const SCOPE_LABEL = { in:'כלול', out:'לא כלול', extra:'בתוספת' };

function renderScope(){
  const box = el('scopeBox');
  const visible = SCOPE_ITEMS.filter(i => !i.when || i.when(chosenSystems));
  box.innerHTML = visible.map(i => `
    <div class="scope-row">
      <div class="scope-t">${esc(i.t)}${i.why ? `<span class="scope-why">${esc(i.why)}</span>` : ''}</div>
      <div class="scope-btns">
        ${['in','out','extra'].map(s =>
          `<button type="button" class="sbtn s-${s}${scopeState[i.id]===s?' on':''}"
             aria-pressed="${scopeState[i.id]===s}"
             data-i="${i.id}" data-s="${s}">${SCOPE_LABEL[s]}</button>`).join('')}
      </div>
    </div>`).join('');
  box.querySelectorAll('.sbtn').forEach(b => b.onclick = () => {
    scopeState[b.dataset.i] = b.dataset.s;
    renderScope();
    renderProposal();
  });
}
function scopeList(state){
  return SCOPE_ITEMS.filter(i => (!i.when || i.when(chosenSystems)) && scopeState[i.id] === state);
}

/* ---------- one-tap presets and example fills ----------
   Two different frictions. Closed/numeric fields cost a keyboard; presets cut
   that to one tap. Open fields cost composition, not typing — the blank page is
   the expense — so the example is offered as content that lands IN the field and
   gets edited, rather than as ghost placeholder text. Placeholder-as-instruction
   vanishes the moment you type, fails contrast, and is read as a filled value;
   the persistent hint under each label stays regardless. */
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

Object.entries(PRESETS).forEach(([id, vals]) => {
  const input = el(id); if (!input) return;
  const row = document.createElement('div'); row.className = 'presets';
  vals.forEach(v => {
    const c = document.createElement('button');
    c.type = 'button'; c.className = 'chip chip-sm'; c.textContent = v;
    c.setAttribute('aria-pressed', 'false');
    c.onclick = () => {
      input.value = v;
      [...row.children].forEach(x => { const sel = x === c;
        x.classList.toggle('on', sel); x.setAttribute('aria-pressed', String(sel)); });
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    row.appendChild(c);
  });
  input.insertAdjacentElement('afterend', row);
  // typing your own number clears the chip highlight — the chips are a shortcut,
  // never a constraint on what you can enter
  input.addEventListener('input', () => {
    if (![...row.children].some(x => x.textContent === input.value))
      [...row.children].forEach(x => { x.classList.remove('on'); x.setAttribute('aria-pressed','false'); });
  });
});

Object.entries(EXAMPLES).forEach(([id, text]) => {
  const field = el(id); if (!field) return;
  const row = document.createElement('div'); row.className = 'presets';
  const c = document.createElement('button');
  c.type = 'button'; c.className = 'chip chip-sm';
  c.textContent = 'מלא דוגמה ואז ערוך';
  c.onclick = () => {
    field.value = text;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  };
  row.appendChild(c);
  field.insertAdjacentElement('afterend', row);
});

/* ---------- method selector ---------- */
const mc = el('methodChips');
mc.dataset.sel = 'value';
Object.entries(METHODS).forEach(([key, m]) => {
  const c = document.createElement('button');
  c.type = 'button';
  c.className = 'chip' + (key === 'value' ? ' on' : '');
  c.textContent = m.name; c.dataset.k = key;
  c.setAttribute('aria-pressed', String(key === 'value'));
  c.onclick = () => {
    mc.dataset.sel = key;
    [...mc.children].forEach(x => { const sel = x.dataset.k === key;
      x.classList.toggle('on', sel); x.setAttribute('aria-pressed', String(sel)); });
    el('methodHint').textContent = m.hint;
    el('m_comparable_in').style.display = key === 'comparable' ? '' : 'none';
    el('m_cost_in').style.display = key === 'cost' ? '' : 'none';
    recompute();
  };
  mc.appendChild(c);
});
el('methodHint').textContent = METHODS.value.hint;

el('q_role').addEventListener('change', () => {
  el('customRateWrap').style.display = el('q_role').value === 'custom' ? '' : 'none';
  recompute();
});

/* ---------- inputs → model ----------
   The only job left here is reading the DOM. Every number and rule lives in
   assets/model.js, which stays free of the document so it can be tested
   directly. */
function readInputs(){
  return {
    freq: num('q_freq'),
    freqUnit: parseFloat(el('q_freq_unit').value),
    minutes: num('q_minutes'),
    rate: el('q_role').value === 'custom' ? num('q_rate_custom') : parseFloat(el('q_role').value),
    capture: parseFloat(el('a_capture').value),
    errFreq: num('q_err_freq'),
    errCost: num('q_err_cost'),
    systemCount: chosenSystems.size,
    integration: parseFloat(el('q_integration').value),
    edge: parseFloat(el('q_edge').value),
    myRate: num('a_myrate'),
    margin: num('c_margin') || undefined,
    maintPct: num('a_maint'),
    method: el('methodChips').dataset.sel || 'value',
    compLast: num('c_last'),
    compScale: parseFloat(el('c_scale').value),
    compScaleLabel: el('c_scale').selectedOptions[0].text,
    deals: parseInt(el('c_deals').value, 10)
  };
}
const model = () => PC.model.compute(readInputs());

/* Where the client's number came from decides what the value figure is worth.
   In documented comparable engagements, clients produced digits only after the
   seller injected the quantification move — meaning a number that appears on
   request may be measuring the question rather than the business. The tool
   cannot resolve that, so it records it and says so instead of averaging it in. */
function provenanceWarning(m){
  if (!m.annualValue) return '';
  const p = el('q_provenance').value;
  if (p === 'unprompted') return '';
  if (p === 'prompted') return '<div class="tri-warn">המספר הגיע אחרי ששאלת. ' +
    'ייתכן שהוא אמיתי, וייתכן שהוא נבנה בשבילך בזמן השיחה. לפני שאתה שולח מחיר שנשען עליו, ' +
    'שאל אותו שאלה אחת: "איך אתה יודע את זה?" — אם אין תשובה, זה אומדן ולא מדידה.</div>';
  if (p === 'mine') return '<div class="tri-warn"><b>המספר הוא שלך, לא שלו.</b> ' +
    'תמחור לפי ערך שנשען על מספר שאתה המצאת הוא תמחור לפי עלות עם שכבת הצדקה. ' +
    'או שתוציא ממנו מספר, או שתתמחר לפי שיטה אחרת ותציג את הערך כהערכה מפורשת.</div>';
  return '';
}

function recompute(){
  const m = model();
  el('s_hours').textContent   = m.hours   ? Math.round(m.hours).toLocaleString('en-US') : '—';
  el('s_value').textContent   = m.annualValue ? ils(m.annualValue) : '—';
  el('s_effort').textContent  = chosenSystems.size ? m.effort : '—';
  const priceTxt = (m.annualValue || chosenSystems.size) ? ils(m.price) : '—';
  el('s_price').textContent = priceTxt;
  el('s_price_top').textContent = priceTxt; // the headline copy in the document bar
  el('s_payback').textContent = m.payback ? m.payback.toFixed(1) : '—';
  el('s_band').textContent = m.annualValue
    ? ils(m.low) + ' – ' + ils(m.high)
    : 'טווח הגנה';

  // side-by-side of every method that has data, so an inflated input shows up
  // as an outlier instead of quietly setting the price
  const tri = el('triangulate');
  if (m.available.length) {
    tri.innerHTML = '<div class="tri-h">מה כל שיטה אומרת</div>' +
      m.available.map(k => {
        const x = m.M[k], on = k === m.method;
        return '<div class="tri-row' + (on ? ' on' : '') + '">' +
          '<span class="tri-n">' + x.label + (on ? ' · נבחרה' : '') + '</span>' +
          '<span class="tri-v">' + ils(x.value) + '</span>' +
          '<span class="tri-b">' + x.basis +
          (x.raised ? ' · הועלה לרצפת העלות ' + ils(m.costFloor) +
                      ', השיטה עצמה נתנה ' + ils(x.raw) : '') + '</span></div>';
      }).join('') +
      // A big gap between cost and value is the point of value pricing, not an
      // error — warning on it would teach distrust of exactly the case that pays.
      // What deserves a warning is the one input the client invents on the spot.
      (m.errShare > 0.55 ? '<div class="tri-warn">' + Math.round(m.errShare * 100) +
        '% מהערך השנתי מגיע מהערכת התקלות בשאלה 6 — מספר שהלקוח שלף בעל פה. ' +
        'המחיר שלך תלוי בו יותר מאשר בכל השאר. בקש ממנו דוגמה אחת קונקרטית לפני שאתה שולח.</div>' : '') +
      provenanceWarning(m) +
      (m.M.cost && m.M.market && Math.max(m.M.cost.value, m.M.market.value) /
        Math.min(m.M.cost.value, m.M.market.value) >= 2
        ? '<div class="tri-warn">אומדן העלות שלך רחוק מטווח השוק. או שהאומדן שגוי, ' +
          'או שהתעריף שלך לא מתאים לסוג העבודה הזה.</div>' : '');
  } else tri.innerHTML = '';

  /* Which method pays most is a property of THIS deal, not a general truth.
     Value pricing wins when the process is worth a lot relative to the build,
     and loses to plain cost pricing when it isn't. Saying "value always yields
     more" while the screen shows it yielding least is how a tool loses trust. */
  const rec = el('recommend');
  if (!m.best || m.available.length < 2) {
    rec.innerHTML = '';
  } else if (m.best === m.method) {
    rec.innerHTML = '<div class="ok"><b>זו גם השיטה שמניבה הכי הרבה כאן</b> מבין אלה שיש לך נתונים עבורן, ' +
      'בלי לחרוג ממה שניתן להגנה מול הלקוח.</div>';
  } else {
    const gap = m.M[m.best].value - m.price;
    rec.innerHTML = '<div class="ok"><b>' + m.M[m.best].label + ' מניבה כאן ' + ils(gap) + ' יותר</b> ' +
      '(' + ils(m.M[m.best].value) + ' מול ' + ils(m.price) + '), ועדיין בטווח שניתן להגנה. ' +
      (m.best === 'value'
        ? 'תמחור לפי ערך מציב את העוגן על מה שהתהליך עולה ללקוח במקום על התעריף שלך, וזה מה שמזיז את המספר.'
        : 'בעסקה הזאת הערך של התהליך קטן מדי מכדי שתמחור לפי ערך ינצח. זה לא תמיד המצב.') +
      '</div>';
  }
  if (!m.annualValue && m.method !== 'value') {
    rec.innerHTML += '<div class="ok">אין לך עדיין את המספרים לתמחור לפי ערך. ' +
      'שאלות 2, 3, 4 ו-6 הן מה שפותח אותו — ובעסקאות שבהן התהליך יקר, זו השיטה שמזיזה הכי הרבה כסף.</div>';
  }

  const v = el('verdict');
  if (!m.annualValue) {
    v.innerHTML = '<div class="ok">מלא את שאלות 2, 3 ו-4 וקבל את המספר. שאלה 6 מוסיפה לו את ערך התקלות.</div>';
  } else if (m.tooThin) {
    v.innerHTML = '<div class="flag"><b>הבנייה יקרה מהערך שהיא מייצרת.</b> ' +
      'עלות הבנייה מחייבת אותך לגבות לפחות ' + ils(m.price) + ', אבל תהליך ששווה ' +
      ils(m.annualValue) + ' בשנה מצדיק עד ' + ils(m.high) + ' לכל היותר. ' +
      'בסקופ הזה הלקוח לא מחזיר את ההשקעה בזמן סביר. צמצם לחלק אחד של התהליך שבו רוב הזמן נשרף, ' +
      'או אמור לו בשיחה שזה לא משתלם. הצעה שלא מחזירה את עצמה חוזרת אליך כתלונה.</div>';
  } else if (m.payback > 20) {
    v.innerHTML = '<div class="flag"><b>ההחזר איטי, ' + m.payback.toFixed(0) + ' שבועות.</b> ' +
      'רוב פרויקטי האוטומציה מחזירים תוך 4 עד 12 שבועות. צמצם סקופ או הורד מחיר, ' +
      'אחרת הלקוח יגלה את זה בעצמו אחרי החתימה.</div>';
  } else {
    v.innerHTML = '<div class="ok"><b>ההחזר תוך ' + m.payback.toFixed(1) + ' שבועות.</b> ' +
      'המשפט לשיחה: "התהליך הזה עולה לך בערך ' + ils(m.annualValue) +
      ' בשנה. ההשקעה מחזירה את עצמה תוך פחות מ' +
      (m.payback < 4 ? '-חודש' : '-' + Math.ceil(m.payback / 4.3) + ' חודשים') + '."</div>';
  }
  renderProposal();
}

document.querySelectorAll('input,select,textarea').forEach(n =>
  n.addEventListener('input', recompute));

/* ---------- payment gate ----------
   Client-side only, and deliberately not pretending otherwise: anyone who
   opens devtools can bypass it. That is an acceptable trade for a first
   paid test with a handful of buyers — the point is to find out whether
   anyone pays at all, not to stop copying. Real enforcement needs the key
   checked server-side before the document is returned. */
const PAYMENT_URL = 'https://example.com/replace-with-your-payment-link';
let unlocked = false, pendingExport = null;

/* The document stays on screen for everyone — it is the interface, and hiding
   it would hide the only thing that shows the tool works. The key is required
   to take it out of the page. */
function requireKey(fn){
  if (unlocked) return fn();
  pendingExport = fn;
  track('export_attempted');
  el('wall').style.display = '';
  el('wall').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

el('payBtn').onclick = () => {
  if (PAYMENT_URL.includes('example.com')) {
    alert('עוד לא חובר קישור תשלום.\n\nהחלף את PAYMENT_URL בקובץ בקישור מ-Stripe / Lemon Squeezy / Paddle,\nושלח לקונה מפתח בפורמט PC-XXXX-XXXX.');
    return;
  }
  window.open(PAYMENT_URL, '_blank', 'noopener');
};

function keyValid(k){
  k = k.trim().toUpperCase();
  if (!/^PC-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(k)) return false;
  // light checksum so a random string of the right shape does not open it
  const body = k.replace(/[^A-Z0-9]/g, '').slice(2);
  let sum = 0; for (const ch of body.slice(0, 7)) sum += ch.charCodeAt(0);
  return body[7] === '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'[sum % 36];
}
function tryUnlock(){
  if (keyValid(el('keyIn').value)) {
    unlocked = true;
    el('wall').style.display = 'none';
    try { localStorage.setItem('postcall_key', el('keyIn').value.trim().toUpperCase()); } catch(e){}
    if (pendingExport) { const f = pendingExport; pendingExport = null; f(); }
  } else {
    el('keyErr').style.display = 'block';
  }
}
try {
  const saved = localStorage.getItem('postcall_key');
  if (saved && keyValid(saved)) unlocked = true;
} catch(e){}

/* ---------- proposal ---------- */
function esc(s){ return (s||'').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])); }

/* The rationale is the part the client actually argues with, so it has to match
   the method the price came from. A value number pasted under a cost-based price
   invites "so why is it not just your hours?" */
function rationaleFor(m){
  if (m.method === 'value' && m.annualValue) {
    return `<div class="rationale"><b>מאיפה המחיר.</b> התהליך עולה כ-${ils(m.annualValue)} בשנה.
      המחיר הוא ${Math.round(m.price / m.annualValue * 100)}% מהערך של השנה הראשונה,
      וההשקעה מחזירה את עצמה תוך כ-${m.payback.toFixed(1)} שבועות.
      משנה שנייה ואילך זה חיסכון מלא.</div>`;
  }
  if (m.method === 'market' && m.M.market) {
    return `<div class="rationale"><b>מאיפה המחיר.</b> ${m.M.market.basis} לעבודה בהיקף הזה.
      המחיר בטווח המקובל${m.annualValue ? `, והתהליך עולה לך כ-${ils(m.annualValue)} בשנה` : ''}.</div>`;
  }
  if (m.method === 'cost') {
    // The hour breakdown stays out of the client's copy on purpose. Justifying a
    // price with hours invites a negotiation about hours, and the anchor is
    // supposed to be what the work is worth, not what it costs to produce.
    return `<div class="rationale"><b>מאיפה המחיר.</b> ${m.annualValue
      ? `התהליך עולה לך כ-${ils(m.annualValue)} בשנה. המחיר נגזר מההיקף שמפורט בסעיף "מה נכלל".`
      : 'המחיר נגזר מההיקף שמפורט בסעיף "מה נכלל" ומהגבולות שמפורטים תחתיו.'}</div>`;
  }
  if (m.method === 'comparable' && m.M.comparable) {
    return `<div class="rationale"><b>מאיפה המחיר.</b> עבודה דומה שביצעתי, מותאמת להיקף כאן${
      m.annualValue ? `. התהליך עולה לך כ-${ils(m.annualValue)} בשנה` : ''}.</div>`;
  }
  return '';
}

function renderProposal(){
  const m = model();
  // hours ceiling on the tuning commitment. Without it the clause was open-ended
  // against a criterion the client wrote, which can be absolute ("nothing ever
  // slips") — an unbounded obligation for someone who won't spot it.
  const tuneCap = Math.max(4, Math.round(m.effort * 0.15));
  const client = txt('q_client') || 'הלקוח';
  const d = new Date();
  const dstr = d.getDate() + '.' + (d.getMonth()+1) + '.' + d.getFullYear();
  const valid = new Date(d.getTime() + 14*864e5);
  const vstr = valid.getDate() + '.' + (valid.getMonth()+1) + '.' + valid.getFullYear();
  const sys = [...chosenSystems];

  const successLine = txt('q_success') ||
    (m.hours ? 'החזרת כ-' + Math.round(m.hours/52) + ' שעות עבודה בשבוע' : 'התהליך רץ בלי מגע יד');

  // cut on a word boundary — slicing mid-word left titles ending in "...חשבו"
  const firstLine = txt('q_process').split('\n')[0].trim();
  let title = firstLine;
  if (title.length > 55) title = title.slice(0, 55).replace(/\s+\S*$/, '') + '…';

  el('proposal').innerHTML = `
<h3>הצעה · אוטומציה של ${esc(title || 'התהליך')}</h3>
<div class="meta">${esc(client)} · ${dstr} · בתוקף עד ${vstr}</div>

${txt('q_trigger') ? `<h4>למה עכשיו</h4><p>${esc(txt('q_trigger'))}</p>` : ''}

<h4>מה קורה היום</h4>
<p>${esc(txt('q_process') || 'התהליך מתבצע ידנית.')}</p>
${m.annualValue ? `<p><b>העלות של זה:</b> ${m.runs ? 'התהליך רץ כ-' + Math.round(m.runs).toLocaleString('en-US') + ' פעמים בשנה, ' : ''}${m.hours ? Math.round(m.hours).toLocaleString('en-US') + ' שעות עבודה' : ''}${m.errValue ? ', ובנוסף ' + ils(m.errValue) + ' בשנה בתקלות' : ''}. סה"כ כ-<b>${ils(m.annualValue)} בשנה</b>.</p>` : ''}

${scopeList('in').length ? `<h4>מה נכלל</h4>
<ul>${scopeList('in').map((i,ix) =>
  `<li>${esc(i.t)}${ix===0 && sys.length ? ', כולל החיבורים בין ' + esc(sys.join(', ')) : ''}</li>`).join('')}</ul>` : ''}

${scopeList('out').length ? `<h4>מה לא נכלל</h4>
<ul>${scopeList('out').map(i => `<li class="no">${esc(i.t)}</li>`).join('')}</ul>
<p style="font-size:13px;color:#5f6673">כל אחד מהסעיפים האלה ניתן לביצוע, ויתומחר בנפרד לפי אותו תעריף.</p>` : ''}

${scopeList('extra').length ? `<h4>זמין בתוספת תשלום</h4>
<ul>${scopeList('extra').map(i => `<li>${esc(i.t)}</li>`).join('')}</ul>` : ''}

<h4>המחיר</h4>
<div class="pricebox">
  <div class="amt">${ils(m.price)}</div>
  <div style="font-size:13px;color:#5f6673;margin-top:4px">
    תשלום חד-פעמי, לא כולל מע"מ. 50% בהתחלה, 50% במסירה.
  </div>
</div>
${rationaleFor(m)}

<h4>לוח זמנים</h4>
<table>
  <tr><th>שלב</th><th>מה קורה</th><th>משך</th></tr>
  <tr><td>מיפוי</td><td>ישיבה אחת, ואני חוזר עם תרשים התהליך לאישור</td><td>שבוע</td></tr>
  <tr><td>בנייה</td><td>פיתוח והטמעה, אומדן ${m.effort} שעות עבודה</td><td>${Math.max(1, Math.ceil(m.effort/12))} עד ${Math.max(2, Math.ceil(m.effort/8))} שבועות</td></tr>
  <tr><td>בדיקה</td><td>הרצה על נתונים אמיתיים במקביל לתהליך הקיים</td><td>שבוע</td></tr>
  <tr><td>מסירה</td><td>הדרכה, תיעוד, ואז שבועיים ליווי</td><td>שבועיים</td></tr>
</table>
${txt('q_deadline') ? `<p style="margin-top:8px">היעד שהגדרת: <b>${esc(txt('q_deadline'))}</b>.</p>` : ''}

<h4>איך נדע שזה הצליח</h4>
<p>${esc(successLine)}. נמדוד את זה 30 יום אחרי המסירה.
אם לא הגענו לשם בגלל משהו בבנייה, אני מכוונן ללא תוספת תשלום, עד ${tuneCap} שעות עבודה.
מעבר לזה, או אם נדרש שינוי בתהליך עצמו או במערכות, נתמחר בנפרד לפי אותו תעריף.</p>

${txt('q_prev') ? `<h4>מה שונה הפעם</h4><p>ניסיתם כבר: ${esc(txt('q_prev'))}. ההצעה הזו נבדלת בכך שהמסירה כוללת תיעוד והדרכה, והאחריות על ההטמעה היא שלי ולא שלכם.</p>` : ''}

<h4>ההחלטה</h4>
<p>ההצעה בתוקף עד ${vstr}.${txt('q_decider') ? ' מי שצריך לאשר: ' + esc(txt('q_decider')) + '.' : ''}
כדי להתחיל, אישור בכתב על ההצעה הזו והתשלום הראשון.</p>
`;
}

function copyProposal(){
  const t = el('proposal').innerText;
  const done = ok => { const f = el('cpFlag');
    f.textContent = ok ? 'הועתק' : 'ההעתקה נכשלה, סמן והעתק ידנית';
    f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 2200); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(() => done(true)).catch(() => fallbackCopy(t, done));
  } else fallbackCopy(t, done);
}
function fallbackCopy(t, done){
  const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch(e){}
  document.body.removeChild(ta); done(ok);
}

renderScope();
recompute();

/* ============================================================
   Stage 4 — the deal ledger in the page.
   The estimate is locked when a deal is saved; hours reported after delivery
   are compared against that locked number. That comparison is the only thing
   that can turn the effort table from fitted-backwards into measured, so the
   "not calibrated" marker is removed by evidence here rather than by editing
   a label.
   ============================================================ */
let currentDealId = null;

function dealSnapshot(){
  const m = model();
  return {
    id: currentDealId || undefined,
    client: txt('q_client') || 'ללא שם',
    process: txt('q_process').slice(0, 120),
    estimatedHours: m.effort,      // locked at save time — see deals.js
    priceQuoted: m.price,
    method: m.method,
    systems: [...chosenSystems]
  };
}

function saveCurrentDeal(){
  const rec = PC.deals.save(dealSnapshot());
  if (!rec) { flashDoc('השמירה נכשלה — ייתכן שאחסון הדפדפן חסום'); return; }
  currentDealId = rec.id;
  renderLedger(); flashDoc('נשמר'); track('deal_saved');
}
function markSent(){
  if (!currentDealId) saveCurrentDeal();
  if (!currentDealId) return;
  PC.deals.setStatus(currentDealId, 'sent');
  renderLedger(); flashDoc('סומנה כנשלחה'); track('deal_sent');
}
function flashDoc(msg){
  const f = el('cpFlag'); f.textContent = msg;
  f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 2000);
}

function setStatus(id, s){ PC.deals.setStatus(id, s); renderLedger(); }
function removeDeal(id){
  if (currentDealId === id) currentDealId = null;
  PC.deals.remove(id); renderLedger();
}
function saveOutcome(id){
  PC.deals.recordOutcome(id, {
    closedPrice: el('oc_price_' + id).value,
    actualHours: el('oc_hours_' + id).value
  });
  renderLedger(); recompute(); track('outcome_recorded');
}

function renderLedger(){
  const box = el('ledgerBox'); if (!box) return;
  const list = PC.deals.list();
  const cal = PC.deals.calibration();
  const win = PC.deals.winRate();

  const summary = list.length ? `
    <div class="ledger-sum">
      <span>${list.length} הצעות</span>
      <span>${win.won} נסגרו · ${win.lost} נדחו · ${win.undecided} פתוחות</span>
      ${win.rate !== null ? `<span>שיעור סגירה ${Math.round(win.rate*100)}%</span>` : ''}
    </div>
    ${cal.enough
      ? `<div class="ok"><b>הכיול נמדד על ${cal.n} מסירות.</b> ${cal.suggestion}.
           אומדן מצטבר ${cal.estimatedTotal} שעות מול ${cal.actualTotal} בפועל.
           אפשר לעדכן את התעריף או את האומדן בהתאם.</div>`
      : `<div class="tri-warn">כיול האומדן דורש ${5 - cal.n} מסירות נוספות עם שעות מדווחות.
           עד אז טבלת האומדן נשארת מסומנת כלא-מכוילת — היא הותאמה אחורה למחיר, ולא נמדדה.</div>`}` : '';

  box.innerHTML = summary + (list.length ? list.map(d => {
    const o = d.outcome || {};
    const done = o.actualHours > 0;
    return `<div class="deal">
      <div class="deal-h">
        <b>${esc(d.client)}</b>
        <span class="deal-st st-${d.status}">${PC.STATUS_LABEL[d.status]}</span>
        <span class="deal-meta">${d.priceQuoted ? ils(d.priceQuoted) : '—'} · אומדן ${d.estimatedHours || '—'} ש׳ · ${d.created.slice(0,10)}</span>
      </div>
      ${d.process ? `<div class="deal-p">${esc(d.process)}</div>` : ''}
      <div class="deal-acts">
        ${['sent','won','lost','no_answer'].map(s =>
          `<button type="button" class="sbtn${d.status===s?' on s-in':''}" aria-pressed="${d.status===s}"
            onclick="setStatus('${d.id}','${s}')">${PC.STATUS_LABEL[s]}</button>`).join('')}
        <button type="button" class="sbtn" onclick="removeDeal('${d.id}')">מחק</button>
      </div>
      ${d.status === 'won' || done ? `
        <div class="deal-out">
          <div><label for="oc_price_${d.id}">מחיר שנסגר בפועל</label>
            <input type="number" id="oc_price_${d.id}" value="${o.closedPrice || ''}" placeholder="${d.priceQuoted || ''}"></div>
          <div><label for="oc_hours_${d.id}">שעות עבודה בפועל</label>
            <input type="number" id="oc_hours_${d.id}" value="${o.actualHours || ''}" placeholder="${d.estimatedHours || ''}"></div>
          <button type="button" class="ghost" onclick="saveOutcome('${d.id}')">שמור תוצאה</button>
        </div>` : ''}
    </div>`;
  }).join('') : '<p class="lead" style="margin:0">עוד לא נשמרה אף הצעה. בנה אחת למעלה ולחץ "שמור".</p>');

  const bar = el('dealBar');
  if (bar) bar.innerHTML = list.length
    ? `<button type="button" class="ghost" onclick="newDeal()">הצעה חדשה</button>
       <span class="dealbar-n">${list.length} שמורות · ${win.undecided} ממתינות לתשובה</span>` : '';
}

function newDeal(){
  currentDealId = null;
  ['q_process','q_client','q_trigger','q_prev','q_decider','q_deadline','q_success',
   'q_freq','q_minutes','q_err_freq','q_err_cost'].forEach(id => { const e = el(id); if (e) e.value = ''; });
  [...el('sysChips').children].forEach(c => { c.classList.remove('on'); c.setAttribute('aria-pressed','false'); });
  chosenSystems.clear();
  SCOPE_ITEMS.forEach(i => scopeState[i.id] = i.d);
  renderScope(); renderLedger(); recompute();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

renderLedger();

/* ---------- optional telemetry ----------
   The page is fully functional with no network at all — this is additive and
   silent on failure. Buckets only: no client names, no proposal text, no exact
   prices. If the endpoint is absent (opened from file://, or deployed without
   the function) nothing happens and nothing breaks. */
function track(event, extra){
  try {
    if (location.protocol === 'file:') return;
    const m = model();
    fetch('/api/event', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(Object.assign({
        event, method: m.method, systems: chosenSystems.size,
        price: m.price, provenance: el('q_provenance') ? el('q_provenance').value : null
      }, extra || {}))
    }).catch(() => {});
  } catch (e) {}
}
track('opened');
