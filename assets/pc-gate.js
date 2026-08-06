/* ============================================================
   POST-CALL · the payment gate.

   The key is checked server-side when a server is there to ask, and against
   an in-page checksum when there isn't. That ordering matters:

   - deployed with POSTCALL_KEYS set, /api/license is authoritative and the
     checksum is irrelevant — a made-up key with a valid shape is refused
   - deployed without it, the endpoint answers not_configured and the tool
     falls back, so the gate is soft until there is something to sell
   - opened from file://, or offline on a train, fetch fails and it falls
     back too — a buyer who paid does not get locked out by their network

   The fallback is bypassable by anyone with devtools, and that is still the
   accepted trade for a first paid test. What changed is that it is no longer
   the only check: once keys are configured, bypassing the page does not get
   a key past the server.
   ============================================================ */

const PAYMENT_URL = 'https://example.com/replace-with-your-payment-link';
const KEY_SHAPE = /^PC-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const KEY_STORE = 'postcall_key';
const KEY_OK_AT = 'postcall_key_ok_at';
const RECHECK_MS = 24 * 60 * 60 * 1000;

let unlocked = false, pendingExport = null, unlockBusy = false;

/* The document stays on screen for everyone — it is the interface, and hiding
   it would hide the only thing that shows the tool works. The key is required
   to take it out of the page. */
function requireKey(fn){
  if (unlocked) return fn();
  pendingExport = fn;
  track('export_attempted');
  show('wall', true);
  el('wall').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function keyValid(k){
  k = (k || '').trim().toUpperCase();
  if (!KEY_SHAPE.test(k)) return false;
  // light checksum so a random string of the right shape does not open it
  const body = k.replace(/[^A-Z0-9]/g, '').slice(2);
  let sum = 0; for (const ch of body.slice(0, 7)) sum += ch.charCodeAt(0);
  return body[7] === '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'[sum % 36];
}

/* Asks the server, and says what it could not decide rather than guessing.
   Returns true / false / 'throttled' / null, where null means "no answer
   available" and the caller falls back to the local checksum. */
async function keyValidRemote(k){
  try {
    const r = await fetch('/api/license', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: k })
    });
    if (r.status === 429) return 'throttled';
    if (!r.ok) return null;
    const j = await r.json();
    return j.valid === null ? null : !!j.valid; // null = keys not configured yet
  } catch (e) {
    return null; // offline, file://, or no backend — fall back, do not lock out
  }
}

async function tryUnlock(){
  if (unlockBusy) return;
  const raw = el('keyIn').value.trim().toUpperCase();

  // A malformed key never reaches the network — no point spending one of the
  // ten attempts per ten minutes on something the regex already rejected.
  if (!KEY_SHAPE.test(raw)) return showKeyErr('המפתח לא תקין. בדוק שהעתקת אותו במלואו.');

  unlockBusy = true;
  show('keyErr', false);
  const remote = await keyValidRemote(raw);
  unlockBusy = false;

  if (remote === 'throttled')
    return showKeyErr('יותר מדי ניסיונות. נסה שוב בעוד כמה דקות.');
  // remote === null means the server had no opinion; the checksum decides
  const ok = remote === null ? keyValid(raw) : remote;
  if (!ok) return showKeyErr('המפתח לא תקין. בדוק שהעתקת אותו במלואו.');

  unlocked = true;
  show('wall', false);
  try {
    localStorage.setItem(KEY_STORE, raw);
    // only stamp a confirmation the server actually gave, so a fallback
    // unlock does not buy itself a day of not being asked again
    if (remote === true) localStorage.setItem(KEY_OK_AT, new Date().toISOString());
  } catch(e){}
  track('unlocked');
  if (pendingExport) { const f = pendingExport; pendingExport = null; f(); }
}

function showKeyErr(msg){
  el('keyErr').textContent = msg;
  show('keyErr', true);
}

/* A key stored in localStorage used to be trusted forever on the strength of
   the checksum alone, so anyone who wrote a shaped string into storage once
   was permanently unlocked no matter what the server said. It is now
   reconfirmed, but not on every load: that would spend the rate limit on
   reloads and could lock out a whole office behind one address. Once a day is
   enough to close a bypass that has to survive to be worth anything.

   The second thing this used to get wrong was the opposite failure, and it is
   the one that costs money. POSTCALL_KEYS is an allowlist, so the server has
   no reason to care about the checksum and does not check it — a key issued
   by hand is valid on the server and fails keyValid(). That key unlocked once,
   on the server's word, and was then thrown away on the next reload, which is
   a paying customer hitting the paywall again. Requiring the weaker of two
   authorities to ratify the stronger one is backwards.

   So the rule here is the same one tryUnlock() uses, in both directions: the
   server decides when it has an opinion, and the checksum decides only when it
   does not. In practice that means three ways in, and the ordering is what
   keeps a reload instant:

     - a stamp from a previous server 'yes' (only tryUnlock writes it, and only
       on remote === true) — the server has already ruled, so unlock now and
       do not spend a request on it. This is also what makes the offline
       reload work for a key the checksum would reject.
     - the checksum passes — unlock now, optimistically, as before.
     - neither — a server-issued key with no surviving stamp. Do not open the
       page on nothing, but do ask, and unlock if the answer is yes.

   Revocation still runs in all cases: an explicit `false` locks and clears. */
function rehydrateKey(){
  try {
    const saved = localStorage.getItem(KEY_STORE);
    // shape is the floor — below it there is nothing worth asking about
    if (!saved || !KEY_SHAPE.test(saved)) return;

    const last = Date.parse(localStorage.getItem(KEY_OK_AT) || '') || 0;
    const confirmed = last > 0;
    unlocked = confirmed || keyValid(saved);

    if (unlocked && Date.now() - last <= RECHECK_MS) return;
    keyValidRemote(saved).then(v => {
      if (v === false) {
        unlocked = false;
        try { localStorage.removeItem(KEY_STORE); localStorage.removeItem(KEY_OK_AT); } catch(e){}
      } else if (v === true) {
        unlocked = true;
        try { localStorage.setItem(KEY_OK_AT, new Date().toISOString()); } catch(e){}
      }
      // 'throttled' or null: no verdict, leave it as it was
    });
  } catch(e){}
}

function mountGate(){
  const pay = el('payBtn');
  if (pay) pay.onclick = () => {
    if (PAYMENT_URL.includes('example.com')) {
      alert('עוד לא חובר קישור תשלום.\n\nהחלף את PAYMENT_URL בקובץ assets/pc-gate.js בקישור מ-Stripe / Lemon Squeezy / Paddle,\nושלח לקונה מפתח בפורמט PC-XXXX-XXXX.');
      return;
    }
    window.open(PAYMENT_URL, '_blank', 'noopener');
  };
  rehydrateKey();
}
