#!/usr/bin/env node
/* node tools/mintkey.js [how many]

   Mints keys for POSTCALL_KEYS.

   The gate accepts a key on two different paths and they have different
   requirements, which is the whole reason this exists rather than "type
   eight characters":

     · with POSTCALL_KEYS set, /api/license is authoritative and compares
       the key against that list. Any string would do.
     · with no server, or offline, or opened from file://, the page falls
       back to an in-page checksum. A key that is not minted correctly
       works for a buyer online and fails for the same buyer on a train.

   So a key has to satisfy both, and this produces keys that do. The
   checksum is not a secret — it is in assets/pc-gate.js, which every
   visitor downloads, and it was never meant to be more than a filter
   against a random string of the right shape.

   Not shipped to the browser: nothing in the pages references this file.
   ============================================================ */
'use strict';

const ALPHA = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/* The same arithmetic as keyValid() in assets/pc-gate.js: sum the first
   seven characters and let the eighth be that sum's letter. mintkey.test.js
   runs the real gate against every key this produces rather than trusting
   that these two stayed in step. */
function checksum(body7) {
  let sum = 0;
  for (const ch of body7) sum += ch.charCodeAt(0);
  return ALPHA[sum % 36];
}

function mint(rand) {
  const pick = () => ALPHA[Math.floor((rand ? rand() : Math.random()) * ALPHA.length)];
  const body = Array.from({ length: 7 }, pick).join('');
  const full = body + checksum(body);
  return 'PC-' + full.slice(0, 4) + '-' + full.slice(4);
}

if (require.main === module) {
  const n = Math.max(1, Math.min(200, parseInt(process.argv[2], 10) || 1));
  const keys = Array.from({ length: n }, () => mint());
  console.log('\n' + keys.join('\n'));
  console.log('\nPOSTCALL_KEYS=' + keys.join(','));
  console.log('\nPaste that line into Vercel → Settings → Environment Variables,');
  console.log('then redeploy. Until it is set, /api/license answers');
  console.log('not_configured and the gate lets everyone through.\n');
}

module.exports = { mint, checksum, ALPHA };
