# Pricing a word

Copy gets cut on taste. Taste has no unit, so the argument never converges and
the longest paragraph survives because nobody could say what it costs.

This gives a word a price. A word costs milliseconds, milliseconds cost
survival, survival is countable — so "is this paragraph worth it" becomes a
question with an answer. It also answers a second question that turns out to
matter more: **where the product should stop.**

Run it:

```
node tools/attention-report.js          # both funnels, measured from the files
node tools/attention.test.js            # 24 properties the model has to hold
```

`tools/attention.js` is the model and is pure. `tools/attention-report.js`
reads the actual shipped copy and turns it into a funnel. Neither ships —
`tools/` is in `.vercelignore`.

---

## The headline

Three ways to spend a day of editing, priced in the same unit — percentage
points of people who finish:

| lever | POST-CALL | PRE-CALL |
|---|---|---|
| cut 100 words (≈2.5 paragraphs) | +0.60 pts | +0.03 pts |
| remove **one field** (default it, derive it, or drop it) | +1.74 pts | +1.28 pts |
| bring **one hand-off** back in-product | — | +15.87 pts |

**One field is worth ~3× a hundred words in POST-CALL and ~42× in PRE-CALL.
Removing PRE-CALL's hand-off to an external LLM is worth 520× a hundred words.**

So the honest answer to "what are all the useful ways to reduce word count" is
that word count is the weakest lever on the board. It is worth pulling — it is
just worth pulling *after* the two levers that are an order of magnitude
larger, and most techniques that get filed under "write less" are really
techniques for removing fields and hand-offs. Those are the ones to reach for.

---

## Where the median user leaves

`alive` is the share of people who started who are still present.

**POST-CALL** — 768 words, 12 required fields, 2.2 minutes of attention:

| step | words | fields | alive |
|---|---|---|---|
| נחיתה · כותרת, הסבר, תבניות | 99 | 0 | 84.3% |
| שלב 1 · התהליך ◆ | 74 | 1 | 74.5% |
| שלב 2 · כמה וכמה זמן | 81 | 3 | 59.0% |
| שלב 3 · תוכנות | 33 | 0 | 57.8% |
| שלב 4 · תקלות | 63 | 2 | 50.3% |
| **שלב 5 · מה כלול** | **255** | 0 | **46.5%** ← boundary |
| שלב 6 · מי שולח | 45 | 5 | 34.9% |
| שלב 7 · הלקוח | 56 | 1 | 32.7% |
| שלב 8 · ההצעה מוכנה ◆ | 62 | 0 | 32.1% |

**PRE-CALL** — 589 words, 18 fields, one hand-off:

| step | words | fields | alive |
|---|---|---|---|
| נחיתה | 42 | 0 | 99.4% |
| שלב 1 · אפיון העסק ⇥ *(leaves for Claude/ChatGPT)* | 99 | 0 | 64.3% |
| **שלב 2 · הזנת הפרופיל** | **199** | **9** | **43.4%** ← boundary |
| שלב 3 · הצד השני | 193 | 6 | 33.5% |
| שלב 4 · התסריט ◆ | 56 | 3 | 29.5% |

---

## The boundary is where the application should end

The boundary is the first step at which fewer than half the people who started
are still there. Everything after it is built for a minority — which is allowed,
but it should be a decision rather than a discovery.

Both tools currently fail the same test. **The thing the product exists to
deliver lands after the boundary.** POST-CALL's finished proposal is reached by
32.1% of starters; PRE-CALL's script by 29.5%. Two thirds of the people who
arrive never see the product's output, and the code that produces it is written
for them anyway.

There are only two moves, and they are the same move seen from either end:

1. **Move the value before the boundary.** POST-CALL already half-does this and
   it is the best decision in the product: the proposal document builds live
   from step 1, so *first* value reaches 74.5% rather than 32.1%. The design
   that made that true — "ההצעה נכתבת תוך כדי שאתה ממלא" — is worth more than
   every copy edit in this document combined.
2. **Move the boundary past the value**, by taking cost out of the steps before
   it. Only cuts *before* the boundary move it; see the next section for why.

