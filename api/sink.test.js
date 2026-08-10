/* node api/sink.test.js — no browser, no deps, no server.

   The sink used to be four lines with nothing to test: a console.log and a
   hardcoded `durable: false` that was simply true. Now it can be configured to
   deliver somewhere, which means it can fail, time out, be pointed at a bad
   URL, or quietly start dropping the rows it was added to keep. Each of those
   is a way for /api/health to report a durability it does not have — the exact
   failure this file's sibling was written to prevent on the license gate.

   Note what is NOT asserted: that a row which left this process arrived. That
   is not knowable from here, and a test pretending otherwise would be the
   inference problem again. What is knowable is where the row was sent, what was
   in it, and what happened to it when sending did not work. */
import assert from 'node:assert';

let pass = 0, fail = 0;
const test = async (name, fn) => {
  try { await fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

const { SINK } = await import('./_sink.js');

/* Env is read per call, not at import, so a test can vary it without cache
   tricks — and so a deployment that sets the variable after a warm start is
   not stuck reporting the answer from whenever the module first loaded. */
const withEnv = async (url, fn) => {
  const had = 'POSTCALL_EVENT_URL' in process.env, prev = process.env.POSTCALL_EVENT_URL;
  if (url === undefined) delete process.env.POSTCALL_EVENT_URL;
  else process.env.POSTCALL_EVENT_URL = url;
  try { return await fn(); }
  finally {
    if (had) process.env.POSTCALL_EVENT_URL = prev; else delete process.env.POSTCALL_EVENT_URL;
  }
};

// captures stdout so a fallback write is observable rather than assumed
const quiet = async fn => {
  const lines = [], orig = console.log;
  console.log = (...a) => lines.push(a.join(' '));
  try { await fn(); } finally { console.log = orig; }
  return lines;
};

// swaps global fetch, records what the sink actually sent
const withFetch = async (impl, fn) => {
  const calls = [], orig = globalThis.fetch;
  globalThis.fetch = async (url, opts) => { calls.push({ url, opts }); return impl(url, opts); };
  try { await fn(calls); } finally { globalThis.fetch = orig; }
  return calls;
};
const okResponse = () => ({ ok: true, status: 204 });

const ROW = { at: '2026-08-10T00:00:00.000Z', event: 'deal_saved', method: 'value',
              systems: 3, priceBucket: '8-20k', provenance: 'unprompted' };

console.log('\nwhat the sink says about itself');
await test('unconfigured, it reports stdout and does not claim durability', async () => {
  await withEnv(undefined, async () => {
    assert.strictEqual(SINK.durable, false);
    assert.strictEqual(SINK.target, 'stdout');
  });
});
await test('configured with an https URL, it reports a durable webhook', async () => {
  await withEnv('https://hooks.example.com/abc', async () => {
    assert.strictEqual(SINK.durable, true);
    assert.strictEqual(SINK.target, 'webhook');
  });
});
await test('an empty or whitespace value is unset, not a configured empty target', async () => {
  for (const v of ['', '   ']) {
    await withEnv(v, async () => assert.strictEqual(SINK.durable, false, JSON.stringify(v)));
  }
});
await test('a plain-http URL is refused rather than used', async () => {
  /* Not pedantry. These rows are anonymous but they are still a live feed of
     when somebody is pricing work and roughly for how much, and http means any
     hop can read it. A refused variable also surfaces as telemetryDurable:false
     on /api/health, which is visible; silently downgrading to cleartext is not. */
  await withEnv('http://hooks.example.com/abc', async () => {
    assert.strictEqual(SINK.durable, false);
    assert.strictEqual(SINK.target, 'stdout');
  });
});
await test('a value that is not a URL at all does not turn the flag on', async () => {
  for (const v of ['yes', 'true', 'hooks.example.com', 'postgres://x/y']) {
    await withEnv(v, async () => assert.strictEqual(SINK.durable, false, v));
  }
});
await test('a value that only looks like https is refused, not reported as durable', async () => {
  /* Raised in review, and the objection goes to the point of the flag. The first
     check here was /^https:\/\/\S+$/, which these all satisfy — and every one of
     them either throws inside fetch or sends somewhere nobody meant:

       https://?        new URL() throws
       https://#x       new URL() throws
       https:///path    parses, and "path" silently becomes the HOSTNAME
       https://.        parses, with a hostname that cannot resolve

     In each case /api/health reported telemetryDurable:true while every row went
     to short-lived stdout — the flag reading green exactly when it exists to show
     a deployment is misconfigured. Shape is all this can check; whether a
     well-formed host answers is what the fallback and the log are for. */
  for (const v of ['https://?', 'https://#x', 'https:///path', 'https://.', 'https://..']) {
    await withEnv(v, async () => {
      assert.strictEqual(SINK.durable, false, v + ' was accepted');
      assert.strictEqual(SINK.target, 'stdout', v + ' reported a webhook');
    });
  }
});
await test('a host with no dot in it is still allowed — that is how anyone tests this', () => {
  /* The pair to the test above, and the reason `https:///path` is rejected as an
     empty authority rather than by demanding a dot in the hostname. Demanding
     one would also have refused localhost, which is the first thing a person
     points this at before pointing it at anything real. Pinned so a later
     tightening has to argue with it. */
  return withEnv('https://localhost:8443/hook', async () => {
    assert.strictEqual(SINK.durable, true, 'localhost was refused');
    assert.strictEqual(SINK.target, 'webhook');
  });
});
await test('a URL with no path is accepted, and normalised the way fetch would', async () => {
  // the counterpart to the above: rejecting these would be validation theatre
  await withEnv('https://hooks.example.com', async () => {
    assert.strictEqual(SINK.durable, true);
    await withFetch(okResponse, async calls => {
      await quiet(() => SINK.write(ROW));
      assert.strictEqual(calls[0].url, 'https://hooks.example.com/');
    });
  });
});
await test('the target name never contains the URL', async () => {
  /* api/health prints target verbatim. A webhook URL is a credential — anyone
     holding it can write to the feed — and health is an unauthenticated GET. */
  await withEnv('https://hooks.example.com/s3cr3t-path', async () => {
    assert.ok(!/example\.com|s3cr3t/.test(SINK.target), SINK.target);
  });
});

console.log('\nwhere the row goes');
await test('unconfigured, the row goes to stdout in the format that was there before', async () => {
  await withEnv(undefined, async () => {
    const lines = await quiet(() => SINK.write(ROW));
    assert.strictEqual(lines.length, 1);
    assert.ok(lines[0].startsWith('POSTCALL_EVENT '));
    assert.deepStrictEqual(JSON.parse(lines[0].slice('POSTCALL_EVENT '.length)), ROW);
  });
});
await test('configured, the row is POSTed as JSON to exactly that URL', async () => {
  await withEnv('https://hooks.example.com/abc', async () => {
    await withFetch(okResponse, async calls => {
      await quiet(() => SINK.write(ROW));
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].url, 'https://hooks.example.com/abc');
      assert.strictEqual(calls[0].opts.method, 'POST');
      assert.match(calls[0].opts.headers['Content-Type'], /application\/json/);
      assert.deepStrictEqual(JSON.parse(calls[0].opts.body), ROW);
    });
  });
});
await test('nothing is added to the row on the way out', async () => {
  /* The whole privacy claim of this endpoint is that the row is the row: the
     bucketing in event.js is the only thing standing between a usage counter
     and a log of who is pricing what. A sink that helpfully attached an IP, a
     user agent or a hostname would undo it here, one layer below where anyone
     reviewing event.js would think to look. */
  await withEnv('https://hooks.example.com/abc', async () => {
    await withFetch(okResponse, async calls => {
      await quiet(() => SINK.write(ROW));
      const sent = JSON.parse(calls[0].opts.body);
      assert.deepStrictEqual(Object.keys(sent).sort(), Object.keys(ROW).sort());
    });
  });
});
await test('a successful delivery does not also write the row to the log', async () => {
  // duplicating it into stdout would put the thing being kept private back in
  // the one place this change exists to stop relying on
  await withEnv('https://hooks.example.com/abc', async () => {
    await withFetch(okResponse, async () => {
      const lines = await quiet(() => SINK.write(ROW));
      assert.deepStrictEqual(lines, []);
    });
  });
});

