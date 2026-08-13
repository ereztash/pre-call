/* ============================================================
   POST-CALL · the call itself as the input.

   The obvious framing is "transcript in, form filled, time saved". That is
   the wrong architecture for this product, and getting it wrong would cost
   the one thing the tool actually has.

   Every claim POST-CALL makes rests on the price being derived from a number
   the CLIENT said. That is why the ROI paragraph leaves the document when
   the figure was the operator's own invention, why the cost-of-waiting line
   disappears on the same rule, and why the tool warns when one guessed
   number carries most of the value. All of it currently rests on the
   operator ticking a box about where the number came from — a self-report,
   and self-reports about your own diligence are the least reliable kind.

   A transcript changes the category. It does not merely save typing; it
   turns provenance from a claim into evidence. Every number can arrive with
   the sentence that produced it and the name of whoever said it. So this
   module is built to preserve citations, not to fill fields fast:

     - nothing is applied automatically. Extraction proposes, the operator
       disposes, and every candidate is shown with its quote
     - a value with no quote is not a value. It is a guess wearing a number,
       which is precisely what the rest of the tool exists to prevent
     - provenance is DERIVED from who spoke and what came before, never asked

   On where the language model lives: nowhere near here. The tool writes a
   prompt, the operator runs it wherever they already have one, and pastes
   the answer back — the same pattern PRE-CALL already uses for the business
   profile. No backend, no key, no cost, and the promise that nothing leaves
   the browser through us survives intact, because the operator chooses where
   the transcript goes.

   Pure: strings in, structures out. No DOM, no network. Tested in Node.
   ============================================================ */
