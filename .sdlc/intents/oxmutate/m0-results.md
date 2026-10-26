# M0 results — can a warm runner beat Stryker by far?

Roadmap: [`roadmap.md`](./roadmap.md) M0 · Metrics: [`metrics.md`](./metrics.md) · Raw data:
[`m0/results/`](./m0/results/) · Reproduce: [`m0/reproduce.sh`](./m0/reproduce.sh) ·
**Measured:** 2026-10-26, Apple M4 Pro (14 cores, 48 GB), macOS 26.2, Node 24.12.0.

## Verdict

**M0 gate: PASS.** The gate was a median of at most 20 ms per mutant and at least 99% verdict
agreement with Stryker. Measured: **0.084 ms** per mutant (Stryker: ~740 ms per mutant per
worker) and **99.72%** agreement (718 of 720). The two disagreements are mutants on which Stryker
also disagrees with itself between runs.

End to end, the oxc instrumenter plus the warm runner scored the same 720 mutants in a median
**9.0 s** of tool time against Stryker's **160.6 s**: **17.9x** faster, using **25.8x** less CPU
(16.4 vs 421.7 CPU-seconds). With Stryker's own 5 s timeout budget instead of the 500 ms one the
warm runner can afford, it is **6.0x** faster and uses **5.4x** less CPU. The runaway mutants'
budget, not the engine, is what separates the two figures.

## Subject and method

- **Subject:** [es-toolkit](https://github.com/toss/es-toolkit) `src/array` at commit
  `d79f9bb6ce4f` (2026-10-24): 69 source files mutated, 68 Vitest spec files, 301 tests. MIT. Chosen
  over a hand-written fixture so nobody can say the subject was built to favour the tool.
- **Incumbent:** Stryker 10.0.0 with `@stryker-mutator/vitest-runner` 10.0.0 and Vitest 4.1.11,
  `concurrency: 4`, `coverageAnalysis: perTest`, `timeoutMS: 5000`, default `timeoutFactor` 1.5.
  Config: [`m0/spike/stryker.config.mjs`](./m0/spike/stryker.config.mjs). 720 mutants.
- **Spike:** [`m0/spike/`](./m0/spike/). Two parts, measured separately and then together:
  1. **Warm runner** (`warm-runner.mjs`, `worker.mjs`): 4 long-lived worker processes. Each imports
     every spec file once, then runs mutants by flipping the active-mutant switch and re-running
     only the covering test callbacks. No test-runner start, no re-collection, no re-import per
     mutant. It reuses **Stryker's own instrumented sandbox and mutant ids**, so verdicts compare
     1:1 and the measurement isolates the execution model.
  2. **oxc instrumenter** (`instrument.mjs`): oxc's Rust parser (`oxc-parser` 0.127, native
     binding) plus span edits, implementing Stryker 10.0.0's 17 mutator and 3 placer rules (Regex
     is not implemented; this subject has no Regex mutants).
- **Same machine, same 4 workers, sequential runs** (never two tools at once). `/usr/bin/time -l`
  for wall and CPU of both tools.

## Results

Medians over 5 runs per row unless noted; ranges in brackets. "Tool time" is the tool's own
measured work (instrumentation plus run), "wall" is `/usr/bin/time` around the whole command.

| | Stryker 10.0.0 | oxmutate α, 500 ms budget | oxmutate α, Stryker's 5 s budget |
| :-- | --: | --: | --: |
| Mutants | 720 | 720 (720/720 same set) | 720 |
| Instrumentation | ~2 s | **0.33 s** | 0.28 s |
| Dry run (301 tests) | 8–15 s (0.82 s of it tests) | **0.71 s** | 0.74 s |
| Mutation phase | 133 s [87–163] | **6.6 s** | 23.6 s |
| Per mutant, median | ~740 ms per worker | **0.084 ms** (p95 2.2 ms) | 0.081 ms (p95 1.7 ms) |
| Tests per mutant | 1.57 | 1.51 | 1.50 |
| **Tool time** | **160.6 s** [103–184] (n=5) | **9.0 s** [8.6–10.6] | 26.9 s [24.8–27.6] |
| Wall incl. harness copy | 160.6 s | 11.4 s [9.9–89.6] | 35.8 s [26.3–98.9] |
| CPU (user + sys) | 421.7 s | **16.4 s** | 78.7 s |
| Peak memory | 4.6 GB (main process only) | 1.4 GB (all processes summed) | 4.7 GB (all processes summed) |
| Verdict agreement with Stryker run 1 | — | 99.72% (all 5 runs: 99.58–99.72%) | 99.03–99.31% |
| **Speedup, tool time** | 1x | **17.9x** | **6.0x** |
| **CPU saving** | 1x | **25.8x** | **5.4x** |

Notes on the numbers:

- **Stryker's own variance is large** on this machine: 103–184 s across 5 clean runs. A sixth run
  (228 s) overlapped other work and is excluded; it is in the raw data, marked.
- **The harness-copy outliers** (89.6 s, 98.9 s) are the test harness copying 1,590 files into a
  fresh directory and deleting it afterwards. This machine's endpoint security scans every new
  file on first read. The tool's own time in those runs was 10.2 s and 26.9 s. Stryker copies a
  sandbox too, inside its measured time. The product needs no copy, because instrumented sources
  can be served from memory through the loader.
- **Memory is not like for like.** Stryker's figure is the largest single process (`time -l`);
  oxmutate's is the sum over all its processes, sampled every 250 ms. Even so, the 500 ms budget
  uses less, because runaway mutants are stopped before they allocate gigabytes.
- **Default mode** (no `--stryker-compat`, so code inside `as` casts is mutated too): 722 mutants,
  9.3 s tool time (n=3), same agreement on the shared 720.
