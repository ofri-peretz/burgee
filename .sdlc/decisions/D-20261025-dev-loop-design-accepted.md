---
id: D-20261025-dev-loop-design-accepted
subject: 'dev-loop: is the re-grounded design, with W4 (byte-identity) and W6 (the watcher segment timed) left to build, accepted for Build?'
taken: 'Accepted — by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-25'
date: '2026-10-25'
superseded_by: —
---

**Accepted. [`dev-loop/spec.md`](../intents/dev-loop/spec.md) § Design gate 2026-10-25 is the design
Build implements, and the intent moves `review → approved`.**

**What re-grounding found.** `burgee dev` is built and held for criteria 1–3, as restated on
2026-10-18. Criterion 1 is held by `dev.test.ts` and `dev-load.test.ts`. Criterion 2 is held by the
dev suite's `list_changed` wait. Criterion 3 is the manifest diff plus the rendered help. State
isolation is held by `.sdlc/models/dev-reload.qnt` in `models.yml`. Two checks the intent names do
not exist, and both are worth having:

- **W4, Z2 byte-identity.** Non-inclusion is locked by `weight.test.ts`, but a user's tree after
  `burgee dev` is not. The test runs `dev()` over a temp project, edits the entry so a reload
  happens, stops it, and asserts that every file's bytes and the directory listing match the
  snapshot from before. It is proven red by a deliberate write in a scratch copy.
- **W6, the save-detection segment.** The budget test times from `handle.reload()`. The
  criterion is save-to-callable, so the test drives the real watcher: write the file, wait for
  `notifications/tools/list_changed`, call the changed command. It is held to the A30 budget,
  max(500 ms, five imports of the entry).

**Alternatives rejected.** *Restate W4 to non-inclusion*: Z2 is a promise about the user's
project, not about burgee's bundle, and only a test over a project keeps it. *Leave W6 at the
reload segment*: the hand measurement (66–89 ms) is the only evidence for the full path, and
a hand measurement does not ratchet.

**Build scope, one batch:** two tests in `packages/burgee/src/dev*.test.ts`, each proven red first.
