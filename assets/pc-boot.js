/* Runs in <head>, synchronously, before first paint — the only job is
   to make the explicit theme and language choices take effect before
   any pixel or any layout exists. A theme applied at the end of the
   body arrives as a flash of the wrong palette; a direction flipped
   after layout arrives as the whole page jumping sides. Everything
   else about preferences (the toggle strip, persistence, translation)
   lives in assets/pc-i18n.js at the bottom of the page.

   localStorage can throw (private browsing, blocked storage); a page
   that cannot read a preference falls back to the system scheme and
   Hebrew, which is exactly what a first visit gets. */
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
       a Hebrew visit pays zero bytes for the second language, which is
       what keeps the per-page transfer budgets in assets/weight.test.js
       honest about the default experience. document.write during head
       parsing is the one mechanism that guarantees the dictionary is
       evaluated before any module renders a string through it — a
       dynamically appended <script> resolves after the parser-inserted
       modules have already painted Hebrew. Same-origin src, so the
       shipped CSP (script-src 'self') allows it. */
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

  /* FIELD exposed a class of UX failures that does not belong to one screen:
     a control can be technically correct and still break trust if its label
     describes an internal mechanism, or if it silently changes channels.
     Load one small contract layer on every product page so the same rule is
     enforced in PRE-CALL, POST-CALL and the entry flow. It waits for the DOM;
     loading it here only guarantees every page gets it. */
  document.write('<script src="assets/action-contract-ui.js"><\/script>');

  /* The tab-bar colour. Two values, not one: the browser paints this
     before any stylesheet resolves, and a dark page under a light tab
     bar reads as a glitch in exactly the first 100ms a visitor sees. */
  var dark = theme === 'dark' ||
    (theme !== 'light' && typeof matchMedia === 'function' &&
     matchMedia('(prefers-color-scheme: dark)').matches);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#14171a' : '#e2e5e9');
})();
