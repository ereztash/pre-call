# POST-CALL · a journal of transitions

`assets/pc-journal.js`  
Pure, storage injected, tested in Node.

The product is good at snapshots and blind to transitions, and the four
sub-topics that score worst are the same defect wearing four hats: the moment
after a call, the middle of a negotiation, whether anybody got anywhere, and
whether money moved. Every one of them is a transition, and a transition is
only observable if the state before it was kept.

The ledger keeps a baseline in exactly three places — estimatedHours locked at
save, scopeAtQuote locked at send, and the in-memory report snapshot behind the
crossing trigger. Each was added deliberately and each unlocked a whole class
of finding. Everywhere else there is no "before" at all, because
storage.setItem() overwrites the entire list on every write. This is the
general case of those three.

What it is NOT: a second copy of the ledger, and not analytics. It answers one
shape of question the ledger structurally cannot — what moved, and in which
order — and it holds nothing that could not be shown to a stranger.

Two properties are load-bearing:

  1. It can never break the thing it observes. deals.js reports a failed write
     to the operator as a real failure, so if journaling could throw, an
     observation would be able to fail a save. Every path returns null instead.
  2. No free text, ever. It is local, but pc-backup.js round-trips it into a
     downloadable file, so it holds the same discipline as the telemetry row:
     statuses, counts, generated ids. A client name cannot get in even if a
     caller passes one.
