# POST-CALL · what this tool's own advice has been worth so far

`assets/pc-history.js`  
Pure, no DOM, no storage. Tested in Node.

The product spends a lot of words being honest about where its numbers
come from. The effort table says it was fitted backwards. The market
tiers say they are converted from published US ranges rather than
measured here. The value coefficient says it is the middle of a
defensible band. All true, all worth saying — and all still assertions
about the tool's defaults rather than evidence about this operator.

Everything needed to replace some of those assertions with evidence has
been sitting in localStorage the whole time. Every saved deal carries
the estimate locked at quote time, the price quoted, the method, and —
once reported — the hours it actually took and the price it actually
closed at. Three things were being computed from that and discarded:

  · priceHold() in deals.js is written, commented, tested, and called
    from nowhere. "Did the price I sent survive?" is the question the
    operator most wants answered and the product answers it to itself.
  · calibration() reports one aggregate ratio. Five jobs each 20% over
    and four accurate jobs plus one that ran 3x produce nearly the same
    ratio and demand opposite corrections — raise the baseline, versus
    leave the baseline alone and fix how one kind of job is scoped. A
    single number cannot tell those apart, so it tells you neither.
  · Which of the four methods actually holds up was never computed at
    all, although every deal records the one it used.

So this module is the tool's own track record. Two rules govern all of
it, and they are the same rules deals.js already set for itself:

  1. Nothing is claimed below the threshold that makes it meaningful,
     and slicing by method makes n smaller rather than larger, so the
     per-method threshold guards a smaller sample, not a bigger one.
  2. What cannot yet be said is stated out loud, with the number of
     deliveries it would take. A track record that only ever reports
     its conclusions is exactly the confident-number-without-evidence
     failure this whole product argues against.
