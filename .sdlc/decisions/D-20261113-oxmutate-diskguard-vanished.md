---
id: D-20261113-oxmutate-diskguard-vanished
subject: 'oxmutate disk guard: is an entry that appeared in the project and is gone again before the guard looks twice a write outside the sandbox?'
taken: 'Taken — by the session building oxmutate-fastest, on the owner''s delegation of 2026-11-11 ("You can make all calls")'
date: '2026-11-13'
superseded_by: —
---

**No. The guard reports an added entry only if it is still there after git has been asked about
it. One that is gone again is a running test's own scratch, and no unit is re-run for it.**

**What happened.** compat-oracle's `run.test.ts` makes a `.setup-probe-*` directory in the
package root for about a second and removes it. Units run side by side, and the guard looks when
any of them ends. When it saw the directory, it removed it, dropped the verdicts of every unit in
flight and queued them again in halves. On the full package at 4 workers, 35,517 mutant-test
pairs ran for 16,865 distinct ones, and 1,253 of 1,682 warm units were run again in full
(`sc8-profile.md` §9).

**Why an ignore rule was not enough.** `.setup-probe-*/` in `.gitignore` left 17 of 21 guard
re-runs on a slice. Git applies a directory rule only to a path it can see is a directory. By
the time the guard asked, the test had removed it, and git answered "not ignored".

**What the guard still catches.** Everything it was written for (#1453): a tracked file changed
or removed, and any new entry that stays. Those are what a later unit can read.

**What it gives up.** A mutant that writes a new file which something then removes within the
same unit is no longer noticed. Before, it was noticed only when another unit happened to end in
that moment, so no run could rely on it.

**Verdicts.** Four runs of one slice (`src/run.ts:700-900`, 120 mutants), two on each build. 118
verdicts are the same in all four. Two mutants on line 728 changed, one in a run of the old
build and one in a run of the new: both are decided by a single test that starts a real
`node --test` with a timeout, so they vary with the machine and not with this change.

**Reversible.** One filter in `check()`.
