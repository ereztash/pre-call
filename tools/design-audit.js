/* What the page actually looks like, measured rather than argued about.
   node tools/design-audit.js

   A graphic designer looked at this product and said it was crowded, that the
   colours were harsh, and that it was simply bad. All three are true and none
   of them is actionable in that form — "crowded" is a feeling, and a feeling
   cannot be reviewed in a diff. This turns each one into a number with a
   threshold and a source, so the next version can be checked instead of
   defended.

   It renders the real pages in Chromium and reads computed styles, not the
   stylesheet. That distinction matters here: assets/*.css is disciplined —
   eight type tokens, one literal padding in 591 rules, a 44-step ramp that
   tokens.test.js keeps honest. The stylesheet is not where the problem is.
   The problem only appears once the rules are composed onto a page, and the
   only way to see it is to look at the page.

   This used to report and never fail, because every threshold below was
   violated and a permanently red build teaches everyone to ignore it. The
   redesign landed and all eighteen checks pass, so it enforces now: a finding
   exits non-zero. That is the whole point of having written the thresholds
   down before doing the work rather than after.

   Needs a browser, so it needs the one install step this repository allows:

     npm install --no-save playwright@1.62.1
     node tools/design-audit.js
     rm -rf node_modules package-lock.json

   That last line is not tidiness. assets/weight.test.js fails while a
   node_modules directory sits in the repo root, because there is no build step
   here and the directory would deploy exactly as it sits. Running this audit
   and then running the suite without cleaning up produces a failure that looks
   like it came from the audit and did not. */
const http = require('http');
const fs = require('fs');
const path = require('path');

/* PRECALL_ROOT points this at another checkout, so a redesign can be scored
   against the commit before it with one method. Same reason as in
   tools/attention-report.js. */
const root = process.env.PRECALL_ROOT
  ? path.resolve(process.env.PRECALL_ROOT)
  : path.join(__dirname, '..');
const PAGES = ['index.html', 'post-call.html', 'pre-call.html'];

/* Thresholds, each with the practitioner it comes from. They are opinions —
   held by people who do this for a living, written down so they can be argued
   with explicitly instead of relitigated per pull request. */
const RULES = {
  borderShare: {
    max: 0.15,
    why: 'Refactoring UI (Wathan & Schoger): use fewer borders. Separate with ' +
         'spacing or a background shift before reaching for a line. When most ' +
         'things on screen are in a box, the boxes stop meaning anything.'
  },
  accentHues: {
    max: 1,
    why: 'IBM Carbon ships exactly one accent hue and says not to add a second. ' +
         'Erik Kennedy: well-designed products are "mostly grayscale, with one ' +
         'colour". Two accents at equal frequency is not a palette, it is a tie.'
  },
  bodySizeCluster: {
    minRatio: 1.2,
    why: 'A Minor Third (1.2) is about the smallest step that reads as ' +
         'deliberate. Sizes closer than that are not a hierarchy — they are ' +
         'noise that costs a decision and returns nothing.'
  },
  backgrounds: {
    max: 4,
    why: 'Carbon builds depth from a small set of stacked layers. Past four, ' +
         'surfaces stop reading as levels and start reading as accidents.'
  },
  fillChroma: {
    max: 110,
    why: 'The cap that named the "harsh" the designer saw. It was one hue at ' +
         'full chroma (145) filling buttons on a near-black page — a colour ' +
         'that reads well on white vibrates against a dark surface. The first ' +
         'pass of this file counted accent HUES instead, found one, and passed ' +
         'the product; variety was never the problem. The page is light now ' +
         'and the fill is a deeper copper at 80, so the cap is slack — it ' +
         'stays because full-chroma fills are the failure mode either way.'
  },
  /* The first floor in this file, and it exists because everything else here
     is a ceiling. Too many boxes, too many hues, too many layers, too much
     chroma, too big a jump — every rule catches EXCESS, so a page that
     deleted every surface would score perfectly. One did: index.html
     reported "distinct surfaces 1 (max 4)" and passed, while all four cards
     on it were the same colour as the background in the dark theme. It took
     a person looking at a screenshot.

     A surface someone bothered to author and that paints nothing is the
     failure this catches. 1.05 is the floor rather than a comfortable step
     because the question is "is this rendering at all", not "is it enough" —
     the product's own step measures 1.14 in both themes. Bordered elements
     are exempt: a border is a different way of saying the same thing, and
     saying it is what matters. */
  invisibleSurface: {
    minRatio: 1.05,
    why: 'A surface that was authored and does not separate from what is ' +
         'behind it is a layer that paints nothing. Mirroring a light-theme ' +
         'pair into the dark ramp is how it happens without anyone editing ' +
         'the rule: #f6f3ee on #e2e5e9 is a clear step, and its mirror ' +
         '#1c1712 on #14171a differs in hue and not in value at all.'
  },
  valueJump: {
    max: 0.75,
    why: 'Elevation is built from neighbouring tones, not from opposite ends ' +
         'of the ramp. This caught the worst object in the old product: the ' +
         'proposal sheet at #fff on a #14171a page, 0.99 — the largest ' +
         'contrast available, spent on a container rather than on meaning. On ' +
         'the light page the sheet is still white and the jump is 0.23, which ' +
         'is the same design decision finally costing what it should.'
  }
};

