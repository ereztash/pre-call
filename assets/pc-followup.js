/* ============================================================
   POST-CALL · the proposal you sent and stopped thinking about.

   The structural hole this closes, stated plainly: the product computes
   an expiry date for every proposal, prints it in the document the client
   receives, and then does absolutely nothing with it. Meanwhile the whole
   long-term claim — that the effort estimate stops being fitted backwards
   and becomes measured — needs five delivered jobs reported back. Nothing
   in the product ever asked for them.

   So the moat depended on a return visit the product made no attempt to
   cause. It could never fill.

   A correction worth keeping, because the first version of this comment
   said "there is no server here and there never will be" and that is
   simply untrue: api/license.js, api/event.js and api/health.js run
   server-side on every deploy. The real constraint is narrower and is a
   promise rather than a limitation — no server stores what the operator
   writes, and no client detail leaves the device. That sentence is on
   privacy.html, and it is the one claim competitors who host your
   document cannot make.

   Under that promise a reminder cannot be sent from here, because sending
   one means holding an address and a date about a named client. What can
   be done instead is to hand the operator a trigger that lives somewhere
   which does notify them: their own calendar. An .ics file is the whole
   mechanism — no account, no permission prompt, no background worker, and
   it keeps working on a phone with the tab long closed.

   If the promise is ever renegotiated, this file is not what has to
   change; it stays as the offline path either way.

   The second half is cheaper and matters just as much: when they do come
   back, say which proposals have gone quiet. sentAt has been recorded on
   every deal since the ledger was written and has never once been read.

   Pure, no DOM, no storage. Tested in Node.
   ============================================================ */