The third option — build more product past the boundary — is the one to stop
doing.

---

## Two results that decide where to cut

**For completion, position does not matter.** Conditional survival over
consecutive intervals telescopes: the share who finish depends only on the
funnel's *total* attention cost, not on how it is distributed. Cutting 100 words
from the last screen is worth exactly what cutting 100 from the first screen is
worth. The report prints one number for this, not a per-step ranking, because a
per-step ranking would imply a difference that does not exist. `tools/attention.test.js`
pins it.

**For the boundary, only early cuts count.** The boundary is a crossing point,
and crossings are decided entirely by what comes before them. Cutting after the
boundary cannot move it.

So: *to get more people to the end, cut the most words anywhere. To get more of
the product in front of the median user, cut early.* Those are different
objectives and a screen-by-screen edit that does not say which one it is serving
is guessing.

---

## The techniques, grouped by the lever they actually pull

### Lever 1 — remove a field (worth ~3–42× a hundred words)

Every one of these converts words *and* a demand into nothing.

| technique | how it applies here |
|---|---|
| **Smart default** — if most users pick A, ship A selected | already done well in `pc-catalog.js` scope rows: every line arrives pre-decided and the user only changes what is wrong. The step costs 0 fields as a result. |
| **Derive instead of ask** — compute it from what you already have | `q_freq_unit` is a select next to `q_freq`; the unit is guessable from magnitude in most cases. |
| **Ask once, reuse forever** | `s_name`…`s_attr` (5 fields, 28s, the single heaviest field cluster in POST-CALL) is already once-only — but it is charged on the *first* proposal, which is the run that decides whether there is a second one. Moving it after the first document is generated converts 5 fields from a toll into a follow-up. |
| **Constrain the input so the error cannot happen** | deletes the validation copy rather than shortening it. |
| **Progressive disclosure of fields** — reveal only on the branch that needs them | the 23 controls this repo already declares off-path are this technique working. |

### Lever 2 — remove a hand-off (worth ~520× a hundred words)

PRE-CALL step 1 says: copy this prompt, run it in Claude or ChatGPT, come back
and paste the result. The user leaves. Nothing in a dwell model covers a closed
tab, and returning is a fresh decision competing with everything that happened
in the other tool.

This one line of the report is the strongest finding in the file:

```
STRUCTURAL CEILING 30.6% — BELOW the 32.1% benchmark.
  18 fields cost 52.9%, 1 hand-off costs 35.0%.
  Cutting words cannot reach the benchmark. Structure is the binding constraint.
```

