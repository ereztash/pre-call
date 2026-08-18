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

/* ---- how the money actually arrives ----
   Three states, and the wall says which one it is in rather than showing a buy
   button that leads nowhere. Before this there were only two, and the second
   was an alert() addressed to whoever wrote the code: "replace PAYMENT_URL in
   assets/pc-gate.js". A buyer who clicked "קנה וקבל מפתח" was told to edit a
   source file. That is the wall's whole job failing at the only moment it
   matters.

     PAYMENT_URL set      → a payment page opens, a key follows from it
     SALES.contact set    → a manual sale. The button opens the route, the wall
                            says how long a key takes and what to write, and the
                            address is also on screen as text
     neither              → not on sale. Said plainly, in the buyer's language,
                            with the price hidden — a price above "not for sale
                            yet" is a contradiction — and the key field still
                            working for anyone who already has one

   The manual state is the one this product is actually in, and it is not a
   placeholder: taking money by hand for the first handful of buyers is a
   decision, not a gap. What it needs is a wall that says so. */
var tr = (typeof PC !== 'undefined' && PC.i18n) ? PC.i18n.tr
  : function (s, p) { if (p) for (var k in p) s = s.split('{' + k + '}').join(p[k]); return s; };

const PAYMENT_URL = 'https://example.com/replace-with-your-payment-link';

/* Where a buyer asks for a key. The route itself lives in pc-contact.js and is
   written once — the landing page sends people here, and when the number was
   declared in both places the only thing keeping them together was a test that
   noticed after they had already diverged. */
const SALES = {
  contact: (typeof PC !== 'undefined' && PC.contact) ? PC.contact.ROUTE : '',
  turnaround: tr('בדרך כלל תוך כמה שעות, ולא יותר מיום עסקים אחד')
};
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
  scrollToEl('wall', 'center');
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
  if (!KEY_SHAPE.test(raw)) return showKeyErr(tr('המפתח לא תקין. בדוק שהעתקת אותו במלואו.'));

  unlockBusy = true;
  show('keyErr', false);
  const remote = await keyValidRemote(raw);
  unlockBusy = false;

  if (remote === 'throttled')
    return showKeyErr(tr('יותר מדי ניסיונות. נסה שוב בעוד כמה דקות.'));
  // remote === null means the server had no opinion; the checksum decides
  const ok = remote === null ? keyValid(raw) : remote;
  if (!ok) return showKeyErr(tr('המפתח לא תקין. בדוק שהעתקת אותו במלואו.'));

  unlocked = true;
  show('wall', false);
  renderKeyAhead(); // the note asks for the thing that just arrived
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
        /* Lock, but do not erase. The key is the buyer's receipt — it is the
           only evidence they hold of what they paid for, and nothing in this
           repository records issued keys by design (mint-key.js says to keep
           that ledger somewhere private).

           This matters most on the day enforcement is switched on. Until
           POSTCALL_KEYS is set the server answers not_configured, the checksum
           decides, and keys sold in that window are not in any list. The first
           recheck after the variable appears refuses every one of them — and
           the old behaviour also wiped them from the browser, so a buyer had
           nothing left to quote when they wrote to ask why. The confirmation
           stamp goes, because that claim is now false; the key stays. */
        try { localStorage.removeItem(KEY_OK_AT); } catch(e){}
      } else if (v === true) {
        unlocked = true;
        try { localStorage.setItem(KEY_OK_AT, new Date().toISOString()); } catch(e){}
      }
      renderKeyAhead(); // in both directions: a revoked key brings the note back
      // 'throttled' or null: no verdict, leave it as it was
    });
  } catch(e){}
}

/* The automated route needs a URL that actually goes somewhere, and "is not the
   placeholder" is not that test. Found in review, and the failing case is the
   likeliest way anyone configures this: the README says to fill SALES.contact,
   so a tidy operator also clears the payment URL they are not using. Then
   ''.includes('example.com') is false, the sale is classified automated, the
   manual contact is ignored, and the button calls window.open('') — the exact
   dead-end blank tab this whole change exists to remove.

   So it is asked positively: what is the configured payment URL, if any.
   https is required rather than assumed — a payment page reached over http is
   worse than no link, and the scheme check also means nothing but a URL can
   ever reach window.open() from here. example.com is a reserved documentation
   domain and never a real payment page, so it stays excluded whatever path it
   is wearing. */
function configuredPayment(){
  const u = (PAYMENT_URL || '').trim();
  if (!u || u.includes('example.com') || !/^https:\/\/\S/i.test(u)) return '';
  return u;
}

/* Which of the three states we are in. Kept as one function so the wall cannot
   end up describing one route while its button goes to another. */
function salesRoute(){
  if (configuredPayment()) return 'automated';
  if (SALES.contact) return 'manual';
  return 'none';
}

const setText = (id, s) => { const n = el(id); if (n) n.textContent = s; };

/* A mailto has to replace the location — window.open leaves an orphaned blank
   tab behind in most browsers. An https route (wa.me, a form) must NOT replace
   it: the buyer is mid-proposal, and navigating away from an unsaved document
   to a chat window is losing their work to open a shop. */
