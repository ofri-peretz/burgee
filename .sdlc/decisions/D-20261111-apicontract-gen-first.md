---
id: D-20261111-apicontract-gen-first
subject: 'apicontract roadmap: does `gen` or `explain` + `diff` ship first?'
taken: Taken
date: '2026-11-11'
superseded_by: —
---

**`gen` is Phase 1 and the first public release; `explain` + `diff` move to Phase 2.** Decided by the
owner on the review of 2026-11-11 ([`review.md`](../intents/apicontract/review.md) F3).

`gen` is the one piece with users asking: openapi-typescript (16.7M installs a week) is in
maintenance mode with no named successor, its TypeScript 7 crash is open with 58 👍, and hey-api
crashes on TypeScript 7 too. The window is being taken now: the fork `openapi-typesafe`, created
2026-11-03, is at `1.0.0-rc.5`. `explain` and `diff` rest on the agent bet (A5–A7), which has no
reading yet. The cost is that the first release leads with a code generator, not with the agent
story the intent opens on; the second kill rule in
[`roadmap.md`](../intents/apicontract/roadmap.md) now reads correctly because of it (no gain at the
Phase 2 exit means stop at Phase 1 scope, a generator).

**Revisit:** if a successor clearly leads before Phase 1 exits (the first kill rule), or if the agent
eval is run early and shows a gain large enough to lead with.

**Note 2026-11-12:** the phases were renumbered when the roadmap was reordered around the generators
([`D-20261112-apicontract-is-a-generator`](./D-20261112-apicontract-is-a-generator.md)). `gen` is
still Phase 1; `explain` + `diff` are now Phase 5, and the second kill rule was rewritten.
