---
id: D-20261101-oxmutate-s3-fixture-sc11-week
subject: 'How oxmutate''s S3 and SC11 are read: S3 on its own fixture, SC11 as one green week from the first green weekly run'
taken: 'Taken by the coordinator on the owner''s delegation of 2026-11-01 ("You call, whatever you think we should do")'
date: '2026-11-01'
superseded_by: —
---

> **Amended 2026-11-01 by [D-20261101-no-mutation-in-gha](./D-20261101-no-mutation-in-gha.md).**
> No mutation runs in GitHub Actions any more. `SC11`'s week reads from the local weekly full run
> (`npm run mutation:weekly`, whose ratchet PR replaces `mutation.yml`'s) and from the pre-push
> changed-lines run of every PR merged to `main` in the window, in place of the workflow runs named
> below. `SC8` is measured locally, both engines on the same machine. `S3` is unchanged.

**S3 is graded on the fixture its definition names, and it is met.** `metrics.md` defines `S3` as
"wall-clock of a full run, no cache, **on the fixture**", targeting ≥ 5x at M1 and ≥ 10x at M3. The
fixture is es-toolkit `src/array` (720 mutants). `m1-results.md` measures it cold at **19.6 s
against Stryker's 160.6 s, 8.2x**. That meets the M1 target and does not yet meet M3's 10x. The design
gate of 2026-10-28 marked `S3` open on paratext (2.4x) and controlroom (slower by the clock). Those
are burgee packages, and burgee-scale wall clock is `S4` and `SC8` ("a full run of burgee … in ≤ 30
minutes on the CI runner"). This decision corrects the row to its own definition. It moves no target.

**SC8 stays open, and it is now measured as a miss.** Weekly run 40818077916 (2026-10-29) ran the
tool on 11 of 12 packages. compat-oracle alone took 203.4 min of engine time and caique 135.4 min,
against Stryker's 58 and 80 min on 2026-10-24. The cause is being worked as engine changes:
false-positive pollution restarts (1,306 in compat-oracle), and runaway watchdog cold restarts plus
timeouts re-run at 3x (1,142 runaways in caique).

**SC11 reads as one green week.** `SC11` asks that `mutation.yml` "runs the tool for one full week"
before the Stryker job is removed. The full run is weekly, and heavy work runs only on the schedule
(`D-20261101-heavy-ci-runs-nightly`). So the week starts at the first **green weekly full run** under
oxmutate. It closes seven days later if every oxmutate mutation run on `main` in that window is green:
the weekly full run, and the changed-lines lane of every PR merged to `main`. A red run in the window
restarts the week.

**Reversal.** If `S3` is re-measured on the fixture below 5x, it reopens. If a later reading shows
the fixture is not representative of the tool's promise, a new decision moves the ship gate to `S4`.
