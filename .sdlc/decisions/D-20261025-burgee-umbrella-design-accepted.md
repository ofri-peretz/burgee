---
id: D-20261025-burgee-umbrella-design-accepted
subject: 'burgee (umbrella): approved as the umbrella over its shipped children, with Z5 restated to a 250-command bench and criterion 4 restated to a ratchet?'
taken: 'Accepted — by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-25'
date: '2026-10-25'
superseded_by: —
---

**Accepted as the umbrella, and the intent moves `review → approved`. It stays the parent of
every child and is not built as one piece.** The spec's 114-row floor stands. The
roadmap tracker counts 110 of its 119 requirements and criteria as holding a check on `main`, and
the children carry them. Two pieces have no child and are restated here as this umbrella's own
build:

- **Z5, restated to the bench.** The in-memory half holds:
  `examples/conformance/src/modularity.test.ts` serves `--help` and `--schema` over 30 commands
  without importing a lazy handler. The precompute opt-in is **dropped**. Nothing measured asks
  for it, and a second code path for the manifest is bytes and a second source of truth. What
  stays is the measurement yargs #1005 asked for: a generated 250-command fixture with
  `--help` and `--schema` timed in the `perf` axis, against the 30-command demo. If the 250-command
  reading is more than 3× the 30-command one, a new intent for precompute is opened from that
  number.
- **Criterion 4, restated from "zero disabled rules" to a ratchet that only moves down.**
  `eslint.config.mjs` carries at least 19 override blocks that switch rules `"off"` for runtime
  source. A lock that demands zero today would either fail or be edited to pass. The lock instead
  counts every `"off"` that reaches a non-test file under `packages/*/src/`, and pins that count
  as a ceiling. Each entry must carry a one-line reason, the count may only fall, and the
  ≥9-plugins half is asserted beside it. Zero stays the target, and the ratchet is how it gets
  there (PRINCIPLES 4: sizes, speeds and pass rates ratchet).

**Text corrected in passing.** The struck *Schema library* question names a built-in `file`,
`path` and `object` type set. `commander-schema` R2 and R4, which would have built them, are
dropped ([D-20261025-commander-schema-dropped](./D-20261025-commander-schema-dropped.md)), and
the intent now says so.

**Build scope, one batch:** the 250-command fixture with its `perf` reading, and the
`eslint.config.mjs` disabled-rule ratchet lock.
