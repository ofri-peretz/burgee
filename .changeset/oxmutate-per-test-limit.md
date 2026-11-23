---
"oxmutate": patch
---

A hang on a fresh worker is stopped at the limit of the test it hangs, as in a warm run ([#1704](https://github.com/ofri-peretz/burgee/pull/1704)), not at the budget
of the whole mutant. The isolated run now marks each covering test with its dry-run time, and the watchdog holds
the run to `timeoutMS` plus 3x that time; a mutant that went to a fresh worker first ([#1727](https://github.com/ofri-peretz/burgee/pull/1727)) had lost the
per-test limit and paid the budget of the slowest test that covers it, 10 s for a hang in a 1 ms test. The re-run
at 3x is 3x the same limit. Static mutants, which run every test of their files, keep the whole budget.
