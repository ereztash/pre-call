/* ============================================================
   POST-CALL · what this tool's own advice has been worth so far.

   The product spends a lot of words being honest about where its numbers
   come from. The effort table says it was fitted backwards. The market
   tiers say they are converted from published US ranges rather than
   measured here. The value coefficient says it is the middle of a
   defensible band. All true, all worth saying — and all still assertions
   about the tool's defaults rather than evidence about this operator.

   Everything needed to replace some of those assertions with evidence has
   been sitting in localStorage the whole time. Every saved deal carries
   the estimate locked at quote time, the price quoted, the method, and —
   once reported — the hours it actually took and the price it actually
   closed at. Three things were being computed from that and discarded:

     · priceHold() in deals.js is written, commented, tested, and called
       from nowhere. "Did the price I sent survive?" is the question the
       operator most wants answered and the product answers it to itself.
     · calibration() reports one aggregate ratio. Five jobs each 20% over
       and four accurate jobs plus one that ran 3x produce nearly the same
       ratio and demand opposite corrections — raise the baseline, versus
       leave the baseline alone and fix how one kind of job is scoped. A
       single number cannot tell those apart, so it tells you neither.
     · Which of the four methods actually holds up was never computed at
       all, although every deal records the one it used.

   So this module is the tool's own track record. Two rules govern all of
   it, and they are the same rules deals.js already set for itself:

     1. Nothing is claimed below the threshold that makes it meaningful,
        and slicing by method makes n smaller rather than larger, so the
        per-method threshold guards a smaller sample, not a bigger one.
     2. What cannot yet be said is stated out loud, with the number of
        deliveries it would take. A track record that only ever reports
        its conclusions is exactly the confident-number-without-evidence
        failure this whole product argues against.

   Pure, no DOM, no storage. Tested in Node.
   ============================================================ */
