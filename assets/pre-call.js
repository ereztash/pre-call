/* ---------- prompts ---------- */

/* ---------- state ---------- */
const S = {};

/* ---------- nav ---------- */
document.querySelectorAll('.stepbtn').forEach(b=>b.onclick=()=>go(+b.dataset.s));
function go(n){
  document.querySelectorAll('.stepbtn').forEach(b=>b.classList.toggle('on',+b.dataset.s===n));
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('on'));
  document.getElementById('p'+n).classList.add('on');
  window.scrollTo({top:0,behavior:'smooth'});
}

/* ---------- copy ---------- */
function cp(id,flag){ copyText(document.getElementById(id).innerText, flag); }
function cpText(id,flag){ copyText(document.getElementById(id).innerText, flag); }

async function copyText(t, flag){
  if(navigator.clipboard && navigator.clipboard.writeText){
    try{ await navigator.clipboard.writeText(t); flash(flag, true); return; }
    catch(e){ /* clipboard API present but denied/failed — fall through to manual-select */ }
  }
  fallback(t, flag);
}
function fallback(t,flag){
  const ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);
  ta.select();
  let ok=false;
  try{ ok=document.execCommand('copy'); }catch(e){ ok=false; }
  document.body.removeChild(ta);
  flash(flag, ok);
}
function flash(f, ok=true){
  const e=document.getElementById(f);
  if(!e.dataset.orig) e.dataset.orig=e.textContent;
  e.textContent = ok ? e.dataset.orig : 'ההעתקה נכשלה — סמנו והעתיקו ידנית';
  e.style.color = ok ? '' : 'var(--red)';
  e.classList.add('on');
  setTimeout(()=>e.classList.remove('on'), ok?1600:3200);
}

/* ---------- parse pasted profile ---------- */
function parseBiz(){
  const t=document.getElementById('pasteBiz').value;
  if(!t.trim())return;
  const g=(re)=>{const m=t.match(re);return m?m[1].trim():''};
  const set=(id,v)=>{if(v)document.getElementById(id).value=v};
  set('f_what', g(/מה אני מוכר:\s*(.+)/));
  set('f_who',  g(/למי:\s*(.+)/));
  set('f_unit', g(/יחידה תחומה:\s*(.+)/));
  set('f_price',g(/מחיר היחידה:\s*(.+)/));
  set('f_last', g(/עסקה אחרונה:\s*(.+)/));
  set('f_gain', g(/מה הלקוח הרוויח:\s*(.+)/));
  set('f_no',   g(/מה אני לא מוכר:\s*(.+)/));
  // stop only at the next KNOWN field label, not any line that happens to contain a colon
  // (a multiline answer here easily contains its own "לדוגמה:"-style colon)
  const edge=g(/מה רק אני רואה:\s*([\s\S]+?)(?:\n(?:מה אני לא מוכר:|מקור הלקוח האחרון:|מה הלקוח הרוויח:|עסקה אחרונה:|מחיר היחידה:|יחידה תחומה:|למי:|מה אני מוכר:)|$)/);
  if(edge)document.getElementById('f_edge').value=edge.trim();
  const src=g(/מקור הלקוח האחרון:\s*(.+)/);
  if(src){
    const s=document.getElementById('f_src');
    if(/הפני|היכר/.test(src))s.value='ref';
    else if(/תוכן/.test(src))s.value='content';
    else if(/יזומ/.test(src))s.value='out';
  }
  saveProfile();
}

/* ---------- profile persistence (localStorage) ----------
   Only the business profile (step 2) persists across page loads — it's
   filled once and reused for every call. Prospect details (step 3) stay
   in-memory only and vanish on close, on purpose: those are private
   specifics about one person, not something to leave sitting in the
   browser after the call is over. */
const PROFILE_FIELDS = ['f_what','f_who','f_unit','f_price','f_last','f_src','f_gain','f_edge','f_no'];
const PROFILE_KEY = 'precall_profile_v1';

function saveProfile(){
  try{
    const data={};
    PROFILE_FIELDS.forEach(id=>{ data[id]=document.getElementById(id).value; });
    localStorage.setItem(PROFILE_KEY, JSON.stringify(data));
    flash('profileSaved');
  }catch(e){ /* private browsing / storage blocked — profile just won't persist, no flash */ }
}
let saveProfileTimer=null;
function saveProfileDebounced(){
  clearTimeout(saveProfileTimer);
  saveProfileTimer=setTimeout(saveProfile, 400);
}
function loadProfile(){
  try{
    const raw=localStorage.getItem(PROFILE_KEY);
    if(!raw)return;
    const data=JSON.parse(raw);
    PROFILE_FIELDS.forEach(id=>{ if(data[id])document.getElementById(id).value=data[id]; });
  }catch(e){}
}
function clearProfile(){
  try{ localStorage.removeItem(PROFILE_KEY); }catch(e){}
  PROFILE_FIELDS.forEach(id=>{ document.getElementById(id).value=''; });
  flash('c4');
}

