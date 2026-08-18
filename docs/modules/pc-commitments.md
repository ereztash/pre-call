# POST-CALL · commitment readiness

`assets/pc-commitments.js`  
Pure: no DOM, no storage, no reads of anything outside its argument.

The question this replaces is "which field is still empty". That question
has one answer for the whole deal, and it is the wrong shape: a proposal is
not ready or unready, it is a stack of separate promises, and they fail
separately. A missing ROI figure says nothing about whether you know which
systems connect. A silence about SLA says nothing about the delivery date.
Rolling those into one boolean means the tool either blocks a proposal it
had no reason to block, or lets a promise through that nothing supports —
and it has no way to tell you which of the two it just did.

So readiness is per commitment. Each one carries what it would be claiming,
what would have to be true to claim it, and — when it is not ready — what
goes wrong if it ships anyway.

Four rules the assessment holds, none of which are about pricing:

  No commitment beyond evidence.  A promise may not be stronger than what
  supports it. That is the whole file in one line.

  A default is not evidence.  The product supplies starting numbers so
  there is something to correct. Something to correct is not something the
  client said, and the two must never arrive at the proposal wearing the
  same face.

  An answer given after the call is not a client quote.  It is usually
  right and it is still the operator's. It can carry a commitment. It
  cannot carry a claim about what the client told you.

  No system authority beyond system certainty.  A regex that matched the
  word "security" has found a topic, not a decision about it.