(function (root) {
  'use strict';

  /* Same five as deals.js calibration(), for the same reason: a ratio
     from two jobs is noise wearing a number. */
  const MIN_DELIVERIES = 5;
  /* Deliberately lower, and it still is not comfortable. Three quotes is
     a thin basis for saying a pricing method works — so the wording that
     comes out of this at n=3 is a lean, not a finding, and says so. */
  const MIN_PER_METHOD = 3;
  /* Halved into before and after, so six is the first n where each half
     has three. */
  const MIN_FOR_TREND = 6;
  /* Within a quarter of the estimate is a good estimate for this kind of
     work. Anyone who thinks they can do better than ±25% on a build they
     have not started is measuring something other than reality. */
  const CLOSE_ENOUGH = 0.25;

  const pct = x => Math.round(x * 100);
  /* Hebrew no more takes "1 מסירות" than English takes "1 jobs". Every
     count this module prints goes through here: the panel is small, every
     line in it is a sentence somebody reads, and one ungrammatical count
     is enough to make the whole thing read as machine output — which is
     the last thing a panel arguing for its own credibility can afford. */
  const count = (n, one, many) => n === 1 ? one : n + ' ' + many;
  const median = xs => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  /* Deliveries, oldest first. A delivery is a deal that has both a locked
     estimate and reported hours — the status does not matter, because a
     job can be delivered and reported without anyone having gone back to
     press "won". */
  function deliveries(deals) {
    return (deals || [])
      .filter(d => d && d.outcome && d.outcome.actualHours > 0 && d.estimatedHours > 0)
      .map(d => {
        const est = +d.estimatedHours, act = +d.outcome.actualHours;
        return {
          id: d.id, client: d.client || 'ללא שם',
          est, act,
          ratio: act / est,
          off: act / est - 1,
          at: d.outcome.at || d.created || ''
        };
      })
      .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  }

  /* How good the estimate has actually been — as a distribution, not as
     an average. The `spread` verdict below is the whole reason this
     function exists rather than deferring to calibration(). */
  function accuracy(deals) {
    const rows = deliveries(deals);
    const n = rows.length;
    const out = {
      n, rows,
      within: rows.filter(r => Math.abs(r.off) <= CLOSE_ENOUGH).length,
      over:   rows.filter(r => r.off >  CLOSE_ENOUGH).length,
      under:  rows.filter(r => r.off < -CLOSE_ENOUGH).length,
      medianRatio: n ? +median(rows.map(r => r.ratio)).toFixed(2) : null,
      meanRatio: n
        ? +(rows.reduce((s, r) => s + r.act, 0) / rows.reduce((s, r) => s + r.est, 0)).toFixed(2)
        : null,
      worst: null, verdict: null, enough: n >= MIN_DELIVERIES
    };
    if (!n) return out;

    out.worst = rows.reduce((w, r) => Math.abs(r.off) > Math.abs(w.off) ? r : w, rows[0]);
    if (!out.enough) return out;

    const med = out.medianRatio;
    const typical = Math.abs(med - 1) <= CLOSE_ENOUGH;
    const mostlyFine = out.within >= Math.ceil(n * 0.6);

    /* The correction to suggest is not always the one the whole history
       implies. Seen in a browser with six deliveries running 80% over at
       the start and 20% over lately: the median across everything says
       "raise the estimate 45%", which would now over-correct by more than
       the original error. Once there are enough deliveries to see a
       direction, the number to act on comes from the recent ones, and the
       whole-history figure is reported beside it rather than instead —
       hiding it would make the panel look like it had changed its mind. */
    const recentMed = n >= MIN_FOR_TREND
      ? +median(rows.slice(Math.ceil(n / 2)).map(r => r.ratio)).toFixed(2) : null;
    const drifted = recentMed !== null && Math.abs(recentMed - med) > CLOSE_ENOUGH / 2;
    out.recentRatio = recentMed;
    const act = drifted ? recentMed : med;
    const alsoSay = drifted
      ? ' (על פני כל ההיסטוריה זה ' + pct(Math.abs(med - 1)) + '%, אבל המסירות האחרונות טובות יותר)'
      : '';

    if (typical && mostlyFine && Math.abs(out.worst.off) > CLOSE_ENOUGH * 2) {
      /* The case the aggregate ratio cannot express, and the reason a
         mean was not enough: the baseline is fine and one job broke. */
      out.verdict = {
        kind: 'outlier',
        text: 'האומדן שלך מדויק ברוב המקרים — ' + out.within + ' מתוך ' + n +
              ' בתוך ±' + pct(CLOSE_ENOUGH) + '%. מה שמושך את הממוצע הוא עבודה אחת: ' +
              out.worst.client + ', ' + out.worst.est + ' שעות באומדן מול ' +
              out.worst.act + ' בפועל. זו בעיית אפיון בסוג עבודה מסוים, לא בסיס שגוי.'
      };
    } else if (typical && mostlyFine) {
      out.verdict = {
        kind: 'holds',
        text: 'האומדן שלך מחזיק: ' + out.within + ' מתוך ' + n +
              ' בתוך ±' + pct(CLOSE_ENOUGH) + '%. אין כאן מה לתקן.'
      };
    } else if (med > 1) {
      out.verdict = {
        kind: 'low',
        text: 'האומדן שלך נמוך באופן שיטתי — ' + out.over + ' מתוך ' + n +
              ' מסירות חרגו. הוספה של ' + pct(Math.abs(act - 1)) +
              '% לאומדן תקרב אותו למציאות' + alsoSay + '.'
      };
    } else {
      out.verdict = {
        kind: 'high',
        text: 'האומדן שלך גבוה באופן שיטתי — ' + out.under + ' מתוך ' + n +
              ' מסירות הסתיימו מתחת לאומדן, בפער טיפוסי של ' + pct(Math.abs(act - 1)) +
              '%' + alsoSay + '. אתה כנראה מתמחר יותר שעות ממה שהעבודה לוקחת.'
      };
    }
    return out;
  }

  /* Per-method track record. Reads pricedBy, never method: the two differ
     whenever the requested method had no data behind it, and a claim
     about which method performs, assembled from mislabelled rows, is
     worse than no claim. Deals saved before pricedBy existed are counted
     as unattributable rather than guessed at. */
  function methods(deals, labels) {
    const L = labels || {};
    const all = (deals || []).filter(d => d && d.priceQuoted > 0);
    const attributed = all.filter(d => d.pricedBy);
    const buckets = {};

    attributed.forEach(d => {
      const b = buckets[d.pricedBy] || (buckets[d.pricedBy] = {
        method: d.pricedBy, label: L[d.pricedBy] || d.pricedBy,
        quoted: 0, won: 0, lost: 0, undecided: 0,
        heldFull: 0, discounted: 0, discounts: []
      });
      b.quoted++;
      if (d.status === 'won') b.won++;
      else if (d.status === 'lost') b.lost++;
      else b.undecided++;
      const closed = d.outcome && d.outcome.closedPrice;
      if (d.status === 'won' && closed > 0) {
        if (closed >= d.priceQuoted) b.heldFull++;
        else { b.discounted++; b.discounts.push(1 - closed / d.priceQuoted); }
      }
    });

    const rows = Object.values(buckets).map(b => {
      const decided = b.won + b.lost;
      const priced = b.heldFull + b.discounted;
      const r = Object.assign({}, b, {
        decided,
        winRate: decided ? +(b.won / decided).toFixed(2) : null,
        pricedN: priced,
        avgDiscount: b.discounts.length
          ? +(b.discounts.reduce((s, x) => s + x, 0) / b.discounts.length * 100).toFixed(1)
          : (priced ? 0 : null),
        enough: b.quoted >= MIN_PER_METHOD
      });
      delete r.discounts;
      return r;
    }).sort((a, b) => b.quoted - a.quoted);

    return { rows, attributed: attributed.length, unattributed: all.length - attributed.length };
  }

  /* Is the estimate getting better, or is it just being averaged over
     more jobs? Compares the typical error of the earlier half against the
     later half. Only from six, so each half has three. */
  function trend(deals) {
    const rows = deliveries(deals);
    if (rows.length < MIN_FOR_TREND) return null;
    const half = Math.floor(rows.length / 2);
    const err = xs => median(xs.map(r => Math.abs(r.off)));
    const early = err(rows.slice(0, half));
    const late  = err(rows.slice(rows.length - half));
    return {
      n: rows.length, early: +early.toFixed(2), late: +late.toFixed(2),
      improving: late < early,
      text: late < early
        ? 'האומדן שלך משתפר: סטייה טיפוסית של ' + pct(early) + '% בהתחלה מול ' +
          pct(late) + '% במסירות האחרונות.'
        : 'האומדן שלך לא משתפר: סטייה טיפוסית של ' + pct(early) + '% בהתחלה מול ' +
          pct(late) + '% במסירות האחרונות.'
    };
  }

  /* The half that keeps this honest. Everything the track record cannot
     yet say, and exactly what it would take — because a panel that shows
     only its conclusions reads as if the silence means agreement. */
  function unknowns(deals, labels) {
    const list = deals || [];
    const acc = accuracy(list);
    const m = methods(list, labels);
    const out = [];

    if (!acc.enough) out.push({
      what: 'כמה מדויק האומדן שלך',
      need: MIN_DELIVERIES - acc.n,
      text: 'צריך עוד ' + (MIN_DELIVERIES - acc.n) + ' מסירות עם שעות מדווחות. ' +
            'עד אז טבלת האומדן נשארת מסומנת כלא-מכוילת.'
    });
    if (acc.n < MIN_FOR_TREND) out.push({
      what: 'האם האומדן שלך משתפר',
      need: MIN_FOR_TREND - acc.n,
      text: 'צריך ' + MIN_FOR_TREND + ' מסירות כדי להשוות את הראשונות לאחרונות.'
    });

    const short = m.rows.filter(r => !r.enough);
    if (!m.rows.length) out.push({
      what: 'איזו שיטת תמחור עובדת לך',
      need: MIN_PER_METHOD,
      text: 'צריך לפחות ' + MIN_PER_METHOD + ' הצעות באותה שיטה.'
    });
    else if (short.length) out.push({
      what: 'איזו שיטת תמחור עובדת לך',
      need: Math.min(...short.map(r => MIN_PER_METHOD - r.quoted)),
      text: short.map(r => r.label + ' (' + r.quoted + '/' + MIN_PER_METHOD + ')').join(' · ') +
            ' — עוד לא מספיק כדי לומר משהו.'
    });

    /* A standing limitation, and the reason this list can never come back
       empty. Every other entry here is a countdown that eventually
       resolves; this one does not, because it is not a gap in the data —
       it is what the data is. Found by walking six delivered jobs through
       a browser: every question had been answered, the gaps list went to
       zero, and the panel started reading like an oracle. A track record
       that stops qualifying itself once it has enough rows has learned
       the wrong lesson from having rows. */
    out.push({
      what: 'מה זה לא',
      need: 0,
      text: 'זה ' + count(acc.n, 'מסירה אחת שלך', 'מסירות שלך') +
            ' — לא מדד שוק ולא השוואה לאף אחד אחר. ' +
            'זה אומר לך אם האומדן שלך מדויק, לא אם המחיר שלך נכון.'
    });

    if (m.unattributed) out.push({
      what: 'הצעות ישנות',
      need: 0,
      text: count(m.unattributed, 'הצעה אחת נשמרה', 'הצעות נשמרו') +
            ' לפני שהכלי תיעד איזו שיטה קבעה את המחיר בפועל, ולכן ' +
            (m.unattributed === 1 ? 'היא לא נספרת' : 'הן לא נספרות') +
            ' כאן. הצעות חדשות כן.'
    });

    return out;
  }

  /* The whole thing, or null when there is no history at all — an empty
     panel that explains what it would show is still an empty panel, and
     the ledger above it already says there is nothing saved. */
  function report(deals, labels) {
    const list = (deals || []).filter(Boolean);
    if (!list.length) return null;
    const acc = accuracy(list);
    const m = methods(list, labels);
    const t = trend(list);
    return {
      deals: list.length,
      accuracy: acc,
      methods: m,
      trend: t,
      unknowns: unknowns(list, labels),
      /* Nothing worth showing yet is different from nothing at all: the
         first is a countdown, the second is an empty state. */
      hasFindings: !!(acc.verdict || t || m.rows.some(r => r.enough))
    };
  }

  root.PC = root.PC || {};
  root.PC.history = {
    deliveries, accuracy, methods, trend, unknowns, report,
    MIN_DELIVERIES, MIN_PER_METHOD, MIN_FOR_TREND, CLOSE_ENOUGH
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.PC.history;
})(typeof window !== 'undefined' ? window : globalThis);
