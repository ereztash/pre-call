/* Anonymous usage counter. Deliberately the smallest thing that unblocks
   measurement, because measurement was structurally impossible without a
   server and everything else about this product is still unproven.

   What it accepts: an event name from a fixed list, and coarse buckets.
   What it refuses: client names, process descriptions, proposal text, exact
   prices, and anything else free-form. The proposal never leaves the browser.
   A tool that promises the document stays local has to mean it. */

const EVENTS = new Set([
  'opened', 'seeded', 'proposal_rendered', 'scope_changed',
  'export_attempted', 'unlocked', 'deal_saved', 'deal_sent', 'outcome_recorded'
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

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

  // One line per event. Swap for a real store when there is traffic worth storing;
  // until then this answers the only question that matters — does anyone use it.
  console.log('POSTCALL_EVENT ' + JSON.stringify(row));
  return res.status(204).end();
}
