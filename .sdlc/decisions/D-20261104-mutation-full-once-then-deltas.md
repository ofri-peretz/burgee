---
id: D-20261104-mutation-full-once-then-deltas
subject: 'The full mutation run is started by hand, on no schedule: one full run, then deltas'
taken: 'Taken — the owner''s ruling of 2026-11-04 ("we do not want to run oxmutate weekly. only once and then on deltas")'
date: '2026-11-04'
superseded_by: —
---

**What was there.** launchd started `npm run mutation:weekly` every Saturday at 02:30
(`tools/launchd/dev.burgee.mutation-weekly.plist`). Each run measured all twelve packages from
scratch. burgee alone took 922 minutes on 2026-11-03, compat-oracle about three hours, and most of
that time re-measured code that had not changed.

**Decided.**

1. **The full run has no schedule.** The agent stays, as the way to start it from its own worktree
   on origin/main (`launchctl kickstart gui/$(id -u)/dev.burgee.mutation-weekly`).
   `mutation-local-only-lock.test.ts` refuses a `StartCalendarInterval`, `StartInterval`,
   `KeepAlive` or `RunAtLoad` true in it.
2. **Deltas are what runs from then on.** Two parts of the repo carry them:
   - **the pre-push lane** (`npm run mutation:changed`), which mutates only the lines a branch
     changed;
   - **oxmutate's incremental cache** (#1467), which reuses a mutant's verdict until its source,
     the module graph its tests reach, the lockfile or the run's options change, and audits 5% of
     what it reuses on every run.
3. **`--package` repeats, and the packages run in the order given.** A full run cut off part-way is
   finished by naming the packages it did not reach, the quickest first. That leaves the most
   scores behind if it is cut off again. The results of the packages it did reach are carried into
   the same results directory, and one ratchet PR lands all of them.

**Not decided here.**

- **The script's name.** `mutation:weekly` is kept, so the lock tests, decisions and docs that cite
  it still read true. Renaming it is churn with no behaviour behind it.
- **When the next full run is worth its hours.** That is the owner's call, for instance after a
  change to oxmutate's own operators or verdict rules. The incremental cache does not see those
  changes as deltas.
