/* node assets/transcript.test.js — no browser, no deps, no network.

   Two things are being protected here, and only one of them is parsing.

   The first is that a value without a citation never becomes a candidate.
   The whole tool exists to stop a guessed number from setting a price, and
   an extraction step is the easiest possible way to reintroduce exactly
   that — at scale, with a confident tone, and with nobody able to check.

   The second is the provenance derivation, which is the actual reason to
   read a transcript at all: it turns "where did this number come from" from
   something the operator asserts into something the recording shows. */
const T = require('./pc-transcript.js');
const EX = require('./pc-example.js');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

const cite = (value, quote, speaker) => ({ value, quote, speaker });

console.log('\nthe prompt');
test('carries the transcript and demands a citation for every value', () => {
  const p = T.buildPrompt('מוכר: שלום\nלקוח: היי');
  assert.ok(p.includes('מוכר: שלום'), 'the transcript must be in the prompt');
  assert.ok(/quote/.test(p) && /speaker/.test(p));
  assert.ok(/בלי ציטוט, החזר null/.test(p), 'the no-citation rule must be stated');
  assert.ok(/אל תמציא/.test(p));
});
test('asks for extraction only, never for judgement', () => {
  const p = T.buildPrompt('x');
  ['מחיר', 'המלץ', 'הערך את השווי'].forEach(w =>
    assert.ok(!p.includes(w), 'the model is not asked to decide anything: ' + w));
});
test('an empty transcript still produces a usable prompt', () => {
  assert.ok(T.buildPrompt('').length > 200);
  assert.ok(!/undefined|null\n---/.test(T.buildPrompt(undefined)));
});

console.log('\nreading what comes back');
test('reads the shape a model actually returns', () => {
  const f = T.parseExtraction(EX.EXTRACTION);
  assert.ok(f, 'the example extraction must parse');
  assert.strictEqual(f.freq.value, 40);
  assert.strictEqual(f.minutes.value, 8);
});
test('survives prose wrapped around the json', () => {
  const f = T.parseExtraction('בטח! הנה מה שחילצתי:\n```json\n{"fields":{"freq":' +
    '{"value":12,"quote":"שתים עשרה","speaker":"לקוח"}}}\n```\nמקווה שעזרתי.');
  assert.strictEqual(f.freq.value, 12);
});
test('survives json with no fence at all', () => {
  const f = T.parseExtraction('{"fields":{"minutes":{"value":5,"quote":"חמש דקות","speaker":"לקוח"}}}');
  assert.strictEqual(f.minutes.value, 5);
});
test('accepts a bare object without the fields wrapper', () => {
  const f = T.parseExtraction('{"minutes":{"value":5,"quote":"ח","speaker":"לקוח"}}');
  assert.strictEqual(f.minutes.value, 5);
});
test('garbage returns null instead of throwing', () => {
  ['', null, undefined, 'סתם טקסט', '```json\n{broken\n```', '[1,2,3]', '"a string"']
    .forEach(v => assert.doesNotThrow(() => T.parseExtraction(v), String(v)));
  assert.strictEqual(T.parseExtraction('סתם טקסט'), null);
});

console.log('\nno citation, no candidate');
test('a value with no quote is dropped entirely', () => {
  const c = T.candidates({ freq: { value: 40, quote: '', speaker: 'לקוח' } }, '');
  assert.deepStrictEqual(c, [], 'an uncited number offered for confirmation gets confirmed');
});
test('a quote with no value is dropped too', () => {
  assert.deepStrictEqual(T.candidates({ freq: cite(null, 'בערך ארבעים', 'לקוח') }, ''), []);
  assert.deepStrictEqual(T.candidates({ freq: cite(0, 'אפס', 'לקוח') }, ''), []);
});
test('a quote the transcript does not contain is kept but marked unverified', () => {
  // a model that paraphrases has invented the evidence
  const src = 'לקוח: בערך ארבעים ביום';
  const real = T.candidates({ freq: cite(40, 'בערך ארבעים ביום', 'לקוח') }, src);
  const fake = T.candidates({ freq: cite(40, 'הלקוח אמר שיש כארבעים', 'לקוח') }, src);
  assert.strictEqual(real[0].verified, true);
  assert.strictEqual(fake[0].verified, false, 'the operator has to be told which to read themselves');
});
test('every candidate names the field it fills', () => {
  T.candidates(T.parseExtraction(EX.EXTRACTION), EX.TRANSCRIPT).forEach(c => {
    assert.ok(c.label, c.key + ' has no label');
    assert.ok(c.kind === 'list' || c.target, c.key + ' fills nothing');
  });
});
test('units become the value the select actually uses', () => {
  const c = T.candidates({ freqUnit: cite('יום', 'ביום', 'לקוח') }, '');
  assert.strictEqual(c[0].value, '365');
  assert.deepStrictEqual(T.candidates({ freqUnit: cite('רבעון', 'x', 'לקוח') }, []), [],
    'a unit the form cannot represent is not a candidate');
});
test('numbers arrive clean of currency and separators', () => {
  const c = T.candidates({ errCost: cite('1,800 ₪', 'אלף שמונה מאות שקל', 'לקוח') }, '');
  assert.strictEqual(c[0].value, 1800);
});
test('an empty list of systems is not a candidate', () => {
  assert.deepStrictEqual(T.candidates({ systems: cite([], 'x', 'לקוח') }, ''), []);
  assert.deepStrictEqual(T.candidates({ systems: cite(['', '  '], 'x', 'לקוח') }, ''), []);
});
test('a malformed payload does not throw', () => {
  [null, undefined, {}, { freq: 'not an object' }, { freq: null }].forEach(f =>
    assert.doesNotThrow(() => T.candidates(f, 'x'), JSON.stringify(f)));
});

