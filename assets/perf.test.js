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

   Three samples per page, and the MEDIAN decides. This used to be one sample,
   which meant one draw decided pass/fail — the failure mode Faulkner's five-user
   study is the cleanest example of: the mean says a set of five finds 85% of
   problems, the actual range across random sets of five is 55% to 99%, and the
   mean was therefore never a number anyone could act on.

   The median, chosen on purpose: the best of three hides the bad draws, the worst
   of three lets any single spike fail the build. Three is still a small sample
   and the range is printed for exactly that reason — read the spread, not only
   the verdict.

   What the spread revealed the first time it existed is worth writing down,
   because it was the opposite of what this change was built expecting. TBT on
   post-call.html had been recorded at 228ms and 275ms against the 200ms budget,
   and that was taken as a real defect. Measured properly it is not one:

     one browser, six sequential samples   176 173 167 158 167 141
     a fresh browser for each sample       167 156 167 186

   Warm-up inside a browser process is real and mild — about 20% across six runs
   — and the cold numbers sit in the same band as the warm ones. Both bands are
   inside the budget. The earlier readings were taken while several other
   Chromium instances and test suites were running on the same machine, so they
   measured the machine's load and not the page.

   The practical rule that follows: a TBT failure here is worth re-running on an
   idle machine before it is believed. LCP and CLS are far less load-sensitive.

     PW_ROOT=/path    where to resolve playwright from

   Chromium only, and not configurable. CPU throttling comes from CDP and the
   longtask observer exists nowhere else, so an engine switch here would report
   numbers it did not measure. A PW_ENGINES knob was documented in this header
   for a while and never read by a line of code — worse than no knob, because it
   reads as coverage.

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
const SAMPLES = 3;

/* Sorted copy, then the middle. With SAMPLES odd this is a real median; the even
   branch is here so raising SAMPLES later does not silently start averaging the
   two middle values into a number that no run produced. */
function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]
                      : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}
const spread = xs => ({ min: Math.min(...xs), mid: median(xs), max: Math.max(...xs) });

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
    const runs = [];
    for (let i = 0; i < SAMPLES; i++) runs.push(await measure(browser, base + p));
    const s = {
      lcp: spread(runs.map(r => r.lcp)),
      cls: spread(runs.map(r => r.cls)),
      tbt: spread(runs.map(r => r.tbt))
    };
    table.push({ page: p, ...s });
    await test(p + ' is inside the "good" band on all three metrics', () => {
      const over = [];
      // the median, and the range alongside it — a verdict without the spread
      // is what let this metric pass on a lucky draw for as long as it did
      const say = (k, u) => k.toUpperCase() + ' ' + s[k].mid + u + ' > ' + LIMITS[k] +
        ' (' + SAMPLES + ' runs: ' + s[k].min + '–' + s[k].max + ')';
      if (s.lcp.mid > LIMITS.lcp) over.push(say('lcp', 'ms'));
      if (s.cls.mid > LIMITS.cls) over.push(say('cls', ''));
      if (s.tbt.mid > LIMITS.tbt) over.push(say('tbt', 'ms'));
      assert.deepStrictEqual(over, [], over.join('; '));
    });
  }

  const band = (v, u) => (v.mid + u).padStart(7) + ('  ' + v.min + '–' + v.max).padEnd(12);
  console.log('\n  median, and the range over ' + SAMPLES + ' runs');
  console.log('  page                 LCP                CLS                TBT');
  table.forEach(r => console.log(
    '  ' + r.page.padEnd(15) + band(r.lcp, 'ms') + band(r.cls, '') + band(r.tbt, 'ms')));

  await browser.close();
  srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})();