const lum = c => {
  const m = (c.match(/[\d.]+/g) || []).map(Number);
  if (m.length < 3) return null;
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]);
};

function serve() {
  const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
                 '.png': 'image/png', '.svg': 'image/svg+xml' };
  return http.createServer((q, r) => {
    let p = q.url.split('?')[0];
    if (p === '/') p = '/index.html';
    const f = path.join(root, p);
    if (!fs.existsSync(f) || !f.startsWith(root)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'text/plain' });
    r.end(fs.readFileSync(f));
  });
}

/* Runs inside the page. Everything it returns is a computed style of an
   element a person can actually see — display:none and zero-area elements are
   dropped, because a rule that never renders is not part of the design. */
function probe() {
  const vis = [...document.querySelectorAll('body *')].filter(e => {
    const s = getComputedStyle(e);
    if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
    const b = e.getBoundingClientRect();
    return b.width > 0 && b.height > 0;
  });

  /* An accent is a hue carrying real chroma. The first version of this cut at
     chroma 14 and duly reported this product as having two accents at equal
     weight — copper, and a 214° "blue" that turned out to be the neutral ramp
     itself, which is deliberately cooled (chroma 16-28) and is not an accent
     by any designer's meaning of the word. A tinted grey is still a grey. The
     cut is now at 60, which separates copper (145) and turquoise (133) from
     every step of the neutral ramp, and the chroma is reported so the call is
     visible instead of buried in a constant. */
  const NEUTRAL_MAX_CHROMA = 60;
  const hueOf = c => {
    const m = (c.match(/[\d.]+/g) || []).map(Number);
    if (m.length < 3) return null;
    const [r, g, b] = m;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx - mn <= NEUTRAL_MAX_CHROMA) return null;
    let h;
    if (mx === r) h = 60 * (((g - b) / (mx - mn)) % 6);
    else if (mx === g) h = 60 * ((b - r) / (mx - mn) + 2);
    else h = 60 * ((r - g) / (mx - mn) + 4);
    return (Math.round(h) + 360) % 360;
  };

  const chromaOf = c => {
    const m = (c.match(/[\d.]+/g) || []).map(Number);
    if (m.length < 3) return 0;
    return Math.max(m[0], m[1], m[2]) - Math.min(m[0], m[1], m[2]);
  };

  const bg = {}, size = {}, hues = {}, fills = {};
  let bordered = 0;
  const isClear = c => !c || /rgba\([^)]*,\s*0\s*\)/.test(c);

  for (const e of vis) {
    const s = getComputedStyle(e);
    if (s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)') {
      bg[s.backgroundColor] = (bg[s.backgroundColor] || 0) + 1;
      /* a filled surface carrying real colour — the button, the badge, the
         chip. This is where saturation is felt, far more than in text. */
      const ch = chromaOf(s.backgroundColor);
      if (ch > 60) fills[s.backgroundColor] = Math.max(fills[s.backgroundColor] || 0, ch);
    }
    size[parseFloat(s.fontSize)] = (size[parseFloat(s.fontSize)] || 0) + 1;
    /* Width AND paint. A border-width with a transparent colour draws no
       line, and counting it inflates the one number on this page that is
       supposed to say how boxed-in the design looks. The entry cards carry
       a 1px transparent edge so the hover and the marker on the primary card
       have something to colour — that is three declarations working, not
       three more boxes, and the count should say so. */
    if (['Top', 'Right', 'Bottom', 'Left'].some(d =>
        parseFloat(s['border' + d + 'Width']) > 0 && !isClear(s['border' + d + 'Color']))) bordered++;
    /* Accent hue is judged on text and on filled buttons — the two places a
       hue is a deliberate signal rather than a tint of the surface. */
    const h = hueOf(s.color);
    if (h !== null) hues[Math.round(h / 20) * 20] = (hues[Math.round(h / 20) * 20] || 0) + 1;
  }

  /* Authored surfaces that do not separate from whatever is painted behind
     them. Walks up for the nearest opaque ancestor rather than trusting the
     parent, because most containers are transparent. */
  const opaque = c => c && !/rgba\(0, 0, 0, 0\)/.test(c);
  const behind = el => {
    let n = el.parentElement;
    while (n && n !== document.body) {
      const c = getComputedStyle(n).backgroundColor;
      if (opaque(c)) return c;
      n = n.parentElement;
    }
    return getComputedStyle(document.body).backgroundColor;
  };
  const label = e => (e.tagName.toLowerCase() +
    (typeof e.className === 'string' && e.className.trim()
      ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : '')).slice(0, 46);
  const flat = [];
  for (const e of vis) {
    if (e === document.body || e.offsetHeight < 24) continue;
    const s = getComputedStyle(e);
    if (!opaque(s.backgroundColor)) continue;
    if (['Top', 'Right', 'Bottom', 'Left'].some(d => parseFloat(s['border' + d + 'Width']) > 0)) continue;
    flat.push({ sel: label(e), bg: s.backgroundColor, under: behind(e) });
  }
  return { total: vis.length, bordered, bg, size, hues, fills, flat,
           pageBg: getComputedStyle(document.body).backgroundColor };
}