console.log('\nwhen the target answers, but not by accepting the row');
await test('the request refuses to follow a redirect', async () => {
  /* Raised in review, and confirmed against a real https server before fixing:
     with fetch's default redirect:'follow', a webhook answering 302 gets the
     POST, and then fetch reissues the request to the Location as a GET with no
     body. If that page answers 200 — and a redirect usually points at something
     that does — r.ok is true, write() reports delivered, the stdout fallback is
     skipped, and the row is gone. Every event, silently, with health reporting
     durable:true throughout. Measured: POST /hook then GET /landed, bodyLen 0,
     status 200.

     'manual' rather than 'error' because undici then hands back the real 3xx
     status instead of an opaque failure, so the log can name what is wrong with
     the URL rather than saying "fetch failed". */
  await withEnv('https://hooks.example.com/abc', async () => {
    await withFetch(okResponse, async calls => {
      await quiet(() => SINK.write(ROW));
      assert.strictEqual(calls[0].opts.redirect, 'manual',
        'fetch follows redirects by default, which turns this POST into a GET');
    });
  });
});
await test('a redirect is a failure with a reason, not a delivery', async () => {
  await withEnv('https://hooks.example.com/abc', async () => {
    for (const status of [301, 302, 303, 307, 308]) {
      await withFetch(() => ({ ok: false, status }), async () => {
        let r;
        const lines = await quiet(async () => { r = await SINK.write(ROW); });
        assert.strictEqual(r.delivered, false, status + ' counted as delivered');
        assert.strictEqual(lines.length, 1, status + ' dropped the row instead of logging it');
        assert.match(r.error, /redirect/i,
          status + ' reported as a generic failure — an operator reading the log needs to ' +
          'know the URL redirects, not that something went wrong: ' + r.error);
      });
    }
  });
});

