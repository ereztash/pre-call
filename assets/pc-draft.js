/* ============================================================
   POST-CALL · keeping the draft you are in the middle of.

   Found by walking the journey rather than by reading the code: a reload
   during a draft left localStorage completely empty and the form blank.
   Everything typed since the call — the process description, the numbers,
   the systems, every scope decision — was gone, with no warning and nothing
   to recover from. On a phone that is not an edge case: a call comes in, the
   tab is evicted, and the tool that exists to save time has just cost the
   whole session.

   The saved-deals ledger did not cover this. It stores what you chose to
   save; this stores what you have not finished yet, which is exactly the
   state worth protecting.

   Deliberately separate from the ledger's storage key: a corrupt draft must
   never be able to take saved deals with it, and clearing one must not clear
   the other. Storage is injected so it runs in Node.
   ============================================================ */
(function (root) {
  'use strict';

  var tr = (typeof PC !== 'undefined' && PC.i18n) ? PC.i18n.tr
    : function (s, p) { if (p) for (var k in p) s = s.split('{' + k + '}').join(p[k]); return s; };

  const KEY = 'postcall_draft_v1';

  /* Every field whose value is worth an unfinished session. Listed rather
     than swept off the DOM so that adding an input somewhere unrelated does
     not silently start persisting it. */
  const FIELDS = [
    'q_process','q_client','q_freq','q_freq_unit','q_minutes','q_role','q_rate_custom',
    'q_trigger','q_err_freq','q_err_cost','q_integration','q_edge','q_prev','q_decider',
    'q_deadline','q_success','q_provenance',
    'a_capture','a_myrate','a_maint',
    'c_last','c_scale','c_deals','c_margin',
    'q_phone','q_email'
  ];

  function make(storage) {
    const api = {
      FIELDS,

      save(state) {
        try {
          storage.setItem(KEY, JSON.stringify(Object.assign({ at: new Date().toISOString() }, state)));
          return true;
        } catch (e) { return false; } // blocked or full — reported to the operator, not swallowed
      },

      load() {
        try {
          const raw = storage.getItem(KEY);
          if (!raw) return null;
          const d = JSON.parse(raw);
          return d && typeof d === 'object' ? d : null;
        } catch (e) { return null; }
      },

      clear() { try { storage.removeItem(KEY); return true; } catch (e) { return false; } },

      /* A draft holding nothing is not worth restoring, and worse, restoring
         it would show "draft recovered" over an empty form — which teaches
         the operator to distrust the message on the occasion it matters.

         `pristine` is the form as it comes up before anyone touches it,
         captured from the page itself rather than guessed. The first version
         of this carried a hand-written list of default values, which is a
         list that silently goes stale the moment a select's default changes
         — and a stale entry here means either a phantom recovery notice or a
         real draft judged empty and thrown away. */
      isEmpty(d, pristine) {
        if (!d) return true;
        const base = pristine || {};
        const hasContent = FIELDS.some(f => {
          const v = d.fields && d.fields[f];
          if (v === undefined || v === null || String(v).trim() === '') return false;
          return String(v) !== String(base[f] === undefined ? '' : base[f]);
        });
        return !hasContent && !(d.systems || []).length && !d.template;
      },

      /* How long the draft has been sitting. A draft from three weeks ago is
         probably not the call you just had, so the operator is told its age
         rather than having it silently reappear as if it were current. */
      age(d, now) {
        if (!d || !d.at) return null;
        const ms = (now || new Date()).getTime() - Date.parse(d.at);
        if (!isFinite(ms) || ms < 0) return null;
        const min = Math.floor(ms / 60000);
        if (min < 1) return tr('לפני פחות מדקה');
        if (min < 60) return tr('לפני {min} דקות', { min: min });
        const hr = Math.floor(min / 60);
        if (hr < 24) return tr('לפני {hr} שעות', { hr: hr });
        return tr('לפני {d} ימים', { d: Math.floor(hr / 24) });
      }
    };
    return api;
  }

  root.PC = root.PC || {};
  root.PC.draftFactory = make;
  root.PC.DRAFT_FIELDS = FIELDS;
  if (typeof localStorage !== 'undefined') root.PC.draft = make(localStorage);

  if (typeof module !== 'undefined' && module.exports) module.exports = { make, FIELDS, KEY };
})(typeof window !== 'undefined' ? window : globalThis);
