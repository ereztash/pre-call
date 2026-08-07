/* Server-side key check. The in-page check is trivially bypassable and is
   documented as such; this is what makes the gate real once keys are sold.
   Keys live in the POSTCALL_KEYS environment variable, comma separated —
   enough for the first handful of buyers, and replaceable by a store later
   without changing the client.

   Every outcome is logged. Before this, a key-guessing campaign against this
   exact oracle left no trace anywhere but the rate limiter's own sliding
   window, which forgets each attempt as soon as it ages out — the one
   endpoint built specifically to be hard to guess against was also the one
   endpoint nobody could see being guessed against. */
import { preflight, parseBody, constantTimeEquals, clientIp } from './_guard.js';

export default async function handler(req, res) {
  // The tightest limit in the product: this endpoint answers "is this key
  // real", so without a ceiling it is a guessing oracle anyone can drive at
  // whatever rate the platform allows. Ten tries per ten minutes is far more
  // than a buyer typing a key from an email ever needs.
  if (!preflight(req, res, { maxBytes: 512, limit: 10, windowMs: 10 * 60_000, bucket: 'license' }))
    return;

  const key = String(parseBody(req).key || '').trim().toUpperCase();
  if (!/^PC-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key)) {
    logAttempt(req, 'malformed');
    return res.status(400).json({ valid: false });
  }

  const allowed = (process.env.POSTCALL_KEYS || '')
    .split(',').map(k => k.trim().toUpperCase()).filter(Boolean);

  // No configured keys means no server-side enforcement is in effect yet; say so
  // rather than silently allowing or silently refusing. Not logged as an
  // attempt — there is nothing yet to guess against.
  if (!allowed.length) return res.status(200).json({ valid: null, reason: 'not_configured' });

  // reduce() rather than some(), so every configured key is compared and the
  // response time does not reveal the matching key's position in the list
  const valid = allowed.reduce((hit, k) => constantTimeEquals(k, key) || hit, false);
  logAttempt(req, valid ? 'valid' : 'invalid');
  return res.status(200).json({ valid });
}

/* One line, same shape as api/event.js's telemetry. The key that was typed is
   never printed — what a guessing campaign looks like from here is a rate and
   a source, not the contents of each wrong guess, and logging the guesses
   themselves would be one bad grep away from logging a real key that was
   simply mistyped. */
function logAttempt(req, outcome){
  console.log('POSTCALL_LICENSE ' + JSON.stringify({
    at: new Date().toISOString(), outcome, ip: clientIp(req)
  }));
}
