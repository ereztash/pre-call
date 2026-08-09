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
test('the client name is escaped per the spec, not merely interpolated', () => {
  const out = F.icsFor(sentDaysAgo(1, { client: 'כהן, לוי; ושות׳' }), { now: NOW });
  assert.ok(out.includes('כהן\\, לוי\\; ושות׳'),
    'an unescaped comma or semicolon silently truncates the field for the reader');
});
test('the description says what to report back — that is the entire point', () => {
  assert.ok(/שעות עבודה/.test(ics),
    'the reminder must ask for the hours, or the calibration still never fills');
});
test('a deal with no send date produces no file rather than a broken one', () => {
  assert.strictEqual(F.icsFor({ client: 'x' }), null);
  assert.strictEqual(F.icsFor(sentDaysAgo(1, { sentAt: 'nonsense' })), null);
});
test('the filename is safe for a filesystem and still recognisable', () => {
  const n = F.filenameFor({ client: 'מסעדת "הדר" / סניף ראשי' });
  assert.ok(n.endsWith('.ics'));
  assert.ok(!/["\/\\:*?<>|]/.test(n), 'illegal filename characters survived: ' + n);
  assert.ok(n.includes('הדר'), 'the client should still be recognisable: ' + n);
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

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
