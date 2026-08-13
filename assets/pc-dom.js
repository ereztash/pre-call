/* ============================================================
   POST-CALL · the small shared layer every other file sits on.

   Loaded as a classic script, not a module, and that is deliberate: ES
   modules are blocked from file:// by CORS, and this tool has to open by
   double-clicking the file. Classic scripts share one global lexical scope,
   so these names are visible to every file loaded after this one.
   ============================================================ */

var tr = (typeof PC !== 'undefined' && PC.i18n) ? PC.i18n.tr
  : function (s, p) { if (p) for (var k in p) s = s.split('{' + k + '}').join(p[k]); return s; };

const el = id => document.getElementById(id);

/* Everything that hides is hidden by the .hidden class, and everything that
   shows goes through here.

   This exists because of a bug worth remembering: those elements used to
   carry an inline display:none, and the code un-hid them by clearing that
   inline value. Removing the inline styles for the CSP left the class behind,
   and clearing an inline style cannot beat a class rule — so the paywall
   stopped opening and three of the four pricing methods lost their inputs,
   all without a single error. One mechanism, used both ways, cannot drift. */
const show = (id, on) => { const n = el(id); if (n) n.classList.toggle('hidden', !on); };

const num = id => { const v = parseFloat(el(id).value); return isFinite(v) && v > 0 ? v : 0; };
const txt = id => el(id).value.trim();
const esc = s => (s || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

/* ---------- error boundary ----------
   The page renders itself from one recompute chain: inputs → model → summary
   → proposal → ledger. Before this, a throw anywhere in that chain took the
   whole page down, and because every input listener calls the same chain, the
   tool then stayed broken for the rest of the session — the user's only clue
   being that typing stopped changing anything.

   guard() keeps a failure local: the section that threw says so, everything
   else keeps working, and the error reaches the console for whoever is
   debugging. It is not a way to ignore bugs; it is a way to stop one bad
   render from eating the document the user is in the middle of writing. */
const _failed = new Set();

function guard(name, fn, opts) {
  return function (...args) {
    try {
      const out = fn.apply(this, args);
      if (_failed.has(name)) { _failed.delete(name); renderFailures(); }
      return out;
    } catch (e) {
      console.error('[post-call] ' + name + ' failed', e);
      _failed.add(name);
      renderFailures();
      return opts && 'fallback' in opts ? opts.fallback : undefined;
    }
  };
}

const FAIL_LABEL = {
  recompute:  tr('המספרים'),
  proposal:   tr('המסמך'),
  scope:      tr('רשימת הסקופ'),
  ledger:     tr('ספר העסקאות'),
  templates:  tr('התבניות')
};

function renderFailures() {
  const box = el('errBoundary');
  if (!box) return;
  if (!_failed.size) { show('errBoundary', false); box.innerHTML = ''; return; }
  const names = [..._failed].map(n => FAIL_LABEL[n] || n);
  box.innerHTML =
    '<b>' + tr('חלק מהמסך לא התרענן: {names}.', { names: esc(names.join(', ')) }) + '</b> ' +
    tr('שאר הכלי ממשיך לעבוד, והנתונים ששמרת לא נפגעו.') + ' ' +
    tr('רענון הדף בדרך כלל פותר את זה; אם לא, פתח את הקונסולה — הפירוט שם.');
  show('errBoundary', true);
}

/* Anything the boundary could not wrap — an async rejection, a listener
   registered elsewhere — still ends up visible instead of silent. */
window.addEventListener('error', e => {
  if (!e.filename || !/post-call|pc-/.test(e.filename)) return;
  _failed.add(tr('כללי')); renderFailures();
});
window.addEventListener('unhandledrejection', () => { /* logged by the browser */ });

/* ---------- moving the viewport ----------
   Every scroll in this product went through scrollIntoView with a
   hardcoded behavior:'smooth'. Loading ?demo=1 animates the page 1048px
   on arrival, which is the single largest piece of unrequested motion in
   the product and lands on someone who has just clicked "show me an
   example" — precisely the reduced-motion case. The OS setting is
   honoured here in one place rather than at eleven call sites, none of
   which were checking it. */
function prefersLessMotion() {
  return typeof matchMedia === 'function' &&
         matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function scrollToEl(target, block) {
  const node = typeof target === 'string' ? el(target) : target;
  if (!node || !node.scrollIntoView) return;
  node.scrollIntoView({
    behavior: prefersLessMotion() ? 'auto' : 'smooth',
    block: block || 'start'
  });
}
function scrollPageTop() {
  window.scrollTo({ top: 0, behavior: prefersLessMotion() ? 'auto' : 'smooth' });
}
