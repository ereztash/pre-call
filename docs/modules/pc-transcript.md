# POST-CALL · the call itself as the input

`assets/pc-transcript.js`  
Pure: strings in, structures out. No DOM, no network. Tested in Node.

The obvious framing is "transcript in, form filled, time saved". That is
the wrong architecture for this product, and getting it wrong would cost
the one thing the tool actually has.

Every claim POST-CALL makes rests on the price being derived from a number
the CLIENT said. That is why the ROI paragraph leaves the document when
the figure was the operator's own invention, why the cost-of-waiting line
disappears on the same rule, and why the tool warns when one guessed
number carries most of the value. All of it currently rests on the
operator ticking a box about where the number came from — a self-report,
and self-reports about your own diligence are the least reliable kind.

A transcript changes the category. It does not merely save typing; it
turns provenance from a claim into evidence. Every number can arrive with
the sentence that produced it and the name of whoever said it. So this
module is built to preserve citations, not to fill fields fast:

  - nothing is applied automatically. Extraction proposes, the operator
    disposes, and every candidate is shown with its quote
  - a value with no quote is not a value. It is a guess wearing a number,
    which is precisely what the rest of the tool exists to prevent
  - provenance is DERIVED from who spoke and what came before, never asked

On where the language model lives: nowhere near here. The tool writes a
prompt, the operator runs it wherever they already have one, and pastes
the answer back — the same pattern PRE-CALL already uses for the business
profile. No backend, no key, no cost, and the promise that nothing leaves
the browser through us survives intact, because the operator chooses where
the transcript goes.