/* What to print next to the button, given what is behind it. A number is kept in
   international form with the plus: it is the only form that works from abroad
   and the only one WhatsApp itself will accept, and dropping the country code to
   look local would produce a number that fails for exactly the caller who has to
   type it by hand. Anything unrecognised is printed as it stands rather than
   mangled — better a URL on screen than a wrong address. */
function contactLabel(){
  const c = (SALES.contact || '').trim();
  const wa = c.match(/^https:\/\/wa\.me\/(\d+)$/i);
  return wa ? '+' + wa[1] : c.replace(/^mailto:/i, '');
}

/* The label on a control that leaves the product has to name where it goes.
   A user who asked for a PDF must never discover WhatsApp only after clicking.
   Reuse existing translated product words so the destination contract stays
   bilingual without adding a second contact configuration. */
function contactChannel(){
  const c = (SALES.contact || '').trim();
  if (/^https:\/\/wa\.me\//i.test(c)) return tr('וואטסאפ');
  if (/^mailto:/i.test(c)) return tr('אימייל');
  return '';
}

function openContact(){
  if (/^mailto:/i.test(SALES.contact)) window.location.href = SALES.contact;
  else window.open(SALES.contact, '_blank', 'noopener');
}

function renderBuyRoute(){
  const pay = el('payBtn');
  const route = salesRoute();

  if (route === 'automated') {
    show('buyRoute', false);
    if (pay) pay.onclick = () => window.open(configuredPayment(), '_blank', 'noopener');
    return;
  }

  if (route === 'manual') {
    // The destination is part of the action contract. In production this says
    // "בקשו מפתח בהודעה · וואטסאפ" before a WhatsApp tab can open.
    const channel = contactChannel();
    setText('payBtn', tr('בקשו מפתח בהודעה') + (channel ? ' · ' + channel : ''));
    setText('buyHow', (channel ? channel + ': ' : '') +
      tr('התשלום נסגר איתי ישירות, והמפתח נשלח ביד — {turnaround}. בהודעה כתבו שם, ואת המייל שאליו לשלוח את המפתח.',
        { turnaround: SALES.turnaround }));
    /* The text under the button is the fallback for the case where the button
       did nothing — a blocked popup, no WhatsApp on this machine. So it has to
       be the thing itself and not a route to it: an email address reads as an
       address once the scheme is stripped, and a wa.me link is worth nothing
       typed by hand, where the phone number behind it can be dialled or saved. */
    setText('buyContact', contactLabel());
    show('buyRoute', true);
    if (pay) pay.onclick = openContact;
    return;
  }

  // Not on sale. Everything that implies a purchase comes off, and the one
  // thing that still works — a key somebody already holds — stays.
  show('wallPrice', false);
  show('payBtn', false);
  setText('buyHow', tr('הכלי עוד לא נמכר, ואין כרגע דרך לקנות מפתח. אם כבר יש לכם מפתח, הפעילו אותו כאן.'));
  setText('buyContact', '');
  show('buyRoute', true);
}

/* ---- asking for a key before the gate asks for it ----
   The three gated actions all happen at one moment: the proposal is finished
   and about to go to the client. With a manual sale, the answer to "I need a
   key" is "I will send you one within a few hours" — so the gate lands at the
   single worst point in the flow to introduce a wait.

   This is the fix, and the whole design is about not becoming noise. It says
   the requirement once, next to the buttons it applies to, while there is
   still slack, and it disappears for good on any of three grounds: a key
   arrives, there is nowhere to ask, or the operator says not now.

   Dismissal is in memory and not persisted, deliberately. A stored dismissal
   would mean the one warning is spent forever on the first session, and the
   buyer who comes back in three weeks meets the wall cold — which is the
   situation this exists to prevent. A session here is one call. */
let keyAheadDismissed = false, keyAheadPriced = false;

/* Called from the recompute chain with whether a real price exists, and called
   with nothing from the two places that can make it obsolete without a
   recompute — an unlock, and a stored key confirmed after load. Remembering
   the last answer is what lets both callers use one function; asking the two
   of them to know about the price would be the way the note survives the key
   that made it pointless. */
function renderKeyAhead(hasRealPrice){
  if (hasRealPrice !== undefined) keyAheadPriced = !!hasRealPrice;
  const worth = keyAheadPriced && !unlocked && !keyAheadDismissed && salesRoute() !== 'none';
  if (!worth) { show('keyAhead', false); return; }
  setText('keyAheadText', salesRoute() === 'manual'
    ? tr('שלוש הפעולות שמוציאות את ההצעה — העתקה, PDF ושליחה — דורשות מפתח, והוא נשלח ביד. בקשו אותו עכשיו, בזמן שאתם עוד עובדים, כדי לא לחכות לו כשההצעה מוכנה לשליחה.')
    : tr('שלוש הפעולות שמוציאות את ההצעה — העתקה, PDF ושליחה — דורשות מפתח. אפשר לסדר את זה עכשיו.'));
  show('keyAhead', true);
}

/* Same destination as the wall's button. One route, so a buyer who asks early
   and a buyer who asks late end up in the same conversation. */
function askForKeyAhead(){
  track('key_requested');
  if (salesRoute() === 'manual') return openContact();
  window.open(configuredPayment(), '_blank', 'noopener');
}

function dismissKeyAhead(){
  keyAheadDismissed = true;
  show('keyAhead', false);
}

function mountGate(){
  renderBuyRoute();
  rehydrateKey();
}
