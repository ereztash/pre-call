# Numbers as they are spoken, not as they are typed

`assets/pc-numerals.js`  
Pure: no DOM, no storage, no network.

Every quantitative cue in this product is written around `\d+`. That is a
reasonable thing to assume about a form and a wrong thing to assume about a
transcript: speech-to-text writes what it hears, and a person saying "forty
orders a day" gets back "ארבעים הזמנות ביום". Measured across 200 generated
calls, the value rung — the method the whole product is built around — was
reached 30 times out of 104 when the numbers came back as digits and
0 times out of 96 when they came back as words. Not rarely. Never.

The repository's own demo transcript is written in words, which is how the
gap survived this long: the one call anybody ran locally produced 1 field
out of 13 and that looked like a thin transcript rather than a deaf reader.

The fix is deliberately not a second set of cues. Rewriting the text once,
before anything reads it, means freq, minutes, errCost and the client's
reference rate all keep the single regular expression each already has, and
a cue added later gets this for free without knowing it exists.
