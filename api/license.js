/* Server-side key check. The in-page check is trivially bypassable and is
   documented as such; this is what makes the gate real once keys are sold.
   Keys live in the POSTCALL_KEYS environment variable, comma separated —
   enough for the first handful of buyers, and replaceable by a store later
   without changing the client. */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const key = String((body || {}).key || '').trim().toUpperCase();

  if (!/^PC-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key)) return res.status(400).json({ valid: false });

  const allowed = (process.env.POSTCALL_KEYS || '')
    .split(',').map(k => k.trim().toUpperCase()).filter(Boolean);

  // No configured keys means no server-side enforcement is in effect yet; say so
  // rather than silently allowing or silently refusing.
  if (!allowed.length) return res.status(200).json({ valid: null, reason: 'not_configured' });

  return res.status(200).json({ valid: allowed.includes(key) });
}