console.log('\nwhen the target is not there');
await test('a rejected fetch never throws out of write()', async () => {
  /* An event is additive. A telemetry sink that can fail the request it is
     attached to has made the product worse than having no telemetry. */
  await withEnv('https://hooks.example.com/abc', async () => {
    await withFetch(() => { throw new Error('ECONNREFUSED'); }, async () => {
      await quiet(() => SINK.write(ROW));   // an unhandled throw fails this test
    });
  });
});
await test('a non-2xx response is treated as a failure, not a delivery', async () => {
  await withEnv('https://hooks.example.com/abc', async () => {
    await withFetch(() => ({ ok: false, status: 500 }), async () => {
      const lines = await quiet(() => SINK.write(ROW));
      assert.strictEqual(lines.length, 1,
        'a 500 counted as delivered — the row is gone and nothing said so');
    });
  });
});
await test('a failed delivery falls back to the log rather than dropping the row', async () => {
  await withEnv('https://hooks.example.com/abc', async () => {
    await withFetch(() => { throw new Error('ECONNREFUSED'); }, async () => {
      const lines = await quiet(() => SINK.write(ROW));
      assert.strictEqual(lines.length, 1);
      assert.deepStrictEqual(JSON.parse(lines[0].slice('POSTCALL_EVENT '.length)), ROW,
        'the fallback must carry the same row, not a summary of it');
    });
  });
});
await test('write() reports what happened, so a caller could act on it', async () => {
  await withEnv('https://hooks.example.com/abc', async () => {
    await withFetch(okResponse, async () => {
      const r = await SINK.write(ROW);
      assert.strictEqual(r.delivered, true);
      assert.strictEqual(r.sink, 'webhook');
    });
    await withFetch(() => { throw new Error('ECONNREFUSED'); }, async () => {
      let r;
      await quiet(async () => { r = await SINK.write(ROW); });
      assert.strictEqual(r.delivered, false);
      assert.strictEqual(r.sink, 'stdout');
      assert.ok(r.error, 'a failure with no reason attached is not much of a report');
    });
  });
});
await test('the request is given a deadline, so a hung target cannot hold a function open', async () => {
  await withEnv('https://hooks.example.com/abc', async () => {
    await withFetch(okResponse, async calls => {
      await quiet(() => SINK.write(ROW));
      const s = calls[0].opts.signal;
      assert.ok(s && typeof s.aborted === 'boolean',
        'no AbortSignal — a target that accepts the connection and never answers ' +
        'would stall the function until the platform kills it');
    });
  });
});

console.log('\nthe two endpoints still agree with it');
await test('health repeats the sink under both configurations', async () => {
  const health = (await import('./health.js')).default;
  const res = () => { const r = { payload: null };
    r.setHeader = () => {}; r.status = () => r; r.json = p => { r.payload = p; return r; }; r.end = () => r;
    return r; };
  let ip = 0;
  const ask = async () => { const r = res();
    await health({ method: 'GET', headers: { 'x-forwarded-for': '203.0.113.' + (++ip) },
                   socket: { remoteAddress: '127.0.0.1' } }, r);
    return r.payload; };

  await withEnv(undefined, async () => {
    const p = await ask();
    assert.strictEqual(p.telemetryDurable, false);
    assert.strictEqual(p.telemetrySink, 'stdout');
  });
  await withEnv('https://hooks.example.com/abc', async () => {
    const p = await ask();
    assert.strictEqual(p.telemetryDurable, true, 'a configured sink still reported as none');
    assert.strictEqual(p.telemetrySink, 'webhook');
    assert.ok(!JSON.stringify(p).includes('example.com'), 'the URL leaked into a public GET');
  });
});
await test('event.js waits for the write instead of firing and forgetting', async () => {
  /* On a serverless host the process is frozen once the handler returns, so a
     promise nobody awaited is a delivery that happens on some invocations and
     not others — and the ones it skips are invisible. */
  const fs = await import('node:fs');
  const url = await import('node:url');
  const src = fs.readFileSync(url.fileURLToPath(new URL('./event.js', import.meta.url)), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.match(src, /await\s+SINK\.write\(/,
    'SINK.write is a promise now — an unawaited call is a dropped event on a cold path');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
