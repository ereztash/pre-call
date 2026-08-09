/* ============================================================
   PRE-CALL & POST-CALL · exporting and restoring what the browser holds.

   Every piece of data either tool keeps — the business profile, the
   unfinished draft, the whole deal ledger with its calibration history —
   lives only in this one browser's localStorage. Clearing the cache,
   switching devices, or a private-browsing window throws all of it away at
   once, with no warning and nothing to recover from. That is fine for a
   free tool. It stops being fine the moment POST-CALL is something someone
   pays for — a customer who loses a paid product's entire history to a
   cache clear is a cancelled customer, not a bug report.

   This is the way out: a JSON file the operator keeps themselves, on their
   own disk, in their own backup — not a sync service, just an escape hatch.

   Deliberately excludes the license state (postcall_key, postcall_key_ok_at).
   A backup file is exactly the kind of thing a user forwards to a friend or
   pastes into a support thread; a file that could hand over a paid key on
   request would be a leak wearing a convenience feature. The guard here is
   an allowlist, not a check against those two names — DATA_KEYS is the only
   thing this file will ever read or write, so a key it does not name cannot
   round-trip through it no matter what the caller's storage object holds.

   Pure: storage is injected (works against localStorage or a fake), no DOM.
   Loaded by both index.html and post-call.html.
   ============================================================ */
(function (root) {
  'use strict';

  const VERSION = 1;

  const DATA_KEYS = ['precall_profile_v1', 'postcall_deals_v1', 'postcall_draft_v1',
                     'postcall_sender_v1'];
  // Documented, not enforced by a check — see the header. Listed so the
  // omission is a decision on record, not something to rediscover later.
  const EXCLUDED_KEYS = ['postcall_key', 'postcall_key_ok_at'];

  function exportAll(storage) {
    const data = {};
    DATA_KEYS.forEach(k => {
      const raw = storage.getItem(k);
      if (raw !== null && raw !== undefined) data[k] = raw;
    });
    return { version: VERSION, at: new Date().toISOString(), data };
  }

  function serialize(storage) {
    return JSON.stringify(exportAll(storage), null, 2);
  }

  /* Refuses rather than guesses. Unreadable JSON, an unrecognised shape, or
     a version this file cannot read back are reported as failure, never
     silently partial-applied — a backup that half-imports is worse than one
     that visibly did nothing, because the operator has no way to tell which
     half they are looking at. */
  function parse(json) {
    let obj;
    try { obj = typeof json === 'string' ? JSON.parse(json) : json; }
    catch (e) { return { ok: false, error: 'not_json' }; }
    if (!obj || typeof obj !== 'object' || !obj.data || typeof obj.data !== 'object') {
      return { ok: false, error: 'bad_shape' };
    }
    if (typeof obj.version !== 'number' || obj.version > VERSION) {
      return { ok: false, error: 'unknown_version' };
    }
    const keys = Object.keys(obj.data).filter(k => DATA_KEYS.indexOf(k) !== -1);
    const foreign = Object.keys(obj.data).filter(k => DATA_KEYS.indexOf(k) === -1);
    if (!keys.length) return { ok: false, error: 'empty' };
    return { ok: true, at: obj.at || null, keys, foreign, raw: obj.data };
  }

  /* What importAll is about to do, before it does it — so the caller can
     say "this will replace your saved deals" and mean it, instead of that
     happening the instant a file is chosen. */
  function preview(json, storage) {
    const p = parse(json);
    if (!p.ok) return p;
    const willOverwrite = p.keys.filter(k => storage.getItem(k) !== null);
    return { ok: true, at: p.at, keys: p.keys, foreign: p.foreign, willOverwrite };
  }

  function importAll(json, storage) {
    const p = parse(json);
    if (!p.ok) return p;
    const imported = [];
    p.keys.forEach(k => {
      try { storage.setItem(k, p.raw[k]); imported.push(k); }
      catch (e) { /* quota or blocked storage — same failure shape as pc-draft.js */ }
    });
    return {
      ok: true, at: p.at, imported,
      skipped: p.keys.filter(k => imported.indexOf(k) === -1),
      foreign: p.foreign
    };
  }

  root.PC = root.PC || {};
  root.PC.backup = { exportAll, serialize, parse, preview, importAll, DATA_KEYS, EXCLUDED_KEYS, VERSION };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.PC.backup;
})(typeof window !== 'undefined' ? window : globalThis);
