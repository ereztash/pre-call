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
   visible from outside; silently downgrading to cleartext would not be.

   Parsed rather than pattern-matched. The first version was /^https:\/\/\S+$/,
   and `https://?` satisfies it — as do `https://#x`, which also throws inside
   fetch, and `https:///path`, which parses with "path" silently promoted to the
   hostname. Each one left /api/health reporting telemetryDurable:true while
   every row went to short-lived stdout, which is the flag reading green in
   precisely the case it exists to expose. Raised in review.

   Two clauses beyond that, both for values `new URL` accepts rather than throws
   on. `https://.` and `https://..` parse with a hostname no resolver can answer.
   And `https:///path` has an EMPTY authority, so the parser promotes the first
   path segment: it becomes a request to a host named "path". One keystroke too
   many, and nothing downstream would have said a word.

   That second one is checked as an empty authority rather than by requiring a
   dot in the hostname, which was the other obvious rule and is worse: it also
   outlaws `https://localhost/…` and single-label internal hosts, which are how
   anyone would test this before pointing it at anything real.

   Shape is the limit of what can be checked here. Whether a well-formed host
   actually accepts a POST is what the fallback and the log are for, and the flag
   says as much out loud. */
const url = () => {
  const v = (process.env.POSTCALL_EVENT_URL || '').trim();
  if (!v) return '';
  if (/^https:\/\/\//i.test(v)) return '';     // empty authority
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:' || !/[^.]/.test(u.hostname)) return '';
    return u.href;
  } catch (e) { return ''; }
};

/* A target that accepts the connection and then never answers is the case that
   matters: without a deadline it holds the function open until the platform
   kills it, and the 204 the client is waiting on goes with it. */
const DEADLINE_MS = 2000;

const toLog = row => { console.log('POSTCALL_EVENT ' + JSON.stringify(row)); };

/* The reason is built here rather than passed through from fetch, so that a
   message like "request to https://… failed" can never carry the URL into a
   return value. Status codes and error class names only. */
const fallback = (row, error) => {
  toLog(row);
  return { delivered: false, sink: 'stdout', error };
};

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
        /* fetch follows redirects by default, and a redirect is where this goes
           wrong quietly rather than loudly. Measured against a real server: the
           POST reaches the webhook, fetch then reissues the request to the
           Location as a GET with no body, and a 200 from that page made r.ok
           true — so the row was never posted, the fallback was skipped, and
           write() reported delivered. Every event, silently, with health saying
           durable throughout. Raised in review.

           'manual' rather than 'error' because undici then returns the real 3xx
           status instead of an opaque failure, so the log can say the URL
           redirects instead of "fetch failed". */
        redirect: 'manual',
        signal: AbortSignal.timeout(DEADLINE_MS)
      });
      /* Named separately from the generic non-2xx case: a redirect is a fixable
         mistake in one environment variable, and an operator reading the log
         should be told that rather than left with a status code. */
      if (r.status >= 300 && r.status < 400) return fallback(row, 'redirect ' + r.status);
      if (!r.ok) return fallback(row, 'HTTP ' + r.status);
      return { delivered: true, sink: 'webhook' };
    } catch (e) {
      return fallback(row, e.name || 'error');
    }
  }
};
