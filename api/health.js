/* Is the deployment alive, and is the paid gate actually switched on.

   The second question is the one worth an endpoint. /api/license returns
   { valid: null, reason: 'not_configured' } when POSTCALL_KEYS is unset,
   which the client reads as "no server-side enforcement" — so forgetting to
   set that variable silently disables the gate on a live deployment with no
   error anywhere. This makes that state visible without having to guess a
   key to discover it.

   It reports whether keys exist and how many. It never reports what they are. */

import { preflight } from './_guard.js';

export default async function handler(req, res) {
  if (!preflight(req, res, { method: 'GET', limit: 30, windowMs: 60_000, bucket: 'health' }))
    return;

  const keys = (process.env.POSTCALL_KEYS || '')
    .split(',').map(k => k.trim()).filter(Boolean);

  return res.status(200).json({
    ok: true,
    at: new Date().toISOString(),
    licenseEnforced: keys.length > 0,
    licenseKeyCount: keys.length,
    node: process.version
  });
}