(function (root) {
  'use strict';

  var tr = (typeof PC !== 'undefined' && PC.i18n) ? PC.i18n.tr
    : function (s, p) { if (p) for (var k in p) s = s.split('{' + k + '}').join(p[k]); return s; };

  /* The contract the prompt asks for. Kept small on purpose: every field
     here is one the operator would otherwise type, and nothing here is a
     judgement the model should be making — no prices, no scope decisions,
     no recommendations. Extraction only. */
  const FIELDS = [
    { key: 'process',  target: 'q_process',   kind: 'text',   label: tr('התהליך הידני') },
    { key: 'freq',     target: 'q_freq',      kind: 'number', label: tr('כמה פעמים') },
    { key: 'freqUnit', target: 'q_freq_unit', kind: 'unit',   label: tr('לכל') },
    { key: 'minutes',  target: 'q_minutes',   kind: 'number', label: tr('דקות לכל פעם') },
    { key: 'systems',  target: null,          kind: 'list',   label: tr('תוכנות') },
    { key: 'errFreq',  target: 'q_err_freq',  kind: 'number', label: tr('תקלות בחודש') },
    { key: 'errCost',  target: 'q_err_cost',  kind: 'number', label: tr('עלות לתקלה') },
    { key: 'client',   target: 'q_client',    kind: 'text',   label: tr('שם הלקוח') },
    { key: 'decider',  target: 'q_decider',   kind: 'text',   label: tr('מי מאשר') },
    { key: 'trigger',  target: 'q_trigger',   kind: 'text',   label: tr('מה קרה לאחרונה') },
    { key: 'prev',     target: 'q_prev',      kind: 'text',   label: tr('מה ניסו קודם') },
    { key: 'deadline', target: 'q_deadline',  kind: 'text',   label: tr('יעד בזמן') },
    { key: 'success',  target: 'q_success',   kind: 'text',   label: tr('איך נדע שהצליח') }
  ];

  /* Literal words the extraction prompt asks the model to answer freqUnit
     with, in whichever language the prompt itself shipped in — and the
     literal word the local heuristic matches back out of a pasted answer.
     These are match keys, not prose: translating them through tr() would
     make the lookup track the CURRENT UI language instead of whatever the
     model actually wrote, which breaks the very case of a Hebrew-UI
     operator pasting back an answer to an English prompt they ran
     elsewhere. Both language's words are kept, always, side by side. */
  const UNIT_VALUES = { 'יום': '365', 'שבוע': '52', 'חודש': '12',
                        'day': '365', 'week': '52', 'month': '12' };

  function buildPrompt(transcript) {
    const quoteWord = tr('המשפט המדויק מהתמלול');
    const clientWord = tr('לקוח');
    const sellerWord = tr('מוכר');
    const fieldsBlock = FIELDS.map(f => `    "${f.key}": { "value": ${
        f.kind === 'list' ? '["..."]' : f.kind === 'number' ? '0' : '"..."'
      }, "quote": "${quoteWord}", "speaker": "${clientWord}" | "${sellerWord}" }`)
      .join(',\n');

    /* The header and the rules are each one tr() call, translated whole —
       an LLM prompt reads as an instruction to a reader, not as a bag of
       fragments, and splicing a translated clause into the middle of one
       would produce exactly the stilted, glued-together English a
       professional prompt cannot afford. The one truly dynamic piece,
       the transcript itself, is never translated — it is the operator's
       own paste, in whatever language they have it — so it travels as a
       {transcript} parameter rather than sitting inside the literal.

       The ```json fence sits OUTSIDE both tr() calls, on its own, rather
       than escaped inside the template literal: tools/i18n-extract.js
       matches a tr(`...`) literal up to its first backtick, escaped or
       not, so an escaped ``` here silently truncated the whole header at
       "בתוך בלוק" and lost everything after it. Splitting the sentence
       around the fence — itself unmarked-up structure, not prose — keeps
       the literal backtick-free and the extraction honest. */
    const header = tr(`להלן תמלול של שיחת מכירה בין נותן שירות אוטומציה ללקוח פוטנציאלי.

המשימה שלך היא חילוץ בלבד. אל תעריך, אל תשלים ואל תנחש — אם משהו לא נאמר, החזר null.
לכל ערך שאתה מחלץ, החזר גם את הציטוט המדויק שממנו לקחת אותו ומי אמר אותו.

החזר JSON יחיד, בתוך בלוק`) + ' ```json' + tr(`, במבנה הבא:

{
  "fields": {`);

    const footer = tr(`  }
}

כללים:
1. "value" הוא null אם זה לא נאמר בשיחה. אל תמציא.
2. "quote" חייב להיות טקסט שמופיע בתמלול מילה במילה. בלי ציטוט, החזר null גם ל-value.
3. "speaker" הוא מי אמר את הציטוט: "{clientWord}" או "{sellerWord}".
4. freqUnit הוא אחד מ: "יום", "שבוע", "חודש".
5. מספרים בספרות בלבד, בלי פסיקים ובלי סימן מטבע.
6. systems הוא רשימת שמות תוכנות שהוזכרו, כמו וואטסאפ, אקסל, CRM.

התמלול:
---
{transcript}
---`, { clientWord: clientWord, sellerWord: sellerWord, transcript: (transcript || '').trim() });

    return header + '\n' + fieldsBlock + '\n' + footer;
  }

  /* Models wrap JSON in prose, in fences, or in both. Find the object rather
     than demanding a clean answer, and fail to null rather than throwing —
     a paste that cannot be read must not take the page down. */
  function parseExtraction(text) {
    const raw = String(text || '');
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const body = fenced ? fenced[1] : raw;
    const start = body.indexOf('{');
    if (start === -1) return null;
    // walk to the matching brace so trailing prose does not break the parse
    let depth = 0, end = -1;
    for (let i = start; i < body.length; i++) {
      if (body[i] === '{') depth++;
      else if (body[i] === '}') { depth--; if (!depth) { end = i; break; } }
    }
    if (end === -1) return null;
    try {
      const o = JSON.parse(body.slice(start, end + 1));
      return o && typeof o === 'object' ? (o.fields && typeof o.fields === 'object' ? o.fields : o) : null;
    } catch (e) { return null; }
  }

  const clean = v => String(v === null || v === undefined ? '' : v).trim();

  /* One row per field the extraction had something to say about. A value
     without a quote is dropped here rather than shown greyed out: offering
     an uncited number as something to confirm is how it ends up confirmed. */
  function candidates(fields, transcript) {
    const src = String(transcript || '');
    const out = [];
    FIELDS.forEach(f => {
      const got = fields && fields[f.key];
      if (!got || typeof got !== 'object') return;
      let value = got.value;
      if (value === null || value === undefined || value === '') return;
      if (f.kind === 'list') {
        if (!Array.isArray(value) || !value.length) return;
        value = value.map(clean).filter(Boolean);
        if (!value.length) return;
      } else if (f.kind === 'number') {
        const n = parseFloat(String(value).replace(/[^\d.]/g, ''));
        if (!isFinite(n) || n <= 0) return;
        value = n;
      } else if (f.kind === 'unit') {
        value = UNIT_VALUES[clean(value)] || UNIT_VALUES[clean(value).toLowerCase()] || null;
        if (!value) return;
      } else {
        value = clean(value);
        if (!value) return;
      }

      const quote = clean(got.quote);
      if (!quote) return;   // no citation, no candidate

      out.push({
        key: f.key, target: f.target, kind: f.kind, label: f.label,
        value, quote,
        speaker: /לקוח|client/i.test(clean(got.speaker)) ? 'client'
               : /מוכר|seller/i.test(clean(got.speaker)) ? 'seller' : 'unknown',
        /* Whether the quote is actually in the transcript. A model that
           paraphrases has invented the evidence, and evidence that cannot be
           checked is worse than none — the row is kept but marked, so the
           operator sees which ones to read for themselves. */
        verified: src.length ? src.replace(/\s+/g, ' ').includes(quote.replace(/\s+/g, ' ')) : false
      });
    });
    return out;
  }

  /* The reason this module is worth building.

     unprompted — the client produced the figure without being steered there
     prompted   — it followed a question from the seller that asked for it
     mine       — no client quote exists, so the number is the operator's

     In documented comparable engagements clients produced digits only after
     the seller injected the quantification move, which means a number that
     appears on request may be measuring the question rather than the
     business. The tool already says so; until now it had to take the
     operator's word for which case this was. */
  const ASKED = /כמה|בערך|מספר|כמות|תוך כמה|מה הנפח|באיזה תדירות|how many|how much|about how|roughly|approximately|what volume|how often/i;

  function provenance(cands, transcript) {
    const numeric = cands.filter(c => c.kind === 'number' && c.key !== 'errFreq');
    const fromClient = numeric.filter(c => c.speaker === 'client');
    if (!fromClient.length) return { value: 'mine', why: tr('אף מספר בשיחה לא נאמר על ידי הלקוח') };

    const src = String(transcript || '').replace(/\s+/g, ' ');
    const steered = fromClient.some(c => {
      const at = src.indexOf(c.quote.replace(/\s+/g, ' '));
      if (at === -1) return false;
      // the window before the client's line is where the seller's question sits
      return ASKED.test(src.slice(Math.max(0, at - 260), at));
    });

    return steered
      ? { value: 'prompted', why: tr('המספר נאמר אחרי שאלה שכיוונה אליו') }
      : { value: 'unprompted', why: tr('הלקוח נקב במספר מעצמו') };
  }

  /* A last resort for a transcript with no model available: pull numbers
     that sit next to a unit word and keep the sentence around them. Weaker
     than an extraction and honest about it — every row still carries its
     quote, and the operator confirms exactly as they would otherwise.

     Each pattern matches its Hebrew wording and an English equivalent
     side by side (case-insensitive, so "Minutes" and "minutes" both
     land), so a transcript pasted in either language still yields
     candidates. */
  const CUES = [
    { key: 'minutes', re: /(\d+)\s*(?:דקות|דק['׳]?|\bminutes?\b|\bmins?\b)/i, label: tr('דקות לכל פעם') },
    { key: 'errCost', re: /(\d[\d,]*)\s*(?:₪|שקל|שח|ש["״]ח|\bnis\b|\bshekels?\b|\bils\b)/i, label: tr('עלות לתקלה') },
    { key: 'freq',    re: /(\d+)\s*(?:פעמים|הזמנות|לידים|פניות|בקשות|\btimes?\b(?:\s*(?:a|per)\s*(?:day|week|month))?|\borders?\b|\bleads?\b|\brequests?\b)/i, label: tr('כמה פעמים') }
  ];

  function heuristics(transcript) {
    const src = String(transcript || '');
    if (!src.trim()) return [];
    const lines = src.split(/\n|(?<=[.!?])\s+/).map(l => l.trim()).filter(Boolean);
    const seen = new Set(), out = [];
    CUES.forEach(cue => {
      for (const line of lines) {
        const m = line.match(cue.re);
        if (!m || seen.has(cue.key)) continue;
        const n = parseFloat(m[1].replace(/,/g, ''));
        if (!isFinite(n) || n <= 0) continue;
        seen.add(cue.key);
        const f = FIELDS.find(x => x.key === cue.key);
        out.push({ key: cue.key, target: f.target, kind: 'number', label: cue.label,
                   value: n, quote: line, speaker: 'unknown', verified: true,
                   guessed: true });
      }
    });
    return out;
  }

  /* What the confirmed rows become. Returns plain field-id → value plus the
     systems list, so the caller applies it through the same path a template
     uses and nothing new has to know about transcripts. */
  function toState(confirmed) {
    const fields = {}, systems = [];
    (confirmed || []).forEach(c => {
      if (c.kind === 'list') { systems.push(...c.value); return; }
      if (!c.target) return;
      fields[c.target] = String(c.value);
    });
    return { fields, systems };
  }

  root.PC = root.PC || {};
  root.PC.transcript = { FIELDS, UNIT_VALUES, buildPrompt, parseExtraction,
                         candidates, provenance, heuristics, toState };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.PC.transcript;
})(typeof window !== 'undefined' ? window : globalThis);
