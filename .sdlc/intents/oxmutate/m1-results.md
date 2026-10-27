# M1 results: oxmutate against Stryker on real suites

Roadmap: [`roadmap.md`](./roadmap.md) · Metrics: [`metrics.md`](./metrics.md) · Previous:
[`m0-results.md`](./m0-results.md) · Harness: `packages/oxmutate/bench/burgee-pair.mts` and
`bench/metrics.mjs` · CI lane: `.github/workflows/oxmutate-bench.yml` · **Measured:** 2026-10-27,
Apple M4 Pro (14 cores), Node 24.12.0, Stryker 10.0.0, `concurrency: 4` for both tools.

## Verdict

**Trust: met.** oxmutate gives the same verdict as Stryker on 99.9% or more of the mutants on
every subject so far. One of the two remaining disagreements is Stryker's false timeout. The other
is a Stryker runtime error that has not been checked yet.

**Speed: met on unit-test suites, not yet on burgee's slowest.** On es-toolkit (fast, pure tests)
oxmutate runs about 8x faster than Stryker. On burgee/paratext it is 2.4x faster. On
burgee/controlroom it uses 1.9x less CPU but is not faster by the wall clock. Two kinds of suite
hold it back, described under "Where it is not yet better". The `≥ 5x` target in `metrics.md`
(`S3`) is a **miss** on paratext and controlroom, reported here as a miss (rule 3).

**Wall-clock from this laptop is indicative only.** Endpoint-security agents put the 1-minute load
average anywhere between 8 and 76 while these runs went on. The same oxmutate build took 124 s and
278 s on controlroom, an hour apart. CPU-seconds held to within 10% across those runs, so CPU is
the comparison this document leans on. Wall-clock numbers to publish come from
`oxmutate-bench.yml` on a runner that nothing else shares. That lane is added in this milestone
and has not run yet.

## Subjects

| Subject | Mutants | Test files | Shape of the suite |
| :-- | --: | --: | :-- |
| es-toolkit `src/array` (`d79f9bb6ce4f`) | 720 | 68 | Pure functions, ~1 ms tests |
| burgee/paratext | 1,332 | 12 | 404 static mutants (30%); one file of 65 tests that each spawn a subprocess (2.3 s a run) |
| burgee/controlroom | 997 | 12 | One 3.3 s Ink test; a 601 ms test that waits on a timer and covers 425 mutants |

## Results

| Metric | es-toolkit | paratext: Stryker | paratext: oxmutate | controlroom: Stryker | controlroom: oxmutate |
| :-- | --: | --: | --: | --: | --: |
| `T1` verdict agreement | 99.58–100% | — | **99.92%** | — | **99.90%** |
| `S3` wall, cold | 19.6 s vs 160.6 s | 427.4 s | **180.0 s** | 94.3 s | 107.2 s |
| `E1` CPU-s per mutant | — | 0.620 | **0.375** | 0.171 | **0.092** |
| `E2` test executions per mutant (warm only, see note) | 1.51 vs 1.57 | 34.82 | 4.83 | 7.43 | 4.92 |
| `E4` mutants per core-hour | — | 5,811 | **9,605** | 21,066 | **39,061** |
| `C4` peak RSS | — | 324 MB | 305 MB | 399 MB | 389 MB |
| `S2` instrumentation | 35 ms | — | 4 ms | — | 22 ms |
| `T4` static mutants scored | n/a | 100% | 100% | 100% | 100% |
| `A5` bytes an agent reads per survivor | — | 4,094 | **326** | 7,275 | **330** |
| `A7` survivors with a `fix:` line | 100% | 0% | **100%** | 0% | **100%** |
| `T6` servers alive 5 s after a killed run | 0 | — | 0 | — | 0 |

Note on `E2`: oxmutate's count leaves out its isolated re-runs (static mutants, survivor and
timeout confirmation), so it understates the isolated share. `E1` CPU is the full cost of the run.

The es-toolkit row is from the M1 build of the morning of 2026-10-27, before this document's
fixes. It is re-measured on the CI lane before it is quoted again.

### The disagreements, one by one

