# Production deployment marker

This file exists to make the production release state explicit when a merge commit has the same tree as an already-built preview deployment.

Current release intent:

- source branch: `main`
- action-contract fix merged in PR #37
- production must expose the same code that passed the full browser journey, accessibility, Core Web Vitals and design audit
- smoke check: `/assets/pc-gate.js` contains `contactChannel()` and discloses WhatsApp before navigation

This is an operational marker only. It changes no product behavior.
