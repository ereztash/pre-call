/* ============================================================
   Language and theme, in one place.

   The product is written in Hebrew, in the files, and stays that way:
   Hebrew in the markup is what the attention model measures and what
   every string-pinning test asserts against. English is an overlay — a
   dictionary keyed by the exact Hebrew string it replaces, applied at
   render time. There are no invented translation keys to keep in sync
   with anything: the Hebrew sentence IS the key, so a copy edit that
   forgets the dictionary breaks assets/i18n.test.js instead of quietly
   shipping a half-translated page.

   Three surfaces get translated:
     1. Static markup — walked once at DOMContentLoaded: text nodes,
        the four read-aloud attributes (placeholder, aria-label, title,
        alt), the page title, and elements marked data-i18n, whose
        whole innerHTML is swapped so inline markup survives word-order
        changes between the languages.
     2. JS-rendered strings — modules pass their Hebrew through
        PC.i18n.tr() at the render seam. tr() interpolates {name}
        params for both languages, so the Hebrew in the code keeps
        reading as a sentence rather than as a template.
     3. The two dynamic documents (the call script, the proposal) —
        they are built from the same seams, so they follow the UI
        language: an English operator sends an English proposal.

   The dictionaries load per page (assets/en-*.js) because index.html
   has a 16KB transfer budget and the full product dictionary belongs
   to the pages that render the product.

   Loaded first in the body, before every dictionary and every module.
   assets/pc-boot.js in <head> has already set lang/dir/theme, so
   nothing here moves layout — this file only fills it in. */
