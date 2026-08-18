# Why each module works the way it does

One file per shipped module, holding the argument behind it. The module itself
keeps a three-line pointer:

```js
/* POST-CALL · which evidence this call can actually carry.
   Pure: no DOM, no storage, no network.
   Why it works this way: docs/modules/pc-ladder.md */
```

## The rule, and where the line is

**A file header of 21 lines or more lives here. Everything shorter stays in the
file, and every comment bound to a line stays on its line.**

That is not a tidiness preference, it is a split by what the comment is for.

A comment sitting above a statement exists to be **unavoidable at the moment of
editing** — it is there to stop somebody reverting the line beneath it. Three
`border-color` declarations in this repository painted nothing for months
because `border:0` is zero *width*; the comment recording that has to be in
front of the eyes of whoever types `border:0` again, at exactly the moment they
are least inclined to follow a link. Move it here and it stops working.

A forty-line block at the top of a file is doing something else. It is not
explaining a statement, it is explaining the file — orientation you read
*before* editing. That is already a document; it just happened to be parked in
a `.js` file. A link serves it, because you follow the link when you are
orienting and you are not orienting in the middle of an edit.

Two things stay in the pointer for the same reason the line notes stay: the
identity line, so you know what you have opened, and the contract line — `Pure:
no DOM, no storage` — because that one constrains the *next* edit rather than
explaining a past one.

Measured before moving anything: 540 comment blocks in the shipped assets, and
311 of them are 4–20 lines carrying 68% of the mass. Those are line-bound.
Moving them would have meant 311 pointers, each one a place for the code and
the prose to drift apart. The 16 headers moved here are the class where the
pointer is per file, and there are 16 of them — the sixteenth found by the test
below on its first run, in a module no page-level scan had reached.

## What holds it together

Prose that lives away from its code goes stale, and this repository has
measured its own rate: three out of three of its out-of-line documents drifted
before anyone noticed — the README's test-package count, the README's file map
(missing eight modules), and `docs/design-persona.md`, which described a
product two versions old. Each needed a test built for it afterwards.

So this directory ships with the test rather than after it. In
`assets/markup.test.js`, `the file headers and docs/modules stay in step`
asserts three things:

1. every pointer names a document that exists;
2. every document here names a module that ships;
3. no shipped module has grown a 21+ line header again.

The third one is what keeps the rule mechanical instead of aspirational. Write
a long header and the build tells you where it belongs.

## What this does not buy

About 9% of `post-call.html`'s transfer weight. That is real and it is not the
reason — the line notes are 68% of the comment mass and they are staying. The
reason is that a file header and a line note are two different objects and were
being stored as one.
