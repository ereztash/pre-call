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

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