console.log('\nprovenance, derived rather than asked');
test('a number the client volunteered reads as unprompted', () => {
  const src = 'לקוח: כל טעות כזאת עולה לנו בערך אלף שמונה מאות שקל';
  const c = T.candidates({ errCost: cite(1800, 'עולה לנו בערך אלף שמונה מאות שקל', 'לקוח') }, src);
  const p = T.provenance(c, src);
  assert.strictEqual(p.value, 'unprompted');
  assert.ok(p.why);
});
test('a number that followed the seller asking for it reads as prompted', () => {
  const src = 'מוכר: כמה הזמנות כאלה נכנסות בערך ביום?\nלקוח: בערך ארבעים ביום';
  const c = T.candidates({ freq: cite(40, 'בערך ארבעים ביום', 'לקוח') }, src);
  assert.strictEqual(T.provenance(c, src).value, 'prompted');
});
test('no client figure at all means the number is the operator\'s own', () => {
  const src = 'מוכר: נניח ארבעים ביום';
  const c = T.candidates({ freq: cite(40, 'נניח ארבעים ביום', 'מוכר') }, src);
  const p = T.provenance(c, src);
  assert.strictEqual(p.value, 'mine');
  assert.ok(/לא נאמר על ידי הלקוח/.test(p.why));
});
test('nothing extracted at all is not treated as unprompted', () => {
  assert.strictEqual(T.provenance([], '').value, 'mine',
    'silence must never be read as the client having volunteered a figure');
});
test('a transcript labelled with names reads unknown, not the operator\'s own', () => {
  /* What Zoom, Teams and Otter actually export: the speaker's name at the head
     of the turn, never their role. Before this, a client stating a figure out
     loud under her own name came back "no figure in the call was said by the
     client" — the opposite answer, at the same confidence, on the only kind of
     transcript anybody outside this repo has. */
  const t = 'דנה כהן: היום נכנסות בערך 40 הזמנות ביום.\nארז: וכמה זמן לוקח כל אחת?\nדנה כהן: איזה 8 דקות.';
  const c = T.heuristics(t);
  assert.ok(c.length, 'the fixture must yield figures or the reading means nothing');
  const p = T.provenance(c, t);
  assert.strictEqual(p.value, 'unknown');
  assert.ok(/מי אמר/.test(p.why), 'the reading has to ask, not report');
});
test('marking who spoke resolves it — the row buttons are the way out', () => {
  const t = 'דנה כהן: היום נכנסות בערך 40 הזמנות ביום.';
  const c = T.heuristics(t);
  c.forEach(x => { x.speaker = 'client'; });        // what whoPicker() writes
  assert.strictEqual(T.provenance(c, t).value, 'unprompted');
});
test('one unplaced figure is enough to block the claim', () => {
  /* mine is a claim about every number in the call, not about most of them. A
     single line nobody placed might be the client's, and refusing to conclude
     over it is the same rule the licence table holds one layer down. */
  const src = 'מוכר: נניח ארבעים ביום';
  const c = T.candidates({ freq: cite(40, 'נניח ארבעים ביום', 'מוכר') }, src);
  assert.strictEqual(T.provenance(c, src).value, 'mine', 'the seller-only case must not drift');
  c.push({ key: 'minutes', kind: 'number', value: 8, quote: 'איזה 8 דקות', speaker: 'unknown' });
  assert.strictEqual(T.provenance(c, src).value, 'unknown');
});
test('the worked example lands on prompted, which is the interesting case', () => {
  // the volume figure in it appears only after the seller asks for it
  const c = T.candidates(T.parseExtraction(EX.EXTRACTION), EX.TRANSCRIPT);
  assert.strictEqual(T.provenance(c, EX.TRANSCRIPT).value, 'prompted');
});