(function (root) {
  'use strict';

  /* Chasing on day one reads as desperate and on day thirty as an
     afterthought. Three days is long enough that silence means something
     and short enough that the call is still fresh for both sides. */
  const NUDGE_AFTER_DAYS = 3;
  const CLOSING_WINDOW_DAYS = 3;   // "about to expire" starts here
  const DEFAULT_VALIDITY_DAYS = 14;

  const DAY = 864e5;
  const startOfDay = d => { const c = new Date(d); c.setHours(0, 0, 0, 0); return c; };
  const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);

  /* Where a sent proposal stands in time, or null when time has nothing
     to say about it — a draft that was never sent, or one already decided.
     A deal that came back won or lost is finished; nagging about it would
     teach the operator to ignore the whole panel. */
  function dueState(deal, now) {
    const d = deal || {};
    if (d.status !== 'sent' && d.status !== 'no_answer') return null;
    if (!d.sentAt) return null;

    const at = new Date(d.sentAt);
    if (!isFinite(at.getTime())) return null;
    const today = now || new Date();

    const silentFor = Math.max(0, daysBetween(at, today));
    const validity = +d.validityDays > 0 ? +d.validityDays : DEFAULT_VALIDITY_DAYS;
    const expires = new Date(at.getTime() + validity * DAY);
    const daysLeft = daysBetween(today, expires);

    let state, label;
    if (daysLeft < 0) {
      state = 'expired';
      label = 'פג התוקף לפני ' + Math.abs(daysLeft) + ' ימים';
    } else if (daysLeft <= CLOSING_WINDOW_DAYS) {
      state = 'closing';
      label = daysLeft === 0 ? 'התוקף פג היום'
            : 'התוקף פג בעוד ' + daysLeft + (daysLeft === 1 ? ' יום' : ' ימים');
    } else if (silentFor >= NUDGE_AFTER_DAYS) {
      state = 'quiet';
      label = 'נשלחה לפני ' + silentFor + ' ימים, בלי תשובה';
    } else {
      state = 'fresh';
      label = silentFor === 0 ? 'נשלחה היום'
            : 'נשלחה לפני ' + silentFor + (silentFor === 1 ? ' יום' : ' ימים');
    }
    return { state, label, silentFor, daysLeft, expires,
             needsAction: state === 'quiet' || state === 'closing' || state === 'expired' };
  }

  /* What the operator should be told the moment they come back, in one
     sentence, or null when nothing is waiting. Counts rather than a list:
     the ledger below it already has the detail, and a summary that
     repeats the detail is just noise above it. */
  function summary(deals, now) {
    const states = (deals || []).map(d => dueState(d, now)).filter(Boolean);
    const acting = states.filter(s => s.needsAction);
    if (!acting.length) return null;
    const expired = acting.filter(s => s.state === 'expired').length;
    const closing = acting.filter(s => s.state === 'closing').length;
    const quiet = acting.filter(s => s.state === 'quiet').length;
    const parts = [];
    if (expired) parts.push(expired === 1 ? 'אחת פג תוקפה' : expired + ' פג תוקפן');
    if (closing) parts.push(closing === 1 ? 'אחת עומדת לפוג' : closing + ' עומדות לפוג');
    if (quiet) parts.push(quiet === 1 ? 'אחת שותקת כבר כמה ימים' : quiet + ' שותקות כבר כמה ימים');
    return { count: acting.length, expired, closing, quiet, text: parts.join(' · ') };
  }

  /* ---------- the calendar file ----------
     RFC 5545 wants CRLF line endings and its own escaping, and a file that
     is subtly wrong is worse than none: the operator taps it, nothing
     opens, and they conclude the feature is broken rather than the file. */
  const esc = s => String(s == null ? '' : s)
    .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

  /* An all-day VALUE=DATE carries a calendar date, not an instant, so it
     has to be the date the operator was actually shown. Serialising it
     with UTC getters put the reminder a day early for anyone east of
     Greenwich: a proposal sent just after midnight in Asia/Jerusalem
     promised 29.8 on screen and wrote 20260828 into the file. A reminder
     that fires the day before the one you were told is worse than none,
     because you stop trusting the ones that do fire.

     DTSTAMP below stays UTC — that one genuinely is an instant, and the
     spec requires the Z form. */
  const p2 = n => String(n).padStart(2, '0');
  const stampDate = d => d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
  const stampUTC = d =>
    d.getUTCFullYear() + p2(d.getUTCMonth() + 1) + p2(d.getUTCDate()) + 'T' +
    p2(d.getUTCHours()) + p2(d.getUTCMinutes()) + p2(d.getUTCSeconds()) + 'Z';

  /* An all-day event rather than a timed one. A reminder pinned to 09:00
     is pinned to 09:00 in whichever timezone the file was written in, and
     lands at some other hour for anyone who travels; all-day is what this
     actually is — a thing to handle that day. */
  function icsFor(deal, opts) {
    const o = opts || {};
    const d = deal || {};
    if (!d.sentAt) return null;
    const at = new Date(d.sentAt);
    if (!isFinite(at.getTime())) return null;

    const validity = +d.validityDays > 0 ? +d.validityDays : DEFAULT_VALIDITY_DAYS;
    const expires = new Date(at.getTime() + validity * DAY);
    /* A couple of days before it lapses, not on the day. Once the date in
       the document has passed the price has to be re-quoted, and a
       re-quote starts the anchoring again — usually lower. */
    const when = new Date(Math.max(
      at.getTime() + NUDGE_AFTER_DAYS * DAY,
      expires.getTime() - CLOSING_WINDOW_DAYS * DAY));
    const end = new Date(when.getTime() + DAY);

    const client = (d.client || 'הלקוח').trim();
    const price = o.ils && d.priceQuoted ? o.ils(d.priceQuoted) : (d.priceQuoted || '');
    const stamp = o.now || new Date();

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//PRE-CALL//POST-CALL//HE',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + esc('postcall-' + (d.id || 'deal') + '-' + stampDate(at) + '@pre-call'),
      'DTSTAMP:' + stampUTC(stamp),
      'DTSTART;VALUE=DATE:' + stampDate(when),
      'DTEND;VALUE=DATE:' + stampDate(end),
      'SUMMARY:' + esc('לבדוק מה קרה עם ההצעה ל' + client),
      'DESCRIPTION:' + esc(
        'ההצעה נשלחה ב-' + at.toLocaleDateString('he-IL') +
        (price ? ' על ' + price : '') +
        '. התוקף שנכתב במסמך: ' + expires.toLocaleDateString('he-IL') + '.\n\n' +
        'אם הוא ענה — עדכן בפנקס אם נסגרה או נדחתה, וכמה שעות עבודה זה לקח בפועל. ' +
        'זה מה שהופך את האומדן ממותאם-אחורה למדוד.'),
      'BEGIN:VALARM',
      'TRIGGER:PT9H',           // 09:00 on the day, in the reader's own zone
      'ACTION:DISPLAY',
      'DESCRIPTION:' + esc('לבדוק מה קרה עם ההצעה ל' + client),
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ];
    return lines.join('\r\n') + '\r\n';
  }

  function filenameFor(deal) {
    const c = ((deal && deal.client) || 'הצעה').replace(/[^\wא-ת -]/g, '').trim().slice(0, 40);
    return 'מעקב-' + (c || 'הצעה') + '.ics';
  }

  root.PC = root.PC || {};
  root.PC.followup = { dueState, summary, icsFor, filenameFor,
                       NUDGE_AFTER_DAYS, CLOSING_WINDOW_DAYS, DEFAULT_VALIDITY_DAYS };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.PC.followup;
})(typeof window !== 'undefined' ? window : globalThis);
