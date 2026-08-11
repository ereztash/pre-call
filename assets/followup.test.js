/* node assets/followup.test.js — no browser, no deps.

   This module exists to close the product's deepest structural hole: the
   calibration that makes the effort estimate real needs five delivered
   jobs reported back, and nothing ever asked for them. So the tests are
   about the asking, and about the one artefact that does the asking when
   the tab is closed — a calendar file that has to be correct, because a
   subtly malformed .ics does not error, it simply does nothing when
   tapped, and the operator concludes the feature is broken. */
const F = require('./pc-followup.js');
const assert = require('assert');

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

const DAY = 864e5;
const NOW = new Date('2026-08-20T10:00:00Z');
const sentDaysAgo = (n, over = {}) => Object.assign({
  id: 'd' + n, client: 'לקוח ' + n, status: 'sent', priceQuoted: 12000,
  created: new Date(NOW - n * DAY).toISOString(),
  sentAt: new Date(NOW - n * DAY).toISOString()
}, over);

console.log('\nwhere a proposal stands in time');
test('sent today is fresh and asks for nothing', () => {
  const s = F.dueState(sentDaysAgo(0), NOW);
  assert.strictEqual(s.state, 'fresh');
  assert.strictEqual(s.needsAction, false);
  assert.strictEqual(s.label, 'נשלחה היום');
});
test('silence past the nudge threshold becomes something to act on', () => {
  assert.strictEqual(F.dueState(sentDaysAgo(2), NOW).state, 'fresh');
  const s = F.dueState(sentDaysAgo(F.NUDGE_AFTER_DAYS), NOW);
  assert.strictEqual(s.state, 'quiet');
  assert.strictEqual(s.needsAction, true);
});
test('the closing window outranks mere silence — the deadline is the sharper fact', () => {
  const s = F.dueState(sentDaysAgo(12), NOW);   // 14-day validity, 2 days left
  assert.strictEqual(s.state, 'closing');
  assert.strictEqual(s.daysLeft, 2);
});
test('past the validity date it is expired, and says how long ago', () => {
  const s = F.dueState(sentDaysAgo(20), NOW);
  assert.strictEqual(s.state, 'expired');
  assert.ok(s.label.includes('6'), 'should say six days past a 14-day validity');
});
test('the validity the document actually promised is respected, not a default', () => {
  /* Same deal, same age, two different promises. A proposal to a client
     who needs more than one signature was written with 21 days on it, and
     treating it as lapsed on day 16 would send the operator chasing a
     deadline their own document never set. */
  const committee = F.dueState(sentDaysAgo(16, { validityDays: 21 }), NOW);
  assert.notStrictEqual(committee.state, 'expired', 'a 21-day offer has not lapsed on day 16');
  assert.strictEqual(committee.daysLeft, 5);
  assert.strictEqual(F.dueState(sentDaysAgo(16), NOW).state, 'expired',
    'the same deal under the 14-day default has');
  // and it does reach 'closing' at the right moment for its own promise
  assert.strictEqual(F.dueState(sentDaysAgo(19, { validityDays: 21 }), NOW).state, 'closing');
});

console.log('\nwhat is deliberately silent');
test('a deal that was decided is never chased again', () => {
  ['won', 'lost'].forEach(status =>
    assert.strictEqual(F.dueState(sentDaysAgo(30, { status }), NOW), null,
      status + ' is finished — nagging about it teaches the operator to ignore the panel'));
});
test('a draft that was never sent has no clock', () => {
  assert.strictEqual(F.dueState({ status: 'draft', client: 'x' }, NOW), null);
  assert.strictEqual(F.dueState(sentDaysAgo(5, { sentAt: undefined }), NOW), null);
});
test('a corrupt timestamp reads as no clock rather than throwing', () => {
  assert.strictEqual(F.dueState(sentDaysAgo(5, { sentAt: 'not a date' }), NOW), null);
});
test('no_answer is still chased — it means asked and unanswered, not closed', () => {
  const s = F.dueState(sentDaysAgo(10, { status: 'no_answer' }), NOW);
  assert.ok(s && s.needsAction);
});

console.log('\nthe line that greets a returning operator');
test('nothing waiting means no line at all, not an empty one', () => {
  assert.strictEqual(F.summary([sentDaysAgo(0), sentDaysAgo(1)], NOW), null);
  assert.strictEqual(F.summary([], NOW), null);
});
test('each kind of waiting is counted and named', () => {
  const s = F.summary([
    sentDaysAgo(0),                       // fresh — not counted
    sentDaysAgo(5), sentDaysAgo(6),       // quiet
    sentDaysAgo(12),                      // closing
    sentDaysAgo(30)                       // expired
  ], NOW);
  assert.strictEqual(s.count, 4, 'the fresh one must not be counted');
  assert.strictEqual(s.quiet, 2);
  assert.strictEqual(s.closing, 1);
  assert.strictEqual(s.expired, 1);
  ['פג', 'לפוג', 'שותקות'].forEach(w =>
    assert.ok(s.text.includes(w), 'summary should mention ' + w + ': ' + s.text));
});
test('singular and plural are both written, not "1 הצעות"', () => {
  const one = F.summary([sentDaysAgo(5)], NOW);
  assert.ok(one.text.includes('אחת'), one.text);
});

