# POST-CALL · reading the specific client

`assets/pc-client.js`  
Pure, no DOM, tested in Node.

Templates got the tool to the vertical. This gets it to the one business
in front of you — a bakery and a sixty-person importer running the same
WhatsApp-to-invoice flow do not get the same document, and the difference
is not the price.

One rule governs the whole file: DERIVE, DO NOT ASK. The product exists
because writing a proposal costs time, so buying tailoring with a second
questionnaire would spend exactly what it is meant to save. Everything
here is read off answers the operator already gave. The only new control
is an override for when the read is wrong.

The second rule: say what was inferred, from what, and what it changed.
A document that quietly rewrote its own payment terms is worse than one
that never adapted — the operator signs it either way, and only one of
those they can check. `evidence` and `changes` exist to be shown.
