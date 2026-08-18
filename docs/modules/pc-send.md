# POST-CALL · getting the document out of the page

`assets/pc-send.js`  
Pure: builds strings, opens nothing. Tested in Node.

The journey measurement said it plainly: from "the call ended" to "a
document on screen" costs one tap, and from there to "the proposal is in
the client's inbox" the tool did nothing at all. It stopped at the
clipboard and left the last, most abandonable step to the operator.

Three routes, because the right one depends on who the client is and the
operator should not have to think about it — WhatsApp for the small
business that answers on the phone, email for the one with a procurement
process, clipboard for everything else.

Every route has a length ceiling that this document is capable of
exceeding, and a link that silently truncates a proposal is worse than no
link at all: the client receives half an offer and the operator never
knows. So the limits are checked before the link is built, and when one
does not fit the module says so instead of producing it.
