/* ============================================================
   PRE-CALL / POST-CALL · attention model
   Pure: no DOM, no reads of anything outside its argument. Give it a funnel
   — an ordered list of steps, each with a word count, a field count and a
   choice count — and it returns what that funnel costs in attention, how
   many people are still there at each step, and where the median one leaves.

   The point of this file is not to predict a number. It is to price a word.
   Copy gets cut on taste ("this feels long"), and taste has no unit, so the
   argument never converges. A word costs milliseconds, milliseconds cost
   survival, and survival is countable. That makes "is this paragraph worth
   it" a question with an answer instead of a matter of who is more stubborn.

   Every constant below is either measured by someone else and cited, or
   assumed and marked as assumed. The line between those two is the whole
   value of the file — see CONSTANTS.
   ============================================================ */
(function (root) {
  'use strict';

  /* --- constants. Each one carries its provenance, because a model whose
     inputs are all "reasonable-sounding" is a model that returns whatever
     its author already believed. `src` is where the number comes from;
     `assumed: true` means nobody measured this and it is a judgement call
     that the sensitivity pass has to earn. --- */
  const CONSTANTS = {
    wpm: {
      value: 220, band: [180, 260], assumed: false,
      src: 'IReST (Trauzettel-Klosinski & Dietz 2012) normative 236±29 wpm read ' +
           'aloud; Canadian cohort 211-218. Silent reading runs faster than aloud, ' +
           'screen reading slower. 220 is the midpoint of those two corrections. ' +
           'Hebrew is roughly the same length as English for the same content, so ' +
           'no language correction is applied — see docs. Band is the honest range.'
    },
    scan: {
      value: 0.28, band: [0.20, 0.45], assumed: false,
      src: 'Nielsen 2008 on Weinreich et al. (59,573 page views): users have time ' +
           'to read at most 28% of words on an average visit, 20% more likely. ' +
           '0.28 is deliberately the pessimistic end FOR THE COPY — it charges the ' +
           'funnel more reading time, so it under-states how bad long copy is only ' +
           'if the true figure is higher, not lower.'
    },
    glanceMs: {
      value: 300, band: [150, 600], assumed: true,
      src: 'ASSUMED. The floor cost of a text block you skip: you still have to ' +
           'land on it, classify it as skippable and leave. Skipping is not free ' +
           'and the scan factor alone would price a 40-word paragraph you ignore ' +
           'at zero. No clean citation for this; treated as assumed and swept.'
    },
    hickA: {
      value: 200, band: [150, 300], assumed: false,
      src: 'Hick-Hyman intercept. RT = a + b·log2(N+1), a ≈ 200ms.'
    },
    hickB: {
      value: 150, band: [100, 200], assumed: false,
      src: 'Hick-Hyman slope, ≈150 ms per bit. Applies to picking one of N ' +
           'visible options, not to typing.'
    },
    fieldMs: {
      value: 4500, band: [2500, 9000], assumed: true,
      src: 'ASSUMED. Median time to fill one short field including deciding what ' +
           'to put in it. In this product several fields require recalling what a ' +
           'client said on a call, which is slower than typing an email address. ' +
           'Wide band on purpose.'
    },
    fieldHazard: {
      value: 0.041, band: [0.02, 0.07], assumed: false,
      src: 'B2B lead-form studies: each additional field costs ≈4.1% of conversion. ' +
           'Mobile studies past 8 fields report 3-7%. Applied per field as an ' +
           'independent survival term, on top of the time cost — the two are ' +
           'different mechanisms (a field is a demand, not only a delay).'
    },
    weibullShape: {
      value: 0.5, band: [0.35, 0.7], assumed: false,
      src: 'Liu, White & Dumais 2010: dwell time is Weibull with negative aging ' +
           '(shape < 1) on 99% of pages — leaving is likeliest early and the curve ' +
           'flattens. Shape 0.5 reproduces the NN/g description: steep for the ' +
           'first 10-20s, relatively flat after ~30s.'
    },
    weibullScale: {
      value: 240, band: [120, 600], assumed: true, free: true,
      src: 'ASSUMED, in seconds — and it is the model\'s ONE free parameter, so it ' +
           'is not set by taste. It is solved for by calibrate() against an ' +
           'external benchmark: Baymard/HubSpot 2026 put average web-form ' +
           'abandonment at 67.9%, i.e. ~32% completion. Scale is whatever ' +
           'reproduces that for a funnel of this size. The first version of this ' +
           'constant was 55s, hand-picked, with a comment claiming it "lets a ' +
           'motivated user survive a multi-minute form" — it returned 11% ' +
           'completion, so the comment was describing an intention rather than ' +
           'the number underneath it. Pinning it to a benchmark removed the ' +
           'opportunity to be wrong that way.'
    },
    exitHazard: {
      value: 0.35, band: [0.15, 0.60], assumed: true,
      src: 'ASSUMED. Cost of a step that sends the user OUT of the product to do ' +
           'work in another tool and come back — PRE-CALL step 1 hands over a ' +
           'prompt to paste into Claude or ChatGPT. No dwell model covers this: ' +
           'the tab is gone, and returning is a fresh decision competing with ' +
           'everything else that happened in the other tool. Wide band because ' +
           'nobody has measured it here; the sensitivity pass carries the weight.'
    }
  };

  /* --- calibration --------------------------------------------------------
     The model has exactly one free parameter (weibullScale) and leaving it to
     judgement would let the author pick the answer. Instead it is solved for:
     given a funnel and an externally measured completion rate, find the scale
     that reproduces it. Everything the model then says about WHERE the losses
     sit is a consequence of the funnel's own shape, not of a dial.

     The absolute completion level is therefore an input, not a finding. What
     the model produces that the benchmark does not: the distribution across
     steps, the boundary, and the price of a word. */
  const BENCHMARK_COMPLETION = 0.321; // Baymard/HubSpot 2026: 67.9% abandonment

  function calibrate(funnel, target, over) {
    const want = target == null ? BENCHMARK_COMPLETION : target;
    let lo = 5, hi = 100000;
    for (let i = 0; i < 60; i++) {
      const mid = Math.sqrt(lo * hi);
      const got = simulate(funnel, Object.assign({}, over, { weibullScale: mid })).completion;
      if (got < want) lo = mid; else hi = mid;
    }
    return Math.sqrt(lo * hi);
  }

  /* --- the structural ceiling --------------------------------------------
     What this funnel completes at if reading were instantaneous and the user
     infinitely patient: every word free, every second free. What is left is
     what the funnel DEMANDS rather than what it costs to read — fields, and
     hand-offs to other products.

     This is the number that decides whether a copy edit is the right tool at
     all. If the ceiling is already below where you want to land, no amount of
     cutting words gets you there, because the words were never the binding
     constraint. calibrate() saturating against this ceiling is the model
     saying exactly that, and it must be reported rather than swallowed —
     otherwise it comes back as an absurd patience value and reads like a
     converged answer. */
  function ceiling(funnel, over) {
    const t = tunables(over);
    const fields = funnel.reduce((a, s) => a + (s.fields || 0), 0);
    const exits  = funnel.filter(s => s.exits).length;
    /* Computed, not simulated with a very large patience. Simulating left a
       ~0.1% residue of dwell loss, which is nothing numerically and is wrong
       conceptually: the ceiling is defined as the limit where time is free,
       and a limit should be evaluated, not approached and rounded. */
    const fromFields = Math.pow(1 - t.fieldHazard, fields);
    const fromExits  = Math.pow(1 - t.exitHazard, exits);
    return { completion: fromFields * fromExits, fields, exits, fromFields, fromExits };
  }

  /* Flatten to plain numbers for the hot path, and let a caller override any
     single one without restating the rest. */
  function tunables(over) {
    const t = {};
    for (const k in CONSTANTS) t[k] = CONSTANTS[k].value;
    return Object.assign(t, over || {});
  }

  const log2 = n => Math.log(n) / Math.LN2;

  /* --- cost of one step, in milliseconds of attention ---------------------
     Three additive channels, because they are three different demands and
     collapsing them hides which one to attack:

       read   — words on screen, discounted by how little anyone reads,
                plus a floor for the cost of skipping
       decide — Hick-Hyman over the visible options at this step
       input  — fields to fill

     A word is charged even when it is not read. That is the point: the
     reader still pays to decide it is not for them, and a wall of text is
     charged for being a wall. */
  function stepCost(step, t) {
    const words   = step.words   || 0;
    const fields  = step.fields  || 0;
    const choices = step.choices || 0;
    /* `!= null`, not `||`: a caller that means "this step shows no separate
       text block" passes 0, and `||` would silently turn that into 1 and
       charge a glance that nobody spends. Found by a test that asserted the
       scan factor and was off by exactly one glance. */
    const blocks  = step.blocks != null ? step.blocks : (words > 0 ? 1 : 0);

    const readMs   = blocks * t.glanceMs + 60000 * words * t.scan / t.wpm;
    const decideMs = choices > 0 ? t.hickA + t.hickB * log2(choices + 1) : 0;
    const inputMs  = fields * t.fieldMs;

    return { readMs, decideMs, inputMs, totalMs: readMs + decideMs + inputMs };
  }

  /* Weibull survival at elapsed time t (seconds). Shape < 1 is negative
     aging: the hazard falls as the visit goes on. */
  function dwellSurvival(seconds, t) {
    if (seconds <= 0) return 1;
    return Math.exp(-Math.pow(seconds / t.weibullScale, t.weibullShape));
  }

  /* --- the simulation -----------------------------------------------------
     Walks the funnel, accumulating elapsed attention time, and reports who
     is left after each step.

     A property worth stating out loud, because it is the opposite of what
     "cut the intro, it's the most important" intuition predicts. Conditional
     Weibull survival over consecutive intervals telescopes:

        S(t1)/S(t0) · S(t2)/S(t1) · … · S(tn)/S(tn-1)  =  S(tn)/S(t0)

     so the share of people who finish depends ONLY on the total attention
     the funnel costs — not on how that cost is distributed across steps. The
     per-field term is multiplicative and order-free for the same reason.

     That has a hard consequence for how to spend effort:

       · to raise COMPLETION, cut the most words anywhere. Position is
         irrelevant. Cutting 100 words from the last screen is worth exactly
         what cutting 100 words from the first screen is worth.
       · to move the BOUNDARY — how much of the product sits in front of the
         median user before they leave — only early cuts count, because the
         boundary is a crossing point on a curve and crossings are decided by
         what comes before them.

     Those are two different objectives and this product has to pick one. */
  function simulate(funnel, over) {
    const t = tunables(over);
    let elapsed = 0, alive = 1;
    const steps = [];

    for (let i = 0; i < funnel.length; i++) {
      const s = funnel[i];
      const cost = stepCost(s, t);
      const t0 = elapsed, t1 = elapsed + cost.totalMs / 1000;

      const dwellTerm = dwellSurvival(t1, t) / dwellSurvival(t0, t);
      const fieldTerm = Math.pow(1 - t.fieldHazard, s.fields || 0);
      /* A step that hands the user to another product is not a slow step, it
         is a different kind of step: the session ends and a new one has to be
         started voluntarily. Charged as a flat survival term, not as time,
         because its cost has nothing to do with how long the copy is. */
      const exitTerm  = s.exits ? (1 - t.exitHazard) : 1;
      const stepSurv  = dwellTerm * fieldTerm * exitTerm;

      alive   *= stepSurv;
      elapsed  = t1;

      steps.push({
        id: s.id, label: s.label || s.id,
        words: s.words || 0, fields: s.fields || 0, choices: s.choices || 0,
        cost, elapsedSec: elapsed,
        stepSurvival: stepSurv, survival: alive,
        lostHere: (steps.length ? steps[steps.length - 1].survival : 1) - alive,
        value: !!s.value, exits: !!s.exits
      });
    }

    /* The boundary: the first step at which fewer than half the people who
       started are still present. Everything after it is built for a minority
       — which is a legitimate choice, but it should be a choice. */
    let boundary = null;
    for (let i = 0; i < steps.length; i++) {
      if (steps[i].survival < 0.5) { boundary = { index: i, ...steps[i] }; break; }
    }

    /* Two different questions, and a funnel can pass one and fail the other:
       when does the user first get something back (firstValue), and when do
       they get the whole thing (valueStep). A product whose first value lands
       on screen 1 can afford a boundary that arrives early; one that pays out
       only at the end cannot. */
    const valued     = steps.filter(s => s.value);
    const firstValue = valued[0] || null;
    const valueStep  = valued[valued.length - 1] || steps[steps.length - 1];

    return {
      steps, boundary, firstValue,
      totalWords:   steps.reduce((a, s) => a + s.words, 0),
      totalFields:  steps.reduce((a, s) => a + s.fields, 0),
      totalSec:     elapsed,
      completion:   alive,
      valueStep,
      /* Does the thing the product exists to deliver land before or after the
         median user has gone? This is the number the funnel is graded on. */
      valueReached: valueStep ? valueStep.survival : 0,
      valueBeforeBoundary: !boundary || !valueStep ? true
        : steps.indexOf(valueStep) < boundary.index
    };
  }

  /* --- what a word is worth ----------------------------------------------
     Two prices, because of the telescoping result above.

     completionPer100 — extra share of starters who finish, per 100 words
       removed. Same everywhere in the funnel, by construction. Reported once,
       not per step, because reporting it per step would imply a difference
       that does not exist and would send someone off to argue about which
       screen to cut.

     reachGain — per step, whether cutting that step's words moves the
       boundary at least one step further into the product. This IS
       position-dependent, and it is the only reason to care where you cut. */
  function wordValue(funnel, over) {
    const base = simulate(funnel, over);
    const cut  = 100;

    const bump = funnel.map((s, i) => {
      const f = funnel.map((x, j) => j === i
        ? Object.assign({}, x, { words: Math.max(0, (x.words || 0) - cut) }) : x);
      return simulate(f, over);
    });

    const baseIdx = base.boundary ? base.boundary.index : funnel.length;

    return {
      completionPer100: bump.length
        ? bump[0].completion - base.completion : 0,
      perStep: funnel.map((s, i) => {
        const idx = bump[i].boundary ? bump[i].boundary.index : funnel.length;
        return {
          id: s.id, label: s.label || s.id, words: s.words || 0,
          completionGain: bump[i].completion - base.completion,
          boundaryMovesTo: idx,
          reachGain: idx - baseIdx,
          valueReachedGain: bump[i].valueReached - base.valueReached
        };
      })
    };
  }

  /* --- sensitivity --------------------------------------------------------
     Two of the seven constants are assumed rather than measured, and one of
     those (weibullScale) moves the answer more than any editing decision
     would. A single-point estimate from this model would be dishonest, so
     the model refuses to report one without its spread: every constant is
     swept to both ends of its band and the boundary is recorded.

     If the boundary lands on the same step across the whole sweep, the
     finding survives the uncertainty. If it does not, the model has told you
     it cannot answer, which is a real answer. */
  function sensitivity(funnel) {
    const rows = [];

    /* Every row re-calibrates. That is deliberate: the benchmark pins HOW MANY
       finish, so a swept constant cannot change the total — it can only change
       WHERE the losses fall. This isolates the only thing the model claims to
       know. A sweep that moved completion around too would let a constant look
       influential when all it did was slide the level. */
    const at = (over) => {
      const scale = calibrate(funnel, null, over);
      return simulate(funnel, Object.assign({}, over, { weibullScale: scale }));
    };

    const base = at({});
    rows.push({ knob: 'baseline', at: '—', ...summary(base) });

    for (const k in CONSTANTS) {
      const c = CONSTANTS[k];
      if (!c.band || c.free) continue;   // the free parameter is solved, not swept
      for (const v of c.band) {
        rows.push({ knob: k, at: v, assumed: c.assumed, ...summary(at({ [k]: v })) });
      }
    }

    /* And sweep the benchmark itself, because "this product behaves like an
       average web form" is an assumption too. */
    for (const target of [0.20, 0.45]) {
      const scale = calibrate(funnel, target);
      rows.push({ knob: 'benchmark', at: target, assumed: true,
        ...summary(simulate(funnel, { weibullScale: scale })) });
    }

    const idx = rows.map(r => r.boundaryIndex);
    return {
      rows, base: summary(base),
      boundaryMin: Math.min.apply(null, idx),
      boundaryMax: Math.max.apply(null, idx),
      stable: Math.min.apply(null, idx) === Math.max.apply(null, idx),
      /* The conclusion the product actually needs is not "which step" but
         "does the value land before the boundary". That can hold across the
         whole sweep even when the exact step index does not. */
      valueSafeAlways: rows.every(r => r.valueBeforeBoundary)
    };
  }

  function summary(r) {
    return {
      boundaryIndex: r.boundary ? r.boundary.index : r.steps.length,
      boundaryId:    r.boundary ? r.boundary.id : null,
      completion:    r.completion,
      firstValueReached: r.firstValue ? r.firstValue.survival : 0,
      valueReached:  r.valueReached,
      valueBeforeBoundary: r.valueBeforeBoundary,
      totalSec:      r.totalSec
    };
  }

  root.PC = root.PC || {};
  root.PC.attention = {
    CONSTANTS, BENCHMARK_COMPLETION, tunables, stepCost, dwellSurvival,
    calibrate, ceiling, simulate, wordValue, sensitivity, summary
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.PC.attention;
})(typeof window !== 'undefined' ? window : globalThis);
