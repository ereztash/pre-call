/* ============================================================
   POST-CALL · pricing model
   Pure: no DOM, no reads of anything outside its argument. The UI hands it a
   plain object and gets the whole computation back, which means it can be
   exercised in Node in milliseconds instead of through a browser, and the
   tunable numbers below sit in one place instead of buried in render code.
   ============================================================ */
(function (root) {
  'use strict';

  var tr = (typeof PC !== 'undefined' && PC.i18n) ? PC.i18n.tr
    : function (s, p) { if (p) for (var k in p) s = s.split('{' + k + '}').join(p[k]); return s; };

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

  /* One source for the four names. They used to be written inline inside
     compute(), which was fine until anything outside this file needed to
     say "your market-priced quotes" — at which point the name would have
     been retyped somewhere else and the two would drift. */
  const METHOD_LABEL = {
    cost: tr('עלות + מרווח'),
    market: tr('מחירון שוק'),
    value: tr('ערך / ROI'),
    comparable: tr('עסקה דומה'),
    /* Not one of the four. It is what set the price whenever the chosen
       method landed under what delivery costs — see pricedBy below. */
    floor: tr('רצפת עלות')
  };

  /* Which pricing method to use, decided for the operator instead of by
     them. Four chips asking someone to pick between value, market rate,
     cost-plus and comparable is a question only a person who already prices
     work can answer — and getting it wrong costs them money. The tool picks
     and says why in one plain sentence; changing it stays available but off
     the main path.

     This lived in pc-guide.js until the readiness work started. It reads like
     guidance and it is worded like guidance, which is exactly why it was in
     danger: pc-guide is the layer being replaced, and a function that decides
     which of the four methods sets the price is not guidance — it is the
     pricing engine choosing which of its own paths runs. It sits next to
     METHOD_LABEL now because those are the four names it returns, and because
     whatever replaces the guide has to call it rather than inherit it. */
  function pickMethod(s) {
    const hasClientNumbers = (+s.freq > 0 && +s.minutes > 0) && !s.numbersAreMine;
    if (hasClientNumbers) return { method: 'value',
      because: tr('המחיר נבנה ממה שהתהליך עולה ללקוח בשנה, כי הוא נתן לך את המספרים. זו הדרך שמחזיקה הכי טוב בשיחה — הדיבור הוא על הכסף שלו, לא על השעות שלכם.') };
    if (+s.comparableLast > 0) return { method: 'comparable',
      because: tr('המחיר נבנה מעבודה דומה שכבר עשית, מותאם להיקף כאן. זה מספר שקל להגן עליו, כי הוא באמת קרה.') };
    /* Market is keyed on how many systems connect — marketTier() returns
       nothing at zero, so M.market is null and compute() falls through to the
       cost floor. Returning 'market' anyway is how the chip came to read one
       thing while the price came from another: measured across 200 generated
       calls, this function named an unpriceable method in 72% of them, and
       nearly all of those were these two lines. Naming cost when cost is what
       will actually run is not a worse answer, it is the true one. */
    const canMarket = (s.systems || []).length > 0;
    if (s.numbersAreMine) return canMarket ? { method: 'market',
      because: tr('המספרים הם הערכה שלכם ולא של הלקוח, אז המחיר נבנה מהטווח המקובל בשוק לעבודה כזאת. ברגע שיתקבל ממנו מספר אמיתי, החישוב יעבור לערך אצלו — וזה בדרך כלל מעלה את המחיר.') }
      : { method: 'cost',
      because: tr('המספרים הם הערכה שלכם, ועוד לא נבחרו מערכות שאפשר לקרוא מהן מורכבות — אז בינתיים המחיר נבנה מהעבודה שאתם צפויים להשקיע ומהתעריף שלכם.') };
    return canMarket ? { method: 'market',
      because: tr('עוד אין מספיק מספרים מהלקוח, אז בינתיים המחיר לפי הטווח המקובל בשוק. ברגע שיהיו כמה פעמים זה קורה וכמה זמן זה לוקח, המחיר יתחיל להישען על העסק שלו.') }
      : { method: 'cost',
      because: tr('עוד אין מספרים מהלקוח ולא נבחרו מערכות, אז בינתיים המחיר נבנה מהעבודה שאתם צפויים להשקיע ומהתעריף שלכם. ברגע שיהיו כמה פעמים זה קורה וכמה זמן זה לוקח, המחיר יתחיל להישען על העסק שלו.') };
  }

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
    { name: tr('פשוט'),      max: 2, simpleOnly: true, lo: 1500,  hi: 4000  },
    { name: tr('מורכב'),     max: 3,                   lo: 4000,  hi: 11000 },
    { name: tr('רב-מערכתי'), max: 5,                   lo: 11000, hi: 25000 },
    { name: tr('ארגוני'),    max: Infinity,            lo: 25000, hi: 45000 }
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
      label: METHOD_LABEL.cost,
      raw: round(floor * (1 + margin / 100)),
      basis: tr('{effort} שעות × ₪{rate} + {margin}% מרווח',
                { effort: effort, rate: myRate, margin: margin })
    };

    const tier = marketTier(n, i.integration || 1);
    M.market = tier ? {
      label: METHOD_LABEL.market,
      raw: round((tier.lo + tier.hi) / 2),
      basis: tr('טווח {tier}: {lo}–{hi}',
                { tier: tier.name, lo: ils(tier.lo), hi: ils(tier.hi) })
    } : null;

    M.value = annualValue > 0 ? {
      label: METHOD_LABEL.value,
      raw: round(annualValue * PRICE.valueCoeff),
      basis: tr('{pct}% מ{value} ערך שנתי · הטווח שניתן להגנה {lo}–{hi}',
                { pct: Math.round(PRICE.valueCoeff * 100), value: ils(annualValue),
                  lo: ils(annualValue * PRICE.bandLow), hi: ils(annualValue * PRICE.bandHigh) })
    } : null;

    M.comparable = (i.compLast > 0) ? {
      label: METHOD_LABEL.comparable,
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
      /* Which method actually set the price, as opposed to which one was
         asked for. The ledger stored `method` and nothing else, so a quote
         the operator did not really price that way was filed under
         whatever they had clicked, and any later claim about which method
         performs would have been assembled from mislabelled rows.

         Three outcomes, not two — the first version of this had two, and
         review caught the missing one:

           · no data behind the requested method (ask for "comparable"
             with no previous deal) → the price is M.cost.value, so 'cost'
           · the requested method priced under what delivery costs → every
             method's value is Math.max(raw, costFloor), so the number
             sent is costFloor and the method contributed nothing to it.
             Measured on a real input: value pricing raw ₪10 against a
             ₪10,730 floor, quoted at ₪10,730 and filed under "value".
             That is not a value-priced deal by any reading.
           · otherwise the method genuinely set the price.

         The floor gets its own name rather than being folded into 'cost',
         because it is not the cost method either: cost+margin is
         floor × 1.3 and the floor is floor × 1.1. Calling it 'cost' would
         swap one mislabelled row for another. */
      pricedBy: !chosen ? 'cost' : (chosen.raised ? 'floor' : method),
      /* No belowCost flag here on purpose — it used to exist, computed as
         `price > 0 && price < floor`, and it could never once fire. Every
         method's .value is Math.max(raw, costFloor) a few lines up, and
         costFloor is floor * 1.1 — so price is structurally >= costFloor,
         which is itself always greater than floor. A flag nothing can ever
         read as true is not a lighter check, it is a trap for whoever reads
         this file next and assumes it means something. Removed rather than
         wired up, because the thing it claimed to guard against cannot
         happen given how price is built two lines above it. */
      tooThin: annualValue > 0 && price > high,
      /* bandLow, not low. PRICE has never had a `low` key, so this was NaN
         from the day it was written and the defensible range on screen read
         "₪NaN – ₪7,567". Nothing threw, nothing failed a test, and the one
         number the operator is supposed to quote in the room was missing. */
      high, low: annualValue * PRICE.bandLow,
      payback: netWeekly > 0 ? price / netWeekly : 0,
      errShare: annualValue > 0 ? errValue / annualValue : 0,
      deals: i.deals || 0
    };
  }

  root.PC = root.PC || {};
  root.PC.model = { compute, ils, round, EFFORT, PRICE, MARKET_TIERS, marketTier, METHOD_LABEL, pickMethod };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.PC.model;
})(typeof window !== 'undefined' ? window : globalThis);