console.log('\nthe calendar file');
const ics = F.icsFor(sentDaysAgo(0), { now: NOW });
test('it is a structurally valid iCalendar object', () => {
  ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:', 'BEGIN:VEVENT', 'UID:',
   'DTSTAMP:', 'DTSTART', 'DTEND', 'SUMMARY:', 'END:VEVENT', 'END:VCALENDAR']
    .forEach(t => assert.ok(ics.includes(t), 'missing ' + t));
});
test('lines end CRLF, as the spec requires — LF-only files are rejected by some clients', () => {
  const bad = ics.split('\r\n').filter(l => l.includes('\n'));
  assert.deepStrictEqual(bad, [], 'a bare LF survived inside a line');
  assert.ok(ics.endsWith('\r\n'));
});
test('the reminder lands before the offer lapses, never after', () => {
  const d = sentDaysAgo(0);
  const m = F.icsFor(d, { now: NOW }).match(/DTSTART;VALUE=DATE:(\d{8})/);
  const start = new Date(m[1].slice(0,4) + '-' + m[1].slice(4,6) + '-' + m[1].slice(6,8));
  const expiry = new Date(new Date(d.sentAt).getTime() + F.DEFAULT_VALIDITY_DAYS * DAY);
  assert.ok(start < expiry, 'a reminder after the expiry date is a reminder to re-quote');
  assert.ok(start > new Date(d.sentAt), 'and it must not be in the past');
});
/* Unfold before asserting on content, which is what every real .ics reader does
   first. RFC 5545 breaks long lines with CRLF plus a leading space, and these
   files are Hebrew — two octets a letter — so almost every content line is
   folded. Asserting on the raw text means asserting that a fold happened not to
   land inside the phrase you were looking for, which is luck, not a test. */
const unfold = s => String(s).replace(/\r\n[ \t]/g, '');

test('the client name is escaped per the spec, not merely interpolated', () => {
  const out = F.icsFor(sentDaysAgo(1, { client: 'כהן, לוי; ושות׳' }), { now: NOW });
  assert.ok(unfold(out).includes('כהן\\, לוי\\; ושות׳'),
    'an unescaped comma or semicolon silently truncates the field for the reader');
});
test('the description says what to report back — that is the entire point', () => {
  assert.ok(/שעות עבודה/.test(unfold(ics)),
    'the reminder must ask for the hours, or the calibration still never fills');
});
test('a deal with no send date produces no file rather than a broken one', () => {
  assert.strictEqual(F.icsFor({ client: 'x' }), null);
  assert.strictEqual(F.icsFor(sentDaysAgo(1, { sentAt: 'nonsense' })), null);
});
/* Measured in Chromium, not assumed: an <a download> whose value contains ANY
   non-ASCII character is discarded entirely and the browser saves the file as
   "download" — with no extension at all, so tapping it opens nothing. Every
   shape was tried:

     שיחה.ics                → "download"
     call-מסעדת.ics          → "download"
     call-2026-08-20-הדר.ics → "download"
     call-2026-08-20.ics     → "call-2026-08-20.ics"

   So the name has to be ASCII, and the client's name lives inside the file
   instead — in SUMMARY, which is where it actually gets read. A file that opens
   and says who it is beats a file with a better name that does nothing. This
   test replaces one that asserted the Hebrew name survived into the filename,
   which it never did outside of Node. */
const asciiOnly = n => assert.ok(!/[^\x00-\x7F]/.test(n),
  'a non-ASCII character makes Chromium drop the whole filename: ' + n);

