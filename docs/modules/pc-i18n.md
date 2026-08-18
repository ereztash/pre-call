# Language and theme, in one place

`assets/pc-i18n.js`

The product is written in Hebrew, in the files, and stays that way:
Hebrew in the markup is what the attention model measures and what
every string-pinning test asserts against. English is an overlay — a
dictionary keyed by the exact Hebrew string it replaces, applied at
render time. There are no invented translation keys to keep in sync
with anything: the Hebrew sentence IS the key, so a copy edit that
forgets the dictionary breaks assets/i18n.test.js instead of quietly
shipping a half-translated page.

Three surfaces get translated:
  1. Static markup — walked once at DOMContentLoaded: text nodes,
     the four read-aloud attributes (placeholder, aria-label, title,
     alt), the page title, and elements marked data-i18n, whose
     whole innerHTML is swapped so inline markup survives word-order
     changes between the languages.
  2. JS-rendered strings — modules pass their Hebrew through
     PC.i18n.tr() at the render seam. tr() interpolates {name}
     params for both languages, so the Hebrew in the code keeps
     reading as a sentence rather than as a template.
  3. The two dynamic documents (the call script, the proposal) —
     they are built from the same seams, so they follow the UI
     language: an English operator sends an English proposal.

The dictionaries load per page (assets/en-*.js) because index.html
has a 16KB transfer budget and the full product dictionary belongs
to the pages that render the product.

Loaded first in the body, before every dictionary and every module.
assets/pc-boot.js in <head> has already set lang/dir/theme, so
nothing here moves layout — this file only fills it in.