console.log('\nthe local fallback');
test('finds numbers next to a unit word, with the sentence around them', () => {
  const h = T.heuristics('לקוח: זה לוקח 8 דקות כל פעם.\nלקוח: כל טעות עולה 1,800 ₪.');
  const mins = h.find(x => x.key === 'minutes');
  const cost = h.find(x => x.key === 'errCost');
  assert.strictEqual(mins.value, 8);
  assert.strictEqual(cost.value, 1800);
  assert.ok(mins.quote.includes('8 דקות'), 'the quote must be the line it came from');
});
test('marks itself as a guess so it is never mistaken for an extraction', () => {
  T.heuristics('זה לוקח 8 דקות').forEach(h => assert.strictEqual(h.guessed, true));
});
/* An hourly rate and a per-incident cost, in that order, on a call that has
   both. The incident cue is "a number beside a currency word" and nothing
   more, so it used to take whichever came first and stop — which on this call
   is the rate, and the sentence that actually names what a mistake costs went
   unread. Neither number is wrong; the label on one of them was.

   The ladder cannot help here: at the value rung it licenses errCost and
   switches `anchor` off, so the one cue that would have recognised the rate
   correctly is not looking. The refusal has to sit on the cue. */
test('an hourly rate is not the cost of an incident, and the real one is still found', () => {
  const tx = 'לקוח: מי שעושה את זה עולה לי 90 שקל לשעה.\n' +
             'לקוח: כשיש טעות המשלוח חוזר וזה 500 שקל בכל פעם.';
  const cost = T.heuristics(tx).find(x => x.key === 'errCost');
  assert.ok(cost, 'the incident cue skipped the line it should have read');
  assert.strictEqual(cost.value, 500, 'read the rate as the cost of an incident');
  assert.ok(cost.quote.includes('טעות'), 'quoted a sentence that is not about a mistake');
});
test('a call that states only a rate fills nothing from the incident cue', () => {
  assert.ok(!T.heuristics('לקוח: אני משלם לה 90 שקל לשעה.').some(x => x.key === 'errCost'),
    'a rate with no incident anywhere in the call still became one');
});
/* The forms a review found after the first version of this shipped. It used
   ANCHOR_RE as the veto, which is the expression deciding whether a number may
   SET a price — deliberately narrow, and therefore blind to an English rate
   and to the Hebrew construct form. Both put 90 in the field that means "what
   one mistake costs", and both then stopped the cue looking, so the real
   figure later in the same call went unread. */
const RATE_FORMS = [
  ['English, per hour', 'Client: the person doing it costs me 90 ILS per hour.\n' +
                        'Client: when it breaks it is 500 shekels each time.'],
  ['English, a day',    'Client: it is 200 shekels a day.\n' +
                        'Client: each mistake costs 500 shekels.'],
  ['Hebrew, construct', 'לקוח: זה עולה לי 90 שקל לשעת עבודה.\nלקוח: כל טעות עולה 500 שקל.'],
  ['Hebrew, per month', 'לקוח: אני משלם על זה 90 שקל לחודש.\nלקוח: כל טעות עולה 500 שקל.']
];
test('a rate is refused in every form the extractor claims to read', () => {
  RATE_FORMS.forEach(([name, tx]) => {
    const cost = T.heuristics(tx).find(x => x.key === 'errCost');
    assert.ok(cost, name + ': the incident cue found nothing at all');
    assert.strictEqual(cost.value, 500, name + ': read the rate as the cost of an incident');
  });
});
test('the veto matches everything the anchor does, and more', () => {
  /* The property that lets these be two expressions instead of one. The anchor
     asks "may this set a price"; the veto asks "must the weak cue leave this
     alone". The second question must never have the narrower answer — a
     sentence tight enough to price from is certainly a rate. */
  const FORMS = ['300 שקל לפגישה', '300 ש"ח לשעה', '1,200 ₪ לחודש', '90 NIS לשעה',
                 '450 שקלים למפגש', '80 ILS ליום', '250 שק לשיחה', '600 ₪ לשבוע'];
  const anchors = FORMS.filter(f => T.ANCHOR_RE.test(f));
  assert.ok(anchors.length > 3, 'these fixtures stopped being anchor forms — this proves nothing now');
  anchors.forEach(f => assert.ok(T.RATE_RE.test(f),
    'the anchor reads "' + f + '" as a rate and the veto does not — that gap is ' +
    'exactly where an hourly rate becomes the cost of a mistake'));
});
test('an empty or wordless transcript yields nothing', () => {
  assert.deepStrictEqual(T.heuristics(''), []);
  assert.deepStrictEqual(T.heuristics('שיחה בלי שום מספר בכלל'), []);
});

