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
   the answer is currently no. Events go to stdout and nothing else, and hosted
   log retention runs from an hour to a day — so an event is discarded faster
   than it accumulates and no month of them exists to read. That is the state,
   not a bug, and a deployment should be able to see it from outside rather than
   by reading the source.

   Read from api/_sink.js rather than decided here. An earlier version kept its
   own constant and a test that inferred the truth from the tokens in event.js,
   which could both certify a false answer and block a true one. The sink
   declares what it is; this endpoint only repeats it. */

import { preflight } from './_guard.js';
import { SINK } from './_sink.js';

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
    telemetryDurable: SINK.durable,
    telemetrySink: SINK.target,
    node: process.version
  });
}