(function(){
  'use strict';
  var HEB = /[֐-׿]/;
  var dict = {};
  var lang = 'he', theme = 'auto';
  var hasDoc = typeof document !== 'undefined';

  try{
    lang  = localStorage.getItem('ui_lang') === 'en' ? 'en' : 'he';
    var t = localStorage.getItem('ui_theme');
    theme = (t === 'dark' || t === 'light') ? t : 'auto';
  }catch(e){}

  function norm(s){ return String(s).replace(/\s+/g, ' ').trim(); }

  function reg(entries){ for (var k in entries) dict[norm(k)] = entries[k]; }

  /* The one function modules call. Hebrew in, the display language out,
     params interpolated either way. A missing translation returns the
     Hebrew — a bilingual sentence is worse than a Hebrew one, but a
     blank is worse than both, and the coverage test is what makes
     "missing" a build failure rather than a runtime surprise. */
  function tr(s, params){
    var out = s;
    if (lang === 'en'){
      var hit = dict[norm(s)];
      if (hit !== undefined) out = hit;
    }
    if (params) for (var k in params){
      out = out.split('{' + k + '}').join(params[k]);
    }
    return out;
  }

  /* ---------- the static walk ---------- */
  var ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];

  function trAttrs(el){
    if (!el.getAttribute) return;
    for (var i = 0; i < ATTRS.length; i++){
      var v = el.getAttribute(ATTRS[i]);
      if (v && HEB.test(v)){
        var hit = dict[norm(v)];
        if (hit !== undefined) el.setAttribute(ATTRS[i], hit);
      }
    }
  }

  function walk(el){
    trAttrs(el);
    if (el.hasAttribute && el.hasAttribute('data-i18n')){
      var k = norm(el.innerHTML);
      if (dict[k] !== undefined) el.innerHTML = dict[k];
      return; /* the English block carries its own inline markup */
    }
    for (var n = el.firstChild; n; n = n.nextSibling){
      if (n.nodeType === 3 && HEB.test(n.nodeValue)){
        var hit = dict[norm(n.nodeValue)];
        if (hit !== undefined)
          n.nodeValue = n.nodeValue.replace(/^(\s*)[\s\S]*?(\s*)$/,
            function(m, a, b){ return a + hit + b; });
      } else if (n.nodeType === 1) walk(n);
    }
  }

  function apply(){
    if (lang !== 'en' || !hasDoc) return;
    if (document.title && HEB.test(document.title)){
      var hit = dict[norm(document.title)];
      if (hit !== undefined) document.title = hit;
    }
    if (document.body) walk(document.body);
  }

  /* ---------- preferences ---------- */
  function setLang(next){
    try{ localStorage.setItem('ui_lang', next === 'en' ? 'en' : 'he'); }catch(e){}
    /* A reload, deliberately: every module has already rendered in the
       old language from state that localStorage holds anyway. Re-render
       in place would mean every module learning to repaint itself for
       an event that happens approximately once per user. */
    location.reload();
  }

  function metaColor(){
    var dark = theme === 'dark' ||
      (theme !== 'light' && typeof matchMedia === 'function' &&
       matchMedia('(prefers-color-scheme: dark)').matches);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#14171a' : '#e2e5e9');
  }

  function setTheme(next){
    theme = next;
    try{
      if (next === 'auto') localStorage.removeItem('ui_theme');
      else localStorage.setItem('ui_theme', next);
    }catch(e){}
    if (!hasDoc) return;
    if (next === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', next);
    metaColor();
  }

  /* The strip: two buttons, top of every page, outside the page's own
     markup so no page has to mention it. Theme cycles auto → dark →
     light — three states because "follow the system" is the state a
     first visit is in, and taking it away means the toggle can never
     be un-decided. The language button is labelled in the language it
     switches TO: the reader it serves is the one who cannot read the
     current one. */
  var THEME_LABEL = {
    auto:  'תצוגה: אוטו',
    dark:  'תצוגה: כהה',
    light: 'תצוגה: בהירה'
  };
  reg({
    'תצוגה: אוטו':   'Theme: auto',
    'תצוגה: כהה':    'Theme: dark',
    'תצוגה: בהירה':  'Theme: light',
    'העדפות תצוגה ושפה': 'Display and language preferences',
    'החלפת שפה':     'Switch language'
  });

  function strip(){
    if (!hasDoc || !document.body) return;
    /* The pages carry an empty #prefsBar with a reserved min-height, so
       filling it moves nothing — the first version created this element
       here, after first paint, and every page below it shifted by the
       strip's height. CLS 0.05, measured by assets/perf.test.js, for
       two buttons. */
    var box = document.getElementById('prefsBar');
    if (!box){
      box = document.createElement('div');
      box.className = 'prefs';
      document.body.insertBefore(box, document.body.firstChild);
    }
    if (box.childNodes.length) return;
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', tr('העדפות תצוגה ושפה'));

    var tBtn = document.createElement('button');
    tBtn.type = 'button';
    tBtn.textContent = tr(THEME_LABEL[theme]);
    tBtn.addEventListener('click', function(){
      setTheme(theme === 'auto' ? 'dark' : theme === 'dark' ? 'light' : 'auto');
      tBtn.textContent = tr(THEME_LABEL[theme]);
    });

    var lBtn = document.createElement('button');
    lBtn.type = 'button';
    lBtn.textContent = lang === 'en' ? 'עברית' : 'English';
    lBtn.setAttribute('aria-label', tr('החלפת שפה'));
    lBtn.addEventListener('click', function(){ setLang(lang === 'en' ? 'he' : 'en'); });

    box.appendChild(tBtn);
    box.appendChild(lBtn);
  }

  var api = {
    tr: tr, reg: reg, apply: apply, norm: norm,
    lang: function(){ return lang; },
    /* for toLocaleDateString and friends. en-GB, not en-US: the dates in
       this product are day-first for the same reason the currency is ₪ —
       the operator's world is, whatever language the UI is in. */
    locale: function(){ return lang === 'en' ? 'en-GB' : 'he-IL'; },
    theme: function(){ return theme; },
    setTheme: setTheme, setLang: setLang
  };

  if (typeof window !== 'undefined'){
    window.PC = window.PC || {};
    window.PC.i18n = api;
    if (hasDoc) document.addEventListener('DOMContentLoaded', function(){
      strip();
      apply();
    });
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
