/* POST-CALL · the proposal you sent and stopped thinking about.
   Pure, no DOM, no storage. Tested in Node.
   Why it works this way: docs/modules/pc-followup.md */
(function (root) {
  'use strict';

  var tr = (typeof PC !== 'undefined' && PC.i18n) ? PC.i18n.tr
    : function (s, p) { if (p) for (var k in p) s = s.split('{' + k + '}').join(p[k]); return s; };

  /* Chasing on day one reads as desperate and on day thirty as an
     afterthought. Three days is long enough that silence means something
     and short enough that the call is still fresh for both sides. */
  const NUDGE_AFTER_DAYS = 3;
  const CLOSING_WINDOW_DAYS = 3;   // "about to expire" starts here
  const DEFAULT_VALIDITY_DAYS = 14;

  const DAY = 864e5;
  const startOfDay = d => { const c = new Date(d); c.setHours(0, 0, 0, 0); return c; };
  const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);
  const locale = () => (typeof PC !== 'undefined' && PC.i18n) ? PC.i18n.locale() : 'he-IL';

  /* ---------- the date the client themselves named ----------

     Question 12 asks "by when do you need this working", and its own help text
     promises the answer "goes into the proposal as a timeline and as a decision
     date". It reached the document and one confidence counter and nothing else,
     so the decision date it promised did not exist — a field the client answered
     out loud, typed in by hand, feeding one layer of eleven.

     Deliberately narrow, and it returns null far more often than not. Free text
     cannot be guessed at, and a reminder that fires on a date nobody named is
     worse than no reminder: it is exactly what teaches an operator to stop
     trusting the panel. "בהקדם האפשרי" and "לפני עונת החגים" are answers this
     function is supposed to refuse.

     Local Date parts throughout, never UTC getters — the same defect the
     all-day event above carries a comment about. A date the client named is a
     calendar date in their week, not an instant.

     MONTHS is parser data, not display copy — it matches whatever month name
     the client used in their own words, in either language, and is never
     itself shown on screen. Kept as regex literals rather than string
     literals for exactly that reason: this is the same kind of match as the
     תחילת/סוף checks below it, not a sentence someone reads. */
  const MONTHS = [/ינואר|january|jan\b/i, /פברואר|february|feb\b/i, /מרץ|march|mar\b/i,
                  /אפריל|april|apr\b/i, /מאי|\bmay\b/i, /יוני|june|jun\b/i,
                  /יולי|july|jul\b/i, /אוגוסט|august|aug\b/i, /ספטמבר|september|sep\b/i,
                  /אוקטובר|october|oct\b/i, /נובמבר|november|nov\b/i, /דצמבר|december|dec\b/i];
  const lastDay = (y, m) => new Date(y, m + 1, 0).getDate();

  function deadlineDate(text, now) {
    const s = String(text == null ? '' : text).trim();
    if (!s) return null;
    const today = now ? new Date(now) : new Date();
    const mk = (y, m, d) => {
      if (m < 0 || m > 11 || d < 1 || d > lastDay(y, m)) return null;   // 31/2 is not a date
      return new Date(y, m, d, 12, 0, 0, 0);   // midday, so no timezone can move the day
    };
    /* Not in the past. A client naming "March" in November means next March, and
       reading it as one behind would produce a proposal that lapsed before it
       was written. */
    const forward = (m, d) => {
      const y = today.getFullYear();
      return (mk(y, m, d) && mk(y, m, d) >= today) ? mk(y, m, d) : mk(y + 1, m, d);
    };

    const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return mk(+iso[1], +iso[2] - 1, +iso[3]);

    /* Day-then-month, which is how it is written in Hebrew. A bare number is not
       a date — "40" is an answer to a different question and must not become one. */
    const dmy = s.match(/(?:^|[^\d])(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?![\d])/);
    if (dmy) {
      const d = +dmy[1], m = +dmy[2] - 1;
      if (!dmy[3]) return forward(m, d);
      const y = +dmy[3] < 100 ? 2000 + +dmy[3] : +dmy[3];
      return mk(y, m, d);
    }

    const mi = MONTHS.findIndex(re => re.test(s));
    if (mi === -1) return null;
    /* Which part of the month was actually said. A bare month name is read as
       its middle, which is the honest midpoint of what the person told you —
       not the 1st, which would invent urgency they did not express. */
    if (/תחילת|ראשית|בתחילת|\b(?:start|beginning) of\b|\bearly\b/i.test(s)) return forward(mi, 1);
    if (/סוף|בסוף|לקראת סוף|\bend of\b|\blate\b/i.test(s)) {
      const y = today.getFullYear();
      const end = mk(y, mi, lastDay(y, mi));
      return end && end >= today ? end : mk(y + 1, mi, lastDay(y + 1, mi));
    }
    return forward(mi, 15);
  }

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
    const docExpires = new Date(at.getTime() + validity * DAY);

    /* The client's own date, when they named one, and only when it comes first.
       A proposal cannot sensibly stay "fresh" past the day they said they need
       the thing working — a client who needs it live in five days was until now
       chased on the same 14-day schedule as one with no deadline at all.

       Clamped in one direction only. A need further out does not extend the
       offer: the document promised fourteen days, and quietly holding the price
       longer would be the tool re-writing what was sent. */
    const named = d.clientDeadline ? new Date(d.clientDeadline) : null;
    const byClient = named && isFinite(named.getTime()) && named < docExpires;
    const expires = byClient ? named : docExpires;
    const daysLeft = daysBetween(today, expires);

    let state, label;
    if (daysLeft < 0) {
      state = 'expired';
      const n = Math.abs(daysLeft);
      label = byClient
        ? tr('התאריך שהלקוח נקב עבר לפני {n} ימים', { n: n })
        : tr('פג התוקף לפני {n} ימים', { n: n });
    } else if (daysLeft <= CLOSING_WINDOW_DAYS) {
      state = 'closing';
      const when = daysLeft === 0 ? tr('היום')
                 : daysLeft === 1 ? tr('בעוד {n} יום', { n: daysLeft })
                 : tr('בעוד {n} ימים', { n: daysLeft });
      label = byClient
        ? tr('הלקוח צריך שזה יעבוד {when}', { when: when })
        : tr('התוקף פג {when}', { when: when });
    } else if (silentFor >= NUDGE_AFTER_DAYS) {
      state = 'quiet';
      label = tr('נשלחה לפני {n} ימים, בלי תשובה', { n: silentFor });
    } else {
      state = 'fresh';
      label = silentFor === 0 ? tr('נשלחה היום')
            : silentFor === 1 ? tr('נשלחה לפני {n} יום', { n: silentFor })
            : tr('נשלחה לפני {n} ימים', { n: silentFor });
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
    if (expired) parts.push(expired === 1 ? tr('אחת פג תוקפה') : tr('{n} פג תוקפן', { n: expired }));
    if (closing) parts.push(closing === 1 ? tr('אחת עומדת לפוג') : tr('{n} עומדות לפוג', { n: closing }));
    if (quiet) parts.push(quiet === 1 ? tr('אחת שותקת כבר כמה ימים') : tr('{n} שותקות כבר כמה ימים', { n: quiet }));
    return { count: acting.length, expired, closing, quiet, text: parts.join(' · ') };
  }

  /* The iCalendar primitives live in pc-ical.js, which PRE-CALL loads on its own
     to build the reminder for a call it is preparing you for. One implementation
     of the escaping, the folding and the stamps, borrowed here rather than
     repeated — a second copy of a 75-octet fold is how two files start disagreeing
     about what a valid file is. */
  const I = root.PC && root.PC.ical;
  const esc = I.esc, build = I.build, stampDate = I.stampDate, stampUTC = I.stampUTC;
  const icsName = I.icsName;   // filenameFor below shares the ASCII naming rule
  const p2 = n => String(n).padStart(2, '0');

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
    const docExpires = new Date(at.getTime() + validity * DAY);
    /* The same one-directional clamp dueState applies, and for the same reason:
       the reminder has to land before the day the client said they need the thing
       working, not before the day the document happens to lapse. Without this the
       file and the panel would disagree about when a proposal is closing, which
       is worse than either being wrong alone. */
    const named = d.clientDeadline ? new Date(d.clientDeadline) : null;
    const expires = named && isFinite(named.getTime()) && named < docExpires ? named : docExpires;
    /* A couple of days before it lapses, not on the day. Once the date in
       the document has passed the price has to be re-quoted, and a
       re-quote starts the anchoring again — usually lower. */
    const when = new Date(Math.max(
      at.getTime() + NUDGE_AFTER_DAYS * DAY,
      expires.getTime() - CLOSING_WINDOW_DAYS * DAY));
    const end = new Date(when.getTime() + DAY);

    const client = (d.client || tr('הלקוח')).trim();
    const price = o.ils && d.priceQuoted ? o.ils(d.priceQuoted) : (d.priceQuoted || '');
    const stamp = o.now || new Date();
    const loc = locale();

    const summaryText = tr('לבדוק מה קרה עם ההצעה ל{client}', { client: client });

    /* Four small variants rather than one template with embedded ${}: the
       price line and the client's own deadline line are each independently
       present or absent, and a translated fragment cannot be spliced into
       the middle of a tr() literal — each combination gets its own
       sentence, in full, so the English reads naturally rather than as
       parts glued together. */
    let desc;
    const dateArgs = { sentDate: at.toLocaleDateString(loc), price: price, expDate: docExpires.toLocaleDateString(loc),
                       namedDate: named && isFinite(named.getTime()) ? named.toLocaleDateString(loc) : '' };
    if (price && named && isFinite(named.getTime())) {
      desc = tr('ההצעה נשלחה ב-{sentDate} על {price}. התוקף שנכתב במסמך: {expDate}.\nהלקוח אמר שהוא צריך שזה יעבוד עד {namedDate}.\n\nאם הוא ענה — עדכן בפנקס אם נסגרה או נדחתה, וכמה שעות עבודה זה לקח בפועל. זה מה שהופך את האומדן ממותאם-אחורה למדוד.', dateArgs);
    } else if (price) {
      desc = tr('ההצעה נשלחה ב-{sentDate} על {price}. התוקף שנכתב במסמך: {expDate}.\n\nאם הוא ענה — עדכן בפנקס אם נסגרה או נדחתה, וכמה שעות עבודה זה לקח בפועל. זה מה שהופך את האומדן ממותאם-אחורה למדוד.', dateArgs);
    } else if (named && isFinite(named.getTime())) {
      desc = tr('ההצעה נשלחה ב-{sentDate}. התוקף שנכתב במסמך: {expDate}.\nהלקוח אמר שהוא צריך שזה יעבוד עד {namedDate}.\n\nאם הוא ענה — עדכן בפנקס אם נסגרה או נדחתה, וכמה שעות עבודה זה לקח בפועל. זה מה שהופך את האומדן ממותאם-אחורה למדוד.', dateArgs);
    } else {
      desc = tr('ההצעה נשלחה ב-{sentDate}. התוקף שנכתב במסמך: {expDate}.\n\nאם הוא ענה — עדכן בפנקס אם נסגרה או נדחתה, וכמה שעות עבודה זה לקח בפועל. זה מה שהופך את האומדן ממותאם-אחורה למדוד.', dateArgs);
    }

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
      'SUMMARY:' + esc(summaryText),
      'DESCRIPTION:' + esc(desc),
      'BEGIN:VALARM',
      'TRIGGER:PT9H',           // 09:00 on the day, in the reader's own zone
      'ACTION:DISPLAY',
      'DESCRIPTION:' + esc(summaryText),
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ];
    return build(lines);
  }

  function filenameFor(deal) {
    const at = deal && deal.sentAt ? new Date(deal.sentAt) : null;
    return icsName('followup', deal && deal.client,
                   at && isFinite(at.getTime()) ? at : new Date());
  }


  root.PC = root.PC || {};
  root.PC.followup = { dueState, summary, icsFor, filenameFor, deadlineDate,
                       callIcs: I.callIcs, callFilename: I.callFilename,
                       NUDGE_AFTER_DAYS, CLOSING_WINDOW_DAYS, DEFAULT_VALIDITY_DAYS,
                       PREP_BEFORE_MIN: I.PREP_BEFORE_MIN, PRICE_AFTER_MIN: I.PRICE_AFTER_MIN };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.PC.followup;
})(typeof window !== 'undefined' ? window : globalThis);
