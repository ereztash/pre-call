# POST-CALL · which evidence this call can actually carry

`assets/pc-ladder.js`  
Pure: no DOM, no storage, no network.

The tool used to read every cue at once and then choose a pricing method
from whatever came back. That order is backwards, and it produced a specific
failure on the first real transcript anybody ran through it: a consulting
call with no process in it, where "300 שקל לפגישה" — the fee being agreed —
was read as the cost of an incident, because the cue for incident cost is
"a number next to a currency word" and that is all it is. Nothing flagged
it. The engine would have computed a year of value from the seller's own
price.

So the order inverts. First decide what kind of evidence this call can
carry, then read only the cues that kind of evidence licenses. A number
cannot be misread as an incident cost on a call that never established a
recurring process, because on that call nobody looks for one.

Five rungs, ordered by how much they need from the client. Descend until
one holds:

  1  value      a quantity of work, recurring over time, from the client
  2  comparable a similar job you have already closed
  3  anchor     a reference price the client named
  4  market     a readable complexity
  5  cost       your own hours and rate

The bottom rung always holds. That is the point of it — there is no floor
under it, so the ladder cannot fail to produce a price, and a call it does
not understand gets an honest cheap answer instead of a confident wrong one.

Rung 3 arrived from two real calls that were nothing like the automation
work the first four rungs were written for. Positioning and branding: no
process, no systems, no ledger history, and both landing on the bottom rung
with the identical answer, which is a ladder that has stopped
discriminating. What those calls did carry was a price the client named as
their own reference — and that is a rung, because it is the client saying
what this class of work is worth to them.

Separately, and not a rung: both of those calls contained the buyer saying
there was no money or no reason to start, and the tool priced them anyway.
`stalled` carries that sentence back verbatim. It does not change the
method. It changes what the operator is looking at when they read the
number.

What the ladder does NOT do is pick the price. Once the rung is known the
engine still computes every method it has data for and says which yields
most — that comparison is one of the more honest things in this product and
a cascade that stopped at the first hit would delete it. The rung decides
what may be read, not what the number is.
