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

  /* The logo lives outside FIELDS on purpose. FIELDS drives a generic
     "read every id's .value" loop in post-call.js (readSender()), and a
     file input's .value is a fake browser-assigned path, never the data —
     looping it in there would silently save the string "C:\fakepath\..."
     as a logo. It is written and read through its own key instead, by the
     file-picker code that actually has the data URI in hand. */
  const LOGO_KEY = 's_logo';
  /* Same ceiling the UI enforces before it ever calls save() — checked
     again here because this module has no other way to know a caller
     followed that rule, and a save() that trusts its caller is the reason
     half the bugs in this project's history got found by a user instead
     of a test. Base64 runs a data URI to about 4/3 of the source bytes;
     60KB of image is a bit over 80,000 characters. */
  const LOGO_MAX = 84000;

  /* A prefix test is not a validator. `/^data:image\//.test(...)` accepts
     `data:image/"><script>...` just as happily as a real logo, because it
     only checks how the string OPENS and says nothing about how it ends —
     and pc-proposal.js prints this value straight into an <img src="…">
     with no escaping (escaping a real base64 payload would corrupt it).
     The gap: pc-backup.js's importAll() writes a restored backup's fields
     straight into storage with setItem(), never through save() below, so
     a hand-edited or shared backup file reaches senderBlock() having
     passed no validation at all — the UI's own upload checks (MIME type,
     size) are not in that path either.
     Caught in review on the PR that introduced this field, before it
     shipped to anyone.

     So the check has to be complete, not partial: anchored at both ends
     (`^…$`), an explicit allowlist of the MIME subtypes the file picker's
     own `accept` attribute offers, and a payload restricted to the base64
     alphabet. That alphabet — A–Z, a–z, 0–9, +, /, and = for padding —
     contains none of `< > " & '`, so a string that matches this pattern
     cannot break out of the attribute it is printed into; the escaping
     the logo intentionally skips is redundant precisely because nothing
     that passes this regex could need it. */
  const LOGO_RE = /^data:image\/(png|jpe?g|webp|svg\+xml);base64,[A-Za-z0-9+/]+=*$/;

  function make(storage) {
    return {
      KEY, FIELDS, LOGO_KEY, LOGO_MAX, LOGO_RE,

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
          // only a data: URI, and only inside the ceiling — a stray string
          // here would otherwise print as a broken image on every future proposal
          const logo = data && data[LOGO_KEY];
          if (logo && logo.length <= LOGO_MAX && LOGO_RE.test(logo)) clean[LOGO_KEY] = logo;
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
    // the one gate a restored backup's raw fields actually pass through —
    // see the note on LOGO_RE for why a prefix test was not enough here
    const logo = (s[LOGO_KEY] && s[LOGO_KEY].length <= LOGO_MAX && LOGO_RE.test(s[LOGO_KEY]))
      ? s[LOGO_KEY] : null;
    return { name, business, contact, logo };
  }

  /* True when the operator has not filled in who they are. The caller uses
     this to say so before a document goes out, rather than after. */
  function missing(sender) { return !block(sender); }

  root.PC = root.PC || {};
  root.PC.senderFactory = make;
  root.PC.SENDER_FIELDS = FIELDS;
  root.PC.SENDER_KEY = KEY;
  root.PC.SENDER_LOGO_KEY = LOGO_KEY;
  root.PC.SENDER_LOGO_MAX = LOGO_MAX;
  root.PC.SENDER_LOGO_RE = LOGO_RE;
  root.PC.senderBlock = block;
  root.PC.senderMissing = missing;
  if (typeof localStorage !== 'undefined') root.PC.sender = make(localStorage);

  if (typeof module !== 'undefined' && module.exports)
    module.exports = { make, block, missing, FIELDS, KEY, LOGO_KEY, LOGO_MAX, LOGO_RE };
})(typeof window !== 'undefined' ? window : globalThis);
