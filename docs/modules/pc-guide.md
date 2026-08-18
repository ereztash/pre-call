# POST-CALL · the conductor

`assets/pc-guide.js`  
Pure: takes a state object, returns what to say. No DOM, tested in Node.

Everything before this assumed an operator who could drive a workspace:
who knows what a scope is, can choose between four pricing methods, and
knows what to do once a document appears on screen. That is a tool for
someone who already knows how to write a proposal — which is not who this
is for. 118 controls visible at rest is "here is everything, help
yourself."

This module inverts it. At any moment it answers one question — what
should this person do right now, and why, in one sentence of plain Hebrew
— and the interface is built around that answer instead of around a form.

Three rules it enforces:

  1. Exactly one next action. Never two, never zero. A finished state is
     still an action ("send it"), because a screen with nothing to do is
     where a first-time user stops and closes the tab.
  2. No vocabulary the user has to already own. No scope, no ROI, no
     triangulation, no provenance. If a word needs a glossary it needs a
     rewrite.
  3. Never blame the user for not knowing where something is. A step that
     lives behind a closed drawer carries the instruction to open it, so
     "go fill question 6" is never something they have to decode.