/* The regression this section exists for. heuristics() used to stamp every
   row speaker:'unknown', which reads like a small omission and is not one:
   provenance() decides client-said versus operator-guessed on that exact
   field, so nothing extracted locally could ever be attributed to the client.
   Every such deal came back 'mine' — which routes pickMethod to market
   pricing, takes the ROI paragraph out of the document, and says nothing
   while doing it. The number was in the transcript, in the client's own line,
   and the tool priced as if the client had never spoken. */
test('a figure in the client\'s line is attributed to the client', () => {
  const h = T.heuristics('לקוח: זה לוקח 8 דקות כל פעם.');
  assert.strictEqual(h[0].speaker, 'client');
});
test('a figure the seller said is not attributed to the client', () => {
  const h = T.heuristics('מוכר: נניח 8 דקות לכל פעם.');
  assert.strictEqual(h[0].speaker, 'seller');
});
test('"אני" is the seller, the way discovery calls are actually written down', () => {
  assert.strictEqual(T.heuristics('אני: אז זה 8 דקות?')[0].speaker, 'seller');
});
test('a line with no speaker label stays unknown rather than guessing', () => {
  assert.strictEqual(T.heuristics('זה לוקח 8 דקות')[0].speaker, 'unknown');
});
test('the local path can reach a client-sourced provenance, not only mine', () => {
  const t = 'מוכר: כמה זמן זה לוקח?\nלקוח: בערך 8 דקות כל פעם.';
  const p = T.provenance(T.heuristics(t), t);
  assert.notStrictEqual(p.value, 'mine',
    'every locally extracted deal is priced as the operator\'s guess again');
  assert.strictEqual(p.value, 'prompted', 'the seller asked first, so it is prompted');
});
test('a figure the client volunteered locally reads as unprompted', () => {
  const t = 'לקוח: יש לנו בערך 40 הזמנות ביום ואנחנו טובעים.';
  assert.strictEqual(T.provenance(T.heuristics(t), t).value, 'unprompted');
});

test('a local candidate carries its sentence, its speaker and its confidence', () => {
  const t = 'לקוח: זה לוקח 8 דקות כל פעם.';
  const [c] = T.heuristics(t);
  assert.ok(c.quote && t.includes(c.quote), 'the quote is not the line it came from');
  assert.ok(['client', 'seller', 'unknown'].includes(c.speaker), 'speaker: ' + c.speaker);
  assert.ok(c.confidence > 0 && c.confidence < 1, 'confidence: ' + c.confidence);
  assert.strictEqual(c.guessed, true, 'a local match must stay marked as a guess');
});

console.log('\npaste, and the tool reads it here');
/* Both halves of one promise. The landing page says to paste the call and the
   tool reads it — which is untrue in two different ways if the module reaches
   the network, and untrue in a quieter way if reading it locally is the
   secondary button while the primary one sends you to another service and asks
   you to come back with its answer. The first is a privacy claim, the second is
   what the operator actually meets. */
test('reading a transcript needs no network at all', () => {
  const src = fs.readFileSync(path.join(__dirname, 'pc-transcript.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  [/\bfetch\s*\(/, /XMLHttpRequest/, /navigator\.sendBeacon/, /\bimport\s*\(/,
   /new\s+WebSocket/, /EventSource/].forEach(re =>
    assert.ok(!re.test(src),
      'the transcript module reaches the network: ' + (src.match(re) || [])[0]));
});
test('the button that reads it here is the primary one', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', 'post-call.html'), 'utf8');
  const acts = page.match(/<div class="tr-acts">[\s\S]*?<\/div>/)[0];
  const primary = acts.match(/class="act"\s+data-act="([a-z]+)"/);
  assert.ok(primary, 'the transcript box has no primary action any more');
  assert.strictEqual(primary[1], 'trlocal',
    'the main path through the transcript box leaves for another service first');
});

