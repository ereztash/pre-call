/* Shared plumbing for the browser suites that drive a page by clicking it.

   Not a test. It holds the three things every such suite needs and none of
   them is the thing the suite is about: resolving playwright, serving the
   static site, and handing back a fresh browser profile per test.

   Extracted at the fourth copy. journey.test.js, a11y.test.js and
   perf.test.js each carry their own and are left alone — they are green, and
   rewriting three passing suites to share a file is a change with no
   behavioural gain and a real chance of breaking one. The two suites that use
   this are the two written after it existed.

   In tools/ and not in assets/: markup.test.js sweeps every non-test .js in
   assets/ as a module the pages ship, and this is neither shipped nor a
   module the pages know about. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

/* Playwright, or an honest exit. A missing engine is a finding about the
   product's reach and gets named; a missing playwright is an absent harness,
   and failing CI for it would be reporting on the machine. */
function resolvePlaywright() {
  try { return require('playwright'); }
  catch (e) {
    try { return require(path.join(process.env.PW_ROOT || '', 'node_modules', 'playwright')); }
    catch (e2) { return null; }
  }
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
               '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

/* A static server good enough for a few HTML files and a directory of assets.
   Deliberately not a dependency: the product is a static site, so the harness
   that proves it should not need a stack the product does not. */
function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const clean = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
      const rel = clean === '/' ? '/index.html' : clean;
      const file = path.join(root, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(fs.readFileSync(file));
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, base: 'http://127.0.0.1:' + srv.address().port }));
  });
}

function runner() {
  const state = { pass: 0, fail: 0 };
  const test = async (name, fn) => {
    try { await fn(); state.pass++; console.log('  ok   ' + name); }
    catch (e) { state.fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
  };
  return { test, state };
}

/* One browser profile per test, and the previous one closed before the next
   opens.

   Per test, because these pages save to localStorage as you work and offer it
   back on the next load — which is what the product is for and death to a
   suite that shares storage between tests: the second test opens onto the
   first one's numbers and passes or fails on them. Found the way it deserved
   to be found, with a rejected row appearing to reach the form when it was the
   previous test's row.

   Closed as we go, because thirty live contexts is thirty live browser
   profiles, and the tail of a long suite starts timing out on elements the
   head had no trouble with. */
function profiles(browser, base, page, errors) {
  const open = [];
  return {
    open,
    fresh: async (opts) => {
      while (open.length) { try { await open.pop().close(); } catch (e) {} }
      const c = await browser.newContext({ viewport: { width: 1000, height: 900 }, ...(opts || {}) });
      c.on('weberror', e => errors.push(String(e.error()).split('\n')[0]));
      open.push(c);
      const p = await c.newPage();
      p.on('pageerror', e => errors.push('pageerror: ' + e.message));
      await p.goto(base + page);
      await p.waitForLoadState('domcontentloaded');
      return p;
    }
  };
}

module.exports = { root, resolvePlaywright, serve, runner, profiles };
