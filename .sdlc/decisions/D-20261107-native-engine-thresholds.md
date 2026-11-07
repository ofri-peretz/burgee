---
id: D-20261107-native-engine-thresholds
subject: 'When a burgee hot path leaves JavaScript for a native engine: profile first, then a threshold rule, not a case-by-case argument'
taken: 'Taken by the owner, 2026-11-07, adopting `ENGINES.md` (one level above this repository) for burgee'
date: '2026-11-07'
superseded_by: —
---

**A burgee hot path moves to a native engine (oxc, swc, esbuild, a Rust or Go core of our own) only
when a profile clears every threshold below. Otherwise it stays JavaScript.** No engine change is
argued case by case. Each one cites this record and the numbers it was measured against.

**Profile first.** Measure `f`, the share of wall time a native engine could do (parsing,
transforming, walking or printing code, scanning bytes), on a real workload, not a fixture. The
whole run can then get at most `1 / ((1 − f) + f / k)` faster with an engine `k` times faster at that
share. At `f` = 50% the ceiling is 2× however good the engine is.

**Switch only if all of these hold.** The thresholds are heuristics, starting points that a
profile can overturn. They are not measurements.

1. `f` is at least **~60%** of wall time on a real workload.
2. A run takes **≥ ~1 s and runs often** (every save, commit or CI job), or it takes minutes.
3. The work is **batch-shaped**: many files or megabytes per invocation, so start-up and the
   boundary are paid once.
4. The **JS↔native boundary is crossed rarely**: the hot loop stays on the native side, with no JS
   callback per node.
5. **The hot loop is ours.** Time spent in user tests, the TypeScript checker or the network is not
   touched by a faster parser.

**Climb the cheapest rung first.** (1) Fix the JavaScript: algorithm, caching, a warm process, less
work. (2) Call an existing native library from JavaScript, loaded lazily. (3) Write our own native
core. (4) Ship a standalone binary. Re-profile after each rung.

**Distribution cost and drop-in parity are counted.** That cost is per-platform binaries,
install size, provenance for each binary, and Bun, Deno and WASM reach, and every user of a
zero-dependency package pays it. Parity graded by the incumbent's own suite is usually larger
work than the engine itself.

**The evidence it rests on (measured):**

- **oxmutate**, the same engine in the same tool: **17.9×** warm against Stryker on its es-toolkit
  fixture (`.sdlc/intents/oxmutate/m0-results.md`), but **1.30–1.54×** on burgee's caique
  (`.sdlc/intents/oxmutate/load-robust.md` P3 and `sc8-profile.md`). On real packages most of the time is
  the tests running, which no parser speeds up.
- **`native-engine` M0** ([D-20261028-native-engine-dropped](./D-20261028-native-engine-dropped.md)):
  a Rust `burgee migrate` on oxc was 3.4–5.0× faster on the CPU part, but that part is 0.6–8.0 ms
  of a 90–135 ms command, so `f` ≈ 1–6% and the projection was 1.00× (ceiling 1.08×). The argv
  core's own work is 1.6–6.0 ms, and module loading is 71–87% of each run. Nothing ported.
- **eslint → oxlint** (import-next, a 5,736-file codebase, `eslint/CLAIMS.md` in the sibling
  repository): **3.1×** end to end, **8×** in pure rule time. The gap between the two is the same
  lesson.

**What follows for burgee.** The argv path (parsing, help, completions) stays JavaScript: it is
start-up-bound, single milliseconds, and an addon's load costs more than the work. Build-time
tooling such as a bundler or minifier is not a runtime engine switch and ships nothing native to
users. It is judged as an experiment against the weight and cold-start bands, not by this rule.
[`burgee-on-oxc`](../intents/burgee-on-oxc/intent.md) is the first intent decided under it.
