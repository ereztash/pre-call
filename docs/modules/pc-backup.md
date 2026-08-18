# PRE-CALL & POST-CALL · exporting and restoring what the browser holds

`assets/pc-backup.js`  
Pure: storage is injected (works against localStorage or a fake), no DOM.  
Loaded by both index.html and post-call.html.

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
