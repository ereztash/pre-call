# Action Contract Audit

Field feedback exposed a product-wide UX invariant:

> Every action is named for what the user expects to happen next. If an action leaves the product or changes channels, that destination must be explicit before the click.

This document tracks the first pass across PRE-CALL, POST-CALL and entry flows.

## Rules

1. User-facing action labels describe user intent, not internal implementation.
2. Internal terms such as extraction, provenance, evidence candidate, scope engine or ledger internals may explain a result, but should not be prerequisites for choosing an action.
3. Copy, PDF and send actions must never silently become a WhatsApp action.
4. If export is locked, the product stays in place, explains why, and offers a separate, explicitly-labelled route to obtain a key.
5. After unlock, the originally requested export action resumes.
6. Entry labels should match the user's current deal state rather than product module names.

## Field observation

A first-time reader reported that a label such as “חלצו מועמדי ראיה” sounded like internal AI language, and that an export control that led to WhatsApp violated the expectation created by the button.

## First-pass changes

- POST-CALL transcript action: user-task language instead of extraction language.
- Transcript review: “what enters the proposal” language instead of candidate/evidence language.
- PRE-CALL pasted profile action: task language instead of parsing language.
- Export gate: WhatsApp is presented only as an explicit key-acquisition action, never as the implied outcome of Copy / PDF / Send.
- Add regression coverage for forbidden internal-action vocabulary and external-channel labels.

## DOD

A control passes only when a first-time user can answer both questions before clicking:

- What will happen?
- Where will it happen?

If the actual result differs, the control fails the audit even if the underlying feature works correctly.
