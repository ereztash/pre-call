/* POST-CALL · what this tool's own advice has been worth so far.
   Pure, no DOM, no storage. Tested in Node.
   Why it works this way: docs/modules/pc-history.md */
(function (root) {
  'use strict';

  var tr = (typeof PC !== 'undefined' && PC.i18n) ? PC.i18n.tr
    : function (s, p) { if (p) for (var k in p) s = s.split('{' + k + '}').join(p[k]); return s; };

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

  /* Six decided proposals before saying anything about the ceiling. A run of
     three wins is luck; the same threshold trend() uses, for the same reason. */
  const MIN_FOR_CEILING = 6;
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
          id: d.id, client: d.client || tr('ללא שם'),
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
    /* Which way it drifted, which the first version never asked. It said
       "but the recent deliveries are better" whenever the two medians
       differed at all — so three accurate jobs followed by three that took
       twice as long produced "the recent ones are better" here and "your
       estimate is not improving" in the trend line directly underneath.
       Two sentences of the same panel contradicting each other is worse
       than either being wrong alone: it tells the reader the panel is not
       reading its own data. */
    const closer = recentMed !== null && Math.abs(recentMed - 1) < Math.abs(med - 1);
    out.recentRatio = recentMed;
    /* Recent work is the right basis for the correction either way — it
       is where the operator actually is — but the sentence has to say
       which direction it moved. */
    const act = drifted ? recentMed : med;
    const alsoSay = drifted
      ? tr(' (על פני כל ההיסטוריה זה {pct}%, {trend})', {
          pct: pct(Math.abs(med - 1)),
          trend: closer ? tr('אבל המסירות האחרונות טובות יותר') : tr('והמסירות האחרונות דווקא גרועות יותר')
        })
      : '';

    if (typical && mostlyFine && Math.abs(out.worst.off) > CLOSE_ENOUGH * 2) {
      /* The case the aggregate ratio cannot express, and the reason a
         mean was not enough: the baseline is fine and one job broke. */
      out.verdict = {
        kind: 'outlier',
        text: tr('האומדן שלך מדויק ברוב המקרים — {within} מתוך {n} בתוך ±{pct}%. מה שמושך את הממוצע הוא עבודה אחת: {client}, {est} שעות באומדן מול {act} בפועל. זו בעיית אפיון בסוג עבודה מסוים, לא בסיס שגוי.', {
          within: out.within, n: n, pct: pct(CLOSE_ENOUGH),
          client: out.worst.client, est: out.worst.est, act: out.worst.act
        })
      };
    } else if (typical && mostlyFine) {
      out.verdict = {
        kind: 'holds',
        text: tr('האומדן שלך מחזיק: {within} מתוך {n} בתוך ±{pct}%. אין כאן מה לתקן.', {
          within: out.within, n: n, pct: pct(CLOSE_ENOUGH)
        })
      };
    } else if (med > 1) {
      out.verdict = {
        kind: 'low',
        text: tr('האומדן שלך נמוך באופן שיטתי — {over} מתוך {n} מסירות חרגו. הוספה של {pct}% לאומדן תקרב אותו למציאות{alsoSay}.', {
          over: out.over, n: n, pct: pct(Math.abs(act - 1)), alsoSay: alsoSay
        })
      };
    } else {
      out.verdict = {
        kind: 'high',
        text: tr('האומדן שלך גבוה באופן שיטתי — {under} מתוך {n} מסירות הסתיימו מתחת לאומדן, בפער טיפוסי של {pct}%{alsoSay}. אתה כנראה מתמחר יותר שעות ממה שהעבודה לוקחת.', {
          under: out.under, n: n, pct: pct(Math.abs(act - 1)), alsoSay: alsoSay
        })
      };
    }
    return out;
  }

  /* One bucketer, two breakdowns. It was written inline inside methods(), and
     that was fine until a second axis needed the same arithmetic — at which
     point the honest-discount rule (average only the deals that were actually
     discounted, never the zeros) would have existed in two places and been
     free to drift in one of them. That rule is the whole reason this module
     exists; it does not get a second copy.

     `keyName` is what the row calls its own grouping value, so a caller reads
     r.method or r.provenance rather than a generic r.key. `keyOf` returns the
     grouping value or a falsy value for "this deal cannot be attributed". */
  function bucketBy(deals, keyName, keyOf, labels) {
    const L = labels || {};
    const all = (deals || []).filter(d => d && d.priceQuoted > 0);
    const attributed = all.filter(d => keyOf(d));
    const buckets = {};

    attributed.forEach(d => {
      const k = keyOf(d);
      let b = buckets[k];
      if (!b) {
        b = buckets[k] = {
          label: L[k] || k,
          quoted: 0, won: 0, lost: 0, undecided: 0,
          heldFull: 0, discounted: 0, discounts: []
        };
        b[keyName] = k;
      }
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

  /* Per-method track record. Reads pricedBy, never method: the two differ
     whenever the requested method had no data behind it, and a claim
     about which method performs, assembled from mislabelled rows, is
     worse than no claim. Deals saved before pricedBy existed are counted
     as unattributable rather than guessed at. */
  function methods(deals, labels) {
    return bucketBy(deals, 'method', d => d.pricedBy, labels);
  }

  /* The same track record on the axis the ledger has been storing since the
     transcript step existed and never once read: where the annual-value figure
     came from. Four values, and they are not interchangeable inputs to one
     calculation — a figure the client named unprompted and a figure the
     operator estimated for him are different kinds of claim. If they close
     differently, or hold their price differently, the operator is the one who
     should get to see it.

     Two reasons the reading is not simply d.provenance. Deals saved before the
     field was promoted still carry it inside the stored form, so dropping them
     would report a blank slate to someone whose ledger is full. And the label
     map is the enum: only keys it defines become buckets, so a hand-edited
     store or a fifth form option added later cannot grow a group named after a
     string this module cannot explain. */
  function provenance(deals, labels) {
    const known = labels ? Object.keys(labels) : null;
    const ok = v => !!v && (!known || known.indexOf(v) !== -1);
    /* One value carries an ambiguity the others do not. 'prompted' used to be
       the form's default, so a stored 'prompted' cannot be told apart from a
       question nobody touched by looking at the value — and this panel claims
       every row is a choice somebody made. A record that was genuinely answered
       carries the flag collectDraft() writes; one that was not is unattributed,
       which the panel already discloses by name.
       The other three were never a default, so demanding a flag from them would
       throw away real answers from every record written before the flag existed.
       Raised in review, and it is the reason the disclaimer that used to sit in
       unknowns() could go rather than being reworded. */
    const answered = d => !!(d.form && d.form.provenanceAnswered);
    const usable = (v, d) => ok(v) && (v !== 'prompted' || answered(d));
    return bucketBy(deals, 'provenance', d => {
      if (usable(d.provenance, d)) return d.provenance;
      return d.form && usable(d.form.q_provenance, d) ? d.form.q_provenance : null;
    }, labels);
  }

  /* Winning everything is not a result. It is a missing measurement.

     winRate() has been computed in deals.js and printed as a score since the
     ledger existed, and nobody has ever interpreted it. The interpretation is
     the counterintuitive one: an operator who has never lost a priced proposal,
     never had one negotiated down, and never quietly widened one at the same
     price has no evidence about their ceiling. Not "you are underpricing" — that
     would be a claim from the same absence of data. The edge shows up in the deal
     that did not close, and they do not have one.

     The claim is narrow on purpose. Any of the three — a loss, a discount, a
     scope that grew after the quote — means the price WAS tested and moved, which
     is a different finding and belongs to the lines that already report it.
     Widening counts because a deal that gained a clause after the quote was
     conceded even though both numbers held; see scopeDrift() in deals.js.

     `hold` is passed in rather than recomputed. Whether the scope moved lives in
     deals.js, and a second implementation of it here is how the two would come to
     disagree. */
  function ceiling(deals, hold) {
    const list = (deals || []).filter(Boolean);
    const decided = list.filter(d => d.status === 'won' || d.status === 'lost');
    const lost = decided.filter(d => d.status === 'lost').length;
    const n = decided.length;
    const h = hold || {};
    if (n < MIN_FOR_CEILING) {
      return { n, lost, enough: false, untested: null,
               need: MIN_FOR_CEILING - n, text: null };
    }
    const moved = lost > 0 || (h.discounted || 0) > 0 ||
                  (h.widened !== null && (h.widened || 0) > 0);
    /* Whether the scope clause may be SAID, which is a different question from
       whether the scope moved. widened is null for every deal with no baseline —
       anything entered through addPast(), and anything saved before baselines
       existed — and `(h.widened || 0) > 0` read that as "nothing widened", so the
       sentence went on to assert it. Raised in review, and it is this change's own
       flagship scenario: six remembered deals produce exactly that ledger.

       The price evidence is untouched by this — no loss and no discount is real —
       so the finding still stands. What goes is the clause it cannot support. */
    const scopeKnown = (h.scopeTracked || 0) > 0 && h.widened !== null;
    const scopeLine = scopeKnown ? tr(', ואף אחת לא קיבלה סעיף נוסף באותו מחיר') : '';
    return {
      n, lost, enough: true, untested: !moved, need: 0,
      text: moved ? null
        : tr('כל {n} ההצעות שהוכרעו נסגרו, אף אחת לא ירדה במחיר{scopeLine}. זה לא אומר שהמחיר נכון — זה אומר שהוא לא נבדק. הקצה מתגלה בהצעה שלא נסגרה, ואין לך אחת כזאת.',
             { n: n, scopeLine: scopeLine })
    };
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
        ? tr('האומדן שלך משתפר: סטייה טיפוסית של {early}% בהתחלה מול {late}% במסירות האחרונות.',
             { early: pct(early), late: pct(late) })
        : tr('האומדן שלך לא משתפר: סטייה טיפוסית של {early}% בהתחלה מול {late}% במסירות האחרונות.',
             { early: pct(early), late: pct(late) })
    };
  }

  /* The half that keeps this honest. Everything the track record cannot
     yet say, and exactly what it would take — because a panel that shows
     only its conclusions reads as if the silence means agreement. */
  function unknowns(deals, labels, provLabels, ceil) {
    const list = deals || [];
    const acc = accuracy(list);
    const m = methods(list, labels);
    const p = provenance(list, provLabels);
    const out = [];

    if (!acc.enough) out.push({
      what: tr('כמה מדויק האומדן שלך'),
      need: MIN_DELIVERIES - acc.n,
      text: tr('צריך עוד {n} מסירות עם שעות מדווחות. עד אז טבלת האומדן נשארת מסומנת כלא-מכוילת.',
               { n: MIN_DELIVERIES - acc.n })
    });
    if (acc.n < MIN_FOR_TREND) out.push({
      what: tr('האם האומדן שלך משתפר'),
      need: MIN_FOR_TREND - acc.n,
      text: tr('צריך {n} מסירות כדי להשוות את הראשונות לאחרונות.', { n: MIN_FOR_TREND })
    });

    /* Same countdown shape as the two above, on the question the ledger can
       answer without any new behaviour from the operator — only more decided
       proposals. Silent once it is answerable, because then the finding itself
       is on screen and a countdown beside it would contradict it. */
    const c = ceil || ceiling(list, null);
    if (!c.enough) out.push({
      what: tr('האם המחיר שלך נבדק בכלל'),
      need: c.need,
      text: tr('צריך {n} הצעות שהוכרעו — נסגרו או נדחו. הצעה שממתינה לתשובה עדיין לא אומרת כלום על המחיר.',
               { n: MIN_FOR_CEILING })
    });

    const short = m.rows.filter(r => !r.enough);
    if (!m.rows.length) out.push({
      what: tr('איזו שיטת תמחור עובדת לך'),
      need: MIN_PER_METHOD,
      text: tr('צריך לפחות {n} הצעות באותה שיטה.', { n: MIN_PER_METHOD })
    });
    else if (short.length) out.push({
      what: tr('איזו שיטת תמחור עובדת לך'),
      need: Math.min(...short.map(r => MIN_PER_METHOD - r.quoted)),
      text: short.map(r => r.label + ' (' + r.quoted + '/' + MIN_PER_METHOD + ')').join(' · ') +
            tr(' — עוד לא מספיק כדי לומר משהו.')
    });

    /* Same threshold, same sentence shape as the method countdown above. The
       question is worth its own line because it is answerable from data the
       ledger already holds — the operator is not waiting on new behaviour,
       only on enough rows. */
    const provShort = p.rows.filter(r => !r.enough);
    if (!p.rows.length) out.push({
      what: tr('מאיפה הגיע המספר בהצעות שנסגרו'),
      need: MIN_PER_METHOD,
      text: tr('צריך לפחות {n} הצעות שנרשם בהן מאיפה הגיע המספר.', { n: MIN_PER_METHOD })
    });
    else if (provShort.length) out.push({
      what: tr('מאיפה הגיע המספר בהצעות שנסגרו'),
      need: Math.min.apply(null, provShort.map(r => MIN_PER_METHOD - r.quoted)),
      text: provShort.map(r => r.label + ' (' + r.quoted + '/' + MIN_PER_METHOD + ')').join(' · ') +
            tr(' — עוד לא מספיק כדי לומר משהו.')
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
      what: tr('מה זה לא'),
      need: 0,
      text: tr('זה {count} — לא מדד שוק ולא השוואה לאף אחד אחר. זה אומר לך אם האומדן שלך מדויק, לא אם המחיר שלך נכון.', {
        count: count(acc.n, tr('מסירה אחת שלך'), tr('מסירות שלך'))
      })
    });

    if (m.unattributed) out.push({
      what: tr('הצעות ישנות'),
      need: 0,
      text: tr('{count} לפני שהכלי תיעד איזו שיטה קבעה את המחיר בפועל, ולכן {clause} כאן. הצעות חדשות כן.', {
        count: count(m.unattributed, tr('הצעה אחת נשמרה'), tr('הצעות נשמרו')),
        clause: m.unattributed === 1 ? tr('היא לא נספרת') : tr('הן לא נספרות')
      })
    });

    /* The same disclosure on the second axis, and it is not optional. Found by
       rendering the panel in a browser: a deal with nothing recorded about the
       source of its number was correctly kept out of every bucket, and nothing
       on screen said so. Excluding a row quietly and excluding it visibly are
       two different products, and this panel is the one that says what it
       cannot answer. */
    /* A caveat used to live here saying that one of the four groups doubled as
       the form's default, so it necessarily mixed deals where somebody chose it
       with deals where nobody touched the question. It is gone because it stopped
       being true: the form's default is now 'unset', which is not one of the
       four and never becomes a group. Every row in this breakdown is a choice
       somebody made.

       Retired rather than kept as reassurance. A disclaimer that no longer
       describes the code is worse than none — it teaches the reader to discount
       the ones that do. */

    if (p.unattributed) out.push({
      what: tr('הצעות בלי מקור למספר'),
      need: 0,
      text: tr('{count} בלי שנרשם מאיפה הגיע המספר, ולכן {clause} בטבלה הזאת.', {
        count: count(p.unattributed, tr('הצעה אחת נשמרה'), tr('הצעות נשמרו')),
        clause: p.unattributed === 1 ? tr('היא לא נספרת') : tr('הן לא נספרות')
      })
    });

    return out;
  }

  /* The whole thing, or null when there is no history at all — an empty
     panel that explains what it would show is still an empty panel, and
     the ledger above it already says there is nothing saved. */
  /* `hold` comes from deals.js priceHold(). Optional, because report() is
     called from tests and from anywhere that has a deal list but no ledger
     instance — a missing hold simply means the ceiling stays unmeasurable, which
     is the same answer it gives below its threshold. */
  function report(deals, labels, provLabels, hold) {
    const list = (deals || []).filter(Boolean);
    if (!list.length) return null;
    const acc = accuracy(list);
    const m = methods(list, labels);
    const p = provenance(list, provLabels);
    const t = trend(list);
    const c = ceiling(list, hold);
    return {
      deals: list.length,
      accuracy: acc,
      methods: m,
      provenance: p,
      trend: t,
      ceiling: c,
      unknowns: unknowns(list, labels, provLabels, c),
      /* Nothing worth showing yet is different from nothing at all: the
         first is a countdown, the second is an empty state. */
      hasFindings: !!(acc.verdict || t || (c.untested && c.text) ||
        m.rows.some(r => r.enough) || p.rows.some(r => r.enough))
    };
  }

  /* What became sayable between two reports.

     The product has no server, so nothing can be pushed — but a threshold
     crossing is CAUSED by an action inside the tool (an outcome recorded, a past
     deal entered), which means the tool is already open at the moment it happens.
     The trigger is to say it, once, there. No channel, no permission, and no
     third-party attention to spend.

     It needs no new vocabulary either. unknowns() is already the list of what
     cannot yet be said, so a crossing is an item LEAVING that list. Defined as a
     set difference over that list, the announcement and the panel can never name
     different findings — the alternative was a second table of thresholds, which
     is how the two would drift.

     Strictly one direction. A restored backup or a deleted deal moves the ledger
     backwards, and announcing a regression as news would be worse than silence.
     A null `before` yields nothing: an empty ledger had no list to leave, which is
     the state every operator is in one action before their first crossing. */
  function crossed(before, after) {
    const was = ((before && before.unknowns) || []).map(u => u.what);
    const now = ((after && after.unknowns) || []).map(u => u.what);
    return was.filter(w => now.indexOf(w) === -1);
  }

  root.PC = root.PC || {};
  root.PC.history = {
    deliveries, accuracy, methods, provenance, trend, ceiling, crossed, unknowns, report,
    MIN_DELIVERIES, MIN_PER_METHOD, MIN_FOR_TREND, MIN_FOR_CEILING, CLOSE_ENOUGH
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.PC.history;
})(typeof window !== 'undefined' ? window : globalThis);
