---
id: D-20261113-apicontract-build-go-ahead
subject: 'apicontract and the validator: is the design accepted, so that building may start?'
taken: Taken
date: '2026-11-13'
superseded_by: —
---

**Yes. Building starts.** The owner's words, 2026-11-13, after the vision and the full roadmap were
put in front of them: "You need to loop for the entire day on building the roadmap, improving our
packages and their performance, increase the fidelity and quality. I'll be AFK so you have all
permissions to loop", and then "you need to understand the vision, loop to build intent.md-s and
then designing plan.md-s, and then execute them all."

That is read as the Design→Build accept for [`apicontract`](../intents/apicontract/intent.md) and
the intent accept for the [`validator`](../intents/validator/intent.md), whose design is still to be
written: that intent stays `draft` until it has a `spec.md`, which is what the intent-artifacts lock
requires of an approved intent. The reading is the agent's; the words are the owner's.

Taken with it, each a default the owner can reverse:

- The two defaults in [`spec.md` § Phase 1 design](../intents/apicontract/spec.md) stand: a
  generator's options are burgee option declarations, and `run` may be asynchronous.
- "plan.md" is this repository's `spec.md`. The locks read that name, so it is kept.
- "Beat them both" means Zod and ajv.
- The order is [`roadmap.md`](../intents/apicontract/roadmap.md)'s; each later phase gets its own
  intent and design before its code.

**Not covered by this accept:** Deploy. Nothing is published to npm and no release PR is merged
without the owner.
