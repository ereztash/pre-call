/* ============================================================
   iCalendar, the primitives and the one file PRE-CALL needs.

   Split out of pc-followup.js for a measured reason: PRE-CALL loads this to
   build one file — the reminder for the call it is preparing you for — and was
   paying 6.76KB over the wire for a module whose other half is about proposals
   that have already been sent. Half of that page's budget went on code it
   cannot run. The escaping, the folding and the stamps live here so there is
   still exactly one implementation of them, which was the reason they were
   together in the first place.

   POST-CALL loads this and then pc-followup.js, which uses these helpers.

   Pure, no DOM, no storage. Tested in Node via followup.test.js, which
   requires both.
   ============================================================ */
(function (root) {
  'use strict';

  var tr = (typeof PC !== 'undefined' && PC.i18n) ? PC.i18n.tr
    : function (s, p) { if (p) for (var k in p) s = s.split('{' + k + '}').join(p[k]); return s; };

  const PREP_BEFORE_MIN = 30;   // enough to open the tool and read your own script
  const PRICE_AFTER_MIN = 15;   // inside the gap for 69 of 70 measured meetings

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
  /* RFC 5545 folds content lines at 75 OCTETS, continuing with a single leading
     space. Every line in this product is Hebrew, and Hebrew is two octets per
     letter, so a description passes 75 octets in about 37 characters — meaning
     nothing here was ever inside the limit. Most clients tolerate it, which is
     why it went unnoticed; the ones that do not produce mojibake rather than an
     error, so the operator sees a broken reminder and blames the tool.

     Counted in octets and cut on character boundaries, because a fold placed
     mid-sequence splits a letter in half. Unfolding must return exactly the
     input, and a test asserts the round trip on a long Hebrew name. */
  function fold(line) {
    let out = '', width = 0, first = true;
    for (const ch of String(line)) {
      // manual UTF-8 length: this runs in a browser too, where Buffer is absent
      const cp = ch.codePointAt(0);
      const n = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
      const limit = first ? 75 : 74;           // the continuation space costs one
      if (width + n > limit) { out += '\r\n '; width = 1; first = false; }
      out += ch; width += n;
    }
    return out;
  }
  const build = lines => lines.map(fold).join('\r\n') + '\r\n';

  const p2 = n => String(n).padStart(2, '0');
  const stampDate = d => d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
  const stampUTC = d =>
    d.getUTCFullYear() + p2(d.getUTCMonth() + 1) + p2(d.getUTCDate()) + 'T' +
    p2(d.getUTCHours()) + p2(d.getUTCMinutes()) + p2(d.getUTCSeconds()) + 'Z';

  /* ASCII only, and this was measured in Chromium rather than assumed: an
     <a download> value containing ANY non-ASCII character is discarded whole and
     the file saves as "download" — with no extension, so tapping it opens
     nothing. Every shape was tried and only pure ASCII survived:

       שיחה.ics                → "download"
       call-מסעדת.ics          → "download"
       call-2026-08-20-הדר.ics → "download"
       call-2026-08-20.ics     → "call-2026-08-20.ics"

     Which means the Hebrew client name in these filenames never once reached a
     real download, and the file the operator got was a name with no extension.
     The name lives inside the file now, in SUMMARY, which is where a person
     actually reads it. The date is what makes the filename recognisable in a
     downloads folder, and a latin name is kept when there is one because it
     costs nothing. */
  const slug = s => String(s || '').normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 30);
  const p2d = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  const icsName = (stem, client, when) => {
    const parts = [stem, slug(client), when ? p2d(when) : ''].filter(Boolean);
    return parts.join('-') + '.ics';
  };

  function callFilename(input) {
    const i = input || {};
    const d = /^\d{4}-\d{2}-\d{2}$/.test(String(i.date || '')) ? new Date(i.date + 'T00:00:00') : null;
    return icsName('call', i.client, d && isFinite(d.getTime()) ? d : new Date());
  }

  /* ---------- the call itself ----------

     A second generator rather than an option on the first, because the two are
     different events. icsFor reminds you about a proposal that has gone quiet
     days later, and is all-day for the reason written above it. This one is
     anchored to a specific call at a specific hour, so it has to be timed — an
     all-day event has no end for an alarm to relate to, which is the whole
     mechanism here.

     Measured before it was built, from 25 days of one operator's calendar: 70
     meetings with more than one attendee, about 19.6 a week, median 60 minutes,
     and a median gap of 60 minutes after one ends — with 69 of the 70 leaving
     more than 15 clear minutes. Two things follow. An alarm 15 minutes after the
     END lands in empty space almost always, which is exactly when the call is
     still in your head and the price has not been guessed yet. And a reminder at
     a fixed hour of the day would be wrong, because those meetings start
     anywhere from 08:00 to 19:00.

     The client's name goes in. This file lands in the operator's own calendar,
     never the client's, and a reminder that says "price the call" without saying
     which call is a reminder about nothing. The README says so out loud rather
     than leaving it to be discovered. */
  function callIcs(input, opts) {
    const o = opts || {};
    const i = input || {};
    const minutes = +i.minutes;
    if (!isFinite(minutes) || minutes <= 0) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(i.date || ''))) return null;
    const hm = String(i.time || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!hm) return null;
    const h = +hm[1], m = +hm[2];
    if (h > 23 || m > 59) return null;

    const [y, mo, d] = String(i.date).split('-').map(Number);
    /* Local constructor on purpose: the operator typed a wall-clock time, and
       building it as UTC would write a different hour into the file than the one
       on screen. That is the defect icsFor carries a comment about, in the
       opposite direction. */
    const start = new Date(y, mo - 1, d, h, m, 0, 0);
    if (!isFinite(start.getTime()) || start.getMonth() !== mo - 1) return null;
    const end = new Date(start.getTime() + minutes * 60000);

    const client = (i.client || '').trim();
    const who = client || tr('הלקוח');
    const stamp = o.now || new Date();

    return build([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//PRE-CALL//POST-CALL//HE',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + esc('precall-' + stampUTC(start).replace(/\D/g, '') + '@pre-call'),
      'DTSTAMP:' + stampUTC(stamp),
      'DTSTART:' + stampUTC(start),
      'DTEND:' + stampUTC(end),
      'SUMMARY:' + esc(tr('שיחת אפיון · {who}', { who: who })),
      'DESCRIPTION:' + esc(
        tr('לפני: תסריט השיחה מוכן ב-PRE-CALL. אחרי: תמחור ההצעה ב-POST-CALL, כל עוד השיחה עוד באוזניים.') +
        '\n\n' +
        tr('הרגע שאחרי הוא הרגע שבו ההיקף עוד זכור והמחיר עוד לא נוחש.')),
      'BEGIN:VALARM',
      'TRIGGER:-PT' + PREP_BEFORE_MIN + 'M',
      'ACTION:DISPLAY',
      'DESCRIPTION:' + esc(tr('בעוד {min} דקות: שיחה עם {who}', { min: PREP_BEFORE_MIN, who: who })),
      'END:VALARM',
      'BEGIN:VALARM',
      /* The line this whole file exists for. Relative to the END of the event:
         anchored to the start, a 45-minute call gets interrupted by its own
         follow-up reminder. */
      'TRIGGER;RELATED=END:PT' + PRICE_AFTER_MIN + 'M',
      'ACTION:DISPLAY',
      'DESCRIPTION:' + esc(tr('השיחה עם {who} נגמרה. תמחר אותה עכשיו, לא מחר — מחר ההיקף כבר מטושטש והמחיר יוצא מהבטן.', { who: who })),
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ]);
  }




  root.PC = root.PC || {};
  root.PC.ical = { esc, fold, build, stampDate, stampUTC, slug, icsName,
                   callIcs, callFilename, PREP_BEFORE_MIN, PRICE_AFTER_MIN };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.PC.ical;
})(typeof window !== 'undefined' ? window : globalThis);
