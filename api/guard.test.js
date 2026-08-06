/* node api/guard.test.js — no browser, no deps, no server.

   The guards are the only thing standing between /api/license and anyone who
   wants to enumerate keys, so they get tested rather than trusted. */
import { rateLimit, tooLarge, parseBody, constantTimeEquals, clientIp, preflight }
  from './_guard.js';
import assert from 'node:assert';

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

const req = (o = {}) => ({
  method: o.method || 'POST',
  headers: Object.assign({ 'x-forwarded-for': o.ip || '1.2.3.4' }, o.headers),
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

console.log('\nrate limit');
test('allows up to the limit and then refuses', () => {
  const opts = { limit: 3, windowMs: 60_000, bucket: 't1' };
  const r = req({ ip: '10.0.0.1' });
  assert.strictEqual(rateLimit(r, opts), 0);
  assert.strictEqual(rateLimit(r, opts), 0);
  assert.strictEqual(rateLimit(r, opts), 0);
  assert.ok(rateLimit(r, opts) > 0, 'the fourth request inside the window is refused');
});
test('a refusal says how long to wait', () => {
  const opts = { limit: 1, windowMs: 60_000, bucket: 't2' };
  const r = req({ ip: '10.0.0.2' });
  rateLimit(r, opts);
  const wait = rateLimit(r, opts);
  assert.ok(wait > 0 && wait <= 60, 'seconds, within the window: ' + wait);
});
test('one client being blocked does not block another', () => {
  const opts = { limit: 1, windowMs: 60_000, bucket: 't3' };
  rateLimit(req({ ip: '10.0.0.3' }), opts);
  assert.ok(rateLimit(req({ ip: '10.0.0.3' }), opts) > 0);
  assert.strictEqual(rateLimit(req({ ip: '10.0.0.4' }), opts), 0);
});
test('buckets are independent, so telemetry cannot exhaust the key check', () => {
  const r = req({ ip: '10.0.0.5' });
  rateLimit(r, { limit: 1, windowMs: 60_000, bucket: 'event' });
  assert.ok(rateLimit(r, { limit: 1, windowMs: 60_000, bucket: 'event' }) > 0);
  assert.strictEqual(rateLimit(r, { limit: 1, windowMs: 60_000, bucket: 'license' }), 0);
});
test('the window slides — old hits stop counting', () => {
  const opts = { limit: 2, windowMs: 1, bucket: 't4' };
  const r = req({ ip: '10.0.0.6' });
  rateLimit(r, opts); rateLimit(r, opts);
  const start = Date.now();
  while (Date.now() - start < 3) { /* let the 1ms window pass */ }
  assert.strictEqual(rateLimit(r, opts), 0, 'the window expired, the client is allowed again');
});
test('takes the first hop of x-forwarded-for, not the last', () => {
  assert.strictEqual(
    clientIp(req({ headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1, 10.0.0.2' } })), '9.9.9.9');
});

console.log('\nbody size');
test('refuses an oversized content-length', () => {
  assert.strictEqual(tooLarge(req({ headers: { 'content-length': '999999' } }), 1024), true);
  assert.strictEqual(tooLarge(req({ headers: { 'content-length': '200' } }), 1024), false);
});
test('refuses an oversized raw string body even with no content-length', () => {
  assert.strictEqual(tooLarge(req({ body: 'x'.repeat(5000) }), 1024), true);
});
test('a missing content-length is not treated as oversized', () => {
  assert.strictEqual(tooLarge(req({ body: { event: 'opened' } }), 1024), false);
});

console.log('\nbody parsing');
test('parses a json string body', () => {
  assert.deepStrictEqual(parseBody(req({ body: '{"event":"opened"}' })), { event: 'opened' });
});
test('malformed json degrades to empty rather than throwing', () => {
  assert.deepStrictEqual(parseBody(req({ body: '{not json' })), {});
});
test('an array body is not accepted as an object', () => {
  assert.deepStrictEqual(parseBody(req({ body: [1, 2, 3] })), {},
    'otherwise body.event reads off an array and the type checks get confusing');
});
test('null and undefined bodies are safe', () => {
  assert.deepStrictEqual(parseBody(req({ body: null })), {});
  assert.deepStrictEqual(parseBody(req({})), {});
});

console.log('\nkey comparison');
test('matches an identical key', () => {
  assert.strictEqual(constantTimeEquals('PC-A1B2-C3DK', 'PC-A1B2-C3DK'), true);
});
test('rejects a different key of the same length', () => {
  assert.strictEqual(constantTimeEquals('PC-A1B2-C3DK', 'PC-A1B2-C3DX'), false);
});
test('rejects a different length without throwing', () => {
  assert.strictEqual(constantTimeEquals('PC-A1B2-C3DK', 'PC-A1B2'), false);
  assert.strictEqual(constantTimeEquals('', 'PC-A1B2-C3DK'), false);
});

console.log('\npreflight');
test('rejects the wrong method with Allow set', () => {
  const r = res();
  assert.strictEqual(preflight(req({ method: 'GET', ip: '11.0.0.1' }), r, { limit: 5, windowMs: 60_000, bucket: 'p1' }), false);
  assert.strictEqual(r.code, 405);
  assert.strictEqual(r.headers.allow, 'POST');
});
test('rejects an oversized body with 413', () => {
  const r = res();
  const q = req({ ip: '11.0.0.2', headers: { 'content-length': '99999' } });
  assert.strictEqual(preflight(q, r, { maxBytes: 512, limit: 5, windowMs: 60_000, bucket: 'p2' }), false);
  assert.strictEqual(r.code, 413);
});
test('rejects past the limit with 429 and Retry-After', () => {
  const opts = { limit: 1, windowMs: 60_000, bucket: 'p3' };
  const q = req({ ip: '11.0.0.3' });
  preflight(q, res(), opts);
  const r = res();
  assert.strictEqual(preflight(q, r, opts), false);
  assert.strictEqual(r.code, 429);
  assert.ok(Number(r.headers['retry-after']) > 0);
});
test('a good request passes and is marked no-store', () => {
  const r = res();
  assert.strictEqual(preflight(req({ ip: '11.0.0.4' }), r, { limit: 5, windowMs: 60_000, bucket: 'p4' }), true);
  assert.strictEqual(r.code, null, 'preflight must not answer for a request it allows');
  assert.strictEqual(r.headers['cache-control'], 'no-store',
    'a cached license answer would outlive the key it describes');
  assert.strictEqual(r.headers['x-content-type-options'], 'nosniff');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
