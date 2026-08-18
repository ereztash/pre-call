/* ============================================================
   Numbers as they are spoken, not as they are typed.
   Pure: no DOM, no storage, no network.

   Every quantitative cue in this product is written around \d+. That is a
   reasonable thing to assume about a form and a wrong thing to assume about a
   transcript: speech-to-text writes what it hears, and a person saying "forty
   orders a day" gets back "ארבעים הזמנות ביום". Measured across 200 generated
   calls, the value rung — the method the whole product is built around — was
   reached 30 times out of 104 when the numbers came back as digits and
   0 times out of 96 when they came back as words. Not rarely. Never.

   The repository's own demo transcript is written in words, which is how the
   gap survived this long: the one call anybody ran locally produced 1 field
   out of 13 and that looked like a thin transcript rather than a deaf reader.

   The fix is deliberately not a second set of cues. Rewriting the text once,
   before anything reads it, means freq, minutes, errCost and the client's
   reference rate all keep the single regular expression each already has, and
   a cue added later gets this for free without knowing it exists.
   ============================================================ */
(function (root) {
  'use strict';

  /* Standalone values. Both spellings of everything, because transcription is
     inconsistent about מ/ש vowels and about the masculine/feminine pair that
     Hebrew forces on every count. */
  const ONES = {
    'אפס': 0,
    'אחד': 1, 'אחת': 1,
    'שניים': 2, 'שתיים': 2, 'שנים': 2, 'שתים': 2, 'שני': 2, 'שתי': 2,
    'שלוש': 3, 'שלושה': 3, 'שלש': 3, 'שלשה': 3,
    'ארבע': 4, 'ארבעה': 4,
    'חמש': 5, 'חמישה': 5, 'חמשה': 5,
    'שש': 6, 'שישה': 6, 'ששה': 6,
    'שבע': 7, 'שבעה': 7,
    'שמונה': 8,
    'תשע': 9, 'תשעה': 9,
    'עשר': 10, 'עשרה': 10
  };
  const TENS = {
    'עשרים': 20, 'שלושים': 30, 'שלשים': 30, 'ארבעים': 40, 'חמישים': 50, 'חמשים': 50,
    'שישים': 60, 'ששים': 60, 'שבעים': 70, 'שמונים': 80, 'תשעים': 90
  };
  /* Whole numbers that are one word rather than a count plus a multiplier. */
  /* `אלפים` is deliberately not here. It is a multiplier and lives in MULT,
     where a count is required in front of it — as a whole number it would
     read "אלפים של הזמנות" as one thousand orders. `מיליון` is the opposite
     case and belongs here: on its own it names a specific quantity, the way
     `אלף` does, while `מיליוני` does not and is in no table at all.

     Both were absent until an enumeration of every NUM-tagged token in the
     Hebrew UD treebank found them the single largest gap — 107 occurrences,
     more than twice any other missing form. */
  const WHOLE = { 'מאה': 100, 'מאתיים': 200, 'מאתים': 200, 'אלף': 1000, 'אלפיים': 2000,
                  'מיליון': 1000000, 'מליון': 1000000, 'מיליארד': 1000000000 };
  /* Words that multiply whatever count came just before them. */
  const MULT = { 'מאות': 100, 'אלפים': 1000, 'אלפי': 1000 };
  /* The construct forms Hebrew uses before אלפים — "חמשת אלפים", not
     "חמש אלפים". Without these, five thousand reads as a bare five. */
  const CONSTRUCT = {
    'שלושת': 3, 'שלשת': 3, 'ארבעת': 4, 'חמשת': 5, 'ששת': 6, 'שישת': 6,
    'שבעת': 7, 'שמונת': 8, 'תשעת': 9, 'עשרת': 10
  };
  /* Teens are a unit followed by עשרה — "שתים עשרה" is 12, while עשרים alone
     is 20. Only the second word tells them apart, so the pair is read together
     rather than each word on its own. */
  const TEEN_TAIL = { 'עשרה': true, 'עשר': true };

  const EN = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
    fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
    nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
    seventy: 70, eighty: 80, ninety: 90
  };
  const EN_MULT = { hundred: 100, thousand: 1000 };

  const isNum = b => ONES[b] !== undefined || TENS[b] !== undefined ||
                     WHOLE[b] !== undefined || MULT[b] !== undefined ||
                     CONSTRUCT[b] !== undefined;

  /* A word may arrive with a one-letter particle fused to its front: "ועשרים"
     joins the parts of a number, and "כחמישים הזמנות ביום" is how a quantity
     is usually given out loud. Only ו came off before, so every approximation
     read as nothing.

     Narrow on purpose in the other direction — the particle comes off only
     when the whole word is not itself a number and the remainder exactly is,
     which keeps מאה and מאות from being read as אה and אות. ש and ה are left
     out: שש and ששים start with ש, and ה fronts the ordinals. */
  const PARTICLE = /^[ובכלמ]/;
  const bare = w => {
    if (isNum(w)) return w;
    if (w.length > 3 && PARTICLE.test(w) && isNum(w.slice(1))) return w.slice(1);
    return w;
  };

  const known = w => isNum(bare(w)) ||
           EN[w.toLowerCase()] !== undefined || EN_MULT[w.toLowerCase()] !== undefined;

  /* Accumulate a run of number-words into one value. `run` is the whole
     multiplier phrase, `part` the piece waiting for a multiplier that may or
     may not arrive: in "אלף ושמונה מאות" the eight belongs to the hundreds,
     and in "אלף ושמונה" it does not. */
  function value(words) {
    let total = 0, part = 0, seen = false;
    for (let i = 0; i < words.length; i++) {
      const w = bare(words[i]), lower = words[i].toLowerCase();
      const next = bare(words[i + 1] || '');

      /* "חמשת אלפים" — the construct form only means five when the multiplier
         it is bound to actually follows it. */
      if (CONSTRUCT[w] !== undefined && MULT[next] !== undefined) {
        part += CONSTRUCT[w]; seen = true; continue;
      }
      /* "שתים עשרה" is twelve; "עשרים" on its own is twenty. Only the second
         word separates them, so the pair is read together. */
      if (ONES[w] !== undefined && ONES[w] < 10 && TEEN_TAIL[next]) {
        part += 10 + ONES[w]; seen = true; i++; continue;
      }
      const mult = MULT[w] !== undefined ? MULT[w] : EN_MULT[lower];
      if (mult !== undefined) {
        /* A multiplier with nothing counting it is not a quantity. "מאות
           שקלים לשעה" is a client declining to name a figure, and `part || 1`
           read it as 100 — inventing a number, then handing it the sentence
           as a quote that appeared to source it. numerals.test.js holds the
           case and the counted forms that still have to work. */
        if (!part) return null;
        if (mult === 1000) { total += part * 1000; part = 0; }
        else part = part * mult;
        seen = true; continue;
      }
      if (WHOLE[w] !== undefined) {
        if (WHOLE[w] >= 1000) { total += (part || 1) * WHOLE[w]; part = 0; }
        else part += WHOLE[w];
        seen = true; continue;
      }
      if (TENS[w] !== undefined) { part += TENS[w]; seen = true; continue; }
      if (ONES[w] !== undefined) { part += ONES[w]; seen = true; continue; }
      if (EN[lower] !== undefined) { part += EN[lower]; seen = true; continue; }
      return null;
    }
    return seen ? total + part : null;
  }

  /* Rewrite every run of number-words in the text as digits, and leave
     everything else exactly as it was. Runs of one word are included: "שמונה
     דקות" is as much a number as "אלף ושמונה מאות שקל".

     A run is not converted when the value comes back 0 from a single "אפס" —
     that word is far more often part of a phrase than a quantity, and a zero
     in a cue is discarded downstream anyway. */
  function digitize(text) {
    const src = String(text || '');
    if (!src) return src;
    /* Even indices are words, odd are the separators between them, so
       punctuation and line breaks come back untouched. */
    const parts = src.split(/([^֐-׿A-Za-z]+)/);
    let out = '', i = 0;
    while (i < parts.length) {
      if (i % 2 === 0 && parts[i] && known(parts[i])) {
        /* A run is number-words joined by single spaces. Anything else — a
           comma, a line break, two spaces — ends it, because "שמונה, תשע"
           is two numbers and not eighty-nine. */
        const words = [parts[i]];
        let j = i + 1;
        while (j + 1 < parts.length && parts[j] === ' ' && known(parts[j + 1])) {
          words.push(parts[j + 1]); j += 2;
        }
        const v = value(words);
        /* A lone zero is far more often a turn of phrase than a quantity, and
           a zero is discarded by every cue downstream anyway. */
        if (v === null || v === 0) { out += parts[i]; i++; }
        else { out += String(v); i = j; }
      } else { out += parts[i]; i++; }
    }
    return out;
  }

  root.PC = root.PC || {};
  root.PC.numerals = { digitize, value, ONES, TENS, WHOLE, MULT };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.PC.numerals;
})(typeof window !== 'undefined' ? window : globalThis);
