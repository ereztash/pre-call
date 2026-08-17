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

      const found = src.length
        ? src.replace(/\s+/g, ' ').includes(quote.replace(/\s+/g, ' ')) : false;
      const spoken = speakerOf(got.speaker);

      out.push({
        key: f.key, target: f.target, kind: f.kind, label: f.label,
        value, quote,
        speaker: spoken,
        /* Whether the quote is actually in the transcript. A model that
           paraphrases has invented the evidence, and evidence that cannot be
           checked is worse than none — the row is kept but marked, so the
           operator sees which ones to read for themselves. */
        verified: found,
        /* Same scale as the local cues, from the two things that can be
           checked without trusting the model: whether the sentence it cited is
           really in the transcript, and whether it could say who spoke it. A
           row whose quote is not in the source is the one the operator has to
           read, so it must not sort above a row that checked out. */
        confidence: found ? (spoken === 'unknown' ? 0.75 : 0.9) : 0.3
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
  /* confidence is not a probability and is not measured. It is how much the
     match can carry on its own, and the only thing it is allowed to do is
     order the review and warn: a cue that fires on any shekel figure is worth
     less than one that fires on the word "minutes", because an hourly rate,
     a salary and a price all look identical to it. Nothing downstream may
     price on it, and nothing may skip approval because of it. */
  const CUES = [
    { key: 'minutes', re: /(\d+)\s*(?:דקות|דק['׳]?|\bminutes?\b|\bmins?\b)/i, label: tr('דקות לכל פעם'),
      confidence: 0.85 },
    { key: 'errCost', re: /(\d[\d,]*)\s*(?:₪|שקל|שח|ש["״]ח|\bnis\b|\bshekels?\b|\bils\b)/i, label: tr('עלות לתקלה'),
      /* Weakest cue here by a distance. Every figure in a discovery call that
         carries a currency word matches it — the hourly rate this same
         transcript states, most of all. */
      confidence: 0.55 },
    { key: 'freq',    re: /(\d+)\s*(?:פעמים|הזמנות|לידים|פניות|בקשות|\btimes?\b(?:\s*(?:a|per)\s*(?:day|week|month))?|\borders?\b|\bleads?\b|\brequests?\b)/i, label: tr('כמה פעמים'),
      confidence: 0.85 }
  ];

  /* One vocabulary for who spoke, because there is one question downstream —
     provenance() asks whether a figure came from the client — and two ways in.
     The model path reads a field it was asked to fill; the local path reads
     the label the transcript already puts at the head of the line. Different
     inputs, and they have to produce the same three words or provenance
     silently answers "mine" for half of them. */
  /* Lines with the speaker each one belongs to.

     A turn is not a sentence. "לקוח: היום ההזמנות נכנסות בוואטסאפ. בערך 40
     הזמנות ביום." is one person speaking, and splitting it on the full stop —
     which is what the number scan needs, to keep quotes short — leaves the
     second half with no label in front of it. Reading the label off each
     fragment therefore lost the attribution for every figure that was not in
     the first sentence of its turn, which is most of them, and provenance came
     back 'mine' for a number the client had just said out loud.

     Same failure as the one heuristics() had before it read labels at all,
     arriving by a different road: a figure the client stated, priced as the
     operator's guess. So the label carries forward until another one replaces
     it, which is how the transcript reads to a person. */
  function withSpeakers(src) {
    let current = 'unknown';
    return String(src || '').split(/\n|(?<=[.!?])\s+/)
      .map(l => l.trim()).filter(Boolean)
      .map(line => {
        const label = (line.match(/^\s*([^:]{1,20}?)\s*:/) || [])[1];
        if (label !== undefined) current = speakerOf(label);
        return { line, speaker: current };
      });
  }

  function speakerOf(text) {
    const s = clean(text);
    if (/לקוח|client|customer/i.test(s)) return 'client';
    /* No \b around אני. In JavaScript a word boundary is defined on ASCII word
       characters, so it never fires between a Hebrew letter and the end of the
       string — /^אני\b/ matched nothing at all. Explicit edges instead, which
       still keeps it from matching inside a longer word. */
    if (/מוכר|יועץ|(^|\s)אני($|\s)|seller|\bme\b/i.test(s)) return 'seller';
    return 'unknown';
  }

  /* licence is the list of cue keys pc-ladder.js says this call can carry, and
     omitting it reads everything — the ladder narrows an existing behaviour
     rather than adding a gate every caller now has to satisfy.

     What it buys is not tidiness. On the first real transcript anybody ran
     through this tool, "300 שקל לפגישה" — the fee being agreed in the room —
     came back as errCost, the cost of an incident, because that cue is "a
     number beside a currency word" and nothing more. The call had no recurring
     process in it at all, so under a licence the incident cue is never looked
     for, and the misreading cannot happen rather than being caught after. */
  function heuristics(transcript, licence) {
    const src = String(transcript || '');
    if (!src.trim()) return [];
    const allowed = k => !licence || licence.indexOf(k) !== -1;
    const lines = withSpeakers(src);
    const seen = new Set(), out = [];
    CUES.filter(c => allowed(c.key)).forEach(cue => {
      for (const { line, speaker } of lines) {
        const m = line.match(cue.re);
        if (!m || seen.has(cue.key)) continue;
        const n = parseFloat(m[1].replace(/,/g, ''));
        if (!isFinite(n) || n <= 0) continue;
        seen.add(cue.key);
        const f = FIELDS.find(x => x.key === cue.key);
        /* The speaker label, when the transcript has one. Every figure used to
           come back 'unknown' here, which reads like a small gap and is not
           one: provenance() decides between client-said and operator-guessed
           by this exact field, so an unknown speaker made every locally
           extracted number the operator's own. That routes pickMethod to
           market pricing, drops the ROI paragraph out of the document, and
           does all of it without a message — the local path quietly priced
           every deal as though the client had said nothing. */
        out.push({ key: cue.key, target: f.target, kind: 'number', label: cue.label,
                   value: n, quote: line, speaker,
                   /* True because the quote is the line, taken whole. This
                      field asks whether the citation exists in the source, not
                      whether a human accepted the row — approval is the review
                      step, and it runs for this path exactly as it does for
                      the model's. There is no paraphrase here to check. */
                   verified: true,
                   confidence: cue.confidence,
                   guessed: true });
      }
    });
    return out;
  }

  /* Everything in a call that is not a number.

     heuristics() finds figures, which is what pricing needs and only part of
     what a proposal promises. Which systems connect, what the connection is
     supposed to produce, and whether the call raised something it never closed
     — those decide what the document commits to, and none of them look like a
     number. Without them a locally-read call can be priced and still cannot be
     assessed, which leaves the readiness engine with nothing to read.

     Same rule as everywhere else in this file: it proposes. A system name
     found in a sentence is a candidate with the sentence attached, not a fact,
     and the two signals are reasons to ask rather than answers. */
  const PLATFORMS = ['Priority', 'SAP', 'Salesforce', 'HubSpot', 'Pipedrive', 'Zapier',
                     'Make', 'n8n', 'Airtable', 'Notion', 'Slack', 'Jira', 'Stripe',
                     'Shopify', 'WooCommerce', 'Monday', 'Zoho', 'Dynamics', 'Odoo'];

  function observe(transcript) {
    const src = String(transcript || '');
    const walked = withSpeakers(src);
    const lines = walked.map(x => x.line);
    const sentenceWith = re => (walked.find(x => re.test(x.line)) || {}).line || null;
    const spokenBy = re => (walked.find(x => re.test(x.line)) || {}).speaker || 'unknown';

    /* The catalogue is a picker, so a couple of its entries are UI options
       rather than products. "אחר" means "other", and as a substring it matches
       inside "אחר כך" — a system nobody mentioned, which then holds up a
       commitment nobody owes. Those are excluded by name.

       Length is not the test, though: the first attempt dropped everything
       under four characters, which also threw away "אתר" — a real entry, and
       the one the second scenario turns on. So entries are split on the slash
       the picker uses for alternatives, and the match has to end at something
       that is not a letter. A Hebrew preposition binds to the front of a word
       ("באתר"), so only the tail can be checked; that still rules out matching
       one word inside a longer one. */
    const GENERIC = /^(אחר|other|אחרת)$/i;
    const known = ((typeof PC !== 'undefined' && PC.catalog && PC.catalog.SYSTEMS) || [])
      .flatMap(n => n.split(/\s*\/\s*/).map(part => ({ name: n, look: part.trim() })))
      .filter(x => x.look.length >= 2 && !GENERIC.test(x.look));
    const names = known.concat(PLATFORMS.map(p => ({ name: p, look: p })));
    const systems = [];
    names.forEach(({ name, look }) => {
      const re = new RegExp(look.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
                            '(?![\\u0590-\\u05FFa-zA-Z])', 'i');
      const quote = sentenceWith(re);
      if (quote && !systems.some(s => s.value === name))
        systems.push({ value: name, quote, speaker: spokenBy(re),
                       source: 'transcript-local', confidence: 0.8, verified: true });
    });

    /* A goal only counts when somebody said it was the goal. Inferring one
       from two system names is the tool deciding what the work is, which is a
       commitment it has no evidence for. */
    /* A question is not a statement of the goal. "What needs to happen?" is
       the seller asking, and matching it took the seller's question as the
       client's answer — which then travelled as the thing the project
       delivers. Interrogatives are excluded before anything else is
       considered. */
    const goalLine = lines.filter(l => !/\?\s*$/.test(l))
      .find(l => /המטרה היא|מבחינתי המטרה|רוצים ש|\bthe goal is\b/i.test(l)) || null;
    const goal = goalLine ? {
      value: goalLine.replace(/^\s*[^:]{1,20}?\s*:\s*/, '')
                     .replace(/^.*?(?:המטרה היא|מבחינתי המטרה היא|רוצים ש)\s*/i, '').trim() || goalLine,
      quote: goalLine, speaker: (walked.find(x => x.line === goalLine) || {}).speaker || 'unknown',
      source: 'transcript-local', confidence: 0.75, verified: true
    } : null;

    /* Both signals are the same shape: the call raised a subject and left it
       open. Either half alone means nothing — an exception that was settled
       needs no question, and "security" in a sentence that closed it is not a
       gap. */
    const OPEN = /לא סגרנו|עוד לא|לא ברור|לא דיברנו|טרם|לא הוגדר|יכול להיות|צריך לבדוק/i;
    const edge = sentenceWith(/טקסט חופשי|צילום מסך|תמונה|free.?text|screenshot/i);
    const risk = sentenceWith(/אבטחה|security|sso|sla|רמת שירות|טיפול בכשל|אחריות.*כשל/i);

    /* The systems arrive as one candidate row of the same shape everything
       else uses, so the review step, the reject toggle and toState() need to
       know nothing new about where they came from. A caller that had to
       assemble this itself would be the second place in the codebase that
       knows what a systems row looks like. */
    const systemsRow = systems.length ? {
      key: 'systems', target: null, kind: 'list',
      label: (FIELDS.find(f => f.key === 'systems') || {}).label,
      value: systems.map(s => s.value),
      quote: systems[0].quote, speaker: systems[0].speaker,
      verified: true, confidence: 0.8, guessed: true
    } : null;

    return {
      systems, systemsRow, goal,
      signals: {
        freeText: !!edge,
        enterpriseOpen: !!risk && OPEN.test(src)
      },
      quotes: {
        'exception-owner': edge,
        'enterprise-risk': risk
      }
    };
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
  /* withSpeakers is exported because pc-ladder.js needs the same split this
     file already does: which sentences are the client's. Two answers to that
     question in one product would drift apart, and the one that drifted would
     be the one deciding whether a rung rests on the operator's own words. */
  root.PC.transcript = { FIELDS, UNIT_VALUES, buildPrompt, parseExtraction,
                         candidates, provenance, heuristics, observe, toState,
                         withSpeakers };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.PC.transcript;
})(typeof window !== 'undefined' ? window : globalThis);
