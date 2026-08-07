/* node api/event.test.js — no browser, no deps, no server.

   This endpoint's whole job is refusing to become the thing it promises not
   to be — client names, process text, exact prices. That is a claim worth
   testing directly rather than trusting the source to keep matching the
   comment describing it. */
import handler from './event.js';
import assert from 'node:assert';

let pass = 0, fail = 0;
const test = async (name, fn) => {
  try { await fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

let ipCounter = 0;
const nextIp = () => '198.51.100.' + (++ipCounter);

const req = (o = {}) => ({
  method: o.method || 'POST',
  headers: Object.assign({ 'x-forwarded-for': o.ip || nextIp() }, o.headers),
  body: o.body,
  socket: { remoteAddress: '127.0.0.1' }
});

const res = () => {
  const r = { code: null, payload: null, headers: {}, ended: false };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.status = c => { r.code = c; return r; };
  r.json = p => { r.payload = p; return r; };
  r.end = () => { r.ended = true; return r; };
  return r;
};

async function run(fn) {
  const lines = [];
  const orig = console.log;
  console.log = (...a) => lines.push(a.join(' '));
  try { await fn(); } finally { console.log = orig; }
  return lines;
}
const rowOf = lines => JSON.parse(lines[0].slice('POSTCALL_EVENT '.length));

(async () => {
  console.log('\naccepted events');
  await test('a known event logs one line and answers 204 with no body', async () => {
    const r = res();
    const lines = await run(() => handler(req({ body: { event: 'opened' } }), r));
    assert.strictEqual(r.code, 204);
    assert.strictEqual(r.payload, null, '204 must not carry a JSON body');
    assert.strictEqual(lines.length, 1);
    assert.ok(lines[0].startsWith('POSTCALL_EVENT '));
    assert.strictEqual(rowOf(lines).event, 'opened');
  });
  await test('every event name the client is allowed to send is actually accepted', async () => {
    // this is the client/server contract markup.test.js checks from the other
    // side (client names against this list) — this checks the list works
    const EVENTS = ['opened', 'seeded', 'template_used', 'example_loaded',
      'transcript_parsed', 'transcript_applied', 'proposal_rendered', 'scope_changed',
      'export_attempted', 'unlocked', 'deal_saved', 'deal_sent', 'outcome_recorded'];
    for (const event of EVENTS) {
      const r = res();
      await run(() => handler(req({ body: { event } }), r));
      assert.strictEqual(r.code, 204, event + ' was rejected — client and server have drifted');
    }
  });

  console.log('\nan unknown event is a silent measurement gap, so it must not be silent here');
  await test('refuses an event name outside the fixed list', async () => {
    const r = res();
    await run(() => handler(req({ body: { event: 'client_deleted_account' } }), r));
    assert.strictEqual(r.code, 400);
  });
  await test('refuses a missing event name', async () => {
    const r = res();
    await run(() => handler(req({ body: {} }), r));
    assert.strictEqual(r.code, 400);
  });

  console.log('\nwhat the row is not allowed to carry');
  await test('a client name never reaches the log, even if the client sends one', async () => {
    const lines = await run(() => handler(req({ body: {
      event: 'deal_saved', client: 'לקוח סודי בע"מ', process: 'תיאור מלא של התהליך'
    } }), res()));
    assert.ok(!lines.join('\n').includes('לקוח'), 'a client name leaked into the row');
    assert.ok(!lines.join('\n').includes('תהליך'), 'free text leaked into the row');
  });
  await test('an exact price is bucketed, never logged verbatim', async () => {
    const lines = await run(() => handler(req({ body: { event: 'deal_saved', price: 7431 } }), res()));
    const row = rowOf(lines);
    assert.strictEqual(row.priceBucket, '3-8k');
    assert.ok(!lines[0].includes('7431'), 'the exact figure defeats the point of bucketing it');
  });
  await test('price bucket boundaries', async () => {
    const cases = [[0, null], [-5, null], [2999, '<3k'], [3000, '3-8k'],
      [7999, '3-8k'], [8000, '8-20k'], [19999, '8-20k'], [20000, '20k+']];
    for (const [price, want] of cases) {
      const lines = await run(() => handler(req({ body: { event: 'deal_saved', price } }), res()));
      assert.strictEqual(rowOf(lines).priceBucket, want, 'price=' + price);
    }
  });
  await test('method is only ever one of the four real methods, or null', async () => {
    let lines = await run(() => handler(req({ body: { event: 'deal_saved', method: 'value' } }), res()));
    assert.strictEqual(rowOf(lines).method, 'value');
    lines = await run(() => handler(req({ body: { event: 'deal_saved', method: 'DROP TABLE' } }), res()));
    assert.strictEqual(rowOf(lines).method, null);
  });
  await test('systems is a small bounded integer or null, not an arbitrary number', async () => {
    let lines = await run(() => handler(req({ body: { event: 'deal_saved', systems: 5 } }), res()));
    assert.strictEqual(rowOf(lines).systems, 5);
    lines = await run(() => handler(req({ body: { event: 'deal_saved', systems: 4.5 } }), res()));
    assert.strictEqual(rowOf(lines).systems, null, 'a non-integer is not a system count');
    lines = await run(() => handler(req({ body: { event: 'deal_saved', systems: 999 } }), res()));
    assert.strictEqual(rowOf(lines).systems, null, 'above the real ceiling is not a real count');
  });
  await test('provenance is only ever one of the four real values, or null', async () => {
    let lines = await run(() => handler(req({ body: { event: 'deal_saved', provenance: 'unprompted' } }), res()));
    assert.strictEqual(rowOf(lines).provenance, 'unprompted');
    lines = await run(() => handler(req({ body: { event: 'deal_saved', provenance: 'anything else' } }), res()));
    assert.strictEqual(rowOf(lines).provenance, null);
  });

  console.log('\nguards');
  await test('refuses a GET', async () => {
    const r = res();
    await run(() => handler(req({ method: 'GET' }), r));
    assert.strictEqual(r.code, 405);
  });
  await test('an ordinary session of ~20 events in a minute is never throttled', async () => {
    const ip = nextIp();
    for (let i = 0; i < 20; i++) {
      const r = res();
      await run(() => handler(req({ ip, body: { event: 'scope_changed' } }), r));
      assert.notStrictEqual(r.code, 429, 'event #' + (i + 1) + ' of 20 was throttled');
    }
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})();
