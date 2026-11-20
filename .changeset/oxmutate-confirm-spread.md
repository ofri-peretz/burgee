---
"oxmutate": patch
---

Survivor confirmation runs in fresh workers again by default; the live path of 2.10.0 is `OXMUTATE_LIVE_CONFIRM=1`. Measured on one build, live and fresh alternating (2026-11-20): on pathe the live path took 57.7 s for 122 confirmations against 21.7 s for 119 in fresh workers (the run took 360.7 s against 280.5 s), on ufo 1.2 s for 100 against 3.9 s. The live path also spreads a file's confirmations over the pool, and a static worker's own run of the file, which decided nothing, no longer runs the file's test bodies. The report gains `isolatedStages` (each stage of the isolated phase: mutants, wall time, peak concurrency), `liveConfirmByFile` and `staticFallbacks` (why static mutants went to fresh workers).
