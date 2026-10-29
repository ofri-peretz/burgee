---
"oxmutate": patch
---

A Vitest config with `projects` is mutation-tested. Each project resolves `runner` from its own inline config rather than from the options oxmutate passes, so such a suite ran with Vitest's runner, recorded no test, and the run stopped at "the dry run ran no tests". oxmutate now sets its runner on every project; each keeps its own pool.
