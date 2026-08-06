/* ============================================================
   POST-CALL · pricing model
   Pure: no DOM, no reads of anything outside its argument. The UI hands it a
   plain object and gets the whole computation back, which means it can be
   exercised in Node in milliseconds instead of through a browser, and the
   tunable numbers below sit in one place instead of buried in render code.
   ============================================================ */
(function (root) {
  'use strict';

  const ils   = n => '₪' + Math.round(n).toLocaleString('en-US');
  // round to 10, not 100: precise first offers draw less ambitious
  // counteroffers than round ones and read as better-informed
  const round = v => Math.round(v / 10) * 10;

  /* --- tunables. Defaults for calibration, not predictions. --- */
  const EFFORT = {
    base: n => n <= 1 ? 4 : n === 2 ? 7 : n === 3 ? 11 : 16 + (n - 4) * 3,
    handover: 2,
    errorAllowance: 1.15
  };

  const PRICE = {
    valueCoeff: 0.25,      // mid of the defensible band
    bandLow: 0.17,         // published first-year ROI 200%–500% puts a
    bandHigh: 0.33,        // defensible price at 17%–33% of year-one value
    ceiling: 0.35,         // past this the client clears under ~1.9x in year one
    floorMargin: 1.1,      // no method may price below delivery cost
    defaultMyRate: 250,
    defaultMargin: 30
  };

  // Converted from published US ranges for this vertical — starting points for
  // an Israeli market, not measurements of it.
  const MARKET_TIERS = [
    { name: 'פשוט',      max: 2, simpleOnly: true, lo: 1500,  hi: 4000  },
    { name: 'מורכב',     max: 3,                   lo: 4000,  hi: 11000 },
    { name: 'רב-מערכתי', max: 5,                   lo: 11000, hi: 25000 },
    { name: 'ארגוני',    max: Infinity,            lo: 25000, hi: 45000 }
  ];

  function marketTier(systemCount, integration) {
    if (!systemCount) return null;
    return MARKET_TIERS.find(t =>
      systemCount <= t.max && (!t.simpleOnly || integration <= 1.0)) || null;
  }

  function compute(i) {
    const runs  = (i.freq || 0) * (i.freqUnit || 0);
    const mins  = i.minutes || 0;
    const rate  = i.rate || 0;
    const hours = runs * mins / 60;

    const timeValue   = hours * rate * (i.capture || 0);
    const errValue    = (i.errFreq || 0) * (i.errCost || 0) * 12;
    const annualValue = timeValue + errValue;

    const n      = i.systemCount || 0;
    const effort = Math.round(
      (EFFORT.base(n) * (i.integration || 1) * (i.edge || 1) + EFFORT.handover)
      * EFFORT.errorAllowance);

    const myRate = i.myRate || PRICE.defaultMyRate;
    const margin = i.margin == null ? PRICE.defaultMargin : i.margin;
    const floor  = effort * myRate;
    const maint  = (i.maintPct || 0) / 100;
    const high   = annualValue * PRICE.ceiling;

    /* --- the four methods. Each needs data the others don't, so the one you
       lack stops being a dead end, and an inflated input shows up as an
       outlier instead of quietly setting the price. --- */
    const M = {};

    M.cost = {
      label: 'עלות + מרווח',
      raw: round(floor * (1 + margin / 100)),
      basis: effort + ' שעות × ₪' + myRate + ' + ' + margin + '% מרווח'
    };

    const tier = marketTier(n, i.integration || 1);
    M.market = tier ? {
      label: 'מחירון שוק',
      raw: round((tier.lo + tier.hi) / 2),
      basis: 'טווח ' + tier.name + ': ' + ils(tier.lo) + '–' + ils(tier.hi)
    } : null;

    M.value = annualValue > 0 ? {
      label: 'ערך / ROI',
      raw: round(annualValue * PRICE.valueCoeff),
      basis: Math.round(PRICE.valueCoeff * 100) + '% מ' + ils(annualValue) +
             ' ערך שנתי · הטווח שניתן להגנה ' +
             ils(annualValue * PRICE.bandLow) + '–' + ils(annualValue * PRICE.bandHigh)
    } : null;

    M.comparable = (i.compLast > 0) ? {
      label: 'עסקה דומה',
      raw: round(i.compLast * (i.compScale || 1)),
      basis: ils(i.compLast) + ' × ' + (i.compScaleLabel || '')
    } : null;

    // A method that prices below what delivery costs is not a strategy. Value
    // pricing falls under it whenever the process is small next to the build.
    const costFloor = round(floor * PRICE.floorMargin);
    Object.values(M).forEach(x => { if (x) {
      x.value  = Math.max(x.raw, costFloor);
      x.raised = x.value > x.raw;
    }});

    const method    = i.method || 'value';
    const chosen    = M[method];
    const available = Object.keys(M).filter(k => M[k]);
    const price     = chosen ? chosen.value : (M.cost ? M.cost.value : 0);

    const vals   = available.map(k => M[k].value).filter(v => v > 0);
    const spread = vals.length > 1 ? Math.max(...vals) / Math.min(...vals) : 1;

    // which method actually pays most here, subject to staying defensible
    const ceiling = annualValue > 0 ? high : Infinity;
    const best = available
      .filter(k => M[k].value <= ceiling)
      .sort((a, b) => M[b].value - M[a].value)[0] || null;

    const netWeekly = annualValue > 0 ? (annualValue * (1 - maint)) / 52 : 0;

    return {
      runs, mins, rate, hours, timeValue, errValue, annualValue,
      effort, floor, costFloor, myRate, maint, capture: i.capture,
      M, method, chosen, available, price, best, spread,
      usedFallback: !chosen,
      belowCost: price > 0 && price < floor,
      tooThin: annualValue > 0 && price > high,
      high, low: annualValue * PRICE.low,
      payback: netWeekly > 0 ? price / netWeekly : 0,
      errShare: annualValue > 0 ? errValue / annualValue : 0,
      deals: i.deals || 0
    };
  }

  root.PC = root.PC || {};
  root.PC.model = { compute, ils, round, EFFORT, PRICE, MARKET_TIERS, marketTier };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.PC.model;
})(typeof window !== 'undefined' ? window : globalThis);
