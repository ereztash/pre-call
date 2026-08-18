# POST-CALL · the proposal you sent and stopped thinking about

`assets/pc-followup.js`  
Pure, no DOM, no storage. Tested in Node.

The structural hole this closes, stated plainly: the product computes
an expiry date for every proposal, prints it in the document the client
receives, and then does absolutely nothing with it. Meanwhile the whole
long-term claim — that the effort estimate stops being fitted backwards
and becomes measured — needs five delivered jobs reported back. Nothing
in the product ever asked for them.

So the moat depended on a return visit the product made no attempt to
cause. It could never fill.

A correction worth keeping, because the first version of this comment
said "there is no server here and there never will be" and that is
simply untrue: api/license.js, api/event.js and api/health.js run
server-side on every deploy. The real constraint is narrower and is a
promise rather than a limitation — no server stores what the operator
writes, and no client detail leaves the device. That sentence is on
privacy.html, and it is the one claim competitors who host your
document cannot make.

Under that promise a reminder cannot be sent from here, because sending
one means holding an address and a date about a named client. What can
be done instead is to hand the operator a trigger that lives somewhere
which does notify them: their own calendar. An .ics file is the whole
mechanism — no account, no permission prompt, no background worker, and
it keeps working on a phone with the tab long closed.

If the promise is ever renegotiated, this file is not what has to
change; it stays as the offline path either way.

The second half is cheaper and matters just as much: when they do come
back, say which proposals have gone quiet. sentAt has been recorded on
every deal since the ledger was written and has never once been read.
