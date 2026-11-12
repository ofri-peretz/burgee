---
id: D-20261111-oxmutate-fastest-defaults
subject: 'oxmutate-fastest: grouped static mutants off by default, a polite resource governor by default, worker memory measured not read from the OS, and Jest 29 and 30 on jest-circus'
taken: 'Taken — by the session that drafted the intent, under the owner''s standing delegation of two-way doors, 2026-11-11'
date: '2026-11-11'
superseded_by: —
---

**Four defaults for [`oxmutate-fastest`](../intents/oxmutate-fastest/intent.md), each a config
value a later decision can change.**

1. **Arming several static mutants in one run is off by default (`static.group: 1`).** Two armed
   mutants can mask each other, so a group that passes is a heuristic, not a proof. It ships
   behind the option, restricted to mutants in different top-level statements, with 5% of
   group-survived pairs re-run alone on every run. The default rises only by a new decision,
   after identical verdicts on three packages (spec `R3`–`R6`).
2. **The governor is polite by default, on CI too.** `resources.priority: 'low'`,
   `maxLoad: 1.5 × cores`, `maxMemory: '50%'`. A CI job that wants the whole runner sets
   `resources.maxWorkers` to a number and `priority: 'normal'`. One default is easier to
   reason about than a CI detection that guesses.
3. **A worker's memory cost is measured, not asked of the OS.** The governor uses each server's
   own resident size from the dry run against total RAM. `os.freemem()` counts only free pages
   on macOS and reads near zero on a healthy machine.
4. **Jest means Jest 29 and 30 with jest-circus.** `jest-jasmine2` is legacy and has no
   `handleTestEvent`, which the runner arms mutants through.

**Not decided here, because it is a measurement:** why compat-oracle's `hosts.ts` mutants went
from Killed on 1.1.0 to Survived on 1.5.0. That is the intent's criterion `F0`, and nothing in
the static phase changes before it is answered.

**Reversible.** Each is a default or a supported-version list.