| Mutant | Stryker | oxmutate | Who is right |
| :-- | :-- | :-- | :-- |
| paratext `template.ts:47` CallExpression | Timeout | Survived | oxmutate: Stryker's hit limit (hits × 100) stops a loop that ends; the covering tests pass |
| controlroom `screen.ts:224` ConditionalExpression | RuntimeError | Survived | Not yet checked: Stryker's worker errored, so Stryker has no verdict to compare. Next: run its covering tests with the mutant applied by hand |

## What oxmutate corrects that Stryker does not

Each correction has a counter in the report's `x-oxmutate.stats` and in the terminal summary. Each
also has a test that fails without it.

| Correction | What it catches | Counter | Proven by |
| :-- | :-- | :-- | :-- |
| Canary, adaptive interval | A mutant that leaves state behind (paratext's plugin registry: 101 restarts a run) would decide the next verdicts | `pollutionRestarts` | `src/e2e.test.ts` registry fixture |
| Survivor confirmation | A mutant that only fails across tests (a no-op `reset()` in `beforeEach`) | `survivorsOverturned` | paratext `plugin.ts`, 1 a run |
| Timeout confirmation, 3x budget | A slow machine read as a runaway: 31 false timeouts in one paratext run at load 40 before this | `timeoutsOverturned` | `src/e2e.test.ts` slow fixture |
| Orphan-free servers | A server spinning in a mutant after its coordinator died: two were found at 100% CPU 11 hours later | `T6` | `src/e2e.test.ts` spin fixture |
| Instrument re-parse | Emitted code that does not parse stops the run (exit 3) instead of scoring a broken file | exit code | `native/tests/instrument.rs` |
| Static mutants scoped to their loaders | Stryker re-runs the whole suite for each one | `isolatedRuns` | paratext: 547 s → 243 s when introduced |

## Bugs found by running real suites

1. **Vitest 5's file module cache served stale instrumentation**, so agreement was 6% until the
   cache was turned off for oxmutate's servers (paratext).
2. **A `??` mixed with `&&` without parentheses** after an operator swap, and string mutants on
   `export … from` specifiers. Both produced code that did not parse.
3. **A mutated `case` test corrupted its case body.** The body was cut from the rendered case at
   a source offset that the instrumented test had moved (controlroom `tabs.ts`). Found by the
   re-parse net on the first controlroom run.
4. **Orphaned servers**, above. The scheduler's own kill was on an `unref`'d timer that never
   fired once the coordinator exited.

## Tried, measured, reverted

| Change | Measured | Why reverted |
| :-- | :-- | :-- |
| Two-round planning (cheapest covering file first, survivors to the rest) | Executions down 23% on paratext, wall up 2.9x | Round 2 waits for round 1 to drain, then its expensive files run as a tail |
| Hybrid static mutants (hit at import and by tests) run warm first | Isolated runs down, but 3 false kills | A module evaluated without the mutant does not stand in for one evaluated with it |
| Units sized by dry-run time, longest first | 30% more units, ~10% more CPU on controlroom | No wall gain that this machine's load could show; re-try on the CI lane |

## Where it is not yet better, and what would change that

1. **Static mutants run one Vitest start each.** That is 404 on paratext. Isolated runs take 86 s
   of its 180 s. Bail at the first failing test and covering-files-first ordering both helped. The
   next step is to re-evaluate the mutated module inside a warm worker without a new Vitest start.
   That needs a sound way to re-import one module graph per mutant.
2. **Tests that wait instead of compute.** Controlroom's 601 ms timer test spends its time idle,
   and so do our 4 servers. Running more servers than cores when the dry run shows low CPU per
   test is the measured experiment to try next. Stryker cannot do it, because its concurrency is
   its process count.
3. **Survivor confirmation is a second pass.** It overturned 1 of 128 paratext survivors. It
   could run only for survivors whose covering tests share state, which the dry run's coverage
   can tell.

## Next actions

- Dispatch `oxmutate-bench.yml` once this lands: paratext, controlroom, roundel, linegauge and
  caique, on the CI runner. Replace this document's wall column with those numbers. Owner: Ofri,
  first run after merge.
- Measure `T3` (three identical oxmutate runs against each other), `C3` (shard balance) and
  `A2`/`S6` (incremental loop) on the same lane. Owner: next oxmutate session, 2026-10-28.
- Try the warm re-import for static mutants (gap 1) behind a flag, A/B on the CI lane. Owner:
  next oxmutate session.
