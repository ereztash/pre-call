/* ============================================================
   POST-CALL · deal ledger
   Stage 4 of the flow: what actually happened after the proposal went out.

   This exists for one reason beyond convenience. The effort table was fitted
   backwards from the price it was supposed to produce, which makes it circular
   and unciteable. The only thing that breaks that circle is estimate-versus-
   actual across real deliveries — so the estimate is locked at quote time and
   compared to hours logged afterwards. Until enough deliveries exist the table
   stays marked uncalibrated, and the marker is removed by evidence rather than
   by editing the label.

   Storage is injected so the whole thing runs in Node without a browser.
   ============================================================ */
(function (root) {
  'use strict';

  const KEY = 'postcall_deals_v1';
  const STATUS = ['draft', 'sent', 'won', 'lost', 'no_answer'];
  const STATUS_LABEL = {
    draft: 'טיוטה', sent: 'נשלחה', won: 'נסגרה',
    lost: 'נדחתה', no_answer: 'ללא מענה'
  };

  /* Who moved the price, when the closing price came in under the quote.
     Recorded after delivery rather than asked before it, and only when the
     number actually dropped — if the price held there is nothing to attribute.

     Three values because two of them are answers and the third is the honest
     absence of one. 'unknown' is the default and is never inferred: a discount
     the client asked for and a discount the operator offered unasked call for
     opposite corrections, and guessing which one happened would manufacture
     exactly the finding this field exists to record. */
  const CONCESSION = ['client_asked', 'i_offered', 'unknown'];
  const CONCESSION_LABEL = {
    client_asked: 'הלקוח ביקש',
    i_offered:    'הצעת מעצמך',
    unknown:      'לא נרשם'
  };

  function make(storage) {
    const read = () => {
      try { return JSON.parse(storage.getItem(KEY)) || []; }
      catch (e) { return []; }
    };
    const write = list => {
      try { storage.setItem(KEY, JSON.stringify(list)); return true; }
      catch (e) { return false; } // private browsing / quota — the tool keeps working
    };

    // Object.assign copies keys whose value is undefined, so a caller passing
    // { id: undefined } would overwrite a freshly generated id with nothing —
    // and every save would then create another record.
    const defined = o => Object.fromEntries(
      Object.entries(o || {}).filter(([, v]) => v !== undefined));

    const api = {
      list: () => read().sort((a, b) => (b.created || '').localeCompare(a.created || '')),

      get: id => read().find(d => d.id === id) || null,

      /* A saved deal locks the estimate. Without that lock the comparison later
         is worthless — you would be checking actuals against a number that moved. */
      save(deal) {
        const list = read();
        deal = defined(deal);
        const i = deal.id ? list.findIndex(d => d.id === deal.id) : -1;
        if (i >= 0) {
          // update: merge only what was actually supplied. Applying the blank
          // defaults here would wipe fields the caller never mentioned — which
          // is exactly how a locked estimate would quietly become null.
          const merged = Object.assign({}, list[i], deal);
          list[i] = merged;
          return write(list) ? merged : null;
        }
        const now = deal.created || new Date().toISOString();
        const rec = Object.assign({
          id: 'd_' + now.replace(/\D/g, '') + '_' + (list.length + 1),
          created: now,
          status: 'draft',
          client: '',
          estimatedHours: null,
          priceQuoted: null,
          method: null,
          outcome: null
        }, deal);
        list.push(rec);
        return write(list) ? rec : null;
      },

      setStatus(id, status) {
        if (!STATUS.includes(status)) return null;
        const d = api.get(id); if (!d) return null;
        d.status = status;
        if (status === 'sent' && !d.sentAt) d.sentAt = new Date().toISOString();
        return api.save(d);
      },

      /* actualHours is the only field that can decalcify the effort model.
         closedPrice tells you whether the price survived contact. */
      recordOutcome(id, { closedPrice, actualHours, note, concession } = {}) {
        const d = api.get(id); if (!d) return null;
        const prev = d.outcome || {};
        d.outcome = {
          closedPrice: num(closedPrice),
          actualHours: num(actualHours),
          note: note || '',
          /* Carried over when the caller does not send one. The outcome form
             re-renders after every save and the hours field is the one an
             operator comes back to — dropping the answer they already gave,
             because that one control was not re-sent, would lose the only
             field here nobody can reconstruct later. */
          concession: conc(concession) || prev.concession || 'unknown',
          at: new Date().toISOString()
        };
        return api.save(d);
      },

      remove(id) { return write(read().filter(d => d.id !== id)); },
      clear() { try { storage.removeItem(KEY); return true; } catch (e) { return false; } },

      /* Estimate-versus-actual. Deliberately refuses to report anything under
         five deliveries: a ratio from two jobs is noise wearing a number, and
         this whole module exists because a confident number without evidence
         is what got the pricing model into trouble. */
      calibration(minDeliveries = 5) {
        const done = read().filter(d =>
          d.outcome && d.outcome.actualHours > 0 && d.estimatedHours > 0);
        const est = done.reduce((s, d) => s + d.estimatedHours, 0);
        const act = done.reduce((s, d) => s + d.outcome.actualHours, 0);
        return {
          n: done.length,
          enough: done.length >= minDeliveries,
          estimatedTotal: est,
          actualTotal: act,
          ratio: est > 0 ? +(act / est).toFixed(2) : null,
          suggestion: est > 0 && done.length >= minDeliveries
            ? (act > est
                ? 'האומדן שלך נמוך ב-' + Math.round((act / est - 1) * 100) + '%'
                : 'האומדן שלך גבוה ב-' + Math.round((1 - act / est) * 100) + '%')
            : null
        };
      },

      /* Win rate is reported only over decided deals. Counting sent-and-silent
         as a loss would flatter or damn the number depending on how long you
         wait, so undecided deals stay out of the denominator and are shown
         separately. */
      winRate() {
        const l = read();
        const decided = l.filter(d => d.status === 'won' || d.status === 'lost');
        return {
          won: l.filter(d => d.status === 'won').length,
          lost: l.filter(d => d.status === 'lost').length,
          undecided: l.filter(d => d.status === 'sent' || d.status === 'no_answer').length,
          rate: decided.length ? +(l.filter(d => d.status === 'won').length / decided.length).toFixed(2) : null
        };
      },

      /* Quoted versus closed — whether the price you sent is the price you got.

         avgDiscount is the mean across the deals that were actually
         discounted, not across every won deal. It used to be the latter,
         and the difference is not academic: five wins where four held and
         one gave 17% off reported "average discount 3.3%", which reads as
         "discounts here are trivial" when in fact one client got a sixth
         off the price. Averaging in the zeros answers a question nobody
         asks and buries the one they do.

         Nothing outside the tests ever read this — the function was
         written, commented and left dark — so the shape could be
         corrected rather than worked around. */
      priceHold() {
        const won = read().filter(d =>
          d.status === 'won' && d.priceQuoted > 0 && d.outcome && d.outcome.closedPrice > 0);
        if (!won.length) return { n: 0, held: null, discounted: 0, avgDiscount: null };
        const cut = won.filter(d => d.outcome.closedPrice < d.priceQuoted);
        const off = d => 1 - d.outcome.closedPrice / d.priceQuoted;
        const mean = rows => rows.length
          ? +(rows.reduce((s, d) => s + off(d), 0) / rows.length * 100).toFixed(1)
          : null;

        /* The same argument this function already makes about the zeros, one
           level in. A mean over every discount cannot tell "the client
           negotiated" from "you moved first", and those two demand opposite
           corrections: the first says the price was too high for this buyer,
           the second says nothing about the buyer at all. Reported apart, and
           the deals nobody answered for stay in their own column rather than
           being distributed across the two that mean something.

           Only discounted deals appear here. A deal that held its price was
           not conceded by anyone, whatever its field happens to say. */
        const byConcession = {};
        CONCESSION.forEach(k => {
          const rows = cut.filter(d => (d.outcome.concession || 'unknown') === k);
          byConcession[k] = { n: rows.length, avgDiscount: mean(rows) };
        });

        return {
          n: won.length,
          held: won.length - cut.length,
          discounted: cut.length,
          avgDiscount: mean(cut),
          byConcession
        };
      }
    };
    return api;
  }

  const num = v => { const n = parseFloat(v); return isFinite(n) && n > 0 ? n : null; };
  // anything outside the three reads as no answer, never as one of the two
  const conc = v => CONCESSION.indexOf(v) !== -1 ? v : null;

  root.PC = root.PC || {};
  root.PC.dealsFactory = make;
  root.PC.STATUS_LABEL = STATUS_LABEL;
  root.PC.STATUS = STATUS;
  root.PC.CONCESSION = CONCESSION;
  root.PC.CONCESSION_LABEL = CONCESSION_LABEL;
  if (typeof localStorage !== 'undefined') root.PC.deals = make(localStorage);

  if (typeof module !== 'undefined' && module.exports)
    module.exports = { make, STATUS, STATUS_LABEL, CONCESSION, CONCESSION_LABEL };
})(typeof window !== 'undefined' ? window : globalThis);