function buildDR(){
  document.getElementById('promptDR').innerText =
    drPrompt(document.getElementById('p_name').value, document.getElementById('p_co').value);
}

/* Step 3 (the prospect) never persists — but its fields DO sit in the DOM
   between calls if you generate one script and come back to prep another.
   Nothing clears them on its own, so leftover info from the last prospect
   quietly rides along into the next script. This wipes it explicitly. */
const PROSPECT_FIELDS = ['p_paste','p_name','p_co','p_trig','p_how'];
function newProspect(){
  PROSPECT_FIELDS.forEach(id=>{ document.getElementById(id).value=''; });
  document.getElementById('p_pair').value='1';
  buildDR();
  resetOutput(); // the previous prospect's script was staying on step 4, name and all
}

/* ---------- build script ---------- */
function build(){
  const v=id=>document.getElementById(id).value.trim();
  S.what=v('f_what'); S.who=v('f_who'); S.unit=v('f_unit'); S.price=v('f_price');
  S.last=v('f_last'); S.src=v('f_src'); S.gain=v('f_gain'); S.edge=v('f_edge'); S.no=v('f_no');
  S.pname=v('p_name'); S.pco=v('p_co'); S.ptext=v('p_paste'); S.ptrig=v('p_trig');
  S.phow=v('p_how'); S.ppair=v('p_pair');

  const err2=document.getElementById('err2');
  if(!S.what){
    err2.innerText='חסר השדה "מה אתם מוכרים". בלעדיו התסריט יוצא כללי, ואז הוא לא שווה יותר מרשימת שאלות באינטרנט.';
    err2.style.display='block';
    go(2);
    setTimeout(()=>document.getElementById('f_what').focus(),250);
    return;
  }
  err2.style.display='none';

  document.getElementById('outArea').innerHTML=render();
  renderPrivate();
  go(4);
}

/* Rendered outside #outArea on purpose — see the .priv CSS note. */
function renderPrivate(){
  const el=document.getElementById('privArea');
  const items=(S.priv||[]);
  if(!items.length){ el.style.display='none'; el.innerHTML=''; return; }
  el.innerHTML =
    '<h4>לעיניכם בלבד</h4><ul>'+items.map(t=>`<li>${esc(t)}</li>`).join('')+'</ul>'+
    '<div class="seal">לא נכלל בהעתקה ולא בהדפסה. אלה המספרים שלכם, לא של השיחה.</div>';
  el.style.display='';
}

const EMPTY_OUT = '<div class="empty">עוד לא נבנה תסריט.<br>מלאו את שלב 2, ואז לחצו "בנה את התסריט" בשלב 3.</div>';
function resetOutput(){
  document.getElementById('outArea').innerHTML=EMPTY_OUT;
  S.priv=[];
  renderPrivate();
}

function esc(s){return (s||'').replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}

const SRC_LABEL = {ref:'הפניה או היכרות אישית', content:'התוכן שאתם מפרסמים', out:'פנייה יזומה שלכם', other:'ערוץ אחר'};

