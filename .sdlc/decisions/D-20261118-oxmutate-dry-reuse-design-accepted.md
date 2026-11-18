---
id: D-20261118-oxmutate-dry-reuse-design-accepted
subject: 'oxmutate-fastest roadmap 3.3: may a run keep each test file''s dry-run results between runs, under the design in dry-reuse.md?'
taken: 'Accepted — the owner, 2026-11-18 ("accept"), in the coordinating session'
date: '2026-11-18'
superseded_by: —
---

**Accepted at Design → Build.** [`dry-reuse.md`](../intents/oxmutate-fastest/dry-reuse.md) is
built as written, in its order of work, starting with its measurement step.

The design's own stop condition binds the build: if the median dry-run share across three
packages is under 25%, the work stops after the measurement and the roadmap row records the
reading. The 1-in-20 audit that repeats the whole dry run on a mismatch is part of what was
accepted, not an option.
