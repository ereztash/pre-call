/* POST-CALL · a journal of transitions.
   Pure, storage injected, tested in Node.
   Why it works this way: docs/modules/pc-journal.md */
(function (root) {
  'use strict';

  const KEY = 'postcall_journal_v1';

  /* The vocabulary IS the contract, and it is closed. An unrecognised `what`
     is refused rather than stored, for the reason PROVENANCE is a closed list in
     deals.js: a string nobody defined becomes a group some panel later makes a
     claim about. */
  const WHAT = [
    'session',
    'deal.status',
    'deal.price',      // the quote moving while it is still being written
    'deal.scope',
    /* The two that close the loop. `deal.price` only ever sees priceQuoted, and
       priceQuoted does not move when an outcome is recorded — so the closing
       price landing below the quote, which is the fact this whole module was
       built to make visible, was the one fact it could not see. */
    'deal.closed',     // priceQuoted → closedPrice
    'deal.hours',      // estimatedHours → actualHours
    /* Without this, every count is higher than reality and nothing shows the
       gap: four saves and a deletion leave three deals and four save lines. */
    'deal.removed'
  ];

  /* localStorage is one quota shared with the ledger, the draft, the sender and
     the key. An unbounded log would eventually make saving a deal fail — the
     observation starving the thing observed — so it is capped. Oldest goes,
     because every question this answers is about recent movement. 500 lines is
     hundreds of deals' worth of transitions at four or five lines each. */
  const CAP = 500;

  /* Only these five keys survive, whatever the caller sends. Not a check on the
     caller's good manners: an allowlist, so free text cannot arrive by accident
     from a future call site that thought a note would be helpful. */
  const FIELDS = ['at', 'what', 'from', 'to', 'ref', 'retro'];
  const REF_MAX = 48;          // a generated id is ~22 chars; prose is not an id

  /* Two sends make a "median" that is the mean of two numbers wearing a
     statistician's hat. The rest of this product refuses to speak on thin
     evidence rather than speak quietly — pc-history.js will not draw a ceiling
     under six deals — and a duration is no different. */
  const MIN_FOR_MEDIAN = 3;

  function make(storage) {
    const read = () => {
      try {
        const l = JSON.parse(storage.getItem(KEY));
        return Array.isArray(l) ? l : [];
      } catch (e) { return []; }
    };
    const write = list => {
      try { storage.setItem(KEY, JSON.stringify(list)); return true; }
      catch (e) { return false; }
    };

    const same = (a, b) => String(a === undefined ? '' : a) === String(b === undefined ? '' : b);

    const api = {
      /* Returns the line, or null. Never throws, and never partially writes. */
      append(entry) {
        const e = entry || {};
        if (WHAT.indexOf(e.what) === -1) return null;
        // a transition that did not move is not a transition; a log of non-events
        // buries the events
        if (same(e.from, e.to)) return null;
        if (e.ref !== undefined && (typeof e.ref !== 'string' || e.ref.length > REF_MAX))
          return null;

        const line = { at: new Date().toISOString(), what: e.what };
        if (e.from !== undefined && e.from !== null) line.from = e.from;
        if (e.to !== undefined && e.to !== null) line.to = e.to;
        if (e.ref !== undefined) line.ref = e.ref;
        /* A deal typed in from memory looks exactly like one the tool watched
           happen, and any duration derived from it would be timing the data
           entry rather than the selling. Set only for a literal true, never
           coerced from a truthy value — that is what keeps a string out of the
           one field here that is not a status, a number or a generated id. */
        if (e.retro === true) line.retro = true;

        const list = read();
        list.push(line);
        // trimmed from the front, so the newest line is never the one dropped
        const kept = list.length > CAP ? list.slice(list.length - CAP) : list;
        return write(kept) ? line : null;
      },

      // oldest first: order is the data, and a reader that has to sort first is a
      // reader that will one day forget to
      list: () => read(),

      forDeal: (id, rows) => (rows || read()).filter(l => l.ref === id),

      sessions: () => read().filter(l => l.what === 'session').length,

      /* The middle of the negotiation, which has no state in the ledger at all —
         STATUS goes straight from 'sent' to an outcome, and that gap is exactly
         where the money is lost. Nothing here adds a status: the middle is
         derived from what moved and when relative to the send.

         `droppedBeforeSending` is the fact the product could not hold before this
         existed. priceQuoted is overwritten on every re-save, so a price that
         went from 12,000 to 10,000 while still a draft left no trace anywhere —
         and it is a different fact from a discount the client asked for.

         `all` is an optional already-read list, because the ledger asks this for
         every deal on screen in one render: without it each row re-reads and
         re-parses the whole log, which is O(deals × lines) and grows with both.
         Passed or not, the answer is identical — the second test below pins
         that, since an optimisation a caller has to opt into is an optimisation
         that can quietly diverge. */
      movement(id, all) {
        const rows = api.forDeal(id, all);
        /* Position, not the clock. `at` is millisecond resolution and a save
           followed immediately by a status change lands on the same value, so
           comparing timestamps put an event that happened after the send on the
           before side. The log is append-only and ordered, which is this whole
           module's argument — so the index IS the sequence, and reaching for the
           clock to re-derive it was the first version's mistake. */
        const sentIx = rows.findIndex(l => l.what === 'deal.status' && l.to === 'sent');
        const before = i => sentIx === -1 || i <= sentIx;
        /* Only transitions with a real `from`. The first line for any deal is
           null → N, which is the price being ESTABLISHED, not moving — counting it
           would report every deal as having moved its price once, and the number
           would then mean nothing. `priceFrom` is the first price that was ever
           departed from, which is the anchor the operator actually set. */
        const prices = rows.map((l, i) => [l, i])
          .filter(([l]) => l.what === 'deal.price' && l.from !== undefined && l.from !== null);
        const scopes = rows.map((l, i) => [l, i]).filter(([l]) => l.what === 'deal.scope');
        return {
          path: rows.filter(l => l.what === 'deal.status').map(l => l.to),
          priceMoves: prices.length,
          priceFrom: prices.length ? prices[0][0].from : null,
          priceTo: prices.length ? prices[prices.length - 1][0].to : null,
          scopeMoves: scopes.length,
          droppedBeforeSending: prices.some(([l, i]) => before(i) && +l.to < +l.from),
          grewAfterSending: scopes.some(([l, i]) => !before(i) && +l.to > +l.from)
        };
      },

      /* The funnel, and the reason it needs no identifier. The telemetry row
         carries no session id, so counts from the server are all it can ever
         give — a total, never a sequence. Here the log is local and one
         person's, so the operator's own order IS the funnel, and the whole
         privacy question the server version raises never comes up.

         Retro deals are counted and then held out of every duration. A deal
         typed in from memory reaches the log with its whole life inside one
         minute, and a median that included it would be timing the data entry
         rather than the selling.

         Returns null, not zero, for anything there is not yet enough evidence
         for — and `sendsNeeded` so a caller can say how much is missing instead
         of showing a quiet zero. Silence reads as agreement otherwise. */
      funnel(all) {
        const rows = all || read();
        const watched = rows.filter(l => l.retro !== true);
        const refs = pred => {
          const s = new Set();
          watched.forEach(l => { if (l.ref && pred(l)) s.add(l.ref); });
          return s;
        };
        const status = to => l => l.what === 'deal.status' && l.to === to;

        const retroRefs = new Set();
        rows.forEach(l => { if (l.retro === true && l.ref) retroRefs.add(l.ref); });

        /* Per deal, first line to the send. The first line is the save, because
           save() is what creates a deal — there is nothing earlier to measure
           from, and the session line belongs to the visit rather than the deal. */
        const mins = [];
        refs(status('sent')).forEach(id => {
          const mine = watched.filter(l => l.ref === id);
          const sent = mine.find(status('sent'));
          const t0 = Date.parse(mine[0].at), t1 = Date.parse(sent.at);
          if (isFinite(t0) && isFinite(t1) && t1 >= t0) mins.push(Math.round((t1 - t0) / 60000));
        });
        mins.sort((a, b) => a - b);
        const med = mins.length < MIN_FOR_MEDIAN ? null
          : (mins.length % 2 ? mins[(mins.length - 1) / 2]
             : Math.round((mins[mins.length / 2 - 1] + mins[mins.length / 2]) / 2));

        /* Two different facts about the same operator, reported apart because
           averaged together they describe neither: a price that fell before
           anyone had seen it, and a price that fell while it was being argued
           over. A price that held writes no closing line at all — the module
           refuses non-events everywhere — so this counts falls, and a caller
           that needs holds has to ask the ledger, which keeps both numbers. */
        let before = 0;
        refs(() => true).forEach(id => {
          if (api.movement(id, watched).droppedBeforeSending) before++;
        });

        return {
          sessions: rows.filter(l => l.what === 'session').length,
          deals: refs(() => true).size,
          sent: refs(status('sent')).size,
          decided: refs(l => l.what === 'deal.status' &&
                             ['won', 'lost', 'no_answer'].indexOf(l.to) > -1).size,
          removed: refs(l => l.what === 'deal.removed').size,
          retro: retroRefs.size,
          medianMinutesToSend: med,
          sendsNeeded: Math.max(0, MIN_FOR_MEDIAN - mins.length),
          droppedBeforeSending: before,
          closedLower: refs(l => l.what === 'deal.closed' && +l.to < +l.from).size
        };
      },

      clear() { try { storage.removeItem(KEY); return true; } catch (e) { return false; } }
    };
    return api;
  }

  root.PC = root.PC || {};
  root.PC.journalFactory = make;
  root.PC.JOURNAL_WHAT = WHAT;
  if (typeof localStorage !== 'undefined') root.PC.journal = make(localStorage);

  if (typeof module !== 'undefined' && module.exports)
    module.exports = { make, WHAT, CAP, KEY, FIELDS, MIN_FOR_MEDIAN };
})(typeof window !== 'undefined' ? window : globalThis);
