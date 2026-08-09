/* ============================================================
   The entry page · picking up where you left off.

   The four cards are static and always correct — they cover the four
   situations somebody can be in, and none of them depends on state. This
   file adds the one thing a static list cannot do: notice that you are
   already mid-flow and offer the specific next step rather than making you
   re-derive it from a menu.

   Read-only by design. It looks at storage and never writes to it — the
   entry page is not a place where work happens, so it must not be a place
   where work can be lost.
   ============================================================ */
(function () {
  'use strict';

  const el = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s)
    .replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

  function read(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }   // blocked storage, or a corrupt value — behave as a first visit
  }

  /* Every fact the page can state about where this person already is.
     Deliberately narrow: a count and a name, never the contents. */
  function state() {
    const deals = read('postcall_deals_v1');
    const draft = read('postcall_draft_v1');
    const profile = read('precall_profile_v1');

    const list = Array.isArray(deals) ? deals : [];
    /* 'no_answer' belongs here too. It means asked and not answered, which
       is exactly the state this box exists to surface — deals.js counts it
       as undecided and pc-followup.js keeps chasing it, so leaving it out
       here meant an operator whose proposals were all marked no_answer got
       no prompt at all while the ledger was actively flagging them. Three
       files, three different ideas of "waiting", caught in review. */
    const waiting = list.filter(d =>
      d && (d.status === 'sent' || d.status === 'no_answer')).length;

    /* Whether a draft holds anything is pc-draft.js's rule, and it needs the
       untouched form to compare against — which only POST-CALL has. So the
       verdict is stamped there, at save time, by the module that owns the
       rule, and simply read here.

       The fallback is for drafts written before that stamp existed, and it
       is deliberately the narrow version: numbers alone, or a template
       alone, will not light this box for those older drafts. Being quiet
       when unsure beats claiming unfinished work that is not there. */
    const f = (draft && draft.fields) || {};
    const draftAlive = draft && typeof draft.hasContent === 'boolean'
      ? draft.hasContent
      : !!((f.q_process || '').trim() || (f.q_client || '').trim() ||
           (draft && (draft.systems || []).length) || (draft && draft.template));

    return {
      waiting,
      savedDeals: list.length,
      draftAlive,
      draftClient: (f.q_client || '').trim(),
      hasProfile: !!(profile && (profile.f_what || '').trim())
    };
  }

  function render() {
    const box = el('resumeBox');
    if (!box) return;
    const s = state();

    const lines = [];

    /* Ordered by how time-critical each one is. An unfinished proposal is
       the only thing here that can still be lost, so it leads. */
    if (s.draftAlive) {
      lines.push({
        text: s.draftClient
          ? 'יש הצעה שלא סיימתם, של ' + esc(s.draftClient) + '.'
          : 'יש הצעה שהתחלתם ולא סיימתם.',
        cta: 'להמשיך אותה',
        href: 'post-call.html'
      });
    }
    if (s.waiting) {
      lines.push({
        text: s.waiting === 1
          ? 'הצעה אחת נשלחה וממתינה לתשובה.'
          : s.waiting + ' הצעות נשלחו וממתינות לתשובה.',
        cta: 'לראות מה קרה',
        href: 'post-call.html#ledger'
      });
    }

    if (!lines.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }

    box.innerHTML =
      '<div class="resume-h">המשך מאיפה שהפסקתם</div>' +
      lines.map(l =>
        '<div class="resume-row">' +
          '<span class="resume-t">' + l.text + '</span>' +
          '<a class="resume-go" href="' + l.href + '">' + l.cta + '</a>' +
        '</div>').join('');
    box.classList.remove('hidden');
  }

  render();
})();
