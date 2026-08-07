/* node api/license.test.js — no browser, no deps, no server.

   api/guard.test.js covers the shared guard layer thoroughly; this covers
   what is actually specific to this handler — key matching, the three ways
   it can answer, and the audit log added after a review found that a
   guessing campaign against this exact endpoint left no trace anywhere but
   the rate limiter's own forgetful counter. Untested until now: this file
   existed with zero coverage of its own business logic. */
import handler from './license.js';
import assert from 'node:assert';

let pass = 0, fail = 0;
const test = async (name, fn) => {
  try { await fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

// each test gets its own IP so the shared rate-limit bucket in _guard.js
// cannot make one test's requests count against another's
let ipCounter = 0;
const nextIp = () => '203.0.113.' + (++ipCounter);

const req = (o = {}) => ({
  method: o.method || 'POST',
  headers: Object.assign({ 'x-forwarded-for': o.ip || nextIp() }, o.headers),
  body: o.body,
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

/* Every call under test goes through this, in or out of a test that cares
   about the log line — so the handler's own console.log never leaks into the
   test runner's output, and the audit-log tests below get the lines back to
   make assertions on instead of chasing a global spy. */
async function run(fn) {
  const lines = [];
  const orig = console.log;
  console.log = (...a) => lines.push(a.join(' '));
  try { await fn(); } finally { console.log = orig; }
  return lines;
}

(async () => {
  console.log('\nwhen no keys are configured');
  await test('answers valid:null rather than guessing either way', async () => {
    await withKeys(undefined, async () => {
      const r = res();
      await run(() => handler(req({ body: { key: 'PC-A1B2-C3DK' } }), r));
      assert.strictEqual(r.code, 200);
      assert.deepStrictEqual(r.payload, { valid: null, reason: 'not_configured' });
    });
  });
  await test('does not log an attempt — there is nothing yet to guess against', async () => {
    await withKeys(undefined, async () => {
      const lines = await run(() => handler(req({ body: { key: 'PC-A1B2-C3DK' } }), res()));
      assert.strictEqual(lines.length, 0, 'the not_configured path logged something');
    });
  });

  console.log('\nwhen keys are configured');
  await test('matches a configured key, case-insensitively', async () => {
    await withKeys('PC-A1B2-C3DK', async () => {
      const r = res();
      await run(() => handler(req({ body: { key: 'pc-a1b2-c3dk' } }), r));
      assert.deepStrictEqual(r.payload, { valid: true });
    });
  });
  await test('matches any key in a comma-separated list, whitespace tolerant', async () => {
    await withKeys(' PC-A1B2-C3DK , PC-9X8Y-7Z6W ', async () => {
      const r = res();
      await run(() => handler(req({ body: { key: 'PC-9X8Y-7Z6W' } }), r));
      assert.deepStrictEqual(r.payload, { valid: true });
    });
  });
  await test('refuses a well-shaped key that is not on the list', async () => {
    await withKeys('PC-A1B2-C3DK', async () => {
      const r = res();
      await run(() => handler(req({ body: { key: 'PC-ZZZZ-ZZZZ' } }), r));
      assert.deepStrictEqual(r.payload, { valid: false });
      assert.strictEqual(r.code, 200, 'a wrong guess is not itself an error');
    });
  });
  await test('rejects a malformed key before it ever reaches the key list', async () => {
    await withKeys('PC-A1B2-C3DK', async () => {
      const r = res();
      await run(() => handler(req({ body: { key: 'not-a-key' } }), r));
      assert.strictEqual(r.code, 400);
      assert.deepStrictEqual(r.payload, { valid: false });
    });
  });
  await test('an absent key is treated the same as a malformed one', async () => {
    await withKeys('PC-A1B2-C3DK', async () => {
      const r = res();
      await run(() => handler(req({ body: {} }), r));
      assert.strictEqual(r.code, 400);
    });
  });

  console.log('\nthe audit log — added after a review found this endpoint left no trace');
  await test('a wrong guess is logged, with an outcome and a source', async () => {
    await withKeys('PC-A1B2-C3DK', async () => {
      const ip = nextIp();
      const lines = await run(() => handler(req({ ip, body: { key: 'PC-ZZZZ-ZZZZ' } }), res()));
      assert.strictEqual(lines.length, 1);
      assert.ok(lines[0].startsWith('POSTCALL_LICENSE '));
      const row = JSON.parse(lines[0].slice('POSTCALL_LICENSE '.length));
      assert.strictEqual(row.outcome, 'invalid');
      assert.strictEqual(row.ip, ip);
      assert.ok(row.at, 'no timestamp — an attempt with no "when" is not an audit trail');
    });
  });
  await test('a correct key is logged too — an audit trail needs the successes as well', async () => {
    await withKeys('PC-A1B2-C3DK', async () => {
      const lines = await run(() => handler(req({ body: { key: 'PC-A1B2-C3DK' } }), res()));
      const row = JSON.parse(lines[0].slice('POSTCALL_LICENSE '.length));
      assert.strictEqual(row.outcome, 'valid');
    });
  });
  await test('the guessed key itself never appears in the log line', async () => {
    await withKeys('PC-A1B2-C3DK', async () => {
      const guess = 'PC-SECR-ETXY';
      const lines = await run(() => handler(req({ body: { key: guess } }), res()));
      assert.ok(!lines.join('\n').includes('SECR'),
        'logging the guess is one grep away from logging a real key that was ' +
        'simply mistyped');
    });
  });
  await test('a malformed guess is logged too, distinctly from a wrong-but-shaped one', async () => {
    await withKeys('PC-A1B2-C3DK', async () => {
      const lines = await run(() => handler(req({ body: { key: 'garbage' } }), res()));
      const row = JSON.parse(lines[0].slice('POSTCALL_LICENSE '.length));
      assert.strictEqual(row.outcome, 'malformed');
    });
  });

  console.log('\nmethod and size guards are actually wired in, not just present in _guard.js');
  await test('refuses a GET', async () => {
    const r = res();
    await run(() => handler(req({ method: 'GET' }), r));
    assert.strictEqual(r.code, 405);
  });
  await test('refuses an oversized body', async () => {
    const r = res();
    await run(() => handler(req({ headers: { 'content-length': '999999' } }), r));
    assert.strictEqual(r.code, 413);
  });
  await test('the tenth attempt from one source still gets an answer, the eleventh does not', async () => {
    await withKeys('PC-A1B2-C3DK', async () => {
      const ip = nextIp();
      let last;
      await run(async () => {
        for (let i = 0; i < 10; i++) last = res(), await handler(req({ ip, body: { key: 'PC-ZZZZ-ZZZZ' } }), last);
      });
      assert.notStrictEqual(last.code, 429, 'the tenth try inside the window must still be answered');
      const eleventh = res();
      await run(() => handler(req({ ip, body: { key: 'PC-ZZZZ-ZZZZ' } }), eleventh));
      assert.strictEqual(eleventh.code, 429, 'the eleventh try is what the limit exists to stop');
    });
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})();
