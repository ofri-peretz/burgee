---
id: D-20261026-docs-per-package-c8-r5-reading
subject: 'docs-per-package: how criterion 8 and R5 are read when they are locked'
taken: 'Taken — on the owner''s delegation of 2026-10-12, applied by the roadmap-to-shipped program (batch 17)'
date: '2026-10-26'
superseded_by: —
---

**Criterion 8 is per row wherever a row's value can reach. R5 is held for the nine package apps,
not for the front door.**

**Criterion 8.** It asks that each of `deploy-lock.test.ts`'s mutations be proven red "for every
row rather than for one file". Every executed case now runs once per row. Each run starts from
preflight's real `Resolve the app` step for that row, and the deploy job's `env:` is resolved
from that step's outputs. The mutations that are properties of the one workflow file are still
asserted once: the triggers, `deploymentEnabled`, the dispatch `if:`, the deploy flags,
`working-directory`, `$comment` and the concurrency group. No row's value reaches any of them,
so ten assertions would read the same bytes ten times. That would add run time under load and
catch nothing more.

**R5.** It says each app keeps "exactly six things of its own". As built, a package app owns four
files outside `content/`: `package.json`, `src/site.ts`, its icon and `tests/examples.test.ts`.
The examples test runs that app's own pages against that app's own bin and environment, which
makes it content, not chassis. `apps/docs` keeps the family-wide surface R11 gives it, so the
lock compares the package apps with each other and leaves the front door out. One allowance in
`package.json`: an app may also depend on a sibling family package that its pages' examples
import (controlroom's examples import flagstaff). Any other extra dependency fails.

**Rejected.** Moving `examples.test.ts` into the chassis as a parameterised runner. The nine
copies differ in which environment variables each package's output policy reads. That is a
real per-package fact, and the move would be a refactor of working tests with nothing to show
for it in this batch.

**How to reopen.** If a second runner per app appears, or the examples tests drift in ways
other than the package's own environment, fold them into `docs-chassis/testing`.
