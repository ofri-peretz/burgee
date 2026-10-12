---
id: D-20261012-commander-front-end-floor
subject: '`burgee/commander` bundles 61,207 B against commander''s 39,329: what goes lazy, what stays, and what is published'
taken: Accepted
date: '2026-10-12'
superseded_by: —
---

**The owner's direction, 2026-10-12, was "win on value, performance, scale and robustness, and
own the size-versus-value judgement". This is that judgement.** Everything that answers with a
Promise loads on demand. Everything a synchronous `parse()` answers stays in the static graph.
The gap that remains is published as a measured floor, byte for byte, under a downward-only
ratchet (D-157's rule). No surface is deleted to make the number fit.

**What goes lazy** ([`commander-front-end-diet`](../intents/commander-front-end-diet/spec.md)
R1, R2), measured by `/docs/weight`'s method:

- `bellpull/cross-spawn` (4,817 B). commander's own spawn, through `node:child_process`, runs on
  every path commander 15 spawns. `bellpull` loads through `import()` only for a Windows
  executable that isn't launched through node, which commander can't run at all. This supersedes
  D-102's "the spawn cannot go lazy". That was true of the whole spawn and is false of the one
  path that needs `bellpull`.
- The `completion` and `--mcp` routers (757 B), which already returned a Promise.

That takes it from 61,207 to a prototyped 55,633 B, or 1.415×.

**What stays, and why.** The residual is 16,304 B, and `spec.md` names every byte of it:

- `--schema`: 5,725 B. `parse()` returns after `--schema` and the program's own code runs next.
  A lazy document would lose to an early `help()` or `process.exit()`.
- `use()`'s plugin check: 4,262 B. A refused plugin throws where it was registered.
- The `--json` envelope and the E1 floor: 3,176 B. A synchronous action's code is settled
  before `parse()` returns.
- The `host` seam, deprecation, the router, helpers and chunk glue: the rest.

Three ways to go lower were measured or reasoned through and refused, and `spec.md` records each:

- An async `--schema` breaks the agent surface on a common program shape.
- `createRequire` breaks every bundle.
- A top-level `await import()` games `initialBytes` without changing what a user pays.

**Published.** `/docs/weight` carries the measured number. `scripts/subpath-weight-lock.test.ts`
holds `burgee/commander` as an `OVER_INCUMBENT` row with a gap file. `BUNDLED_CEILING` and
`lighter-than-commander` come down to each measurement and never go up. If a later change
reaches 39,329 B without giving up a contract above, the row moves to `DROP_IN_CEILINGS` and
the gap closes. That is the condition this decision is superseded on.
