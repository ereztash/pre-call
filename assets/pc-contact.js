/* The buyer's route out of this product, written once.

   It used to be written twice — SALES.contact in pc-gate.js, and again in the
   landing page that sends people to the gate. They held the same number and a
   test asserted they matched, which is two sources of truth with an alarm on
   them: it rings after somebody has shipped a page pointing at the wrong chat.

   Only the route lives here. What each page says when it opens the
   conversation is that page's copy — the wall asks for a key, the landing page
   asks for a transcript — and putting either sentence in this file would ship
   the other page's words to everyone who loads the tool.

   Whatever goes here is published on a page anyone can read, so it is never a
   default somebody inherits: a fork that forgets sends its buyers here.
   International format, no leading zero — wa.me silently opens nothing for a
   local number, and mailto: works too. gate.test.js pins the shape. */
(function (root) {
  'use strict';

  const ROUTE = 'https://wa.me/972524545963';

  // wa.me carries the opening line as a query parameter and mailto: does not
  // take it the same way, so callers pass words and get a working href back.
  function href(message) {
    const to = ROUTE.trim();
    if (!to || message == null) return to;
    const sep = to.includes('?') ? '&' : '?';
    if (/^mailto:/i.test(to)) return to + sep + 'body=' + encodeURIComponent(message);
    if (/^https?:/i.test(to)) return to + sep + 'text=' + encodeURIComponent(message);
    return to;
  }

  root.PC = root.PC || {};
  root.PC.contact = { ROUTE, href };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.PC.contact;
})(typeof window !== 'undefined' ? window : globalThis);