- **The warm runner alone** on Stryker's own instrumented sandbox: 9.1 s (500 ms budget) and 27.2 s
  (5 s budget). The oxc instrumenter adds about 0.3 s and replaces Stryker's ~2 s.

## What the spike found

1. **Where Stryker's time goes.** Stryker's Vitest runner keeps one Vitest instance, but every
   mutant calls `ctx.start()`: Vitest re-collects and re-evaluates the covering test files in a
   worker. On this subject the dry run alone shows the split: 301 tests, 0.82 s net test time,
   12.4 s overhead. The mutation phase is the same overhead, 716 times.
2. **Warm workers need isolation guards, or they lie.** A warm worker shares modules across spec
   files and across mutants, which Vitest isolates per file. Measured on this subject:
   - Mutant #394 (`arr.slice().sort` → `arr.sort`) sorted a spec file's module-level fixture in
     place. The next mutant on the same worker, #397, saw the reordered fixture and was reported
     **Killed**; Stryker and a direct Vitest run both say **Survived**. Found by bisection over the
     358 mutants that ran before it.
   - **Fix:** after each mutant, re-import only the spec files whose tests ran, as fresh module
     instances (`?r=n`), so fixtures are renewed while instrumented sources stay warm. Cost:
     ~0.5 s total over the whole run. #397 now agrees.
   - Two more guards: kills that follow another file's tests are confirmed in a fresh worker, and
     every 100 mutants each worker re-runs the unmutated suite (a pollution checkpoint). Neither
     fired a correction on this subject after the fix above; both stay.
3. **Runaway mutants dominate the warm runner's time.** 12 mutants hang synchronously (loops whose
   mutated bound is never re-checked through the switch, so the hit counter cannot stop them). With
   Stryker's own 5 s budget they cost more than the other 704 mutants together. In-process tests run
   in microseconds, so the 5 s absolute slack (sized for process start-up noise) is unnecessary: a
   500 ms budget plus 1.5x the covering tests' time changed **no verdict** on this subject and
   removed the out-of-memory race. It must be re-checked on subjects with slow tests before it
   becomes a default.
4. **Worker threads are the wrong isolation unit.** A thread that reaches its heap limit can abort
   the whole process (`FATAL ERROR: Reached heap limit`). Warm workers are child processes with
   `--max-old-space-size`; an out-of-memory mutant kills only its own worker, which is replaced.
5. **Stryker never mutates inside TypeScript casts or enums.** Its type-node list includes
   `TSAsExpression` and `TSEnumDeclaration` (`instrumenter/dist/src/util/syntax-helpers.js`), so
   `new Array(n) as T` or `xs[xs.length - 1] as Fn` produce no mutants. On this subject: 2 mutants
   (0.3%). The oxc instrumenter mutates them by default and has `--stryker-compat` for 1:1 parity.
6. **Random-dependent tests make some verdicts nondeterministic in both tools.** `sampleSize` uses
   `Math.random`; its mutants #504–#506 flip between Killed and Survived across runs of either tool
   (verified with direct Vitest runs: #506 killed 2 of 3 times). They are listed, not tuned away;
   metric T3 (verdict stability) counts them.

## Disagreements, every one explained

Against Stryker run 1, the oxc pipeline at the 500 ms budget disagrees on 2 of 720 mutants.
Across all five Stryker runs it agrees on 99.58–100% (100% against run 2). Stryker's run 1
disagrees with its own runs 2, 3, 5 and 6 on 1–2 mutants each, the same ones:

| Mutant | Stryker, across its 5 runs | oxmutate | Why |
| :-- | :-- | :-- | :-- |
| `sampleSize.ts:32` BlockStatement (#505) | Survived, NoCoverage, Killed | NoCoverage | `sampleSize` draws random indices; whether the covering test reaches this block depends on the draw. Nondeterministic in both tools. |
| `sampleSize.ts:36` CallExpression (#506) | Killed, Survived | Survived or Killed | Same cause; a direct Vitest run kills it 2 of 3 times. |
| `windowed.ts:59` BlockStatement (#669) | RuntimeError, Timeout | Timeout | An unbounded loop. Whether the worker dies of memory first (RuntimeError) or hits the budget (Timeout) is a race. Both count as detected. |

With the 5 s budget, 3–5 more `windowed.ts:59` runaway mutants flip between RuntimeError and
Timeout in the same race, which is why that column's agreement is lower. Same cause; not a
verdict error.

## What this does and does not show

- **Shows:** on a real open-source TypeScript library, the warm execution model is more than an
  order of magnitude cheaper than Stryker's per-mutant Vitest runs, with the same verdicts on every
  deterministic mutant, once fixture isolation is guarded.
- **Does not show:** behaviour on suites that use hooks, fake timers, snapshot files, mocks of
  modules (`vi.mock`), or browser environments. The spike's Vitest shim implements only what this
  subject uses (`describe`, `it`, `expect`, `vi.fn`, `expectTypeOf`, inline error snapshots). The
  product runner must either drive Vitest's own runner warm or implement the full surface; M1
  decides which, on burgee's own suites.
- **Does not show:** results at burgee scale (13,738 mutants). M3's gate measures that on the CI
  runner.

## Next actions

- **Owner:** take G0 for M1 on these numbers (plan.md).
- **Agent (M1):** port the warm runner onto Vitest's own runner API (hooks, `vi.mock`, snapshots)
  and run burgee's `roundel` and `caique` against Stryker with the same harness.
- **Agent (M1):** install the Rust toolchain (owner decision, plan.md) and move `instrument.mjs`'s
  rules into the Rust crate behind the same mutant-set parity check (720/720 on this subject).
