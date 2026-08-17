/* Runs in <head>, synchronously, before first paint — the only job used to be
   applying explicit theme and language choices before layout. FIELD added one
   product-wide responsibility that belongs here for the same reason: every page
   already loads this file, so the visible action contract can be enforced once
   across PRE-CALL, POST-CALL and the entry flow without another module or request.

   The contract does not change product logic. It only aligns what a control says
   with what the existing action actually does:
     - name the user's task, not the implementation mechanism
     - name an external channel before a click leaves the product

   localStorage can throw (private browsing, blocked storage); a page that cannot
   read a preference falls back to the system scheme and Hebrew. */
(function(){
  var doc = document.documentElement;
  var theme = null, lang = null;
  try{
    theme = localStorage.getItem('ui_theme');
    lang  = localStorage.getItem('ui_lang');
  }catch(e){}
  if (theme === 'dark' || theme === 'light') doc.setAttribute('data-theme', theme);
  if (lang === 'en'){
    doc.lang = 'en'; doc.dir = 'ltr';
    /* The English dictionaries load here, synchronously, and only here:
       a Hebrew visit pays zero bytes for the second language. */
    var page = (location.pathname.split('/').pop() || 'index')
      .replace(/\.html$/, '') || 'index';
    var dicts = { 'index': ['entry'], 'pre-call': ['pre-call'],
                  'post-call': ['post-call', 'post-call-tools'],
                  'privacy': ['privacy'],
                  'accessibility': ['accessibility'] }[page];
    if (dicts) document.write(['common'].concat(dicts).map(function(d){
      return '<script src="assets/en-' + d + '.js"><\/script>';
    }).join(''));
  }

  /* The tab-bar colour. Two values, not one: the browser paints this before any
     stylesheet resolves, and a dark page under a light tab bar reads as a glitch. */
  var dark = theme === 'dark' ||
    (theme !== 'light' && typeof matchMedia === 'function' &&
     matchMedia('(prefers-color-scheme: dark)').matches);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#14171a' : '#e2e5e9');

  /* ---------- FIELD action contract ---------- */
  function isHebrew(){
    return (doc.lang || 'he').toLowerCase().indexOf('he') === 0;
  }
  function one(sel){ return document.querySelector(sel); }
  function all(sel){ return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function setButton(act, label){
    all('[data-act="' + act + '"]').forEach(function(b){ b.textContent = label; });
  }

  function replaceExact(from, to){
    if (!document.body) return;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var n;
    while ((n = walker.nextNode())) {
      if ((n.nodeValue || '').trim() === from) n.nodeValue = n.nodeValue.replace(from, to);
    }
  }

  function replaceContaining(from, to){
    if (!document.body) return;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var n;
    while ((n = walker.nextNode())) {
      if ((n.nodeValue || '').indexOf(from) !== -1) n.nodeValue = n.nodeValue.split(from).join(to);
    }
  }

  function contactChannel(){
    var addr = one('#buyContact');
    var t = addr ? (addr.textContent || '').trim() : '';
    if (/^\+?\d[\d\s-]+$/.test(t)) return 'WhatsApp';
    if (/@/.test(t)) return 'אימייל';
    return '';
  }

  function makeExternalRouteExplicit(){
    var channel = contactChannel();
    if (!channel) return;
    var label = channel === 'WhatsApp'
      ? 'פתח WhatsApp לבקשת מפתח'
      : 'פתח ' + channel + ' לבקשת מפתח';

    var pay = one('#payBtn');
    if (pay && /מפתח|הודעה/.test(pay.textContent || '')) pay.textContent = label;

    var early = one('[data-act="askkey"]');
    if (early) early.textContent = label;
  }

  function applyActionContract(){
    if (!isHebrew() || !document.body) return;

    /* POST-CALL: extraction is the mechanism; finding what matters to the
       proposal is the user's task. */
    setButton('trlocal', 'מצא מה חשוב להצעה');
    setButton('trprompt', 'מצא עוד פרטים עם AI');

    /* PRE-CALL: parsing fields is implementation language. */
    all('[data-act="parse"]').forEach(function(b){
      if (/חלץ|שדות|הדבקה/.test(b.textContent || '')) b.textContent = 'מלא את הפרופיל מהטקסט';
    });
    all('[data-act="go2"]').forEach(function(b){
      if ((b.textContent || '').trim() === 'המשך לצד השני') b.textContent = 'המשך להכנת השיחה';
    });
    replaceExact('שלב 2 · הצד השני', 'שלב 2 · מי מולכם');
    replaceExact('מסלול מעמיק · פרומפט ל-Deep Research', 'מחקר מעמיק על הלקוח');

    /* Dynamic transcript review: describe the decision the user is making,
       not the data structure being moved. */
    replaceExact('3 · עבור על מה שנמצא ואשר', 'בדוק מה ייכנס להצעה');
    all('[data-act="trapply"]').forEach(function(b){ b.textContent = 'השתמש בפרטים שאישרתי'; });
    replaceExact('מאיפה הגיעו המספרים:', 'על מה המחיר נשען:');
    replaceContaining('הטופס מולא מהשיחה', 'הפרטים שאישרת נכנסו להצעה');

    /* Copy / PDF / Send remain exactly those actions. If they are locked, the
       product first opens its own wall. Only the separate key-request control
       changes channel, so that control names WhatsApp/email before the click. */
    makeExternalRouteExplicit();
  }

  var scheduled = false;
  function scheduleContract(){
    if (scheduled) return;
    scheduled = true;
    Promise.resolve().then(function(){
      scheduled = false;
      applyActionContract();
    });
  }

  function mountActionContract(){
    applyActionContract();
    if (document.body && typeof MutationObserver !== 'undefined') {
      new MutationObserver(scheduleContract).observe(document.body, {
        subtree: true, childList: true, characterData: true
      });
    }
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', mountActionContract, { once: true });
  else
    mountActionContract();
})();
