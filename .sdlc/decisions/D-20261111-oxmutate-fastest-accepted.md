---
id: D-20261111-oxmutate-fastest-accepted
subject: 'oxmutate-fastest: the design is accepted at Design→Build, and the build starts at M0'
taken: 'Taken — by the session that drafted the pair, on the owner''s delegation of 2026-11-11 ("You can make all calls, and have the permission to decide when switching to execution")'
date: '2026-11-11'
superseded_by: —
---

**[`oxmutate-fastest`](../intents/oxmutate-fastest/intent.md) moves `review → approved`, and its
[`spec.md`](../intents/oxmutate-fastest/spec.md) is accepted as written on 2026-11-11.**

**Who accepted.** The working agreement has a human accept at Design→Build, and says the agent
that wrote the code does not approve it. Here the owner delegated that accept, in those words, to
the session that wrote the pair. This records that the delegation was used, so a reader does not
take the `approved` status for an independent review. No code existed when it was used. Each
milestone's code still gets its own review before it merges.

**What changed after the first draft, at the owner's request the same day.** Resource limits are
configuration in the shapes Vitest and Jest users already write: `resources.maxWorkers` as a
number or a percentage, and memory as bytes, a size or a percentage. Two memory limits, not one:
`workerMemoryLimit` per worker, as Jest's `workerIdleMemoryLimit`, and `maxMemory` for all
workers together, which Jest lacks.

**What starts.** `M0`: explain why compat-oracle's `hosts.ts` mutants went from Killed on 1.1.0
to Survived on 1.5.0, then add the per-phase counters. Nothing in the static phase changes
before that.

**Reversible.** A status and a start order.
