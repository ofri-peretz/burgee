---
"oxmutate": patch
---

Graded against Stryker 10.0.0's own mutator specs (`npm run compat:mutation`): 236 of 236 pass, 4 that test Stryker's internals are listed as not applicable. Two fixes it found: `"use strict"` and other directive prologues are no longer mutated, as Stryker never mutates them; and a `switch` case mutant is reported as Stryker reports it (`case 1:`, its body emptied) rather than as the whole clause removed. What runs under each mutant is unchanged.
