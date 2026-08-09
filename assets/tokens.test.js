/* node assets/tokens.test.js — no browser, no deps.

   A design system that is applied once and not defended decays back into
   what it replaced, one reasonable exception at a time. The measurement
   that started this: 25 distinct font sizes and 22 distinct spacing
   values, six of the sizes inside a single 2px band. Nobody decided that.
   It is what a stylesheet becomes when every individual choice is
   defensible and nothing checks the set.

   So this file is not a test of appearance — nothing here can tell you
   whether the product looks good. It tests that the vocabulary stayed a
   vocabulary: that the three stylesheets declare the same scale, and that
   a size or a gap picks a step from it rather than inventing one 1.5px
   away from a step that already exists. */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

const FILES = ['entry.css', 'pre-call.css', 'post-call.css'];
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '');

const scaleOf = text => {
  const out = {};
  for (const m of strip(text).matchAll(/(--(?:fs|sp|r)-[\w]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
};

console.log('\none vocabulary, not three');
const scales = FILES.map(f => ({ f, scale: scaleOf(read(f)) }));

test('every stylesheet declares the scale', () => {
  scales.forEach(({ f, scale }) =>
    assert.ok(Object.keys(scale).length >= 20,
      f + ' declares only ' + Object.keys(scale).length + ' scale tokens'));
});

test('the three files declare identical values, to the pixel', () => {
  /* They are separate files because the pages load separately, not
     because they are separate products. A --fs-md that is 15px in one
     and 14px in another is the same decay as before, only harder to see:
     crossing from the entry page to a tool would shift the body text. */
  const [first, ...rest] = scales;
  rest.forEach(({ f, scale }) => {
    Object.keys(first.scale).forEach(k => {
      assert.ok(k in scale, f + ' is missing ' + k);
      assert.strictEqual(scale[k], first.scale[k],
        k + ' is ' + scale[k] + ' in ' + f + ' but ' + first.scale[k] + ' in ' + first.f);
    });
    assert.deepStrictEqual(Object.keys(scale).sort(), Object.keys(first.scale).sort(),
      f + ' declares a different set of tokens');
  });
});

test('the type scale has no two steps closer than 1px apart', () => {
  /* The original fault, stated as a rule. 13 and 13.5 are not two
     decisions, they are one decision made twice. */
  const sizes = Object.entries(scales[0].scale)
    .filter(([k]) => k.startsWith('--fs-')).map(([, v]) => parseFloat(v)).sort((a, b) => a - b);
  assert.ok(sizes.length >= 6, 'the type scale collapsed to ' + sizes.length + ' steps');
  for (let i = 1; i < sizes.length; i++)
    assert.ok(sizes[i] - sizes[i - 1] >= 1,
      sizes[i - 1] + 'px and ' + sizes[i] + 'px are the same step wearing two names');
});

console.log('\nsizes and gaps come from the scale');
/* Deliberately narrow. Colour, borders, widths, breakpoints and print
   units are not governed here — this is the scale that the eye reads as
   rhythm, and widening the rule until it needs a dozen exemptions is how
   a guard stops being believed. */
const GOVERNED = /(?:^|[;{\s])(font-size|padding|padding-(?:top|right|bottom|left)|margin|margin-(?:top|right|bottom|left)|gap|row-gap|column-gap|border-radius)\s*:\s*([^;}\n]+)/g;

/* 0 and 1px are not rhythm: 1px is a hairline, and it is the same
   hairline as the borders next to it. Negative values are deliberate
   pulls against a neighbouring box and belong to that box, not to the
   scale. Everything else has to name a step. */
const allowed = v => v === 0 || v === 1 || v < 0;

FILES.forEach(f => {
  test(f + ' invents no sizes or gaps of its own', () => {
    const text = strip(read(f));
    const bad = [];
    for (const m of text.matchAll(GOVERNED))
      for (const raw of m[2].matchAll(/(-?[\d.]+)px/g))
        if (!allowed(parseFloat(raw[1])))
          bad.push(m[1] + ': ' + m[2].trim().slice(0, 48) + '  ← ' + raw[1] + 'px');
    assert.deepStrictEqual(bad, [],
      'raw values where a token belongs — add a step, or use the nearest one:\n       ' +
      bad.join('\n       '));
  });
});

console.log('\nthe scale is used, not merely declared');
test('no token is dead — a step nobody picked is a step that will drift', () => {
  const all = FILES.map(read).map(strip).join('\n');
  const unused = Object.keys(scales[0].scale).filter(k => !all.includes('var(' + k + ')'));
  assert.deepStrictEqual(unused, [],
    'declared and never used: ' + unused.join(', '));
});

console.log('\nthe palette is a palette');
/* The same argument as the type scale, on the axis the type scale did not
   cover. Measured before the palette existed: 94 distinct colour literals,
   39 used exactly once, across nine hue families — two of them 15 degrees
   apart, two more appearing exactly once, and a saturation spread of 84
   points inside a single family. Near-duplicate hues do not read as
   variety. They read as a product nobody was in charge of. */
const hexes = text => {
  const out = new Map();
  for (const m of strip(text).matchAll(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g)) {
    const h = '#' + m[1].toLowerCase();
    out.set(h, (out.get(h) || 0) + 1);
  }
  return out;
};
/* Paper and ink. They are in the print sheet, on the one artefact that
   leaves the product, and they are not part of the screen palette. */
const PAPER_AND_INK = new Set(['#fff', '#ffffff', '#000', '#000000']);

const toRgb = h => {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
};
const toHsl = ([r, g, b]) => {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
           h *= 60; if (h < 0) h += 360; }
  const l = (mx + mn) / 2, s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
};
const ANCHORS = { copper: 32, turquoise: 168, red: 352, neutral: 214 };
const hueDist = (h, a) => { const d = Math.abs(h - a); return d > 180 ? 360 - d : d; };

const allHex = new Map();
FILES.forEach(f => hexes(read(f)).forEach((n, h) => allHex.set(h, (allHex.get(h) || 0) + n)));
const palette = [...allHex.keys()].filter(h => !PAPER_AND_INK.has(h));

test('the whole product is drawn from one small set of colours', () => {
  /* 46 today. The ceiling is where it is so that adding a shade is a
     decision somebody makes on purpose, not something that happens. */
  assert.ok(palette.length <= 50,
    'the palette has grown to ' + palette.length + ' colours (ceiling 50). ' +
    'Pick a step from the ramp, or raise this deliberately and say why.');
});

test('every colour sits on one of the four hue anchors', () => {
  /* The finding that made this file necessary: a copper at h30 and a
     second warm at h45 are not two colours, they are one colour applied
     by two people who never spoke. */
  const strays = palette.map(h => ({ h, hsl: toHsl(toRgb(h)) }))
    .filter(x => x.hsl[1] >= 12)          // greys have no meaningful hue
    .filter(x => !Object.values(ANCHORS).some(a => hueDist(x.hsl[0], a) <= 8))
    .map(x => x.h + ' (hue ' + x.hsl[0] + ')');
  assert.deepStrictEqual(strays, [],
    'colours off every anchor — ' + strays.join(', ') +
    '. Anchors: ' + JSON.stringify(ANCHORS));
});

test('two steps at the same brightness carry the same chroma', () => {
  /* The first version of this asserted a small total spread inside a
     family, and it failed on a palette that was correct — chroma is
     *supposed* to peak in the midtones and ease off at both ends, so a
     wide spread across a ramp is the system working, not breaking.

     What was actually wrong before is narrower and this states it: the
     old stylesheets held #241f1a at 16% saturation and #26200f at 43%,
     two nearly black warms of the same lightness and wildly different
     chroma, sitting on the same page. Same colour, same brightness,
     different intensity — that is what the eye reads as unfinished. */
  const rows = palette.map(h => ({ h, hsl: toHsl(toRgb(h)) })).filter(x => x.hsl[1] >= 12)
    .map(x => Object.assign(x, { fam: Object.entries(ANCHORS)
      .sort((a, b) => hueDist(x.hsl[0], a[1]) - hueDist(x.hsl[0], b[1]))[0][0] }));
  const bad = [];
  rows.forEach(a => rows.forEach(b => {
    if (a.h >= b.h || a.fam !== b.fam) return;
    if (Math.abs(a.hsl[2] - b.hsl[2]) <= 6 && Math.abs(a.hsl[1] - b.hsl[1]) > 12)
      bad.push(a.h + '(L' + a.hsl[2] + ' s' + a.hsl[1] + ') vs ' +
               b.h + '(L' + b.hsl[2] + ' s' + b.hsl[1] + ')');
  }));
  assert.deepStrictEqual(bad, [],
    'same family, same brightness, different chroma: ' + bad.join('; '));
});

test('chroma rises toward the midtones and falls away from them', () => {
  /* The curve itself, asserted rather than assumed — a flat ramp makes
     dark tints muddy and light tints chalky, and inverting it would be
     worse than either. */
  ['copper', 'turquoise', 'red'].forEach(fam => {
    const anchor = ANCHORS[fam];
    const steps = palette.map(h => toHsl(toRgb(h)))
      .filter(x => x[1] >= 12 && hueDist(x[0], anchor) <= 8)
      .sort((a, b) => a[2] - b[2]);
    if (steps.length < 4) return;
    const mid = steps.reduce((m, x) => Math.abs(x[2] - 52) < Math.abs(m[2] - 52) ? x : m, steps[0]);
    assert.ok(mid[1] >= steps[0][1] && mid[1] >= steps[steps.length - 1][1],
      fam + ' is more saturated at an end of the ramp than in the middle: ' +
      JSON.stringify(steps.map(s => 'L' + s[2] + '/s' + s[1])));
  });
});

test('the ramp is declared identically in all three files', () => {
  const rampOf = text => {
    const out = {};
    for (const m of strip(text).matchAll(/(--(?:nt|cu|tq|rd)-\d+)\s*:\s*(#[0-9a-fA-F]{3,6})\s*;/g))
      out[m[1]] = m[2].toLowerCase();
    return out;
  };
  const ramps = FILES.map(f => ({ f, r: rampOf(read(f)) }));
  ramps.forEach(({ f, r }) =>
    assert.ok(Object.keys(r).length >= 40, f + ' declares only ' + Object.keys(r).length + ' ramp steps'));
  const [first, ...rest] = ramps;
  rest.forEach(({ f, r }) => assert.deepStrictEqual(r, first.r,
    f + ' and ' + first.f + ' disagree about the ramp — crossing between pages would shift colour'));
});

test('a ramp step is named for its own lightness', () => {
  /* --nt-41 is 41% light. That is what makes the contrast between any two
     steps readable off the names instead of out of a colour picker, and
     it is the only reason a ramp beats a list. */
  const wrong = [];
  for (const m of strip(read(FILES[2])).matchAll(/--(?:nt|cu|tq|rd)-(\d+)\s*:\s*(#[0-9a-fA-F]{3,6})\s*;/g)) {
    const want = +m[1], got = toHsl(toRgb(m[2]))[2];
    if (Math.abs(want - got) > 1) wrong.push(m[0].trim() + ' is L' + got);
  }
  assert.deepStrictEqual(wrong, [], 'steps whose name lies about their lightness: ' + wrong.join(', '));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
