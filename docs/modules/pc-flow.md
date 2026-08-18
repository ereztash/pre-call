# POST-CALL · where the price came from

`assets/pc-flow.js`  
Pure: takes the computed model and the citations, returns rows. Tested.

The citations were being thrown away. The transcript step collected, for
every number, the sentence it came from and who said it — and then the
operator confirmed, the form filled, and all of that evidence evaporated.
What remained on screen was a price, which is exactly the shape of thing
this tool exists to argue against.

So the chain is kept and shown. Not a diagram of how the software is
built — the operator does not care — but the arithmetic that turns four
answers into a number they are about to send, each step in the same
language as the room:

  what he said  →  a figure  →  a year  →  what it costs him  →  your price

Two rules, and both matter more than the picture:

  1. The formulas here are read off the model's own output, never
     recomputed. A flow view that does its own arithmetic will eventually
     show a chain that does not end at the price beside it, and then it is
     worse than nothing — an explanation that is confidently wrong.
  2. A step whose inputs are missing is absent, not shown as zero. Zero is
     a measurement; blank is the truth.
