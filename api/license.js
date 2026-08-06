/* Server-side key check. The in-page check is trivially bypassable and is
   documented as such; this is what makes the gate real once keys are sold.
   Keys live in the POSTCALL_KEYS environment variable, comma separated —
   enough for the first handful of buyers, and replaceable by a store later
   without changing the client. */
import { preflight, parseBody, constantTimeEquals } from './_guard.js';

export default async function handler(req, res) {
  // The tightest limit in the product: this endpoint answers "is this key
  // real", so without a ceiling it is a guessing oracle anyone can drive at
  // whatever rate the platform allows. Ten tries per ten minutes is far more
  // than a buyer typing a key from an email ever needs.
  if (!preflight(req, res, { maxBytes: 512, limit: 10, windowMs: 10 * 60_000, bucket: 'license' }))
    return;

  const key = String(parseBody(req).key || '').trim().toUpperCase();
  if (!/^PC-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key)) return res.status(400).json({ valid: false });

  const allowed = (process.env.POSTCALL_KEYS || '')
    .split(',').map(k => k.trim().toUpperCase()).filter(Boolean);

  // No configured keys means no server-side enforcement is in effect yet; say so
  // rather than silently allowing or silently refusing.
  if (!allowed.length) return res.status(200).json({ valid: null, reason: 'not_configured' });

  // reduce() rather than some(), so every configured key is compared and the
  // response time does not reveal the matching key's position in the list
  const valid = allowed.reduce((hit, k) => constantTimeEquals(k, key) || hit, false);
  return res.status(200).json({ valid });
}
