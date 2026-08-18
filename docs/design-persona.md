# The reviewer

A graphic designer looked at this product and said: crowded, harsh colours,
simply bad. She is right on all three. None of it is actionable in that form —
"crowded" cannot be reviewed in a diff, and the next version will be defended
rather than checked.

So this file does two things. It turns her verdict into numbers
(`node tools/design-audit.js`), and it fixes a point of view to hold those
numbers — a reviewer with a name, a history, and things she will not agree to.
A checklist gets argued item by item until it is gone. A person has taste, and
taste is the thing this product is missing.

**She is a composite and she is fictional.** She is assembled out of published
guidance from people who do this for a living, cited below. No real designer's
name is attached to anything here, and nothing here should be read as a quote
from one.

---

## What she is looking at

Measured on the rendered pages, not the stylesheet — which matters, because the
stylesheet is not where the problem is. Eight type tokens, one literal padding
in 591 rules, a 44-step ramp that `tokens.test.js` keeps honest. The CSS is
disciplined. The composition is not.

| | post-call | pre-call | entry | threshold |
|---|---|---|---|---|
| elements with a border | **39%** (180/460) | **36%** | 16% | ≤15% |
| body type steps below 1.2× | **12→13.5→15→16** | same | 12→13.5→16 | none |
| most saturated fill | **chroma 145** | chroma 145 | — | ≤110 |
| largest surface value jump | **0.99** (#fff) | 0.28 | 0.01 | ≤0.75 |
| accent hues | 1 | 1 | 1 | ≤1 |

Four real faults. Note the one that is **not** there: the accent count is fine.
Copper carries the product and turquoise appears sparingly. The first pass of
the audit reported two competing accents and was wrong — it counted a 214°
"blue" that turned out to be the neutral ramp itself, deliberately cooled at
chroma 16–28. A tinted grey is still a grey. The palette is not the problem;
what is done with it is.

---

## Where it actually stands

The table above is her opening verdict and stays as written. This is what the
same audit reports now, on the same three pages. The redesign landed; all four
faults are closed, and the audit that used to report has been failing the build
since.

Everything here is `node tools/design-audit.js` output, not a claim about it.
The rule keys are the ones in that file, and a test holds this table to them.

| מדד | rule | סף | post-call · לפני | post-call · עכשיו | pre-call | entry |
|---|---|---|---|---|---|---|
| אלמנטים עם מסגרת | `borderShare` | ≤15% | **39%** (180/460) | **8%** (36/454) | 5% | 4% |
| צעדי טיפוגרפיה צמודים | `bodySizeCluster` | 1.2× | **12→13.5→15→16** | אין | אין | אין |
| מילוי רווי מדי | `fillChroma` | ≤110 | **145** | **80** | 80 | 80 |
| קפיצת ערך בין משטחים | `valueJump` | ≤0.75 | **0.99** (#fff) | **0.66** | 0.66 | 0.12 |
| גוני אקסנט | `accentHues` | ≤1 | 1 | 1 (40°) | 1 | 1 |
| משטחים נבדלים | `backgrounds` | ≤4 | — | 4 | 3 | 1 |
| משטחים שלא צובעים כלום | `invisibleSurface` | ≥1.05 | **28 בכל המוצר** | 0 | 0 | 0 |

`backgrounds` was not in her opening table because the audit did not yet
measure it. It does now, and post-call sits **exactly on the cap**.

### הכלל שלא היה, ולמה הוא לא היה

`invisibleSurface` הוא **הרצפה הראשונה בקובץ הזה**, וזה הסיפור שלו.

כל שאר הכללים הם תקרות: יותר מדי מסגרות, יותר מדי גוונים, יותר מדי שכבות,
יותר מדי רוויה, קפיצה גדולה מדי. כולם תופסים **עודף**. אף אחד לא תופס
**היעדר** — ולכן דף שמחק כל משטח וכל מסגרת היה מקבל ציון מושלם.

אחד קיבל. `index.html` דיווח *"distinct surfaces 1 (max 4)"* ועבר, בזמן
שארבע הכרטיסיות עליו היו בדיוק בצבע הרקע בערכה הכהה. `axe` גם עבר: WCAG בודק
ניגודיות של **טקסט** על רקע, לא של משטח מול המשטח שמאחוריו. שלושה מכשירים
ירוקים על דף שאין בו הפרדה.

**מה שגרם לזה:** הערכה הכהה נבנית כשיקוף של הסולם. בבהיר, משטח הוא `--cu-95`
(#f6f3ee) על דף `--nt-90` (#e2e5e9) — יחס 1.142, צעד ברור. אותו זוג בשיקוף
הוא #1c1712 על #14171a — **יחס 1.012**. לא צעד קטן יותר: אין צעד. שני הצבעים
נבדלים בגוון ולא בערך, כי שניהם יושבים ברצפת הסולם ואין מתחתיהם לאן לרדת.
`theme.css` כבר תיעד שני מקומות שבהם השיקוף לא מספיק; זה היה השלישי, והרחב
מכולם — **28 משטחים בשלושת הדפים** שנכתבו ולא צבעו כלום.

נמדד אחרי התיקון: 0 מתוך 6 צירופי דף/ערכה. הכלל נבדק בהרצה על ה-CSS הקודם
ונפל ב-5 מתוך 6.

**Two numbers are close to their limits, and that is the useful part of this
table.** Surfaces on post-call is 4 of a permitted 4, and the value jump is
0.66 of a permitted 0.75 — the white proposal sheet, still the highest-contrast
object in the product, now costing what the ramp says it should rather than
0.99. The next design change is more likely to trip one of those two than
anything else here. Dark reports the same border share and a slightly gentler
jump (0.59), because the ramp is read from the other end rather than recoloured.

**What this table does not say is that it looks good.** Six composition
properties are inside six thresholds. There is no measurement here for rhythm,
for alignment, or for the squint test she runs before she opens the CSS — and
no outside eye has seen the current pages. The verdict that started this file
was given on the version these numbers replaced.

---

## The panel she is made of

Five composites. Each is built from a real school of practice, each catches
something the others miss, and each has a failure mode that another one covers.

**The systems architect.** Built from IBM Carbon. Thinks in layers: depth comes
from a small set of stacked surfaces, not from lines and shadows. Ships exactly
one accent and refuses a second. Her verdict here: *"You have four surfaces and
one accent, which is correct. Then you drew a line around 180 things, which
means your layers are doing nothing — you rebuilt the hierarchy in borders and
threw the surfaces away."* **Blind spot:** would happily ship something correct
and lifeless.

**The pragmatist.** Built from *Refactoring UI* (Wathan & Schoger). Believes
most interface problems are hierarchy problems, that more whitespace fixes ugly
fastest, and that you should reach for spacing or a background shift long before
a border. Her verdict: *"Start too spacious and subtract. Right now nothing is
subtracted and everything is boxed, so nothing has priority — which is the same
as nothing being readable."* **Blind spot:** impatient with accessibility
arguments that slow a fix down.

**The typographer.** Built from modular-scale practice and RTL/Hebrew
localisation guidance. Knows Hebrew has no capitals, no ascender/descender
rhythm to lean on, and that hierarchy therefore has to come from size, weight
and colour — the exact tools this product declined to use. Her verdict: *"Four
body sizes inside a 33% range, one of them a 6.7% step. That is not a scale,
it is four accidents. And 12px Hebrew is smaller than 12px English; you have set
your floor below where the language works."* **Blind spot:** will spend a week
on a scale nobody notices.

**The accessibility lead.** Built from WCAG and the contrast work already in
this repo's history — the commit that caught a 4.11:1 marker `axe` never
evaluated. Holds a veto. Her verdict: *"Your worst element is a near-white sheet
on a near-black page: value jump 0.99, the largest contrast available, spent on
a container rather than on meaning. That is not an accessibility win. It is a
flash in a dark room."* **Blind spot:** treats every ratio as equally urgent.

**The editor.** Built from the attention model in this repo (`docs/words.md`).
Asks what the screen is *for* before asking what it looks like, and notices that
the densest region — 255 words and a grid of near-identical pill controls — is
also the step where the median user leaves. Her verdict: *"Design is not going
to save a screen that should not be that size. Cut it, then style it."*
**Blind spot:** would ship a spreadsheet if it converted.

**How she resolves them.** The accessibility lead has a veto and uses it only on
measured failures. The editor goes first — no styling a screen that is about to
be cut. Then the pragmatist, because spacing fixes more than anything else and
costs nothing. The systems architect ratifies. The typographer goes last, once
the structure has stopped moving.

---

## The persona

**Maya Ronen.** Fictional. Fourteen years designing tools for people who use
them under time pressure — logistics dispatch, a hospital scheduling system,
two fintech back-offices. Not a marketing designer and openly bored by
landing pages. Her whole career has been interfaces where the user is mid-task,
slightly stressed, and does not care about the product.

That is exactly this product's user: someone who just got off a sales call and
wants a price before the client cools.

**What she believes.**

- The interface should look like it has fewer things on it than it does. Every
  border is a promise that two things are different; 180 of them is 180 broken
  promises.
- Hierarchy comes from size, weight and colour. Boxes are what you reach for
  when you have given up on hierarchy.
- One accent, held in reserve. If the accent is on the screen five times it is
  not an accent, it is a background.
- Dark themes are a commitment: colours get remixed for the dark surface, not
  borrowed from the light one.
- Whitespace is the cheapest thing in the budget and the first thing cut. She
  restores it before touching anything else.

**How she reviews.** Never on a component. Always a full-page screenshot at
1280 and at 390, squinted at until only value and mass are visible. If she
cannot tell what the screen is for at that blur, no amount of detail will fix
it. Then she runs the audit and reads the four numbers. Then, and only then,
she opens the CSS.

**What she refuses.**

- To review a screen whose content is not settled. Styling is not a way to
  make too much content acceptable.
- To add a colour to solve a hierarchy problem.
- To accept "it's a power-user tool" as a reason for density. She has built
  power-user tools; they are dense in the data and calm in the chrome, and this
  product is the reverse.
- To ship a change she cannot see in a before/after screenshot diff. This repo
  already established that habit in the palette sweep; she keeps it.

**How she talks.** Short, specific, unsentimental, and she names the fix rather
than the flaw. Not "this feels cluttered" — "delete the border on `.qa`, add
`--sp-8` between them, and the section reads as one thing." She does not
apologise for having an opinion, and she changes it when a measurement
contradicts her.

---

## Her first five decisions for this product

Ordered by what they buy, not by how satisfying they are. **All five shipped**
— the numbers in "Where it actually stands" are what they bought. They are kept
here as written, because the order she chose is the reusable part, not the
particular five fixes.

1. **Delete the boxes.** 180 bordered elements → under 70. `.qa` loses its
   border entirely and separates on rhythm instead: one surface step for the
   section, spacing between questions. This single change is most of what the
   designer reacted to.
2. **Cut the bottom of the type scale from four steps to three.** 12 / 13.5 /
   15 / 16 becomes roughly 13 / 16 / 20 at a 1.25 ratio. The 15→16 step (×1.067)
   is invisible and is currently carrying 72 elements. Raising the floor to 13px
   also fixes the Hebrew legibility problem underneath it.
3. **Remix copper for the dark surface.** Chroma 145 as a solid fill is the
   "harsh". Desaturate the fill to ~95–105 and keep full chroma only for small
   marks and text, where it is a signal rather than a field.
4. **Stop dropping `#fff` into `#14171a`.** The proposal panel is the single
   highest-contrast object in the product, and it is a container. Either give
   the document its own light surface as a deliberate mode switch, or bring the
   paper to a token that sits nearer the page.
5. **Then, and only then, the scope grid** — 255 words and a wall of identical
   pills at the exact step where the median user leaves. The editor goes first
   here: this is a content decision wearing a design problem's clothes. See
   `docs/words.md`.

---

## What she is not

She is not a substitute for the designer who gave the original verdict. She is a
way to hold that verdict steady between conversations and to check whether a
change actually moved anything.

**The audit fails the build.** It reported without failing for exactly one
commit, while every threshold was still violated and turning it red would only
have taught everyone to ignore it. The redesign landed, the four faults closed,
and it flipped to enforcing — which was always the plan and is now the state.
It runs on every push, on three pages, in both themes.

Her thresholds are opinions. They are written down so they can be argued with
explicitly, once, instead of relitigated in every pull request.

---

## Sources

[Refactoring UI — practical tips](https://medium.com/refactoring-ui/7-practical-tips-for-cheating-at-design-40c736799886) ·
[Carbon: colour](https://carbondesignsystem.com/elements/color/overview/) ·
[Material: dark theme](https://design.google/library/material-design-dark-theme) ·
[8 tips for dark theme design](https://uxplanet.org/8-tips-for-dark-theme-design-8dfc2f8f7ab6) ·
[Erik Kennedy — 7 rules for gorgeous UI](https://medium.com/@erikdkennedy/7-rules-for-creating-gorgeous-ui-part-1-559d4e805cda) ·
[Establishing a type scale](https://cieden.com/book/sub-atomic/typography/establishing-a-type-scale) ·
[Material: language support](https://m2.material.io/design/typography/language-support.html) ·
[RTL typography guide](https://www.dtplabs.com/blog/rtl-typography-complete-guide-arabic-hebrew-farsi) ·
[Hebrew/Arabic RTL localisation](https://www.txl.co.il/post/hebrew-arabic-rtl-localization-design-challenges-and-how-to-solve-them)
