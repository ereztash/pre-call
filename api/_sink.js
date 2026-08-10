/* Where a usage event goes, and whether that place keeps it.

   One declaration, two consumers: api/event.js writes through it, api/health.js
   reports what it says. The point is that those two facts sit in one file, so
   they cannot disagree.

   The first version of this contract was a test that read event.js and guessed
   from the tokens in it — a `fetch` anywhere meant durable, and a real sink
   written through an API the list had not heard of (`pool.query`, `PutCommand`)
   meant not durable. Raised in review, and the objection is right in both
   directions: that check could certify a health response that was false, and
   block one that was true. Persistence is not a property you can infer from
   source text, so it is declared instead.

   What changed: it was stdout and nothing else, with `durable: false` written
   in by hand, and the comment here said wiring a real store was a decision for
   whoever runs this. It still is — the decision is now a variable rather than a
   patch. Set POSTCALL_EVENT_URL to an https endpoint and rows go there;
   leave it unset and nothing about this deployment changes.

   The flag is derived from that variable instead of asserted, which is the
   whole reason this file exists. Nobody can now configure a sink and leave
   /api/health saying there isn't one, or remove one and leave it saying there
   is. There is deliberately nothing clever holding them in sync: they are the
   same expression.

   What `durable: true` claims, exactly: rows are being sent somewhere outside
   the host's log window, which runs from an hour to a day. It does not claim
   every row arrived — that is not knowable from inside this process, and a
   delivery that fails writes to stdout instead of vanishing, so a failing
   webhook degrades to the old behaviour rather than to silence. It cannot be
   reported through /api/health either: each invocation is its own process, so
   there is no failure count here to read. The log is the record of that.

   Read per call rather than at import, so a variable set after a warm start
   takes effect and a test can vary it without cache tricks. */

/* Only https. These rows are anonymous, but a live feed of when somebody is
   pricing work and roughly for how much is still worth not handing to every hop
   on the way. A refused value reports as telemetryDurable:false, which is
   visible from outside; silently downgrading to cleartext would not be. */
const url = () => {
  const v = (process.env.POSTCALL_EVENT_URL || '').trim();
  return /^https:\/\/\S+$/.test(v) ? v : '';
};

/* A target that accepts the connection and then never answers is the case that
   matters: without a deadline it holds the function open until the platform
   kills it, and the 204 the client is waiting on goes with it. */
const DEADLINE_MS = 2000;

const toLog = row => { console.log('POSTCALL_EVENT ' + JSON.stringify(row)); };

export const SINK = {
  /* Does anything survive past the host's log window. */
  get durable() { return !!url(); },
  /* Named so a health response can say where events go without exposing the
     URL — anyone holding it can write to the feed, and health is an
     unauthenticated GET. */
  get target() { return url() ? 'webhook' : 'stdout'; },

  /* Returns what happened rather than nothing, so a caller has the option of
     acting on a failure. Never throws: an event is additive, and telemetry that
     can fail the request it rides on has made the product worse than no
     telemetry at all. */
  async write(row) {
    const to = url();
    if (!to) { toLog(row); return { delivered: false, sink: 'stdout' }; }
    try {
      const r = await fetch(to, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // the row as event.js bucketed it, and nothing else — no IP, no user
        // agent, no hostname. The bucketing is the privacy claim; adding to it
        // here would undo that a layer below where anyone reviewing event.js
        // would think to look.
        body: JSON.stringify(row),
        signal: AbortSignal.timeout(DEADLINE_MS)
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return { delivered: true, sink: 'webhook' };
    } catch (e) {
      toLog(row);
      return { delivered: false, sink: 'stdout', error: e.name || 'error' };
    }
  }
};