test('the follow-up filename is ASCII and keeps its extension', () => {
  const n = F.filenameFor(sentDaysAgo(1, { client: 'מסעדת "הדר" / סניף ראשי' }));
  assert.ok(n.endsWith('.ics'), 'without the extension a calendar will not open it');
  asciiOnly(n);
  assert.ok(!/["\/\\:*?<>|]/.test(n), 'illegal filename characters survived: ' + n);
  assert.ok(/\d{4}-\d{2}-\d{2}/.test(n), 'the date is what makes it recognisable now: ' + n);
});
test('a latin client name is kept, because it costs nothing', () => {
  const n = F.filenameFor(sentDaysAgo(1, { client: 'Hadar Bistro & Co.' }));
  assert.ok(/hadar-bistro/i.test(n), 'transliterable-free names should survive: ' + n);
  asciiOnly(n);
});
test('the call filename is ASCII, dated, and never extensionless', () => {
  const n = F.callFilename({ date: '2026-08-20', client: 'מסעדת הדר' });
  assert.ok(n.endsWith('.ics'));
  asciiOnly(n);
  assert.ok(n.includes('2026-08-20'), n);
  // and with nothing at all to go on it is still a usable name
  const bare = F.callFilename();
  assert.ok(bare.endsWith('.ics') && bare.length > 4, bare);
  asciiOnly(bare);
});

console.log('\nthe calendar date is the date the operator was shown');
/* Found in review, reproduced exactly: a proposal sent just after midnight
   in Asia/Jerusalem promised 29.8 on screen and wrote 20260828 into the
   file. A reminder that fires the day before the one you were told is
   worse than none, because you stop trusting the ones that do. */
test('DTSTART is the local calendar date, not the UTC one', () => {
  const at = new Date('2026-08-18T00:30:00+03:00');
  const d = { id: 'x', client: 'לקוח', status: 'sent', sentAt: at.toISOString() };
  const start = (F.icsFor(d).match(/DTSTART;VALUE=DATE:(\d{8})/) || [])[1];
  // what the UI promises: the same instant, read as a local calendar date
  const when = new Date(Math.max(at.getTime() + F.NUDGE_AFTER_DAYS * DAY,
    at.getTime() + (F.DEFAULT_VALIDITY_DAYS - F.CLOSING_WINDOW_DAYS) * DAY));
  const p = n => String(n).padStart(2, '0');
  const promised = when.getFullYear() + p(when.getMonth() + 1) + p(when.getDate());
  assert.strictEqual(start, promised,
    'the file says a different day from the one the operator was told');
});
test('DTEND stays exactly one day after DTSTART, in the same calendar', () => {
  const ics = F.icsFor(sentDaysAgo(0), { now: NOW });
  const s = (ics.match(/DTSTART;VALUE=DATE:(\d{8})/) || [])[1];
  const e = (ics.match(/DTEND;VALUE=DATE:(\d{8})/) || [])[1];
  const toD = t => new Date(+t.slice(0,4), +t.slice(4,6) - 1, +t.slice(6,8));
  assert.strictEqual(Math.round((toD(e) - toD(s)) / DAY), 1,
    'an all-day event must end the day after it starts');
});
test('DTSTAMP is still an instant in UTC, as the spec requires', () => {
  assert.ok(/DTSTAMP:\d{8}T\d{6}Z/.test(F.icsFor(sentDaysAgo(0), { now: NOW })),
    'DTSTAMP is a timestamp, not a calendar date — it keeps the Z form');
});

console.log('\nthe call itself, which is the only trigger that needs no channel');
/* Measured, not assumed: over 25 days of this operator's calendar there were 70
   meetings with more than one attendee — about 19.6 a week, median 60 minutes —
   and the median gap after one ends is 60 minutes, with 69 of the 70 leaving
   more than 15 clear minutes. So an alarm 15 minutes after the end lands in
   empty space essentially always, and a reminder at a fixed hour of the day
   would not: those meetings start anywhere between 08:00 and 19:00.

   That is what `TRIGGER;RELATED=END` is for, and it is the whole reason this
   generator is separate from icsFor above — that one reminds you about a
   proposal days later, this one catches the ten minutes after you hang up. */
const CALL = { date: '2026-08-20', time: '14:30', minutes: 45, client: 'מסעדת הדר' };

test('the second alarm fires after the meeting ENDS, not after it starts', () => {
  /* The one line that cannot be got wrong. Anchored to the start, a 45-minute
     call would be interrupted by its own follow-up reminder. */
  const ics = F.callIcs(CALL, { now: NOW });
  assert.ok(/TRIGGER;RELATED=END:PT15M/.test(ics),
    'no end-relative trigger, so the reminder lands mid-call: ' + ics);
});
test('one event, two alarms — before it to prepare, after it to price', () => {
  const ics = F.callIcs(CALL, { now: NOW });
  assert.strictEqual((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.strictEqual((ics.match(/BEGIN:VALARM/g) || []).length, 2);
  assert.strictEqual((ics.match(/END:VALARM/g) || []).length, 2);
  assert.ok(/TRIGGER:-PT\d+M/.test(ics), 'nothing reminds you before the call');
});
test('it is a timed event, unlike the follow-up, and the end matches the length', () => {
  /* icsFor is all-day on purpose and says so; this one is anchored to a specific
     hour, so an all-day event would make RELATED=END meaningless. */
  const ics = F.callIcs(CALL, { now: NOW });
  assert.ok(!/DTSTART;VALUE=DATE/.test(ics), 'an all-day call has no end to relate to');
  const s = (ics.match(/DTSTART:(\d{8}T\d{6}Z)/) || [])[1];
  const e = (ics.match(/DTEND:(\d{8}T\d{6}Z)/) || [])[1];
  assert.ok(s && e, 'DTSTART/DTEND missing or not instants: ' + ics);
  const toD = t => new Date(Date.UTC(+t.slice(0,4), +t.slice(4,6) - 1, +t.slice(6,8),
                                     +t.slice(9,11), +t.slice(11,13), +t.slice(13,15)));
  assert.strictEqual((toD(e) - toD(s)) / 60000, CALL.minutes);
});
test('the hour written into the file is the hour the operator typed', () => {
  /* The defect icsFor already carries a comment about, in the other direction:
     serialise a local wall-clock time with UTC getters and the file says a
     different hour than the screen did. 14:30 local must arrive as 14:30 local. */
  const ics = F.callIcs(CALL, { now: NOW });
  const s = (ics.match(/DTSTART:(\d{8}T\d{6}Z)/) || [])[1];
  const back = new Date(Date.UTC(+s.slice(0,4), +s.slice(4,6) - 1, +s.slice(6,8),
                                 +s.slice(9,11), +s.slice(11,13), +s.slice(13,15)));
  assert.strictEqual(back.getHours(), 14, 'the hour drifted between screen and file');
  assert.strictEqual(back.getMinutes(), 30);
  assert.strictEqual(back.getDate(), 20, 'and so did the day');
});
test('a missing or unparseable time produces nothing, not a broken file', () => {
  // a subtly malformed .ics does not error when tapped, it simply does nothing
  assert.strictEqual(F.callIcs(null), null);
  assert.strictEqual(F.callIcs({ date: '', time: '14:30' }), null);
  assert.strictEqual(F.callIcs({ date: 'לא תאריך', time: '14:30' }), null);
  assert.strictEqual(F.callIcs({ date: '2026-08-20', time: '99:99' }), null);
  assert.strictEqual(F.callIcs({ date: '2026-08-20', time: '14:30', minutes: 0 }), null);
});
test('the client name is escaped, and it is in there on purpose', () => {
  /* This file goes into the operator's own calendar, so the name being visible
     is the point — it is what makes the reminder mean anything three days
     later. It is also the reason the README says so out loud. */
  const ics = F.callIcs({ date: '2026-08-20', time: '09:00', minutes: 30,
                          client: 'כהן, לוי; ושותפים\\בע"מ' }, { now: NOW });
  assert.ok(ics.includes('כהן'), 'the whole point is that you know who it is');
  assert.ok(/SUMMARY:[^\r\n]*\\,/.test(ics), 'an unescaped comma splits the field');
  assert.ok(/\\;/.test(ics), 'an unescaped semicolon splits the field');
});
test('no line exceeds 75 octets, and no fold splits a Hebrew character', () => {
  /* RFC 5545 folds at 75 OCTETS, and Hebrew is two octets per letter — so a
     naive fold at 75 characters is both wrong and capable of cutting a letter
     in half, which is how a file becomes mojibake in one calendar and fine in
     another. Unfolding must return exactly what was folded. */
  const ics = F.callIcs({ date: '2026-08-20', time: '09:00', minutes: 60,
    client: 'מרפאת שיניים דוקטור כהן ובניו בעמק הירדן והסביבה בעמ' }, { now: NOW });
  const lines = ics.split('\r\n');
  const over = lines.filter(l => Buffer.byteLength(l, 'utf8') > 75);
  assert.deepStrictEqual(over, [], 'lines longer than 75 octets: ' + over.join(' | '));
  const unfolded = ics.replace(/\r\n[ \t]/g, '');
  assert.ok(unfolded.includes('מרפאת שיניים דוקטור כהן ובניו בעמק הירדן והסביבה'),
    'unfolding did not give the text back — a fold landed inside a character');
  assert.ok(!/�/.test(ics), 'a replacement character means a split code point');
});
test('the follow-up file is folded too, and still says what it said', () => {
  // same helper, applied to the generator that shipped before it existed
  const ics = F.icsFor(sentDaysAgo(0), { now: NOW });
  const over = ics.split('\r\n').filter(l => Buffer.byteLength(l, 'utf8') > 75);
  assert.deepStrictEqual(over, [], 'unfolded long lines: ' + over.join(' | '));
  assert.ok(ics.replace(/\r\n[ \t]/g, '').includes('שעות עבודה'),
    'the ask that makes calibration possible must survive folding');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
