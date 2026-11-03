---
id: D-20261104-local-mutation-lane
subject: 'The pre-push mutation lane gets 45 minutes, not 11: its budget was sized for a GitHub job that no longer runs it; and an oxmutate run is stopped with SIGKILL at its budget'
taken: 'Taken — the owner''s ruling of 2026-11-04 ("only locally"), applied by the session building oxmutate-load-robust'
date: '2026-11-04'
superseded_by: —
---

**What was there.** `PR_BUDGET.wallClockMinutes` was 11: in a 15-minute GitHub job, the build took
about two of them. Since D-20261101-no-mutation-in-gha the lane runs only in the pre-push hook, on
the owner's machine. No job constrains it.

**What it cost.** oxmutate's deadlock change (about 280 new lines in `quiescence.ts`) could not be
measured in 11 minutes at concurrency 1 on a loaded machine. Pushed whole, the change ran past the
budget. Split, it still did: the run told to stop at 11 minutes stopped at 354 (2026-11-03).

**Decided.**

1. **The budget is 45 minutes.** A run that needs more still fails as a pull request too large to
   mutate in the lane. It never passes unmeasured.
2. **An oxmutate run is stopped with SIGKILL at its budget.** SIGINT reached burgee's shutdown layer,
   which runs its exit handlers before exiting, and something in them did not end. oxmutate writes
   no source, so there is nothing for a gentle stop to restore. Its servers end with their
   coordinator's IPC channel. Stryker keeps SIGINT, which is how it restores the sources it
   mutated in place.

**Not decided here.** Why oxmutate's CLI does not exit promptly on SIGINT. That is its own defect,
to be traced in burgee's shutdown handlers.
