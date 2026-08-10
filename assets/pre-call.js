/* ---------- prompts ---------- */

/* ---------- state ---------- */
const S = {};

/* ---------- nav ---------- */
document.querySelectorAll('.stepbtn').forEach(b=>b.onclick=()=>go(+b.dataset.s));
function go(n){
  if(n!==4) callMode(false); // the step buttons are hidden in call mode; leaving step 4 must not hide them
  if(n===3) refreshEdgeRef();
  document.querySelectorAll('.stepbtn').forEach(b=>b.classList.toggle('on',+b.dataset.s===n));
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('on'));
  document.getElementById('p'+n).classList.add('on');
  window.scrollTo({top:0,behavior:
    (typeof matchMedia==='function' && matchMedia('(prefers-reduced-motion: reduce)').matches)?'auto':'smooth'});
}

/* ---------- call mode ----------
   Everything this does lives in CSS (see the @media screen block next to the
   print sheet); this only flips the class and swaps which control bar is on
   screen. Deliberately not a persisted preference: call mode is a state you
   are in for twenty-five minutes, not a setting, and a page that reopened
   with its header missing would look broken rather than focused. */
function callMode(on){
  document.body.classList.toggle('callmode', on);
  show('callbar', on);
}
/* The reading card is hidden while the call is running, so the way to it is
   also the way out — one button, at the moment the call ends. */
function toReadingCard(){
  callMode(false);
  const el=document.getElementById('afterCall');
  if(el && el.scrollIntoView) el.scrollIntoView({behavior:
    (typeof matchMedia==='function' && matchMedia('(prefers-reduced-motion: reduce)').matches)?'auto':'smooth'});
}

/* The observation in step 2 is a general one about your clients; the sentence
   in step 3 is about this one person. Showing the first next to the field for
   the second is the whole point — otherwise you are being asked to remember
   what you wrote on a screen you left. */
function refreshEdgeRef(){
  const el=document.getElementById('edgeRef');
  if(!el) return;
  const edge=(document.getElementById('f_edge').value||'').split('\n').map(s=>s.trim()).filter(Boolean).join(' ');
  el.textContent = edge
    ? 'האבחנה הכללית שלכם, לגזור ממנה: "' + edge + '"'
    : 'לא מילאתם "מה רק אתם רואים אצל הלקוחות שלכם" בשלב 2. בלי זה אין ממה לגזור את המשפט.';
}

/* ---------- copy ---------- */
function cp(id,flag){ copyText(document.getElementById(id).innerText, flag); }
/* innerText is what the eye sees, not what the DOM holds — anything CSS has
   set to display:none is left out of it. Call mode hides the twelve `why`
   lines and the whole post-call reading card, so copying from inside call
   mode would emit a quietly truncated script: no error, no warning, just a
   shorter document than the one on the page. Same silent-breakage class as
   the CSP that killed every button and the print sheet that produced a blank
   page. Dropping the class for the length of one synchronous read costs one
   layout and cannot be seen. */
function cpText(id,flag){
  const wasCall = document.body.classList.contains('callmode');
  if(wasCall) document.body.classList.remove('callmode');
  const text = document.getElementById(id).innerText;
  if(wasCall) document.body.classList.add('callmode');
  copyText(text, flag);
}

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
/* One mechanism for hiding, used both ways. The inline style="display:none"
   attributes became class="hidden" when the CSP forbade inline styles, and
   every site that un-hid with style.display='' quietly stopped working —
   clearing an inline style does not outrank a class rule. The private-notes
   panel was hidden permanently that way, with no error to show for it. */
const show=(id,on)=>{ const n=document.getElementById(id); if(n) n.classList.toggle('hidden',!on); };

/* ---------- error boundary ----------
   Every button on this page runs through one delegated click listener (see
   the bottom of this file). Before this, a throw inside parseBiz() or
   build() — a malformed paste, a future edge case nobody hit yet — died
   silently: the click did nothing, nothing appeared on screen, and the
   only trace was a console line nobody here was looking at. This is the
   same mechanism as guard() in assets/pc-dom.js on POST-CALL, kept
   deliberately identical in shape rather than reinvented, so the two tools
   fail the same way instead of drifting into two different ones. */
