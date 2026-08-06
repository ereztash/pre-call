/* ============================================================
   POST-CALL · getting the document out of the page.

   The journey measurement said it plainly: from "the call ended" to "a
   document on screen" costs one tap, and from there to "the proposal is in
   the client's inbox" the tool did nothing at all. It stopped at the
   clipboard and left the last, most abandonable step to the operator.

   Three routes, because the right one depends on who the client is and the
   operator should not have to think about it — WhatsApp for the small
   business that answers on the phone, email for the one with a procurement
   process, clipboard for everything else.

   Every route has a length ceiling that this document is capable of
   exceeding, and a link that silently truncates a proposal is worse than no
   link at all: the client receives half an offer and the operator never
   knows. So the limits are checked before the link is built, and when one
   does not fit the module says so instead of producing it.

   Pure: builds strings, opens nothing. Tested in Node.
   ============================================================ */
(function (root) {
  'use strict';

  /* WhatsApp's documented message ceiling is 65,536 characters, but the
     wa.me URL is the real constraint and browsers vary; 4,000 is the number
     that survives everywhere in practice. mailto is far worse — Outlook and
     several Android clients cut around 2,000 characters of encoded URL, so
     the budget is measured on the encoded string, not the readable one. */
  const LIMITS = { whatsapp: 4000, mailto: 1800 };

  /* The document is HTML on screen; what leaves has to be text a person can
     read in a chat window. Block elements become line breaks, list items
     become bullets, everything else collapses. */
  function toPlainText(html) {
    return String(html || '')
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\/(h[1-6]|p|div|tr|li)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<\/(td|th)>/gi, ' · ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .split('\n').map(l => l.trim()).join('\n')
      .trim();
  }

  /* Israeli numbers arrive as 052-123-4567, +972 52 1234567, or 0521234567.
     wa.me wants digits with a country code and nothing else. Returns null
     rather than guessing when it cannot tell — a message sent to the wrong
     number is not a recoverable mistake. */
  function normalisePhone(raw) {
    const d = String(raw || '').replace(/[^\d+]/g, '');
    if (!d) return null;
    if (d.startsWith('+972')) return d.slice(1);
    if (d.startsWith('972')) return d;
    if (d.startsWith('0')) return '972' + d.slice(1);
    // a bare local number with no leading zero is ambiguous; refuse it
    return d.length >= 11 ? d : null;
  }

  function whatsapp({ phone, text }) {
    const body = toPlainText(text);
    if (body.length > LIMITS.whatsapp)
      return { ok: false, reason: 'too_long', length: body.length, limit: LIMITS.whatsapp };
    const to = normalisePhone(phone);
    // wa.me with no number opens the contact picker, which is a legitimate
    // route — the operator picks the chat themselves
    return { ok: true,
             url: 'https://wa.me/' + (to || '') + '?text=' + encodeURIComponent(body),
             addressed: !!to };
  }

  function mailto({ to, subject, text }) {
    const body = toPlainText(text);
    const url = 'mailto:' + encodeURIComponent(to || '') +
      '?subject=' + encodeURIComponent(subject || '') +
      '&body=' + encodeURIComponent(body);
    if (url.length > LIMITS.mailto)
      return { ok: false, reason: 'too_long', length: url.length, limit: LIMITS.mailto };
    return { ok: true, url };
  }

  const subjectFor = client =>
    'הצעת מחיר' + (client && client.trim() ? ' · ' + client.trim() : '');

  /* What to offer, given this document and what is known about the client.
     Each route reports whether it can actually carry this proposal, so the
     interface can grey one out with a reason rather than handing over a link
     that arrives cut in half. */
  function routes({ html, client, phone, email }) {
    const text = toPlainText(html);
    const w = whatsapp({ phone, text });
    const m = mailto({ to: email, subject: subjectFor(client), text });
    return [
      { id: 'whatsapp', label: 'וואטסאפ', ok: w.ok, url: w.url,
        note: w.ok ? (w.addressed ? 'נפתח בצ׳אט של הלקוח' : 'ייפתח וואטסאפ ותבחר את הצ׳אט')
                   : 'ההצעה ארוכה מדי לוואטסאפ (' + w.length + ' תווים). העתק ושלח ידנית.' },
      { id: 'email', label: 'אימייל', ok: m.ok, url: m.url,
        note: m.ok ? 'ייפתח תוכנת המייל עם הטקסט בפנים'
                   : 'ההצעה ארוכה מדי לפתיחה אוטומטית במייל. העתק, פתח מייל חדש והדבק.' },
      { id: 'copy', label: 'העתק את הטקסט', ok: true, url: null,
        note: 'תמיד עובד. הדבק לאן שתרצה.' }
    ];
  }

  root.PC = root.PC || {};
  root.PC.send = { toPlainText, normalisePhone, whatsapp, mailto, routes, subjectFor, LIMITS };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.PC.send;
})(typeof window !== 'undefined' ? window : globalThis);
