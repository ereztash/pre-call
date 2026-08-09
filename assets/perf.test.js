/* node assets/perf.test.js — Core Web Vitals, measured rather than assumed.

   Performance was the one quality claim in this project with nothing
   behind it. "It is a static site with no framework" is an argument, not a
   measurement, and an argument cannot notice a regression. This measures
   the three field metrics Google's thresholds are written against, on a
   throttled CPU, and fails when they leave the "good" band.

   Thresholds are the published "good" boundaries, not stretch goals:
     LCP  <= 2500ms      largest contentful paint
     CLS  <= 0.1         cumulative layout shift
     TBT  <= 200ms       total blocking time (the lab proxy for INP)

   4x CPU throttling, because the target user is on a phone in a car park
   right after a meeting, not on the machine this was written on. No
   network throttling: the product ships 319KB from one origin with no
   third-party bytes, so the interesting risk here is script execution,
   not transfer.

     PW_ROOT=/path    where to resolve playwright from
     PW_ENGINES=...   which engine to measure in (default chromium — the
                      CDP-based metrics below are Chromium-only)

   Skips with exit 0 if playwright is not resolvable: an absent harness is
   an environment problem, not a product defect. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');

function resolveFrom(name) {
  try { return require.resolve(name); } catch (e) {}
  if (process.env.PW_ROOT) {
    try { return require.resolve(path.join(process.env.PW_ROOT, 'node_modules', name)); } catch (e) {}
  }
  return null;
}
const pwPath = resolveFrom('playwright');
if (!pwPath) {
  console.log('\n  skipped — playwright not resolvable here.\n');
  process.exit(0);
}
const { chromium } = require(pwPath);

let pass = 0, fail = 0;
const test = async (name, fn) => {
  try { await fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
               '.css': 'text/css; charset=utf-8' };
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

const LIMITS = { lcp: 2500, cls: 0.1, tbt: 200 };

async function measure(browser, url) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  // registered before navigation so nothing is missed between load and observe
  await page.addInitScript(() => {
    window.__vitals = { lcp: 0, cls: 0, longTasks: [] };
    new PerformanceObserver(l => {
      const e = l.getEntries();
      window.__vitals.lcp = e[e.length - 1].startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver(l => {
      for (const entry of l.getEntries()) {
        if (!entry.hadRecentInput) window.__vitals.cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver(l => {
      for (const entry of l.getEntries()) window.__vitals.longTasks.push(entry.duration);
    }).observe({ type: 'longtask', buffered: true });
  });

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(1200);   // let LCP and late shifts settle
  // nudge the page so any post-load shift is counted, as a real reader would
  await page.evaluate(() => window.scrollBy(0, 300));
  await page.waitForTimeout(400);

  const v = await page.evaluate(() => window.__vitals);
  await ctx.close();

  return {
    lcp: Math.round(v.lcp),
    cls: Math.round(v.cls * 1000) / 1000,
    // TBT is the blocking portion: everything a long task spends past 50ms
    tbt: Math.round(v.longTasks.reduce((s, d) => s + Math.max(0, d - 50), 0))
  };
}

(async () => {
  const { srv, base } = await serve();
  const browser = await chromium.launch();
  console.log('\nCore Web Vitals · 390x844 · 4x CPU throttling\n');

  const pages = ['/', '/pre-call.html', '/post-call.html', '/privacy.html'];
  const table = [];

  for (const p of pages) {
    const m = await measure(browser, base + p);
    table.push({ page: p, ...m });
    await test(p + ' is inside the "good" band on all three metrics', () => {
      const over = [];
      if (m.lcp > LIMITS.lcp) over.push('LCP ' + m.lcp + 'ms > ' + LIMITS.lcp);
      if (m.cls > LIMITS.cls) over.push('CLS ' + m.cls + ' > ' + LIMITS.cls);
      if (m.tbt > LIMITS.tbt) over.push('TBT ' + m.tbt + 'ms > ' + LIMITS.tbt);
      assert.deepStrictEqual(over, [], over.join('; '));
    });
  }

  console.log('\n  page              LCP      CLS     TBT');
  table.forEach(r => console.log(
    '  ' + r.page.padEnd(17) +
    (r.lcp + 'ms').padStart(6) +
    String(r.cls).padStart(9) +
    (r.tbt + 'ms').padStart(8)));

  await browser.close();
  srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})();
