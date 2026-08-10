/* ============================================================
   POST-CALL · a journal of transitions.

   The product is good at snapshots and blind to transitions, and the four
   sub-topics that score worst are the same defect wearing four hats: the moment
   after a call, the middle of a negotiation, whether anybody got anywhere, and
   whether money moved. Every one of them is a transition, and a transition is
   only observable if the state before it was kept.

   The ledger keeps a baseline in exactly three places — estimatedHours locked at
   save, scopeAtQuote locked at send, and the in-memory report snapshot behind the
   crossing trigger. Each was added deliberately and each unlocked a whole class
   of finding. Everywhere else there is no "before" at all, because
   storage.setItem() overwrites the entire list on every write. This is the
   general case of those three.

   What it is NOT: a second copy of the ledger, and not analytics. It answers one
   shape of question the ledger structurally cannot — what moved, and in which
   order — and it holds nothing that could not be shown to a stranger.

   Two properties are load-bearing:

     1. It can never break the thing it observes. deals.js reports a failed write
        to the operator as a real failure, so if journaling could throw, an
        observation would be able to fail a save. Every path returns null instead.
     2. No free text, ever. It is local, but pc-backup.js round-trips it into a
        downloadable file, so it holds the same discipline as the telemetry row:
        statuses, counts, generated ids. A client name cannot get in even if a
        caller passes one.

   Pure, storage injected, tested in Node.
   ============================================================ */
(function (root) {
  'use strict';

  const KEY = 'postcall_journal_v1';

  /* The vocabulary IS the contract, and it is closed. An unrecognised `what`
     is refused rather than stored, for the reason PROVENANCE is a closed list in
     deals.js: a string nobody defined becomes a group some panel later makes a
     claim about. */
  const WHAT = ['session', 'deal.status', 'deal.price', 'deal.scope'];

  /* localStorage is one quota shared with the ledger, the draft, the sender and
     the key. An unbounded log would eventually make saving a deal fail — the
     observation starving the thing observed — so it is capped. Oldest goes,
     because every question this answers is about recent movement. 500 lines is
     hundreds of deals' worth of transitions at four or five lines each. */
  const CAP = 500;

  /* Only these five keys survive, whatever the caller sends. Not a check on the
     caller's good manners: an allowlist, so free text cannot arrive by accident
     from a future call site that thought a note would be helpful. */
  const FIELDS = ['at', 'what', 'from', 'to', 'ref'];
  const REF_MAX = 48;          // a generated id is ~22 chars; prose is not an id

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

      clear() { try { storage.removeItem(KEY); return true; } catch (e) { return false; } }
    };
    return api;
  }

  root.PC = root.PC || {};
  root.PC.journalFactory = make;
  root.PC.JOURNAL_WHAT = WHAT;
  if (typeof localStorage !== 'undefined') root.PC.journal = make(localStorage);

  if (typeof module !== 'undefined' && module.exports)
    module.exports = { make, WHAT, CAP, KEY, FIELDS };
})(typeof window !== 'undefined' ? window : globalThis);
