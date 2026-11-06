---
id: D-20261106-oxmutate-ships-measurements-continue
subject: 'oxmutate is shipped; its measurements run on the schedulers, not as roadmap gates'
taken: 'Taken by the owner, 2026-11-06 ("we need to stop these endless checks, we can run them without the roadmap"; "we should avoid extra gates, we can have schedulers")'
date: '2026-11-06'
superseded_by: —
---

**oxmutate is `shipped`.** It is built, published (`oxmutate@1.5.0`), and has run over every package
in this repository. What held the intent at `approved` were measurement criteria, not missing
behaviour. The owner ruled that measurements are the schedulers' job: they keep running, and no
criterion waits on one more reading.

**The executions, recorded.**

- **The full run over every package.** `npm run mutation:weekly`, engine oxmutate, 2026-11-04/05 at
  `c7582ed8df` and `c1e0ba5f54`: all 12 packages observed, recorded in
  `.sdlc/bands/mutation-ratchets.json` (this PR). Nine held their floors; burgee (88.55 against
  90.9), compat-oracle (74.61 against 91.1) and oxmutate (99.84 against 100) did not, as the
  ratchet file records.
- **Agreement with Stryker.** The SC8 survivor diff is closed
  ([`sc8-profile.md`](../intents/oxmutate/sc8-profile.md), 2026-11-06): of 69 disputed caique
  mutants, 57 were Stryker Timeouts under load, and the two real misses among the other 12 were an
  oxmutate defect (an unhandled rejection scored Survived), fixed with a test that fails without
  it. On the fix, 61 of 61 mutants on those lines agree.
- **Speed.** caique, both engines on one machine: oxmutate 1.30x–1.54x faster than Stryker
  (`sc8/RUNS.md`).

**What the schedulers carry from here.** The weekly run (`dev.burgee.mutation-weekly`) keeps
recording every package's score and floor, so the three breaches above are already where they are
watched; a run with none of them is when the Stryker engine leaves the weekly script. Further
head-to-head readings are taken when they are taken. None is a gate on a release or on this
intent.

**What stays.** Every criterion keeps its text in the intent, with the reading it got; nothing is
restated as met that was not measured. The `burgee` umbrella, which waited only on this intent, is
`shipped` with it.