console.log('\nhow much a match can carry');
test('every local cue states a confidence, and none of them claims certainty', () => {
  T.heuristics('לקוח: 8 דקות, 40 הזמנות ביום, 1,800 ₪ לתקלה.').forEach(h => {
    assert.ok(typeof h.confidence === 'number', h.key + ' has no confidence');
    assert.ok(h.confidence > 0 && h.confidence < 1,
      h.key + ' claims ' + h.confidence + ' — a regex does not get to be certain');
  });
});
test('the cue that fires on any currency figure is the least trusted', () => {
  const h = T.heuristics('לקוח: 8 דקות כל פעם, ו-1,800 ₪ לכל טעות.');
  const cost = h.find(x => x.key === 'errCost');
  const mins = h.find(x => x.key === 'minutes');
  assert.ok(cost.confidence < mins.confidence,
    'a shekel figure matches the hourly rate in the same call just as well');
});
test('a quote the model invented ranks below every quote that checks out', () => {
  const src = 'לקוח: זה לוקח 8 דקות.';
  const real = T.candidates({ minutes: { value: 8, quote: 'זה לוקח 8 דקות', speaker: 'לקוח' } }, src);
  const made = T.candidates({ minutes: { value: 8, quote: 'זה לוקח שמונה דקות בערך', speaker: 'לקוח' } }, src);
  assert.strictEqual(real[0].verified, true);
  assert.strictEqual(made[0].verified, false);
  assert.ok(made[0].confidence < real[0].confidence,
    'the row the operator has to read for themselves must not sort above the one that checked out');
});

console.log('\nwhat confirmation produces');
test('confirmed rows become plain field values plus a systems list', () => {
  const c = T.candidates(T.parseExtraction(EX.EXTRACTION), EX.TRANSCRIPT);
  const s = T.toState(c);
  assert.strictEqual(s.fields.q_freq, '40');
  assert.strictEqual(s.fields.q_freq_unit, '365');
  assert.strictEqual(s.fields.q_minutes, '8');
  assert.strictEqual(s.fields.q_err_cost, '1800');
  assert.ok(s.systems.includes('וואטסאפ'));
});
test('rejecting a row keeps it out of the state', () => {
  const c = T.candidates(T.parseExtraction(EX.EXTRACTION), EX.TRANSCRIPT);
  const s = T.toState(c.filter(x => x.key !== 'freq'));
  assert.strictEqual(s.fields.q_freq, undefined, 'a rejected value must not arrive anyway');
});
test('nothing confirmed produces nothing', () => {
  assert.deepStrictEqual(T.toState([]), { fields: {}, systems: [] });
  assert.deepStrictEqual(T.toState(null), { fields: {}, systems: [] });
});

console.log('\nthe worked example itself');
test('the transcript contains the cases the tool is opinionated about', () => {
  const t = EX.TRANSCRIPT;
  assert.ok(/כמה הזמנות/.test(t), 'a figure given only on request');
  assert.ok(/אני מעריך שכל טעות/.test(t), 'a figure volunteered');
  assert.ok(/קנינו לפני שנה/.test(t), 'a previous failed attempt');
  assert.ok(/השותף שלי/.test(t), 'more than one decision maker');
  assert.ok(/וואטסאפ/.test(t), 'a WhatsApp step');
});
test('every quote in the example extraction really is in the transcript', () => {
  const c = T.candidates(T.parseExtraction(EX.EXTRACTION), EX.TRANSCRIPT);
  const bad = c.filter(x => !x.verified).map(x => x.key);
  assert.deepStrictEqual(bad, [], 'the shipped example must not cite text that is not there');
});
test('the example fills every field the form needs for a full document', () => {
  const s = T.toState(T.candidates(T.parseExtraction(EX.EXTRACTION), EX.TRANSCRIPT));
  ['q_process', 'q_freq', 'q_minutes', 'q_err_freq', 'q_err_cost', 'q_client']
    .forEach(f => assert.ok(s.fields[f], 'example is missing ' + f));
  assert.ok(s.systems.length >= 2);
});

