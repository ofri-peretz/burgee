---
id: D-20261111-layer-bar
subject: 'What bar does every layer we build have to clear, and when is it named?'
taken: Taken
date: '2026-11-11'
superseded_by: —
---

**Every layer we build has leading and lagging metrics defined against its named competitors and
beats them on each. "Build our own" is about one thing: a Zod alternative that beats Zod in every
aspect. Package names are chosen after the capabilities are implemented.** Owner direction,
2026-11-11, given on the `apicontract` review together with the choice that the validator has a
code-first authoring API.

Corrected the same day. The first draft of this record read "build on our own" as a rule for every
layer and then recorded an owner ruling that protobuf and GraphQL diff "stay wrapped". The owner
said neither: the build-our-own direction was about the Zod alternative, and the ruling was a button
pressed on a word that had not been explained. Both are withdrawn here.

What follows from it in this tree:

- The validator is a product of its own with its own intent
  ([`validator/intent.md`](../intents/validator/intent.md)), not `apicontract-schema`. Its bar is Zod,
  on every metric; the other validators are read beside it and published, and are not the bar.
- [`apicontract/metrics.md`](../intents/apicontract/metrics.md) states the metrics bar as a rule, its
  targets that allowed a tie now require a win, and `extract` has metrics.
- Naming leaves Phase 0 of [`apicontract/roadmap.md`](../intents/apicontract/roadmap.md). `apicontract`
  and `validator` stay working names.
- **People use `apicontract` with the protocols and spec formats they already have** (owner,
  2026-11-11): the tool reads their files as they are, with no conversion step.

A metric we lose is published as a loss and blocks the claim and the phase exit it belongs to; it is
never dropped or redefined to pass (PRINCIPLES rule 4).

**Open, for the owner:** for protobuf and GraphQL, `spec.md` R9b plans to read the files ourselves
for `explain` and `check`, but for `diff` to run the tool the team already has installed
(`buf breaking`, graphql-inspector) and pass its verdict through. So `diff` on those two needs that
tool present. The alternative is our own breaking-change rules for both, so one install covers them,
at the cost of maintaining rules Buf and The Guild ship weekly. The owner defers it (2026-11-11): decided when
Phase 8 starts, and Phase 8 stands as written until then.

**Revisit:** when Phase 8 is next in line, or if a metric against Zod cannot be beaten.
