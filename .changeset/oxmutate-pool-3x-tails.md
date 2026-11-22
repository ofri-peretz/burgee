---
"oxmutate": minor
---

The 3x re-runs run in the pool, not after it. A mutant the isolated phase stops at 1x (a watchdog stop
or a slow kill) used to wait for the whole stage to drain, and then its 3x run, and every stopped
confirmation its `recheck`, ran as a serial tail of two to five mutants on a pool of eight (pathe: 36
to 38 s each). The stopped mutant's 3x run is now queued as its own unit the moment its unit ends, so
it overlaps the stage. The verdict is still the 3x run's. `isolatedStages` reports a `rerun` or
`recheck` stage inside its drain, with `at`, when its first run was queued. `bench/container.mjs`
takes `--concurrency N`.

pathe in container mode, two rounds each, alternating with the build before, on the same machine:
259 s to 215 s (1.21x), every verdict equal.
