# Where this sits in its category

Written because every other decision in this repo gets measured against
something — a benchmark, a threshold, a practitioner's rule — and the
product as a whole had never been held up against the category it
actually competes in. "Best in its category" is not checkable until the
category is named and the comparison is real, so this does both: names
real products, cites what they actually offer, and says plainly where
this one is ahead, where it is behind on purpose, and where it was
behind by accident and got fixed.

---

## The category

Freelancer and small-agency proposal/quoting software — the tools a
solo operator reaches for between a discovery call and a signed deal.
Two clusters, per the research below: **all-in-one** platforms that
bundle CRM, invoicing and proposals (HoneyBook, Bonsai, Dubsado,
Agiled), and **dedicated proposal tools** that specialise in the
document and its analytics (PandaDoc, Proposify, Ignition — formerly
Practice Ignition, Qwilr, Better Proposals). This product is closer to
the second cluster in shape — one document, priced — and does not
attempt CRM or invoicing; that line is deliberate and stated below.

Sources, checked August 2026: [Plutio's freelancer proposal software
roundup](https://www.plutio.com/freelancer-magazine/best-proposal-software-for-freelancers) ·
[Agiled's comparison](https://agiled.app/blog/best-proposal-software-for-freelancers) ·
[Ignition pricing and features](https://www.getcone.io/blog/practice-ignition-software) ·
[Ignition plans](https://www.getcone.io/blog/practice-ignition-pricing) ·
[freelance rate calculator landscape](https://freelancepricing.com/).

---

## What the category ships that this product does not

Four gaps, each with the specific tool that does it best and why this
product doesn't just copy it.

**Document view tracking.** PandaDoc and Proposify's whole pitch
includes "know when they opened it, which section they read, how long."
That requires a server the recipient's browser talks to — a tracking
pixel or a hosted-link view. This product's core claim, tested and
documented in `privacy.html`, is that no client content and no client
behaviour ever reaches a server it controls. Adding view tracking would
not be a feature added on top of that claim — it would be that claim
removed. **Not planned. Named here as a deliberate non-goal, not an
oversight**, the same way PRE-CALL's structural ceiling is stated
plainly in `docs/words.md` rather than glossed over.

**Integrated payment collection.** Ignition's standout feature is
automated upfront payment — ACH and credit card, charged the moment the
proposal is accepted, which is real cash-flow value the research is
explicit about. This needs a payment processor, a merchant account, and
a server to reconcile against. Out of reach for a static site with
[zero third-party bytes shipped](../assets/weight.test.js), and out of
scope for what one person can respectably operate without becoming a
payments company by accident. **Not planned**, for the same reason as
above — this product moves the number to a document; sending money is
the client's bank app or the operator's own invoice tool, same as it
was before any of this existed.

**E-signature.** Ignition, PandaDoc and HoneyBook all bundle a legally
meaningful signature flow — identity binding, an audit trail, a
timestamp a court would accept. Building a *fake* version of that (a
"type your name" box with none of the guarantees) would be worse than
having none: it would look like acceptance and carry none of the weight
a freelancer might actually need in a dispute. **Not planned** for the
honest version (needs a server-side identity/audit chain this
architecture structurally refuses), and a fake version is worse than
nothing.

**Branding on the document.** Every tool surveyed — the all-in-one
platforms and the dedicated ones alike — lets the sender put a logo on
what the client reads. This one didn't, and it was the one gap on this
list with no architectural reason to leave open: a small image, stored
the same way the sender's name and phone already are (client-side,
inside the existing `postcall_sender_v1` key, riding the existing
backup file for free), printed next to the name. **Closed this session**
— see the sender box in POST-CALL. Capped at 60KB and validated by MIME
type and a `data:image/` prefix check rather than resized on the fly:
the same "refuse and explain, don't half-build" instinct the calendar
file and the transcript prompt already use, because a silent image
transform is exactly the kind of thing that goes wrong in a way nobody
notices until a client has already received a broken logo.

One more, named rather than silently deferred: **good/better/best
pricing options.** Proposify's own data ties multiple price tiers in
one document to a real lift in close rate — anchoring the client against
a higher option makes the middle one look reasonable. This product's
pricing model already computes a defensible band (`low`/`price`/`high`
in `assets/model.js`, derived from annual value at 17%/25%/35%) rather
than a single number pulled from nowhere — the raw material for three
tiers already exists. It is not built: turning three numbers into three
*documents* means new scope-differentiation logic (what does the client
actually get less of at the lower tier?), new rendering, and new tests
to this repo's standard, which is real, multi-session work rather than
something to rush into an already-large change. **Open. The next
highest-leverage gap**, and the reason it's next is that everything else
on this list is either closed or architecturally out of scope.

---

## What this product does that the category mostly doesn't

Not a consolation list — these are checkable claims, the same way the
gaps above are.

**Nothing is stored on a server, and that is testable, not asserted.**
Every competitor surveyed is subscription SaaS with the client's data
sitting in their cloud. `privacy.html` names the exact three server
endpoints this product has and what each one receives — no client name,
no free text, no transcript, ever. `assets/weight.test.js` asserts zero
third-party bytes ship. A prospective buyer of any competitor above has
to trust a privacy policy; here the whole client-side codebase is the
policy.

**Every number in the proposal cites the sentence it came from.**
POST-CALL's transcript path doesn't just extract a number — it keeps
the quote it was extracted from, and the document shows both. None of
the five tools surveyed do this; their differentiation is in *tracking
what happens to the document*, not in *showing where the numbers inside
it came from*. This is the thing an operator can actually defend a price
with, in the room, which is closer to this product's whole reason for
existing than a feature comparison can really capture.

**Free, with no account, and a one-time unlock instead of a
subscription.** Ignition starts at $49/month, Proposify and PandaDoc are
priced per seat per month, Bonsai bundles a subscription with invoicing
whether the operator wants it or not. This product's core document is
free with no login; payment is a lightweight one-time gate at export,
stated plainly on the paywall screen itself. For the target user —
someone pricing their *first* few automation deals, per the persona this
whole product is built around — that is not a minor pricing difference,
it is the difference between trying the tool and not.

**A published accessibility statement that says what is not yet true.**
None of the five competitors researched publish anything like
`accessibility.html` — a statement naming the exact automated checks
that run, on what schedule, and the gaps that remain (no testing yet
with real assistive-technology users, chief among them). Most SaaS
accessibility statements are marketing copy naming a standard; this one
is generated from, and checkable against, the test suite in
`.github/workflows/test.yml`.

**Two languages and two color schemes, both measured, not assumed.**
Every string that ships has to have an English entry or the build fails
(`assets/i18n.test.js`); the dark theme is a mirror of the same 44-token
ramp rather than a second palette, and both a11y and the design audit
run against both. This is infrastructure quality none of the five
competitors' marketing pages claim explicitly, and it is unusual for a
one-person static site to carry at all.

---

## The honest net

Four gaps looked at, one closed this session (logo), two are deliberate
non-goals that would break the product's actual differentiator if
built (view tracking, payments), one is a fake version of a real thing
that would be worse than absent (signature), and one is real,
in-scope, and open (multi-tier pricing) — named as the next thing to
build, not left implicit.

None of this makes "best in category" a settled claim — that would
need the same kind of user testing `docs/first-ten.md` already argues
for, run against the specific tools named here, not just a feature
table. What this file can say, and can be checked against the files it
cites: on the axis this product actually competes on — a freelancer
walking out of a discovery call with a defensible, private, free-to-try
price — nothing in the five products surveyed does the provenance work
this one does, and the privacy claim here is the kind every one of them
would have to remove their subscription model to match.

---

## Sources

[Plutio — best proposal software for freelancers 2026](https://www.plutio.com/freelancer-magazine/best-proposal-software-for-freelancers) ·
[Agiled — 12 best proposal software for freelancers 2026](https://agiled.app/blog/best-proposal-software-for-freelancers) ·
[Cone — Ignition (Practice Ignition) software review](https://www.getcone.io/blog/practice-ignition-software) ·
[Cone — Ignition pricing and plans](https://www.getcone.io/blog/practice-ignition-pricing) ·
[FreelancePricing.com — freelance rate calculator landscape](https://freelancepricing.com/)
