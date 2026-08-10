/* node api/health.test.js — no browser, no deps, no server.

   This endpoint exists for one reason: POSTCALL_KEYS being unset must never
   be a silent failure on a live deployment. The whole test file is really
   one question asked from a few angles — does licenseEnforced actually
   track whether the environment variable is set, or could it drift and lie. */
import handler from './health.js';
import assert from 'node:assert';

let pass = 0, fail = 0;
const test = async (name, fn) => {
  try { await fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

let ipCounter = 0;
const nextIp = () => '192.0.2.' + (++ipCounter);

const req = (o = {}) => ({
  method: o.method || 'GET',
  headers: Object.assign({ 'x-forwarded-for': o.ip || nextIp() }, o.headers),
  socket: { remoteAddress: '127.0.0.1' }
});

const res = () => {
  const r = { code: null, payload: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.status = c => { r.code = c; return r; };
  r.json = p => { r.payload = p; return r; };
  r.end = () => r;
  return r;
};

const withKeys = async (csv, fn) => {
  const had = 'POSTCALL_KEYS' in process.env, prev = process.env.POSTCALL_KEYS;
  if (csv === undefined) delete process.env.POSTCALL_KEYS; else process.env.POSTCALL_KEYS = csv;
  try { await fn(); }
  finally { if (had) process.env.POSTCALL_KEYS = prev; else delete process.env.POSTCALL_KEYS; }
};

(async () => {
  console.log('\nthe one thing this endpoint exists to make visible');
  await test('reports the gate as off when POSTCALL_KEYS is unset', async () => {
    await withKeys(undefined, async () => {
      const r = res();
      await handler(req(), r);
      assert.strictEqual(r.code, 200);
      assert.strictEqual(r.payload.licenseEnforced, false);
      assert.strictEqual(r.payload.licenseKeyCount, 0);
    });
  });
  await test('reports the gate as on the moment a key is configured', async () => {
    await withKeys('PC-A1B2-C3DK', async () => {
      const r = res();
      await handler(req(), r);
      assert.strictEqual(r.payload.licenseEnforced, true);
      assert.strictEqual(r.payload.licenseKeyCount, 1);
    });
  });
  await test('an empty string is the same as unset, not one empty key', async () => {
    await withKeys('', async () => {
      const r = res();
      await handler(req(), r);
      assert.strictEqual(r.payload.licenseEnforced, false);
      assert.strictEqual(r.payload.licenseKeyCount, 0);
    });
  });
  await test('trailing commas and blank entries do not inflate the count', async () => {
    await withKeys('PC-A1B2-C3DK,,PC-9X8Y-7Z6W,', async () => {
      const r = res();
      await handler(req(), r);
      assert.strictEqual(r.payload.licenseKeyCount, 2);
    });
  });

  console.log('\nwhat it must never say');
  await test('never echoes the configured keys themselves', async () => {
    await withKeys('PC-A1B2-C3DK,PC-9X8Y-7Z6W', async () => {
      const r = res();
      await handler(req(), r);
      const dump = JSON.stringify(r.payload);
      assert.ok(!dump.includes('A1B2') && !dump.includes('9X8Y'),
        'a health check is not the place a real key should ever appear');
    });
  });

  console.log('\nshape');
  await test('reports ok, a timestamp, and the node version', async () => {
    const r = res();
    await handler(req(), r);
    assert.strictEqual(r.payload.ok, true);
    assert.ok(!isNaN(Date.parse(r.payload.at)), 'at is not a parseable timestamp');
    assert.ok(r.payload.node.startsWith('v'));
  });

  console.log('\nguards');
  await test('refuses a POST — this is a read, not an action', async () => {
    const r = res();
    await handler(req({ method: 'POST' }), r);
    assert.strictEqual(r.code, 405);
  });
  await test('a dashboard polling once a minute is never throttled', async () => {
    const ip = nextIp();
    for (let i = 0; i < 30; i++) {
      const r = res();
      await handler(req({ ip }), r);
      assert.notStrictEqual(r.code, 429, 'check #' + (i + 1) + ' of 30 was throttled');
    }
  });

  console.log('\ndoes the usage counter keep anything');
  /* The same question this file already asks about licenseEnforced, on the other
     endpoint: could the flag drift and lie.

     The first version of this section answered it by reading event.js and
     inferring from the tokens in it. Raised in review, and the objection was
     right in both directions: any unrelated `fetch` would have forced the flag
     true, and a real store written through an API the list had not heard of —
     `pool.query`, `PutCommand` — would have forced it false. A check that can
     certify a false health response is worse than no check, which is the same
     standard this project already applies to a skip that looks like a pass.

     So nothing is inferred. api/_sink.js declares what happens to an event;
     event.js writes through it and this endpoint repeats what it says. What is
     left to test is that the declaration is actually the one in force. */
  const { SINK } = await import('./_sink.js');

  await test('health repeats what the sink declares, rather than its own copy', async () => {
    const r = res();
    await handler(req({ ip: nextIp() }), r);
    assert.strictEqual(typeof r.payload.telemetryDurable, 'boolean',
      'a deployment has to see this from outside, not by reading the source');
    assert.strictEqual(r.payload.telemetryDurable, SINK.durable);
    assert.strictEqual(r.payload.telemetrySink, SINK.target);
  });
  await test('the event endpoint writes through that same sink and nowhere else', async () => {
    /* This one is sound where the token scan was not, because it is not asking
       whether something persists — it is asking whether event.js still routes
       through the single declaration. A second write path added beside it is
       exactly how the flag and the behaviour would come apart again. */
    const fs = await import('node:fs');
    const url = await import('node:url');
    const src = fs.readFileSync(
      url.fileURLToPath(new URL('./event.js', import.meta.url)), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(/SINK\.write\(/.test(src), 'event.js must write through api/_sink.js');
    assert.ok(!/console\.log\(/.test(src),
      'a write beside the sink is how the declaration stops describing reality');
  });
  await test('the sink says where events go without leaking how to reach it', async () => {
    const r = res();
    await handler(req({ ip: nextIp() }), r);
    const dump = JSON.stringify(r.payload);
    assert.ok(!/(https?:\/\/|postgres:|redis:|@|password|secret|token)/i.test(dump),
      'a health check is not the place a connection string should ever appear');
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})();