With every word free and the user infinitely patient, PRE-CALL still tops out
below an *average* web form. **No amount of editing fixes PRE-CALL.** That is
the same structural verdict the README already reaches by a different route
("עוגן המחיר שלו נשען על העסקה האחרונה של המשתמש, ולכן הוא ריק בדיוק אצל מי
שהכלי מיועד לו") — arrived at here from attention cost alone.

### Lever 3 — remove words (worth what it is worth: real, and smallest)

Ranked by what they replace, not by fashion.

| technique | what it removes | where it applies |
|---|---|---|
| **Delete happy talk** (Krug) | introductory sociable text carrying no content | the largest single block in POST-CALL is `שלב 5 · מה כלול` at **255 words** — the `note` prose in `pc-catalog.js` explaining scope decisions. It is the top cut target in the product by a factor of three. |
| **Table instead of comparative prose** | the connective tissue between compared items | that same `note`: a 58-word paragraph about three scope rows moving becomes a 3-row table of item → where it moved → why, in about 12 words. |
| **Number as the message** | the sentence wrapped around the number | the pricing flow already does this. |
| **Sparkline / dataword** (Tufte) | a sentence describing a trend | `pc-viz.js` is the place. |
| **Diagram instead of describing a flow** | ordered prose | the README uses mermaid for exactly this; the product does not. |
| **Icon + label** | never icon alone — icons without labels are ambiguous and cost a decision instead of saving one | |
| **Front-load (BLUF), one idea per sentence, 15–20 words** | re-reading | 45 blocks in this product run ≥18 Hebrew words. |
| **Recognition over recall** — show the example, don't describe the rule | a paragraph of explanation | `pc-example.js` already does this with a full simulated transcript, and it is the right call. |

### The hover question specifically

You asked about answering via mouse position. The model and the guidelines agree,
and the answer is narrower than it looks:

- **Hover does not remove a word from the funnel.** A collapsed disclosure trades
  a large word cost for a small glance cost *plus a decision*. It pays only when
  the majority genuinely does not need the content. If most people must open it,
  it is strictly worse than showing the text: same words, plus a decision, plus
  two interactions.
- **Never put load-bearing content behind hover.** NN/g is explicit: not for
  anything vital to task completion.
- **Touch has no hover**, and hover-only content is unreachable there.
- **WCAG 2.2 SC 1.4.13 (AA)** requires content shown on hover or focus to be
  *dismissable*, *hoverable*, and *persistent*. A bare `title=""` attribute meets
  none of these. This repo currently has exactly two `title=` tooltips, in
  `pc-ledger.js` — small enough to fix rather than defend.
- The modern mechanism is the native `popover` attribute with CSS anchor
  positioning, which needs no JavaScript and works on tap, hover and keyboard
  focus. Baseline across Chrome/Edge 125+, Firefox 132+, Safari 18.2+.

`<details>`/`<summary>` — already used 7 times here — remains the right default
for "most people don't need this", and it survives in-page search.

---

## What the model is not

The absolute completion level is an **input, not a finding**. The model has one
free parameter (how patient the visitor is) and it is not set by judgement: it is
solved for against an external benchmark — Baymard/HubSpot 2026 put average web
form abandonment at 67.9%. Every sensitivity row re-solves it, so a swept
constant can only change *where* the losses fall, never how many there are.

What the model produces that the benchmark does not: the distribution across
steps, the boundary, the ceiling, and the exchange rate between the levers.

Two of the seven constants are assumed rather than measured (`glanceMs`,
`fieldMs`, plus the `exitHazard` for PRE-CALL) and they are labelled `ASSUMED` in
the source with wide bands. The sweep is honest about what that costs:

- The **boundary step moves** across the sweep (POST-CALL: index 2–6). The exact
  step is *not* a robust finding.
- "Value lands after the boundary" holds in **every** sweep, for both tools. That
  one is robust, and it is the finding that matters.
- PRE-CALL's ceiling being below the benchmark holds regardless of any reading
  constant, because the ceiling is computed with reading time set to zero.

The honest summary: this instrument cannot tell you that the median user leaves
on screen 5. It can tell you that they leave before the product delivers
anything, in both tools, under every assumption tried — and it can tell you what
each available fix is worth relative to the others.

None of this is measured on real users. Ten of them would replace the assumed
constants with observed ones; see [first-ten.md](first-ten.md).

---

## Sources

Reading: [IReST, Trauzettel-Klosinski & Dietz 2012](https://pubmed.ncbi.nlm.nih.gov/22661485/) ·
[IReST in a Canadian cohort](https://pmc.ncbi.nlm.nih.gov/articles/PMC10224635/) ·
[How Little Do Users Read?](https://www.nngroup.com/articles/how-little-do-users-read/) ·
[Concise, Scannable, Objective](https://www.nngroup.com/articles/concise-scannable-and-objective-how-to-write-for-the-web/)

Dwell and abandonment: [How Long Do Users Stay on Web Pages?](https://www.nngroup.com/articles/how-long-do-users-stay-on-web-pages/) ·
[Baymard cart & form abandonment](https://baymard.com/lists/cart-abandonment-rate)

Decisions: [Hick's law](https://en.wikipedia.org/wiki/Hick%27s_law) ·
[Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) ·
[Recognition vs recall](https://www.nngroup.com/articles/recognition-and-recall/)

Hover: [Tooltip Guidelines](https://www.nngroup.com/articles/tooltip-guidelines/) ·
[WCAG 2.2 SC 1.4.13](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html) ·
[Popover API](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API/Using)

Visual: [Icon Usability](https://www.nngroup.com/articles/icon-usability/) ·
[Sparkline theory and practice](https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/)
