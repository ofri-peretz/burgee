---
id: D-20261123-verification-tools-live-in-burgee
subject: 'Where do the new verification tools (proofline, triggerlist, replay, hookset) live?'
taken: 'packages in burgee — the owner, 2026-11-23, on the decision card in the coordinating session'
date: '2026-11-23'
superseded_by: —
---
**Packages in burgee**, next to `apicontract` and `oxmutate`. The alternative was a new dedicated
repository.

The reason is what they build on: this repository already has the intent process
(`.sdlc/intents`), the release pipeline, the per-PR mutation lane and the lock-test convention
the tools generalise. All of them are burgee CLIs, so they dogfood `defineCommand`.

Each package starts `private` and keeps its working name until its intent's success criteria are
read, the same rule as [`D-20261119-apicontract-stays-private`](./D-20261119-apicontract-stays-private.md).

**Lint rules go to the eslint monorepo, not here.** The owner, 2026-11-23: lefthook and our own
ESLint plugins are the preferred levers, and missing rules are implemented in the eslint repo so
they spread to every consumer. The test-integrity rules (no `.only`, unexplained skips, fixed
sleeps, retries, weakened assertions) are therefore an intent in `ofri-peretz/eslint`
(`docs/intents/test-integrity/`), not a package here. The same holds for any later check that can
be a lint rule: it goes there; a check that needs a CLI, git history or a model goes here.

**Every product CLI is a burgee program.** The owner, 2026-11-23. The tools here, and any CLI
another Interlace repo ships, are built with `defineCommand`. The foundation packages burgee is
built from (roundel, linegauge, closeout, seniority, bellpull, paratext, caique, flagstaff,
controlroom) are exempt, because depending on burgee would make a cycle the zero-dependency rule
forbids.

Intents: [`proofline`](../intents/proofline/intent.md),
[`triggerlist`](../intents/triggerlist/intent.md), [`replz`](../intents/replz/intent.md),
[`hookset`](../intents/hookset/intent.md), and the apicontract lane
[`contract-properties`](../intents/contract-properties/intent.md).
The gap analysis they come from: <https://claude.ai/artifact/BCjCqoaRfDvtQeha24HrNi>.