const _failed = new Set();

function guard(name, fn){
  return function(...args){
    try{
      const out = fn.apply(this, args);
      if(_failed.has(name)){ _failed.delete(name); renderFailures(); }
      return out;
    }catch(e){
      console.error('[pre-call] ' + name + ' failed', e);
      _failed.add(name);
      renderFailures();
    }
  };
}

const FAIL_LABEL = { parse: 'חילוץ השדות מההדבקה', build: 'בניית התסריט' };

function renderFailures(){
  const box = document.getElementById('errBoundary');
  if(!box) return;
  if(!_failed.size){ show('errBoundary', false); box.innerHTML=''; return; }
  const names = [..._failed].map(n => FAIL_LABEL[n] || n);
  box.innerHTML = '<b>' + names.join(', ') + ' נכשל.</b> שאר הכלי ממשיך לעבוד, והנתונים ששמרת לא נפגעו. ' +
    'רענון הדף בדרך כלל פותר את זה; אם לא, פתח את הקונסולה — הפירוט שם.';
  show('errBoundary', true);
}

window.addEventListener('error', e => {
  if(!e.filename || !/pre-call/.test(e.filename)) return;
  _failed.add('כללי'); renderFailures();
});

function flash(f, ok=true){
  const e=document.getElementById(f);
  if(!e.dataset.orig) e.dataset.orig=e.textContent;
  e.textContent = ok ? e.dataset.orig : 'ההעתקה נכשלה — סמנו והעתיקו ידנית';
  e.style.color = ok ? '' : 'var(--red)';
  e.classList.add('on');
  setTimeout(()=>e.classList.remove('on'), ok?1600:3200);
}

/* ---------- parse pasted profile ---------- */
// Every field the paste can carry. The profile prompt asks for all nine in a
// fixed order and tells the model to return them "in this exact format" —
// but nothing stops a real answer, or a real person editing the model's
// output, from leaving one blank. `KNOWN_LABELS` exists so a blank field can
// be told apart from a missing one, in both directions below.
const KNOWN_LABELS = ['מה אני מוכר:','למי:','יחידה תחומה:','מחיר היחידה:','עסקה אחרונה:',
  'מקור הלקוח האחרון:','מה הלקוח הרוויח:','מה רק אני רואה:','מה אני לא מוכר:'];

const parseBiz = guard('parse', function parseBiz(){
  const t=document.getElementById('pasteBiz').value;
  if(!t.trim())return;
  /* A field left blank looks like "מה הלקוח הרוויח:\n" — label, then straight
     to the next line. \s*(.+) used to close over that newline and keep
     reading, so the "value" it found was the NEXT field's own label line —
     one blank field made the script quote "מה רק אני רואה:" as if it were a
     number the client said. [ \t]* stops the match at the end of the
     label's own line: a value that only exists on the following line is not
     a value here, it is a blank field, and the two must not be confused. */
  const g=(re)=>{const m=t.match(re);return m?m[1].trim():''};
  // a value that turned out to BE one of the other labels is the same bug by
  // a different route (an empty field with only whitespace before the next
  // label still needs the labels list to catch it) — never worth keeping
  const clean=v=>KNOWN_LABELS.some(l=>v===l||v.startsWith(l))?'':v;
  const set=(id,v)=>{v=clean(v); if(v)document.getElementById(id).value=v};
  set('f_what', g(/מה אני מוכר:[ \t]*(.+)/));
  set('f_who',  g(/למי:[ \t]*(.+)/));
  set('f_unit', g(/יחידה תחומה:[ \t]*(.+)/));
  set('f_price',g(/מחיר היחידה:[ \t]*(.+)/));
  set('f_last', g(/עסקה אחרונה:[ \t]*(.+)/));
  set('f_gain', g(/מה הלקוח הרוויח:[ \t]*(.+)/));
  set('f_no',   g(/מה אני לא מוכר:[ \t]*(.+)/));
  // stop only at the next KNOWN field label, not any line that happens to contain a colon
  // (a multiline answer here easily contains its own "לדוגמה:"-style colon).
  // Multi-line on purpose, which is exactly why [ \t]* alone cannot fix a
  // blank "מה רק אני רואה:" the way it fixes the single-line fields above —
  // [\s\S]+? still crosses the first newline looking for content, so a blank
  // field here swallowed the entire rest of the paste rather than one line
  // of it. clean() is what actually stops that: a capture that starts with
  // another field's label was never this field's answer.
  const edge=clean(g(/מה רק אני רואה:[ \t]*([\s\S]+?)(?:\n(?:מה אני לא מוכר:|מקור הלקוח האחרון:|מה הלקוח הרוויח:|עסקה אחרונה:|מחיר היחידה:|יחידה תחומה:|למי:|מה אני מוכר:)|$)/));
  if(edge)document.getElementById('f_edge').value=edge;
  const src=clean(g(/מקור הלקוח האחרון:[ \t]*(.+)/));
  if(src){
    const s=document.getElementById('f_src');
    if(/הפני|היכר/.test(src))s.value='ref';
    else if(/תוכן/.test(src))s.value='content';
    else if(/יזומ/.test(src))s.value='out';
  }
  saveProfile();
});

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
    storageWarned = false;
    flash('profileSaved');
  }catch(e){ warnStorage(); }
}