test('the tools that record time are in the vocabulary, because minutes is priced from them', () => {
  /* The list held sales, ERP and automation tools and nothing that measures
     time — while the value method is built on `minutes`, and a time tracker is
     the one system that holds that answer already measured. Across twelve real
     calls the single genuinely in-scope system anybody named was Toggl, said
     in Hebrew, by a prospect explaining that everything she does is already
     logged and detailed. The product could not see it. */
  const seen = T.observe('לקוח: אני משתמש בתוגל אצלי הכל מתועד ומדוקדק.').systems.map(s => s.value);
  assert.ok(seen.indexOf('תוגל') !== -1, 'a time tracker named out loud is still invisible: ' + seen);
  assert.ok(T.observe('לקוח: אנחנו על Clockify.').systems.length >= 1, 'Latin spelling missed');
});

test('a transliteration that collides with ordinary Hebrew is a candidate, never a fact', () => {
  /* The first version of this test made the rule about length, and its own
     rule then failed on the one entry that works: "תוגל" is four letters.
     Length was the wrong variable. What matters is whether the string is a
     substring of ordinary speech, and that has to be checked per word rather
     than derived from a count.

     "ויקס" was in the list for exactly one measurement. It matched three times
     across the twelve real calls, two of them inside garbled speech mentioning
     no website builder, and one of those moved a whole call onto the market
     rung. Removed; the Latin spelling stays.

     "תוגל" is kept with its ambiguity written down rather than hidden: it is
     also a Hebrew verb, and this sentence proves the collision is real. It is
     kept because observe() proposes candidates with the sentence attached and
     never applies them — the cost of this one is a glance, and the benefit is
     the only in-scope system anybody named in twelve calls. */
  const verb = T.observe('לקוח: התוכנית תוגל בשנה הבאה.').systems.map(s => s.value);
  assert.ok(verb.indexOf('תוגל') !== -1,
    'the known collision stopped happening — if the matcher got smarter, say so here');

  /* What must hold regardless: a candidate carries the sentence it came from,
     so the operator can see in one line that this is a verb and not a tool. */
  const rows = T.observe('לקוח: התוכנית תוגל בשנה הבאה.').systems;
  assert.ok(rows[0].quote && rows[0].quote.indexOf('תוגל') !== -1,
    'a proposed system arrived without the sentence that produced it');
  assert.ok(rows[0].verified !== false || rows[0].source,
    'a proposed system arrived without a source');
});

/* The period the sentence named, not the one the form defaulted to.

   FREQ_RE has always required a period word — that is what makes a backlog
   ("שתי הזמנות שנפלו בין הכיסאות") a non-match. It then discarded it in a
   non-capturing group, so q_freq_unit kept the form's שבוע and every "ביום"
   call priced at 1/7 of what the client described. 365/52 = 7.02, measured
   end to end at ₪4,710 against ₪33,090.

   The reason it survived is the part worth pinning: there was no review row
   for the unit, so the operator confirmed "כמה פעמים: 40" while a decision
   they never saw had already been made for them. Both halves are asserted
   here — the value, and that it arrives as something a person can refuse. */
test('the frequency carries the period that was actually said', () => {
  const said = { 'ביום': '365', 'בשבוע': '52', 'בחודש': '12' };
  const seen = {};
  for (const word of Object.keys(said)) {
    /* Digits, because this file does not load pc-numerals — the spoken-number
       reader has its own suite. What is under test here is the period, and it
       is a literal either way. */
    const line = 'לקוח: נכנסות בערך 40 הזמנות ' + word + ' וכל אחת לוקחת 7 דקות.';
    const rows = T.heuristics(line, ['freq', 'freqUnit', 'minutes', 'errCost']);
    const unit = rows.find(r => r.key === 'freqUnit');

    assert.ok(unit, 'no unit row for "' + word + '" — the period was read and thrown away');
    assert.strictEqual(unit.value, said[word],
      '"' + word + '" reached the form as ' + unit.value + ' rather than ' + said[word]);
    assert.strictEqual(T.toState(rows).fields.q_freq_unit, said[word],
      '"' + word + '" did not reach q_freq_unit');

    /* Reviewable means: the sentence is under it, and what is shown is the
       word somebody said rather than the multiplier the engine wants. */
    assert.ok(unit.quote && unit.quote.indexOf(word) !== -1,
      'the unit row arrived without the sentence it came from');
    assert.strictEqual(unit.display, word.replace(/^ב/, ''),
      'the unit row would render as ' + unit.value + ', which is not a thing anybody said');

    seen[word] = unit.value;
  }
  assert.strictEqual(new Set(Object.values(seen)).size, 3,
    'two different periods produced the same annual figure — this is the 7x bug');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