function render(){
  const name = S.pname ? (S.pname + (S.pco?' · '+S.pco:'')) : 'הצד השני';
  const d = new Date();
  const dstr = d.getDate()+'.'+(d.getMonth()+1)+'.'+d.getFullYear();

  /* --- price anchor sentence, built from what THEIR last client gained ---
     S.gain drives the sentence. If it reads as a number/amount up front, it slots
     into "היה שווה בערך X". If it's a narrative, that phrasing breaks grammatically
     ("שווה בערך מצא 3 לקוחות..."), so it gets its own sentence structure instead. */
  const numFirst = /^\s*(כ-|~|בערך)?\s*[\d₪$€]/.test(S.gain||'');
  let anchor;
  if(S.gain && numFirst){
    anchor = `אצל לקוח שעבדתי איתו במצב דומה, הפער הזה היה שווה בערך ${S.gain}. אצלך זה יותר או פחות?`;
  }else if(S.gain){
    // "אצל לקוח..., חסך 12 שעות" reads as if YOU saved them — the verb loses its subject.
    // Making the client the grammatical subject fixes it for any narrative phrasing.
    anchor = `לקוח שעבדתי איתו במצב דומה — ${S.gain}. אצלך זה דומה, פחות, או יותר?`;
  }else{
    anchor = `אצל לקוח שעבדתי איתו במצב דומה, הפער הזה היה שווה בערך [כאן נכנס המספר מהעסקה האחרונה שלכם]. אצלך זה יותר או פחות?`;
  }

  /* --- ownership move. The edge field is a general observation about YOUR clients,
     so it can't be handed over as a guess about this specific person, and splicing it
     into a sentence dropped every line after the first. It's shown whole, as reference
     material, and the phrasing stays the operator's job. */
  let own;
  if(S.edge){
    const edgeFull = S.edge.split('\n').map(l=>l.trim()).filter(Boolean).join(' ');
    own = `מה שאתם רואים אצל לקוחות כאלה, והם עצמם לא: "${edgeFull}" — זו אבחנה כללית שלכם, לא עובדה עליו. נסחו ממנה משפט אחד עליו, בגוף שני, מעט לא מדויק בכוונה. ואז שאלו:`;
  }else{
    own = `נסחו לו את הצוואר שלו במשפט אחד, מעט לא מדויק בכוונה, ואז שאלו:`;
  }

  /* --- contextual openers ---
     Split in two. `openers` are things said or watched for in the room, and belong in
     the script. `priv` holds your own figures — they used to sit in the same list, i.e.
     inside the document that gets copied and printed, under a label saying not to say
     them out loud. They now render outside #outArea entirely. */
  const openers=[], priv=[];
  if(S.phow==='in') openers.push('הוא פנה אליכם. אל תסבירו מה אתם עושים. פתחו בשאלה, ותנו לו לתאר למה פנה.');
  if(S.phow==='out') openers.push('אתם פניתם אליו. תנו משפט אחד על למה פניתם דווקא אליו, ומיד עברו לשאלה. לא הצגה עצמית ארוכה.');
  if(S.phow==='ref') openers.push('הגעתם דרך הפניה. שאלו קודם מה נאמר לו עליכם. זה מגלה איזו ציפייה כבר נבנתה.');
  if(S.ptrig) openers.push(`יש טריגר ידוע: ${S.ptrig}. אל תזכירו אותו ראשונים. חכו לראות אם הוא מעלה אותו בשאלה 3.`);
  if(S.ppair==='2') openers.push('שניים בשיחה. בשאלת הבעלות, בקשו תשובה מכל אחד בנפרד. אם ענו שונה, ההצעה מותנית בסבב שני עם שניהם.');
  if(S.ptext) openers.push('יש לכם טקסט ציבורי עליו. השוו בשאלה 6 בין מה שהוא כתב על עצמו למה שהוא אומר עכשיו. הפער הוא הסימן.');
  if(!S.unit) openers.push('אין לכם יחידה תחומה. שימו לב לשאלה 8. אם גם לו אין, השיחה הזאת עוסקת בבניית יחידה, לא בהצעה רחבה.');
  if(S.src) openers.push(`הלקוח האחרון שלכם הגיע דרך ${SRC_LABEL[S.src]||S.src}. בשאלה 5 תשמעו מאיפה הגיע הלקוח שלו — אם זה ערוץ אחר משלכם, זה סימן שהערוץ ששכנע אתכם לא בהכרח ישכנע אותו.`);

  if(S.last && S.gain) priv.push(`העסקה האחרונה שלכם: ${S.last}. הרווח שהערכתם אצל הלקוח: ${S.gain}. היחס הזה הוא הכיול שלכם בראש לפני שאלה 11.`);
  else if(S.last) priv.push(`העסקה האחרונה שלכם: ${S.last}.`);
  if(S.price) priv.push(`מחיר היחידה שלכם: ${S.price}. רצפה פנימית למה שכדאי בכלל להמשיך אליו.`);
  S.priv = priv;

  // the space after the badge is load-bearing: without it innerText (what the copy
  // button emits) glued the number to the question — "1מה אתה צריך ממני?"
  const q=(n,txt,why)=>`<div class="q"><span class="qn">${n}</span> ${esc(txt)}${why?`<span class="why">${esc(why)}</span>`:''}</div>`;

  return `
<h3>תסריט שיחת אפיון · ${esc(name)}</h3>
<div class="meta">
  ${esc(S.what)}${S.who?' · '+esc(S.who):''} · הוכן ${dstr}<br>
  משך מוערך 25 עד 35 דקות. סדר השאלות הוא חלק מהכלי. אל תדלגו קדימה.
</div>

${openers.length?`<div class="blk">
  <div class="blk-h">לפני שמתחילים</div>
  <ul class="prep">${openers.map(o=>`<li>${esc(o)}</li>`).join('')}</ul>
</div>`:''}

<div class="blk">
  <div class="blk-h">חלק א · 7 דקות</div>
  <div class="blk-t">האם יש כאן בכלל עסקה</div>
  <div class="blk-d">שלוש השאלות האלה קובעות אם שווה להמשיך. אם שתיים מהן נופלות, אין הצעה בסוף השיחה, ועדיף לדעת את זה עכשיו ולא אחרי שכתבתם מסמך.</div>
  ${q(1,'מה אתה צריך ממני?','הפתיחה. אל תמלאו את השקט. מה שהוא אומר ראשון הוא מה שהוא באמת בא בשבילו.')}
  ${q(2,'מתי בפעם האחרונה מישהו העביר לך כסף על זה. מתי, כמה, ממי.','אתם מחפשים מספר וזהות. "היה לי פעם", "פרו בונו", "התנסות" זה לא מספר. אז שאלו: וכמה לקוחות משלמים יש לך עכשיו.')}
  ${q(3,'מה קרה לאחרונה שגרם לך לחפש פתרון דווקא עכשיו?','בלי אירוע ספציפי אין דחיפות, ובלי דחיפות ההצעה תישאר פתוחה חודשים.')}
  ${q(4,'בעוד שנה מהיום, איפה אתה רואה את עצמך?','תשובה שמכילה משרה, ביטחון או "אחרי שאתבסס" מסמנת שהמטרה היא עבודה ולא עסק. תשובה שמכילה לקוחות, מחזור או מוצר, ממשיכים.')}
  <div class="stop"><b>עצירה.</b> ממשיכים רק כשיש שלושה יחד: לקוחות משלמים בהווה, אירוע שקרה, ויעד עסקי. שניים מתוך שלושה זה שיחת המשך בעוד חודשיים, לא הצעה.</div>
</div>

<div class="blk">
  <div class="blk-h">חלק ב · 12 דקות</div>
  <div class="blk-t">איפה בדיוק זה נעצר אצלו</div>
  <div class="blk-d">חמש שאלות, בסדר הזה. הן חותכות בין חמש סיבות שונות לכך שעסק לא זז. הכרטיס בסוף המסמך מתרגם את התשובות.</div>
  ${q(5,'מאיפה הגיע הלקוח האחרון שלך?','הפניה, תוכן, או פנייה יזומה. שלוש תשובות, שלושה מסלולים שונים.')}
  ${q(6,'מה מפורסם היום בחוץ שמתאר את מה שאתה עושה?','"כלום" זו תשובה משמעותית. "יש, אבל זה כללי" זו תשובה אחרת לגמרי.')}
  ${q(7,'כמה שעות בשבוע הולכות לפנייה יזומה, ומתי הן ביומן?','שאלו על היומן, לא על הכוונה. "אני משתדל" זה אפס.')}
  ${q(8,'כשלקוח שואל כמה זה עולה, מה אתה עונה לו?','תעריף שעה, "תלוי", או "אני לא כל כך מבין בזה" מסמנים שאין לו יחידה. זו הסיבה השכיחה ביותר.')}
  ${q(9,'הלקוח האחרון שסיים, מה קרה אחרי?','רק אם יש לו לקוחות שסיימו. "עבר לעשות לבד" או "התשלום נגרר" הם סימן נפרד.')}
  <div class="rule">אם שתי סיבות מתחרות, רשמו ראשית ומשנית. אל תמזגו אותן להצעה אחת רחבה.</div>
</div>

<div class="blk">
  <div class="blk-h">חלק ג · מהלך אחד</div>
  <div class="blk-t">מי מנסח את הבעיה</div>
  <div class="blk-d">${esc(own)}</div>
  ${q(10,'זה נשמע לך מדויק, או שאתה היית מנסח אחרת?','בקשו אישור על אבחנה, לא על כיוון. "הכיוון בסדר?" מקבל "כן" ומעביר נושא.')}
  <table class="read">
    <tr><th>מה שהוא עושה</th><th>מה זה אומר</th><th>מה מותר להציע</th></tr>
    <tr><td>מנסח מחדש בשפתו ומוסיף חומר</td><td>הוא הבעלים של הבעיה</td><td>תהליך מלא</td></tr>
    <tr><td>דוחה ומחדד גרסה משלו</td><td>יש בעלות, הניסוח שלכם החטיא</td><td>תהליך שמתחיל מהניסוח שלו</td></tr>
    <tr><td>מהנהן, "כן", "נכון"</td><td>הוא לא אוחז בבעיה</td><td class="no">לא תהליך. מפגש בודד או שיחת המשך.</td></tr>
  </table>
</div>

<div class="blk">
  <div class="blk-h">חלק ד · הנעילה</div>
  <div class="blk-t">המספר, ומי מחזיק אותו</div>
  <div class="blk-d">אל תשאלו "כמה זה שווה לך לדעתך". השאלה הזו מייצרת "אני לא יודע" כמעט תמיד, ואז הלחץ נשאר בחדר. תנו עוגן שהוא מכייל.</div>
  ${q(11,anchor,'הוא מכייל מספר קיים במקום לייצר מאפס. אם הוא אומר "פחות", בקשו כמה פחות. זה עדיין מספר שלו.')}
  ${q(12,'עד מתי, ואיזה מספר קונקרטי צריך לזוז כדי שתגיד שזה היה שווה?','זו הנעילה. חסר תאריך או חסר מספר, לא עוברים לדבר על מחיר.')}
  <div class="stop"><b>הכלל.</b> אם בסוף החלק הזה אין מספר שהוא אמר, אין מחיר בשיחה הזאת. שלחו את ההצעה אחרי שהוא נקב, לא לפני.</div>
</div>

<div class="blk">
  <div class="blk-h">אחרי השיחה</div>
  <div class="blk-t">כרטיס קריאה · חמש הסיבות</div>
  <div class="blk-d">מצאו את השורה שמתאימה לתשובות בחלק ב. העמודה האחרונה היא מה שלא לכתוב בהצעה, גם אם מתחשק.</div>
  <table class="read">
    <tr><th>אם שמעתם</th><th>מה נעצר</th><th>מה ההצעה מכילה</th><th>מה לא להציע</th></tr>
    <tr>
      <td>שאלה 8: תעריף שעה או "תלוי"</td>
      <td>אין לו יחידה מתומחרת</td>
      <td>בניית יחידה אחת. פורמט, תוצר, מחיר, רציונל.</td>
      <td class="no">תמחור לפי ערך לפני שיש יחידה. תפריט אפשרויות.</td>
    </tr>
    <tr>
      <td>שאלה 5 "מהתוכן" + שאלה 6 "יש אבל כללי"</td>
      <td>הערוץ לא נושא את הערך</td>
      <td>העברת האבחון שהוא כבר עושה בשיחה, אל תוך הערוץ. תוצר ספיר.</td>
      <td class="no">תוכנית תוכן. שיפור פוסטים.</td>
    </tr>
    <tr>
      <td>שאלה 6 "כלום" + שאלה 5 "היכרות"</td>
      <td>שום דבר לא יוצא החוצה</td>
      <td>הוצאה של נכס אחד קיים, בשבוע. עם נמען מוגדר.</td>
      <td class="no">בניית מוצר חדש. תיק עבודות. הוא לא צריך עוד נכס.</td>
    </tr>
    <tr>
      <td>שאלה 7 "אין שעות" ויש לו נכסים</td>
      <td>הקשב לא מוקצה לרכישה</td>
      <td>שעה קבועה, רשימה תחומה, מדד שבועי אחד.</td>
      <td class="no">אסטרטגיה. מיצוב. זה לא הצוואר שלו.</td>
    </tr>
    <tr>
      <td>שאלה 9 "עבר לעשות לבד" או "נגרר"</td>
      <td>אין ניסוח למה עדיין צריך אותו</td>
      <td>שלב שני שהוא לא המשך של הראשון, עם קריטריון סיום כתוב.</td>
      <td class="no">ליווי חודשי. הרחבת סקופ. הבעיה היא הגבול.</td>
    </tr>
  </table>
</div>

<div class="blk">
  <div class="blk-h">שלושה כללים לכתיבת ההצעה</div>
  <div class="rule">המספר בהצעה נגזר מהעוגן שהוא נקב בשאלה 11, לא מהשוק ולא משעות.</div>
  <div class="rule">אין הנחה יזומה. אם צריך להוריד, מורידים סקופ ולא מחיר.</div>
  ${S.no?`<div class="rule">הגבול שהגדרתם: ${esc(S.no)}. אם ההצעה חורגת ממנו, זו כבר לא ההצעה שלכם.</div>`:''}
</div>
`;
}

/* ---------- init ---------- */
document.getElementById('promptBiz').innerText=P_BIZ;
buildDR();
resetOutput(); // step 4 opened as a blank white slab before anything was built
loadProfile();
PROFILE_FIELDS.forEach(id=>{
  const el=document.getElementById(id);
  el.addEventListener('input', saveProfileDebounced); // debounced: don't hit localStorage on every keystroke
  el.addEventListener('change', saveProfile); // immediate on blur/select-change — belt-and-suspenders for the <select>
});