/* Private browsing, a full quota, or a blocked third-party context all land
   here. Failing silently was worse than not saving at all: the page kept
   showing "נשמר בדפדפן" from the last successful write, so the profile looked
   safe right up until the next visit found it gone. Said once, then left
   alone — repeating it on every keystroke would be its own kind of noise. */
let storageWarned = false;
function warnStorage(){
  if (storageWarned) return;
  storageWarned = true;
  const e = document.getElementById('profileSaved');
  if (!e) return;
  if (!e.dataset.orig) e.dataset.orig = e.textContent;
  e.textContent = 'הדפדפן חוסם שמירה — הפרופיל לא יישמר לפעם הבאה';
  e.classList.add('on', 'u-warn');
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
const PROSPECT_FIELDS = ['p_paste','p_name','p_co','p_trig','p_how','p_own'];
function newProspect(){
  PROSPECT_FIELDS.forEach(id=>{ document.getElementById(id).value=''; });
  document.getElementById('p_pair').value='1';
  buildDR();
  refreshEdgeRef();
  resetOutput(); // the previous prospect's script was staying on step 4, name and all
}

/* ---------- build script ---------- */
const build = guard('build', function build(){
  const v=id=>document.getElementById(id).value.trim();
  S.what=v('f_what'); S.who=v('f_who'); S.unit=v('f_unit'); S.price=v('f_price');
  S.last=v('f_last'); S.src=v('f_src'); S.gain=v('f_gain'); S.edge=v('f_edge'); S.no=v('f_no');
  S.pname=v('p_name'); S.pco=v('p_co'); S.ptext=v('p_paste'); S.ptrig=v('p_trig');
  S.phow=v('p_how'); S.ppair=v('p_pair'); S.pown=v('p_own');

  const err2=document.getElementById('err2');
  if(!S.what){
    err2.innerText='חסר השדה "מה אתם מוכרים". בלעדיו התסריט יוצא כללי, ואז הוא לא שווה יותר מרשימת שאלות באינטרנט.';
    show('err2', true);
    go(2);
    setTimeout(()=>document.getElementById('f_what').focus(),250);
    return;
  }
  show('err2', false);

  document.getElementById('outArea').innerHTML=render();
  renderPrivate();
  go(4);
});

/* Rendered outside #outArea on purpose — see the .priv CSS note. */
function renderPrivate(){
  const el=document.getElementById('privArea');
  const items=(S.priv||[]);
  if(!items.length){ show('privArea', false); el.innerHTML=''; return; }
  el.innerHTML =
    '<h4>לעיניכם בלבד</h4><ul>'+items.map(t=>`<li>${esc(t)}</li>`).join('')+'</ul>'+
    '<div class="seal">לא נכלל בהעתקה ולא בהדפסה. אלה המספרים שלכם, לא של השיחה.</div>';
  show('privArea', true);
}

const EMPTY_OUT = '<div class="empty">עוד לא נבנה תסריט.<br>מלאו את שלב 2, ואז לחצו "בנה את התסריט" בשלב 3.</div>';
function resetOutput(){
  document.getElementById('outArea').innerHTML=EMPTY_OUT;
  S.priv=[];
  renderPrivate();
  callMode(false); // call mode over an empty script is a blank page with no way off it
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

  /* --- ownership move ---
     The edge field is a general observation about YOUR clients, so it can't be
     handed over as a guess about this specific person, and splicing it into a
     sentence dropped every line after the first.

     What it used to do instead was worse than either: it printed the whole
     observation into the room and told the operator to compose the sentence
     from it, live. That is the one place in the document that asks for
     authoring rather than reading, at the one moment the operator has no
     capacity for it — reading and speaking compete, and composing while
     listening is what produces the read-off-a-page voice. The composing moved
     to step 3. When the sentence is prepared, this block hands over a
     finished line and nothing else; when it is not, the script says so
     plainly rather than pretending the old instruction was fine. */
  let own, sayLine = '', ownGap = '';
  const edgeFull = S.edge ? S.edge.split('\n').map(l=>l.trim()).filter(Boolean).join(' ') : '';
  if(S.pown){
    own = `אמרו לו את המשפט שהכנתם, ואז שאלו:`;
    sayLine = `<div class="say">${esc(S.pown)}</div>`;
  }else if(S.edge){
    own = `מה שאתם רואים אצל לקוחות כאלה, והם עצמם לא: "${edgeFull}" — זו אבחנה כללית שלכם, לא עובדה עליו. נסחו ממנה משפט אחד עליו, בגוף שני, מעט לא מדויק בכוונה. ואז שאלו:`;
    ownGap = `<div class="gap"><b>המשפט הזה לא הוכן.</b> ניסוח בזמן השיחה הוא מה שנשמע כמו קריאה מדף. חזרו לשלב 3, לשדה "המשפט שתגידו בשאלה 10", ונסחו אותו לפני שאתם מתקשרים.</div>`;
  }else{
    own = `נסחו לו את הצוואר שלו במשפט אחד, מעט לא מדויק בכוונה, ואז שאלו:`;
    ownGap = `<div class="gap"><b>אין ממה לנסח את המשפט.</b> מלאו את "מה רק אתם רואים" בשלב 2, ואז את המשפט עצמו בשלב 3. בלי שניהם שאלה 10 מבקשת מכם להמציא ניסוח באוויר, מול אדם שמחכה.</div>`;
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

  /* --- what the ledger already knows about the person holding this script ---
     A beginner and a veteran need opposite things from the same twelve questions.
     The beginner has no number of their own, so the anchor in question 11 leans on
     an estimate. The veteran has one, and gives it away before being asked.

     Neither is answerable by asking "how experienced are you": years in business
     say nothing about whether somebody can hold a price, and the ledger says it
     exactly — how many deals were priced, and how many held. So this is derived,
     like everything else here, and no question was added to any form.

     One line, by priority, never three: this page is read aloud under pressure and
     the whole design of it is one instruction at a time.

     Guarded on every level because PRE-CALL has worked with no ledger at all for
     its entire life and must keep working — somebody who has never opened
     POST-CALL is the likeliest person to be holding this. A corrupt store reads as
     an empty one inside deals.js, which lands on the first-timer line, and that is
     the right answer for it. */
  const ten = (typeof PC !== 'undefined' && PC.deals && PC.deals.tenure)
    ? PC.deals.tenure() : null;
  if(ten){
    if(ten.selfOffered > 0){
      openers.push('בפנקס שלכם ' + (ten.selfOffered === 1 ? 'עסקה אחת שבה ירדתם' :
        ten.selfOffered + ' עסקאות שבהן ירדתם') + ' במחיר לפני שהלקוח ביקש. ' +
        'שאלה 12 היא המקום שזה מתחיל בו — החליטו עכשיו מה לא תיתנו, לפני שהוא שואל.');
    } else if(ten.closed >= 2 && !ten.discounted){
      openers.push(ten.closed + ' העסקאות שסגרתם נסגרו במחיר שנקבתם, ואף אחת לא ירדה — ' +
        'כלומר לא בדקתם את התקרה שלכם. בשאלה 11 נקבו במספר גבוה מהאחרון, ותקשיבו לתשובה.');
    /* `total > 0` and not merely `closed === 0`, which is the difference between
       a ledger with nothing closed in it and no ledger at all. Somebody who has
       never opened POST-CALL is the likeliest person holding this script, and
       telling them what their ledger does not contain would be a line about a tool
       they may not know exists. Silence is the right output there — and it is also
       what keeps an untriggered prep list empty rather than rendering a heading
       over one sentence, which a test in this file has protected since before any
       of this. */
    } else if(ten.total > 0 && ten.closed === 0){
      openers.push('יש בפנקס הצעות, אבל אף אחת לא נסגרה — כלומר אין לכם מספר משלכם לעוגן. ' +
        'בשאלות 2 ו-8 תשמעו את המספרים שלו — הם עדיפים על אומדן שלכם.');
    }
  }
  if(S.src) openers.push(`הלקוח האחרון שלכם הגיע דרך ${SRC_LABEL[S.src]||S.src}. בשאלה 5 תשמעו מאיפה הגיע הלקוח שלו — אם זה ערוץ אחר משלכם, זה סימן שהערוץ ששכנע אתכם לא בהכרח ישכנע אותו.`);

  if(S.last && S.gain) priv.push(`העסקה האחרונה שלכם: ${S.last}. הרווח שהערכתם אצל הלקוח: ${S.gain}. היחס הזה הוא הכיול שלכם בראש לפני שאלה 11.`);
  else if(S.last) priv.push(`העסקה האחרונה שלכם: ${S.last}.`);
  if(S.price) priv.push(`מחיר היחידה שלכם: ${S.price}. רצפה פנימית למה שכדאי בכלל להמשיך אליו.`);
  S.priv = priv;

  // the space after the badge is load-bearing: without it innerText (what the copy
  // button emits) glued the number to the question — "1מה אתה צריך ממני?"
  const q=(n,txt,why)=>`<div class="q"><span class="qn">${n}</span> ${esc(txt)}${why?`<span class="why">${esc(why)}</span>`:''}</div>`;

  /* --- the reading tables ---
     Written as data rather than as markup for one reason: below 600px the
     heading row is hidden and every cell carries its own heading in data-l
     instead (see the narrow-table rules in the stylesheet). Hand-written
     data-l attributes would drift from the <th> above them the first time a
     column was renamed, and nothing on screen would say so — the wrong
     label simply appears under the right cell. Here they cannot drift: they
     are the same strings. A cell is either text, or {t, no:true} for the
     "do not offer this" column. */
  const readTable=(heads, rows)=>
    '<div class="tbl-wrap">\n  <table class="read" role="table"><tbody role="rowgroup">' +
    '<tr role="row">' + heads.map(h=>`<th role="columnheader">${esc(h)}</th>`).join('') + '</tr>' +
    rows.map(r=>'<tr role="row">' + r.map((c,i)=>{
      const txt = typeof c === 'string' ? c : c.t;
      const cls = (typeof c === 'object' && c.no) ? ' class="no"' : '';
      return `<td role="cell"${cls} data-l="${esc(heads[i])}">${esc(txt)}</td>`;
    }).join('') + '</tr>').join('') +
    '</tbody></table>\n  </div>';

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
  ${sayLine}
  ${q(10,'זה נשמע לך מדויק, או שאתה היית מנסח אחרת?','בקשו אישור על אבחנה, לא על כיוון. "הכיוון בסדר?" מקבל "כן" ומעביר נושא.')}
  ${ownGap}
  ${readTable(
    ['מה שהוא עושה','מה זה אומר','מה מותר להציע'],
    [
      ['מנסח מחדש בשפתו ומוסיף חומר','הוא הבעלים של הבעיה','תהליך מלא'],
      ['דוחה ומחדד גרסה משלו','יש בעלות, הניסוח שלכם החטיא','תהליך שמתחיל מהניסוח שלו'],
      ['מהנהן, "כן", "נכון"','הוא לא אוחז בבעיה',{t:'לא תהליך. מפגש בודד או שיחת המשך.',no:true}]
    ])}
</div>

<div class="blk">
  <div class="blk-h">חלק ד · הנעילה</div>
  <div class="blk-t">המספר, ומי מחזיק אותו</div>
  <div class="blk-d">אל תשאלו "כמה זה שווה לך לדעתך". השאלה הזו מייצרת "אני לא יודע" כמעט תמיד, ואז הלחץ נשאר בחדר. תנו עוגן שהוא מכייל.</div>
  ${q(11,anchor,'הוא מכייל מספר קיים במקום לייצר מאפס. אם הוא אומר "פחות", בקשו כמה פחות. זה עדיין מספר שלו.')}
  ${!S.gain?`<div class="gap"><b>אין לכם מספר לעוגן.</b> שאלה 11 מכילה סוגריים במקום סכום, ולכן היא מבקשת מכם להמציא מספר בזמן השיחה — וזה המספר שכל ההצעה נגזרת ממנו. מלאו "מה הלקוח האחרון הרוויח" בשלב 2.</div>`:''}
  ${q(12,'עד מתי, ואיזה מספר קונקרטי צריך לזוז כדי שתגיד שזה היה שווה?','זו הנעילה. חסר תאריך או חסר מספר, לא עוברים לדבר על מחיר.')}
  <div class="stop"><b>הכלל.</b> אם בסוף החלק הזה אין מספר שהוא אמר, אין מחיר בשיחה הזאת. שלחו את ההצעה אחרי שהוא נקב, לא לפני.</div>
</div>

<!-- .blk-post: useful only once the last answer is in. Call mode hides these
     two so the room holds the questions and nothing else; the bar's second
     button brings them back at the moment the call ends. Print keeps them. -->
<div class="blk blk-post" id="afterCall">
  <div class="blk-h">אחרי השיחה</div>
  <div class="blk-t">כרטיס קריאה · חמש הסיבות</div>
  <div class="blk-d">מצאו את השורה שמתאימה לתשובות בחלק ב. העמודה האחרונה היא מה שלא לכתוב בהצעה, גם אם מתחשק.</div>
  ${readTable(
    ['אם שמעתם','מה נעצר','מה ההצעה מכילה','מה לא להציע'],
    [
      ['שאלה 8: תעריף שעה או "תלוי"','אין לו יחידה מתומחרת',
       'בניית יחידה אחת. פורמט, תוצר, מחיר, רציונל.',
       {t:'תמחור לפי ערך לפני שיש יחידה. תפריט אפשרויות.',no:true}],
      ['שאלה 5 "מהתוכן" + שאלה 6 "יש אבל כללי"','הערוץ לא נושא את הערך',
       'העברת האבחון שהוא כבר עושה בשיחה, אל תוך הערוץ. תוצר ספיר.',
       {t:'תוכנית תוכן. שיפור פוסטים.',no:true}],
      ['שאלה 6 "כלום" + שאלה 5 "היכרות"','שום דבר לא יוצא החוצה',
       'הוצאה של נכס אחד קיים, בשבוע. עם נמען מוגדר.',
       {t:'בניית מוצר חדש. תיק עבודות. הוא לא צריך עוד נכס.',no:true}],
      ['שאלה 7 "אין שעות" ויש לו נכסים','הקשב לא מוקצה לרכישה',
       'שעה קבועה, רשימה תחומה, מדד שבועי אחד.',
       {t:'אסטרטגיה. מיצוב. זה לא הצוואר שלו.',no:true}],
      ['שאלה 9 "עבר לעשות לבד" או "נגרר"','אין ניסוח למה עדיין צריך אותו',
       'שלב שני שהוא לא המשך של הראשון, עם קריטריון סיום כתוב.',
       {t:'ליווי חודשי. הרחבת סקופ. הבעיה היא הגבול.',no:true}]
    ])}
</div>

<div class="blk blk-post">
  <div class="blk-h">שלושה כללים לכתיבת ההצעה</div>
  <div class="rule">המספר בהצעה נגזר מהעוגן שהוא נקב בשאלה 11, לא מהשוק ולא משעות.</div>
  <div class="rule">אין הנחה יזומה. אם צריך להוריד, מורידים סקופ ולא מחיר.</div>
  ${S.no?`<div class="rule">הגבול שהגדרתם: ${esc(S.no)}. אם ההצעה חורגת ממנו, זו כבר לא ההצעה שלכם.</div>`:''}
</div>
`;
}

/* ---------- backup / restore ----------
   Everything on this page — the profile, and separately the whole ledger in
   POST-CALL — lives only in this browser's localStorage. See pc-backup.js
   for why that stops being acceptable once either tool holds a paying
   customer's history. Download writes a file the operator keeps themselves;
   restore shows exactly what it is about to overwrite before it does. */
function downloadBackup(){
  const text = PC.backup.serialize(localStorage);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'precall-postcall-backup-' + new Date().toISOString().slice(0,10) + '.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function pickBackupFile(){
  const input = document.getElementById('backupFile');
  if(input) input.click();
}
function backupFlash(msg, warn){
  const box = document.getElementById('backupMsg');
  if(!box) return;
  box.textContent = msg;
  box.classList.toggle('u-warn', !!warn);
  box.classList.add('on');
  setTimeout(()=>box.classList.remove('on'), warn ? 4000 : 2200);
}
function handleBackupFile(e){
  const file = e.target.files && e.target.files[0];
  e.target.value = ''; // choosing the same file twice must still fire 'change'
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => restoreBackup(reader.result);
  reader.onerror = () => backupFlash('לא הצלחתי לקרוא את הקובץ', true);
  reader.readAsText(file);
}
function restoreBackup(text){
  const p = PC.backup.preview(text, localStorage);
  if(!p.ok){ backupFlash('הקובץ לא נראה כמו גיבוי תקין מהכלי הזה', true); return; }
  const overwriting = p.willOverwrite.length ? '\n\nזה ידרוס: ' + p.willOverwrite.join(', ') : '';
  const at = p.at ? new Date(p.at).toLocaleDateString('he-IL') : 'תאריך לא ידוע';
  if(!confirm('לשחזר גיבוי מ-' + at + '?' + overwriting)) return;
  PC.backup.importAll(text, localStorage);
  backupFlash('שוחזר. טוען מחדש...');
  setTimeout(()=>location.reload(), 600);
}

/* ---------- init ---------- */
document.getElementById('promptBiz').innerText=P_BIZ;
buildDR();
resetOutput(); // step 4 opened as a blank white slab before anything was built
loadProfile();
refreshEdgeRef(); // the profile has just loaded; step 3's reference line reflects it from the first paint
PROFILE_FIELDS.forEach(id=>{
  const el=document.getElementById(id);
  el.addEventListener('input', saveProfileDebounced); // debounced: don't hit localStorage on every keystroke
  el.addEventListener('change', saveProfile); // immediate on blur/select-change — belt-and-suspenders for the <select>
});

/* ---------- event wiring ----------
   Inline onclick/oninput attributes are blocked by the shipped Content Security
   Policy (script-src 'self'), which would have left every button dead in
   production. One delegated listener replaces them all. */
const ACTIONS = {
  'cp-biz':       () => cp('promptBiz', 'c1'),
  'cp-dr':        () => cp('promptDR', 'c2'),
  'cp-out':       () => cpText('outArea', 'c3'),
  parse:          parseBiz,
  clearprofile:   clearProfile,
  go3:            () => go(3),
  newprospect:    newProspect,
  build:          build,
  'callmode-on':  () => callMode(true),
  'callmode-off': () => callMode(false),
  'to-card':      toReadingCard,
  print:          () => window.print(),
  'backup-export': downloadBackup,
  'backup-import': pickBackupFile
};
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const fn = ACTIONS[t.dataset.act];
  if (fn) { e.preventDefault(); fn(); }
});
document.querySelectorAll('[data-oninput="builddr"]').forEach(
  el => el.addEventListener('input', buildDR));
const backupFileInput = document.getElementById('backupFile');
if(backupFileInput) backupFileInput.addEventListener('change', handleBackupFile);
