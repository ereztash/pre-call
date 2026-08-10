/* Anonymous usage counter. Deliberately the smallest thing that can receive an
   event — and receiving is not the same as measuring, which the first version of
   this comment ran together.

   Whether it accumulates anything depends on one variable, and this used to be
   the paragraph explaining that it never did. With POSTCALL_EVENT_URL unset the
   sink is one line to stdout, and hosted log retention of an hour to a day means
   a thirty-day question about usage has nothing to read — the counter receives
   without recording. With it set, rows go to that endpoint instead. Either way
   /api/health reports which, derived from the same variable, so the answer
   cannot drift from the behaviour. See api/_sink.js.

   What it accepts: an event name from a fixed list, and coarse buckets.
   What it refuses: client names, process descriptions, proposal text, exact
   prices, and anything else free-form. The proposal never leaves the browser.
   A tool that promises the document stays local has to mean it. */

/* Fixed list, and the client is tested against it — a name the client sends
   that is missing here is a silent 400 nobody sees, which is how the one
   measurement that matters most (did the template shortcut get used) would
   have gone uncounted. */
const EVENTS = new Set([
  'opened', 'seeded', 'template_used', 'example_loaded',
  'transcript_parsed', 'transcript_applied', 'proposal_rendered', 'scope_changed',
  'export_attempted', 'unlocked', 'deal_saved', 'deal_sent', 'outcome_recorded',
  'followup_added'
]);

// coarse enough that a row cannot be traced back to a specific deal
const bucketPrice = n => {
  const v = Number(n);
  if (!isFinite(v) || v <= 0) return null;
  if (v < 3000) return '<3k';
  if (v < 8000) return '3-8k';
  if (v < 20000) return '8-20k';
  return '20k+';
};

import { preflight, parseBody } from './_guard.js';
import { SINK } from './_sink.js';

export default async function handler(req, res) {
  // A session that fills in a deal, edits the scope and exports fires on the
  // order of twenty events. Sixty a minute leaves ordinary use untouched and
  // stops one client from turning the log into a bill.
  if (!preflight(req, res, { maxBytes: 1024, limit: 60, windowMs: 60_000, bucket: 'event' }))
    return;

  const body = parseBody(req);
  if (!EVENTS.has(body.event)) return res.status(400).json({ error: 'unknown event' });

  const row = {
    at: new Date().toISOString(),
    event: body.event,
    method: ['value', 'market', 'cost', 'comparable'].includes(body.method) ? body.method : null,
    systems: Number.isInteger(body.systems) && body.systems <= 12 ? body.systems : null,
    priceBucket: bucketPrice(body.price),
    provenance: ['unprompted', 'prompted', 'mine', 'none'].includes(body.provenance)
      ? body.provenance : null
  };

  /* Through the declared sink rather than logging here, so that what happens to
     an event and what /api/health says happens to it are one fact in one file.
     See api/_sink.js — it is stdout unless POSTCALL_EVENT_URL is set.

     Answer first, then deliver. The client fires these with keepalive and
     ignores the reply, so it is not waiting on us; but on a serverless host the
     process freezes when the handler returns, and a promise nobody awaited is a
     delivery that lands on warm invocations and silently does not on cold ones.
     Awaiting after the 204 costs the client nothing and makes the write happen
     every time. */
  res.status(204).end();
  await SINK.write(row);
  return;
}