(async () => {
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch { console.error('playwright not installed. npm install --no-save playwright@1.62.1'); process.exit(2); }

  const exec = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
                '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(fs.existsSync);
  const srv = serve();
  await new Promise(z => srv.listen(8099, z));
  const b = await chromium.launch(exec ? { executablePath: exec } : {});
  const findings = [];

  /* Both themes, same thresholds. The dark ramp in assets/theme.css is a
     mirror of the light one, which ARGUES it inherits the light theme's
     discipline — this is what checks it. A theme that is only ever
     audited in the mode the auditor's laptop happens to be in is the
     axe-was-never-loaded failure again, one layer up. */
  for (const scheme of ['light', 'dark'])
  for (const page of PAGES) {
    const pg = await b.newPage({ viewport: { width: 1280, height: 900 },
                                 colorScheme: scheme });
    await pg.goto('http://localhost:8099/' + page, { waitUntil: 'networkidle' });
    await pg.waitForTimeout(400);
    const r = await pg.evaluate(probe);
    await pg.close();

    console.log('\n' + '='.repeat(74));
    console.log(page + ' · ' + scheme + '   ' + r.total + ' visible elements');
    console.log('='.repeat(74));

    const say = (ok, label, detail) => {
      console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + label.padEnd(30) + detail);
      if (!ok) findings.push({ page: page + ' (' + scheme + ')', label, detail });
    };

    // 1. how much of the page is in a box
    const share = r.bordered / r.total;
    say(share <= RULES.borderShare.max, 'elements with a border',
      r.bordered + '/' + r.total + ' = ' + Math.round(share * 100) + '%  (max ' +
      RULES.borderShare.max * 100 + '%)');

    // 2. accent hues carrying real weight — a hue used once is a highlight,
    //    a hue used two hundred times is a second brand colour
    const heavy = Object.entries(r.hues).filter(([, n]) => n >= Math.max(5, r.total * 0.02));
    say(heavy.length <= RULES.accentHues.max, 'accent hues in use',
      (heavy.length ? heavy.sort((a, c) => c[1] - a[1]).map(([h, n]) => h + '°×' + n).join('  ') : 'none') +
      '  (max ' + RULES.accentHues.max + ')');

    // 3. body sizes too close to read as a hierarchy
    const used = Object.entries(r.size).map(([s, n]) => [parseFloat(s), n])
      .filter(([, n]) => n >= Math.max(5, r.total * 0.03)).sort((a, c) => a[0] - c[0]);
    const tight = [];
    for (let i = 1; i < used.length; i++) {
      const ratio = used[i][0] / used[i - 1][0];
      if (ratio < RULES.bodySizeCluster.minRatio) tight.push(used[i - 1][0] + '→' + used[i][0] + ' (×' + ratio.toFixed(3) + ')');
    }
    say(tight.length === 0, 'type steps below 1.2',
      tight.length ? tight.join('  ') : 'none — every step is deliberate');

    // 3b. saturation of coloured fills against a dark page
    const loud = Object.entries(r.fills).filter(([, c]) => c > RULES.fillChroma.max);
    say(loud.length === 0, 'over-saturated fills',
      (Object.keys(r.fills).length
        ? Object.entries(r.fills).sort((a, c) => c[1] - a[1])
            .map(([c, ch]) => c + ' chroma ' + ch).join('  ')
        : 'none') + '  (max ' + RULES.fillChroma.max + ')');

    // 4. surface count
    const bgs = Object.entries(r.bg).filter(([, n]) => n >= 2);
    say(bgs.length <= RULES.backgrounds.max, 'distinct surfaces',
      bgs.length + '  (max ' + RULES.backgrounds.max + ')');

    // 5. the biggest value jump between a surface and the page
    const pageL = lum(r.pageBg);
    let worst = 0, worstC = null;
    for (const [c, n] of Object.entries(r.bg)) {
      if (n < 2) continue;
      const l = lum(c);
      if (l == null || pageL == null) continue;
      if (Math.abs(l - pageL) > worst) { worst = Math.abs(l - pageL); worstC = c; }
    }
    say(worst <= RULES.valueJump.max, 'largest surface value jump',
      worst.toFixed(2) + (worstC ? '  ' + worstC : '') + '  (max ' + RULES.valueJump.max + ')');

    // 6. surfaces that were authored and do not render as surfaces
    const ratio = (a, b) => {
      const la = lum(a), lb = lum(b);
      if (la == null || lb == null) return Infinity;
      const [hi, lo] = la > lb ? [la, lb] : [lb, la];
      return (hi + 0.05) / (lo + 0.05);
    };
    const flat = (r.flat || []).filter(f => ratio(f.bg, f.under) < RULES.invisibleSurface.minRatio);
    const seen = new Set();
    const uniq = flat.filter(f => { const k = f.sel + f.bg; if (seen.has(k)) return false; seen.add(k); return true; });
    say(uniq.length === 0, 'surfaces that paint nothing',
      (uniq.length ? uniq.slice(0, 4).map(f => f.sel + ' ' + f.bg + ' on ' + f.under).join('   ')
                   : 'none — every authored surface separates') +
      '  (min ratio ' + RULES.invisibleSurface.minRatio + ')');
  }

  await b.close();
  srv.close();

  console.log('\n' + '='.repeat(74));
  console.log(findings.length + ' finding(s).');
  console.log('='.repeat(74));
  for (const k in RULES) console.log('\n  ' + k + '\n    ' + RULES[k].why.replace(/(.{68}) /g, '$1\n    '));
  console.log('');
  process.exit(findings.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
