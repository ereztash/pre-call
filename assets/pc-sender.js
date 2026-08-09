/* ============================================================
   POST-CALL · who the proposal is from.

   The product spent its whole life making sure the price could be
   defended, and shipped a document with no sender on it. A proposal that
   does not say who it is from is not a proposal — it is a quote someone
   found. This was invisible to every check the project runs, because an
   absent letterhead is not a defect in anything: the markup is valid, the
   contrast passes, nothing throws.

   Operator-level, not deal-level. Your own name does not change between
   clients, so it is asked once and reused — the same bargain PRE-CALL's
   business profile makes. Its own storage key for the same reason the
   draft has its own: a corrupt ledger must never be able to take your
   identity with it, and clearing one must not clear the other.

   Pure, storage injected, no DOM. Tested in Node.
   ============================================================ */
(function (root) {
  'use strict';

  const KEY = 'postcall_sender_v1';

  /* Deliberately short. Every field here is one the operator has to type
     before they can send anything, so each one has to earn its place:
     a name to sign it, a business line to say what you are, and the two
     ways a client actually replies. Anything else belongs in the body. */
  const FIELDS = ['s_name', 's_business', 's_phone', 's_email'];

  function make(storage) {
    return {
      KEY, FIELDS,

      load() {
        try {
          const raw = storage.getItem(KEY);
          if (!raw) return null;
          const d = JSON.parse(raw);
          return d && typeof d === 'object' && !Array.isArray(d) ? d : null;
        } catch (e) { return null; }
      },

      save(data) {
        try {
          const clean = {};
          FIELDS.forEach(f => { if (data && data[f]) clean[f] = String(data[f]).trim(); });
          clean.attribution = data && data.attribution !== false;
          storage.setItem(KEY, JSON.stringify(clean));
          return true;
        } catch (e) { return false; }   // blocked or full — reported, never swallowed
      },

      clear() { try { storage.removeItem(KEY); return true; } catch (e) { return false; } }
    };
  }

  /* What the document should print, or null when there is nothing worth
     printing. A letterhead containing only a phone number looks worse than
     no letterhead at all, so a name is the minimum that turns this on. */
  function block(sender) {
    const s = sender || {};
    const name = (s.s_name || '').trim();
    if (!name) return null;
    const business = (s.s_business || '').trim();
    const contact = [(s.s_phone || '').trim(), (s.s_email || '').trim()].filter(Boolean);
    return { name, business, contact };
  }

  /* True when the operator has not filled in who they are. The caller uses
     this to say so before a document goes out, rather than after. */
  function missing(sender) { return !block(sender); }

  root.PC = root.PC || {};
  root.PC.senderFactory = make;
  root.PC.SENDER_FIELDS = FIELDS;
  root.PC.SENDER_KEY = KEY;
  root.PC.senderBlock = block;
  root.PC.senderMissing = missing;
  if (typeof localStorage !== 'undefined') root.PC.sender = make(localStorage);

  if (typeof module !== 'undefined' && module.exports)
    module.exports = { make, block, missing, FIELDS, KEY };
})(typeof window !== 'undefined' ? window : globalThis);
