---
"oxmutate": patch
---

The run report's `x-oxmutate.stats` now says what the isolated phase was made of. `staticFallbacks` counts the static mutants a live worker handed back to a fresh one, by the reason it gave and the globals it named (pathe: 75 mutants, every one of them from two inline snapshots whose re-collected test has no running test to read). `isolatedStages` lists each stage of the phase (first, rerun, confirm, recheck, flaky) with its mutants, its wall time and the most units that ran at once, so a stretch on one core shows up as a stage with a peak of 1.
