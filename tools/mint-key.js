#!/usr/bin/env node
/* ============================================================
   node tools/mint-key.js — issue a licence key by hand.

   Why this exists, precisely. A key has to satisfy two independent
   authorities, and until now only one of them was reachable by hand:

     - POSTCALL_KEYS on the server, which is an allowlist. It checks the
       shape and then compares against the list. It does NOT check the
       last character.
     - the in-page checksum in assets/pc-gate.js, where the eighth
       character of the body is a check digit over the first seven.

   So a key typed straight into POSTCALL_KEYS is valid on the server and
   fails the checksum. pc-gate.js handles that in the deployed case: the
   server's yes is stamped and outranks the checksum. What it cannot
   handle is the case with no server to ask —

     - opened from file://, which the README promises works in full
     - no network, or a browser that blocked the request
     - localStorage cleared, so there is no surviving stamp

   In all three, fetch fails, the checksum decides, and it says no. That is
   a paying customer locked out of the thing they paid for, on a mode the
   documentation advertises. Minting keys that pass BOTH removes the whole
   class, and there is nothing to remember at the moment of sale.

   Nothing secret lives here. The checksum is already in the browser, in
   pc-gate.js, on every page load — a minted key opens the soft fallback
   and nothing else, exactly as the README already says about anyone with
   devtools. What actually authorises a key is being in POSTCALL_KEYS,
   which is why this prints a line for you to paste there and cannot do it
   for you. tools/ is excluded from the deploy anyway; see .vercelignore.

   USAGE
     node tools/mint-key.js                       one key
     node tools/mint-key.js 5                     five
     node tools/mint-key.js --for "דנה כהן"       one, plus a record line
     node tools/mint-key.js 3 --env               plus a POSTCALL_KEYS line
     node tools/mint-key.js --check PC-AB23-CD4F  is this key well formed

   Existing keys are read from POSTCALL_KEYS in the environment when it is
   set, and a freshly minted key is never one of them.
   ============================================================ */
const crypto = require('crypto');

/* Must stay identical to keyValid() in assets/pc-gate.js. Not shared as a
   module because that file is a classic script written for a page — see the
   README on why this project has no module system. tools/mint-key.test.js
   evaluates the real keyValid() and runs every minted key through it, so a
   change to one side fails the build rather than shipping a dead key. */
const CHECK_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SHAPE = /^PC-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/* The seven random characters are drawn from a reduced alphabet: no 0/O and
   no 1/I. These keys are read off a screen and typed into a field, sometimes
   read out over the phone, and the pair 0/O alone accounts for a support
   thread that costs more than the key is worth. The check character is not a
   free choice — it is whatever the sum lands on — so a key whose check
   character falls outside the safe set is discarded and another is drawn.
   Costs about one retry in nine and buys a key that cannot be misread. */
const SAFE = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function checkChar(seven) {
  let sum = 0;
  for (const ch of seven) sum += ch.charCodeAt(0);
  return CHECK_ALPHABET[sum % 36];
}

const bodyOf = key => key.replace(/[^A-Z0-9]/g, '').slice(2);
const format = body => 'PC-' + body.slice(0, 4) + '-' + body.slice(4, 8);

function passesChecksum(key) {
  key = String(key || '').trim().toUpperCase();
  if (!SHAPE.test(key)) return false;
  const b = bodyOf(key);
  return b[7] === checkChar(b.slice(0, 7));
}

/* crypto.randomInt, not Math.random. Math.random is seeded from a source
   nobody promises anything about and its output is reconstructible from a
   handful of samples — which for a bearer token means one buyer's key can
   suggest the next buyer's. randomInt is also rejection-sampled, so the
   alphabet is drawn uniformly rather than with a modulo bias toward its
   first few characters. */
function mintOne(taken) {
  for (let attempt = 0; attempt < 1000; attempt++) {
    let seven = '';
    for (let i = 0; i < 7; i++) seven += SAFE[crypto.randomInt(0, SAFE.length)];
    const c = checkChar(seven);
    if (!SAFE.includes(c)) continue;          // keep the whole key unambiguous
    const key = format(seven + c);
    if (taken.has(key)) continue;             // never re-issue one already sold
    return key;
  }
  throw new Error('could not mint an unused key in 1000 attempts');
}

/* 32^7 is about 3.4e10, so roughly 35 bits before the check character, which
   adds none. That is deliberately not treated as a standalone secret: what
   makes it safe to guess against is /api/license capping attempts at ten per
   ten minutes per address, against an allowlist holding a handful of keys.
   Stated here rather than implied, because the day that rate limit is
   loosened is the day this number stops being enough. */
function existingKeys() {
  return new Set((process.env.POSTCALL_KEYS || '')
    .split(',').map(k => k.trim().toUpperCase()).filter(Boolean));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function main(argv) {
  const args = argv.slice(2);
  const flag = name => {
    const i = args.indexOf('--' + name);
    return i === -1 ? null : (args[i + 1] || '');
  };
  const has = name => args.includes('--' + name);

  const check = flag('check');
  if (check !== null) {
    const key = String(check).trim().toUpperCase();
    const shaped = SHAPE.test(key);
    const summed = passesChecksum(key);
    console.log(key || '(nothing to check)');
    console.log('  צורה תקינה:        ' + (shaped ? 'כן' : 'לא'));
    console.log('  ספרת ביקורת:       ' + (summed ? 'כן' : 'לא') +
      (shaped && !summed ? '  ← יעבוד מול השרת, ייכשל בלי רשת ומ-file://' : ''));
    console.log('  ב-POSTCALL_KEYS:   ' +
      (existingKeys().has(key) ? 'כן' : 'לא — בלי זה השרת ידחה אותו'));
    return summed && shaped ? 0 : 1;
  }

  const count = Math.max(1, Math.min(100, parseInt(args.find(a => /^\d+$/.test(a)) || '1', 10)));
  const buyer = flag('for');
  const taken = existingKeys();
  const minted = [];
  for (let i = 0; i < count; i++) {
    const key = mintOne(taken);
    taken.add(key);
    minted.push(key);
  }

  minted.forEach(k => console.log(k));

  if (buyer !== null) {
    console.log('\nלפנקס — הדביקו במקום פרטי, לא לרפו:');
    minted.forEach(k => console.log(k + '  ' + today() + '  ' + (buyer || '(ללא שם)')));
  }
  if (has('env')) {
    const all = [...existingKeys(), ...minted];
    console.log('\nל-POSTCALL_KEYS ב-Vercel (כולל מה שכבר מוגדר כאן):');
    console.log(all.join(','));
  }
  if (!has('env')) {
    console.log('\nמפתח מתחיל לעבוד רק אחרי שהוא ב-POSTCALL_KEYS ב-Vercel. --env מדפיס את השורה.');
  }
  return 0;
}

if (require.main === module) process.exit(main(process.argv));
module.exports = { mintOne, passesChecksum, checkChar, SAFE, SHAPE, format, bodyOf };
