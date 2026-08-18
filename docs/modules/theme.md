# The dark remix — one file, shared by every page

`assets/theme.css`

The palette in each page's stylesheet is the light theme and stays
there; this file only says what the 44 ramp tokens resolve to on a
dark surface. The rule is a mirror: within each hue family the
lightness order reverses, and every dark value is a value the light
ramp already ships — the same vocabulary read from the other end.
That keeps two properties the audits care about: the contrast
between any two steps survives the flip, and no new colour literal
enters the product. The handful of places a mirror lands wrong
(paper, the warning chip) are re-pointed by name below, not patched
at the use site.

Both blocks are identical on purpose and assets/tokens.test.js
asserts it: the first serves people whose system asks for dark and
who never touched the toggle, the second serves an explicit choice.
Explicit light (`data-theme="light"`) simply matches neither.

Everything is @media screen. Print is paper, paper is light, and a
proposal printed from a dark screen must not come out dark — the
print sheets in the page stylesheets keep resolving the light ramp.
