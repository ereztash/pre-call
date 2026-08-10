/* Is the deployment alive, is the paid gate actually switched on, and does the
   usage counter keep anything.

   The second question is the one worth an endpoint. /api/license returns
   { valid: null, reason: 'not_configured' } when POSTCALL_KEYS is unset,
   which the client reads as "no server-side enforcement" — so forgetting to
   set that variable silently disables the gate on a live deployment with no
   error anywhere. This makes that state visible without having to guess a
   key to discover it.

   It reports whether keys exist and how many. It never reports what they are.

   telemetryDurable is the same shape of question about the other endpoint, and
   the answer is currently no. api/event.js writes one line to stdout and
   nothing else, and hosted log retention is measured in hours to a day — so
   events are discarded faster than they accumulate, and the single question the
   endpoint exists to answer cannot be asked of a month of them. That is not a
   bug in event.js; it is the state it is in, and a deployment should be able to
   see it from outside rather than by reading the source. Whoever wires a real
   store flips this, and api/health.test.js fails until the sink actually
   changes — so the flag cannot drift from the code in either direction. */
const TELEMETRY_DURABLE = false;

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
    telemetryDurable: TELEMETRY_DURABLE,
    node: process.version
  });
}
