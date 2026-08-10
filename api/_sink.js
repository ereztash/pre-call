/* Where a usage event goes, and whether that place keeps it.

   One declaration, two consumers: api/event.js writes through it, api/health.js
   reports what it says. The point is that those two facts sit three lines apart
   in one file, so they cannot disagree.

   The first version of this contract was a test that read event.js and guessed
   from the tokens in it — a `fetch` anywhere meant durable, and a real sink
   written through an API the list had not heard of (`pool.query`, `PutCommand`)
   meant not durable. Raised in review, and the objection is right in both
   directions: that check could certify a health response that was false, and
   block one that was true. Persistence is not a property you can infer from
   source text, so it is declared instead.

   Today it is stdout and nothing else. Hosted log retention runs from an hour to
   a day depending on the plan, so an event is discarded faster than it
   accumulates and no month of them exists to read. That is the state, not a bug,
   and /api/health says so from outside rather than leaving it to be found by
   reading code.

   Whoever wires a real store changes write() and durable together, here. There
   is deliberately nothing clever holding them in sync: colocation is the
   mechanism, because every alternative has to infer something. */
export const SINK = {
  /* Does anything survive past the host's log window. */
  durable: false,
  /* Named so a health response can say where events go without exposing a
     connection string. */
  target: 'stdout',
  write(row) {
    console.log('POSTCALL_EVENT ' + JSON.stringify(row));
  }
};
