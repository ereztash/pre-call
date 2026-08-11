# Protocol for the first ten arrivals

Written before anyone arrives, because the alternative is improvising it on the
first person and then having no comparable data from the second.

Three people reached this product on 2026-08-10 — 13:33, 14:54 and 15:38 — and
all three hit a login wall, because the link that had been shared was a preview
deployment behind Vercel SSO rather than the public production alias. That is the
whole reason this file exists: the first turn of the loop was wasted on
infrastructure, and there was no instrument in place to notice.

---

## Ten, not five

The five-user rule comes from Nielsen and Landauer (1993) and it reports a mean:
a set of five finds about 85% of problems. Faulkner (2003) ran 60 users and drew
random subsets from them, and the **range** across sets of five was **55% to
99%**. A mean of 85% with a floor of 55% is not a number anyone can act on — one
draw in that range tells you the product is fine and another tells you it is
broken, and nothing in the result distinguishes which draw you got.

The same paper gives the numbers that matter here:

| participants | worst-case coverage observed |
|---|---|
| 5 | 55% |
| 10 | 80% |
| 20 | 95% |

Nielsen's 31% per-user discovery rate is itself an average across projects, and
real rates as low as 15% appear in the literature — which would need 12 users to
reach 85%.

**So: ten is the floor, twenty is the target, and five is not a study.** The
three people who arrived on 10 August are three of the ten. They are not a study
on their own and must not be treated as one.

---

## What is measured without asking anybody anything

Across 298 designs where both were measured, objective performance and
subjective satisfaction correlate **r = .53**, and users prefer the
best-performing design only **70% of the time**. The 30% divergence is
systematic, not noise: in one recent study people ranked urgency as the most
important factor in a choice whose behavioural predictive power was near zero,
while effort — the strongest actual driver — got only moderate self-reported
importance. Designing from stated preference would have promoted the weakest
signal.

Which means the primary instrument is behaviour, and it already exists. The
journal records every transition locally and the funnel panel reads it back:

- visits, and whether a second one happened
- proposals saved
- proposals sent
- proposals answered
- median minutes from saving to sending
- prices that fell **before** the quote went out — a discount nobody asked for
- prices that fell **at closing** — a discount that was negotiated

None of that requires a question, a server, or an identifier. It is the
operator's own ordered log, which is why the funnel works without the session id
the telemetry row does not have.

**Collection, given there is no server:** ask each participant to use the backup
export (`postcall_journal_v1` is included) and send the file. That is one click
for them and it carries no client names — the journal holds statuses, counts and
generated ids by construction, and a test asserts it.

---

## The two questions, and only two

Asked **after** the task, never before, and never instead of watching.

**1 · UMUX-LITE**, two items on a 1–7 scale:

> היכולות של הכלי עונות על הצורך שלי.
>
> הכלי קל לשימוש.

Two items, reliability .82–.83, correlates .81 with the full SUS, and predicts a
SUS score to about 99% accuracy. The ten-item SUS buys nothing here that these
two do not, and eight extra questions cost answers.

**2 · SEQ**, one item, immediately after the single core task ("turn what you
heard on a call into a priced proposal"):

> כמה קל או קשה היה להוציא הצעה מתומחרת?  (1 = קשה מאוד, 7 = קל מאוד)

Both numbers get recorded next to that person's behavioural counts, never
instead of them. A satisfaction score without a paired behavioural measure lands
somewhere in the 30% divergence with no way to tell that it did — and a test in
`markup.test.js` refuses to let a rating control ship without one.

---

## The task list

One task, because the product has one job. Everything else is a variation on it.

1. **Cold arrival.** Hand over the production URL and nothing else. Do not
   explain what the product is. Watch what they click first.
2. **The core task.** "You have just come off a discovery call with a
   restaurant. Their orders arrive on WhatsApp and get typed into a spreadsheet
   by hand, about 40 a day, roughly 8 minutes each. Produce a proposal with a
   price." Timed, silent, no help.
3. **The second visit.** Ask them to come back the next day and find the
   proposal they made. This is the transition the product scores worst on, and
   it cannot be observed in one sitting.

Record, per participant: whether they arrived, whether they reached a price,
whether they sent anything, where they stopped, and what they said out loud
without being asked.

---

## What not to do

- **No NPS.** It performs no better than ordinary satisfaction measures at
  predicting growth (Keiningham, Aksoy & Cooil in *Journal of Marketing*;
  de Haan et al. 2015 found top-two-box satisfaction at r = .184 against NPS at
  r = .170), it correlates .74–.99 with measures we would collect anyway, and
  there is nowhere near the volume for either. It is not discredited — it is
  merely not better, and it costs a question.
- **No preference votes between designs.** Preference and performance diverge
  30% of the time and the divergence is invisible from inside a preference.
- **No leading the participant to the feature.** If they do not find the ledger,
  that is the finding.
- **No conclusions from three people.** Not from five either.

---

## Sources

- Faulkner, *Beyond the five-user assumption: Benefits of increased sample sizes
  in usability testing*, Behavior Research Methods 35(3), 2003
- Nielsen Norman Group, *User Satisfaction vs. Performance Metrics* — r = .53
  across 298 designs, 70% agreement
- Lewis, Utesch & Maher, *UMUX-LITE: when there's no time for the SUS*, CHI 2013
- Keiningham, Aksoy & Cooil, *A longitudinal examination of net promoter and firm
  revenue growth*, Journal of Marketing 71(3), 2007
- Sauro, *Has the Net Promoter Score Been Discredited in the Academic
  Literature?*, MeasuringU
