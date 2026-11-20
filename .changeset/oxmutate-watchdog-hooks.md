---
"oxmutate": patch
---

A `beforeAll` or `afterAll` hook that times out or throws in the dry run now fails it with one line naming the hook's file and the fix, as a failing test does. Vitest skips every test under a failed hook, so before this every mutant of the code those tests covered was reported NoCoverage and the run passed. A mutant the warm run stopped as a runaway, with its worker busy, is now run isolated once at 3x its budget instead of at 1x and again at 3x: the verdict is the one the 3x run gave before, for one stop less (ufo's `punycode.ts`, a loop with no switch in it, spent 2.3 s of 9.2 s on the 1x stop).
