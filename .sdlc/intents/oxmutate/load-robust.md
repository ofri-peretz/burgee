# Intent + spec — oxmutate is fast on a loaded machine, and its verdicts do not depend on the clock

> Stage 1 artifact. Opened 2026-11-03 by the owner: "oxmutate must be faster, including on
> machines under load … make it really high-fidelity." Built from the SC8 round-2 evidence
> (`.sdlc/intents/oxmutate/sc8/`, merged in #1457) and from `packages/oxmutate/src` at `c7582ed8df`.

**Status:** L1 shipped in #1463 (with deadlock teardown and a 5 s cap per test, owner 2026-11-04), L6 in #1465, L5 with this record; L2, L4 and L7 not built, see §7 · **Opened:** 2026-11-03 · **Owner:** @ofri-peretz · **Follows:** `oxmutate` SC8

---

## 1. What the evidence says

caique, oxmutate 1.2.2 in `strykerCompat` mode, `concurrency: 4`, one Mac (14 cores), runs
`sc8r2-caique-O1`/`O2`:

| Phase | O1 seconds | Share |
| :-- | --: | --: |
| warm (units on the server pool) | 1,707 | 54% |
| isolated (static, unfinished, busy-stop re-runs) | 1,289 | 41% |
| static (live) | 144 | 5% |
| dry run + instrument | 4 | 0% |
| **wall** | **3,143** | |

- **64% of the wall time is spent waiting for mutants that hang.** There are 708 watchdog stops:
  354 *idle*, which average 12.0 s, and 354 *busy*, which average 10.7 s. That is 8,019 worker-seconds,
  about 2,000 s of the 3,143 s wall.
- **Every stop waits a wall-clock budget with a fixed floor.** The warm budget is
  `timeoutMS + max(timeoutFactor, 3) × maxTestMs + 250`, and the isolated budget is
  `1500 + timeoutMS + timeoutFactor × ms × 2`. With burgee's `timeoutMS: 10000`, almost every stop costs
  at least 10 s, whatever the test's own time. Under load the test times stretch too, so the
  budget grows: compat-oracle stops reached 22.5 s at load 40–70.
- **The hang is only classified once the budget has run out** (`heartbeat.ts`). An idle stall,
  where a prompt awaits a keypress that never comes, is recognisable within about a second, but it waits
  the full budget.
- **The 3× re-run of busy stops pays for almost nothing.** It overturned 0 of 354 stops in O1 and 4 in
  O2, but each re-run costs up to 3× the isolated budget.
- **Every stop kills and respawns a Vitest server** (715 spawns in O1), even an idle one, whose
  process is healthy.
- **Load moves the result.** Stryker on caique took 3,322 s at load 10 and 4,835 s at load 29. The
  loads oxmutate ran at (24–36) were too far from that to grade SC8 (`RUNS.md`: ratio 1.52×).

**Validated 2026-11-03 (before any build).**

- **706 of the 708 stops are deadlocks.** Of O1's 354 "busy" stops, 352 read a fresh beat and 0% CPU:
  the worker was waiting outside a test body, in a hook or teardown, so `classifyStall` called it busy.
  Every one of them then got the 3× re-run. Only **2** were real loops (CPU ≥ 25%), and O2 shows the
  same split. The win is detecting quiescence anywhere, not making the busy path faster.
- **The quiescence signal works inside a Vitest `threads` worker.** A probe in Node 24.12 sampled
  `performance.eventLoopUtilization()`, `process.threadCpuUsage()` and the counted
  `process.getActiveResourcesInfo()` for each kind of wait. The table is reproduced in §3 L1.
  - A deadlock (a promise that never settles, or an input stream nobody feeds) reads ELU 0.00, about 0 ms
    of CPU, and no native resource beyond the sampler's own timer.
  - A pending real timer adds a `Timeout`. A child process adds `PipeWrap` and `ProcessWrap`.
  - A busy loop reads ELU 1.00 and 2,993 ms of CPU in 3 s. A blocking `execFileSync` reads ELU 1.00 and
    4 ms of CPU.
  - Each of the five cases has its own signature.
- **Revised estimate for caique.**
  - Stops: 706 deadlocks go from about 11.3 s to about 0.7 s each, saving ~7,500 worker-s, about 1,870 s of wall.
  - Re-runs: removing the ~352 needless 3× re-runs cuts most of the 1,289 s isolated phase.
  - Projection: **3,143 s → about 600–900 s**, against Stryker's 3,322 s at load 10.
  - Server spawns: **715 → under 20**, because only the 2 real loops need a process killed.
  The estimate is replayed on the caique subset before the PR merges.

Fidelity today:

- Two identical runs (O1, O2) disagree on **17 of 6,263 verdicts (0.27%)**, all of them Killed↔Timeout.
  **No mutant flipped between detected and undetected.**
- Against Stryker, every survivor that only oxmutate reports is explained (`sc8/README.md`). The 12 that held
  across runs are Survived (10) or RuntimeError (2) under Stryker's per-mutant report.
- **On-disk pollution goes undetected.** A compat-oracle mutant overwrote its package's
  `package.json` and voided a 5-hour run (#1453). This is gap `A-20261101-oxmutate-disk-pollution-restart`.
- **The incremental cache can reuse a stale verdict.** Its fingerprint is the mutated file's source plus
  the covering test files (`coordinator.ts` `fingerprint`). A change to any other module those tests
  import, to the config, or to oxmutate itself does not invalidate it. The weekly run does not use the
  cache at all.

## 2. What is wanted

**No verdict depends on the wall clock.** A hang is recognised from what the worker is doing:
whether its event loop can make progress, and how much CPU it burns. Waiting is not the evidence. A
wall-clock ceiling stays only as the last resort for a worker that is blocked in I/O.

### Success criteria

| ID | Criterion | Today |
| :-- | :-- | :-- |
| P1 | caique ≤ 1,200 s and compat-oracle ≤ 40% of today's time, at load ≤ 12 on the owner's Mac, equal mutant sets | 3,145 s |
| P2 | Under synthetic load of 1× and 3× the core count, wall time rises by ≤ 1.3× of the unloaded run (Stryker: 1.46× from load 10 to 29) | ~1.5× |
| P3 | Faster than Stryker on caique and compat-oracle **at every load level in P2**, not only on a quiet machine (SC8, generalised) | caique 1.30× at unmatched load |
| P4 | A weekly run of a package whose code did not change finishes in ≤ 60 s (incremental) | full run, 9–190 min |
| R1 | Vitest servers spawned ≤ 1 per 300 mutants (only real loops kill a worker) | 715 for 6,394 (1 per 9) |
| R2 | CPU-seconds per mutant (all processes, from `getrusage` of the run) down ≥ 50% at load ≤ 12 | to be measured in B0 |
| R3 | Worker-seconds spent waiting at 0% CPU ≤ 10% of worker time (today 8,019 of ~12,500) | ~64% |
| L-1 | No re-run, retry or restart path without a bound and a reported overturn rate; the run ends in ≤ 1.5× its predicted time or reports the unit that held it | 3× re-run overturns 0–4 of 354 |
| F1 | 0 detected↔undetected flips between a run at load 0 and one at 3× cores | 0 (at 24 vs 36) |
| F2 | ≤ 0.05% Killed↔Timeout flips between the same two runs | 0.27% |
| F3 | Every per-mutant disagreement with Stryker in an SC8 run is classified in the ledger; 0 unexplained "oxmutate Survived, Stryker Killed" | holds after manual triage |
| F4 | A mutant that writes outside its sandbox is caught in the unit that ran it, the files are restored, and it is reported (the #1453 mutant, red first) | missed |
| F5 | The incremental cache re-runs a random 5% audit sample of reused verdicts each run, with 0 disagreements | no audit |

## 3. Design

Each lever lists its mechanism, an estimate from O1's numbers, and how fidelity is protected.

### L1 — Stop deadlocks early, wherever they wait, from the worker's own event loop

Probe (Node 24.12, worker thread, 500 ms samples, resource counts net of the sampler's own timer):

| Wait | ELU | thread CPU | native resources | rule |
| :-- | --: | --: | :-- | :-- |
| promise never settles / stream never fed | 0.00 | ~0 ms | none | deadlock: stop now |
| real `setTimeout` pending | 0.00 | ~0 ms | +1 `Timeout` | wait (wall ceiling) |
| child process running | 0.00 | ~0 ms | `PipeWrap`, `ProcessWrap` | wait (wall ceiling) |
| `execFileSync` blocked | 1.00 | ~4 ms | loop blocked | wait (wall ceiling) |
| busy loop | 1.00 | 2,993 ms / 3 s | loop blocked | CPU budget (L2) |

- **The worker judges itself.** Its own sampler keeps running while it is deadlocked, because the loop
  is free. Before each test and each hook it records a baseline of the resources it holds (Vitest's
  RPC port, the heartbeat). It reads **deadlocked** when, for `IDLE_CONFIRM_MS` (500 ms, and never
  less than 2× that test's dry-run time), all of these hold:
  - ELU < 0.02 and thread CPU < 5 ms;
  - its resources do not exceed the baseline;
  - no Vitest fake-timer queue is advancing.
- **On a deadlock it fails the pending test or hook itself.** The runner wraps each task's function
  (`getFn`/`setFn` from `@vitest/runner`, and the same for hooks) in a race with the worker's
  deadlock signal. The test fails as a Timeout, the worker stays alive, and nothing is respawned.
- **The coordinator's wall budget stays as a ceiling,** for the cases the worker cannot judge: a
  blocked loop (`execFileSync`), or a timer or child that never ends.


- **Mechanism.** The worker reports what its event loop is waiting on, using
  `process.getActiveResourcesInfo()`, with every beat (`heartbeat.ts`).
  - The test is **deadlocked** when it is inside a test body and the only active resources are stream
    reads (`TTYWrap`, `PipeWrap`, `FSReqCallback` on stdin), with no `Timeout`, `Immediate` or
    outstanding child process.
  - That holds for `IDLE_CONFIRM_MS` of beats (default 500 ms, and never less than 2× the test's dry-run time).
  - The coordinator then stops the run as an idle Timeout.
  - The current CPU-share reading stays as a second witness: a deadlocked worker reads 0–2%.
- **Cheaper stop.** An idle worker is healthy, so it is not killed. The run is ended by failing the
  pending test: the worker's own abort hook rejects the awaited promise, and Vitest reports the test as
  failed. The server is reused, so there is no respawn.
- **Estimate.** 354 idle stops fall from about 12 s to about 1 s, saving ~3,900 worker-s, about 970 s of
  wall time, plus 354 respawns.
- **Fidelity.** A test awaiting a real timer, a child process or network I/O has a matching active
  resource, so it is never read as deadlocked. Fake timers sit in the worker's own JS, so with nothing
  queued natively they read as deadlocked. That is correct: nothing will advance them.
  - `stall.qnt` gains the quiescent state and the invariant "a run with a live timer is never stopped idle".
  - Red first: the idle-stall fixture stops in under 2 s, and a fixture that awaits a 3 s real timer
    passes on both the old and the new build.

### L2 — Budget busy runs in CPU time, not wall time

- **Mechanism.** The dry run records each test's CPU time; the server already reports process CPU
  every 250 ms. A busy run is stopped when its CPU since the test started exceeds
  `cpuFactor × testCpu + CPU_FLOOR_MS` (defaults 3× and 1,000 ms), with the worker at ≥ 50% of a core.
  - CPU time does not stretch when the machine is loaded, so the budget stays tight and the verdict stays
    the same at any load.
  - The 3× wall-clock re-run of busy stops goes. It exists to tell a loop from a slow machine, and
    CPU time already makes that distinction.
- **Estimate.** 354 busy stops fall from about 10.7 s to about 1.5 s of CPU. The isolated phase loses
  the busy re-runs. Together that is ~1,000–1,400 s of wall time on O1.
- **Fidelity.**
  - A test that is legitimately CPU-heavy has a matching dry-run CPU time, so its budget scales with it.
  - A run that waits on I/O at low CPU is neither busy nor deadlocked. It falls to the wall ceiling
    (default 60 s or 10× the test's dry wall time), and that stop is reported separately as
    `Timeout (wall ceiling)`, so it can be counted.
  - Red first: a `while(true)` mutant stops in under 3 s at load 3× cores. A fixture that
    legitimately burns 2 s of CPU passes at that load.

### L3 — Remove the fixed floor from the budgets

- **Mechanism.** With L1 and L2 in place, `timeoutMS` is only a slack term for the wall ceiling. Its
  default becomes 0 under oxmutate's own semantics, while burgee's 10 s keeps its Stryker meaning in
  `strykerCompat`, for SC8 parity.
- **Estimate.** Folded into L1 and L2.

### L4 — Size the worker pool to the cores the machine has free

- **Mechanism.** `concurrency: auto` (the new default) means `max(1, cores − round(load1) − 1)`,
  re-read before each unit starts, never more than the configured maximum.
  - On a loaded machine fewer workers finish sooner, because oversubscription inflated every
    wall-measured cost (the Mac ran at load 45–60 on 14 cores, about 4 of them Sophos).
  - With L1 and L2 the verdicts no longer depend on the count, so changing it is safe.
- **Estimate.** P2 is the measure. It is not estimated here.

### L5 — Incremental by default, with a fingerprint that cannot go stale

- **Mechanism.**
  - The fingerprint covers the mutant itself, every module in the module graph of its covering tests
    (Vitest's dry run already loads them; record each test file's resolved modules with content
    hashes), the oxmutate version, the Node version, the lockfile hash and the resolved config.
  - The cache is on by default for local runs and for `mutation:weekly`, kept in
    `~/.cache/oxmutate/<repo>/<package>`, outside the throwaway worktree.
  - Every run re-runs a random 5% of the reused verdicts (`auditShare`), reports how many disagree,
    and drops the cache for the package if any do.
- **Estimate.** A package with no changes takes seconds; one with a small change takes time in
  proportion to the changed mutants. This is P4, and it is where "seconds, not minutes" comes from.
- **Fidelity.** The 5% audit measures staleness on every run (F5). A cache that has drifted rebuilds
  itself rather than being trusted.

### L6 — Catch on-disk pollution as it happens

- **Mechanism.** Before a run, snapshot the package tree (paths and mtimes, outside `node_modules`
  and gitignored scratch). After each unit, compare.
  - On a difference, restore the files from the snapshot and mark the unit polluted, so its verdicts
    are re-run the way the canary already does.
  - Bisect to the mutant that wrote, and report it as `Polluting` with the path it wrote.
- **Fidelity.** F4, red first, using the #1453 mutant (`` `${live}.vendoring` `` → `""`) on the code
  from before the fix.

### L7 — Mark equivalent mutants, so survivors mean something

- **Mechanism.** Trivial compiler equivalence. Minify the original and the mutated file with
  `oxc_minifier` and compare them. When they are identical, the mutant is `Equivalent`: kept in the
  report, but out of the score.
- **Example.** A `NumericLiteral` mutant whose constant is never read gets marked here. Many of today's
  caique `NumericLiteral` survivors are suspected to be this kind.
- **Fidelity.** Identical minified output means identical program behaviour, so this cannot hide a real
  survivor. Expected to remove a small but noisy share of survivors.

### L8 — No loop that cannot end

The same discipline applies to oxmutate and to the scripts around it:

- **Every re-run kind is bounded and accounted for.** The report carries, for each kind, how many
  times it ran, how many verdicts it overturned, and how many seconds it cost: busy-stop confirmation,
  flaky re-runs, pollution restarts and survivor confirmation. A kind that overturns nothing costs
  only what the bench shows it is worth. The 3× busy re-run goes in B2 (0–4 overturned of 354).
- **Restarts and respawns have a ceiling.** A unit is restarted at most twice. A server that dies
  three times on the same unit sends the unit to the isolated path with its reason.
- **Progress is watched, not assumed.** Before it starts, the run predicts its time from the dry run
  and the stop rate. A run that passes 1.5× the prediction prints which unit is holding it, so a stuck
  run never looks like a slow one.
- **The surrounding scripts** (`scripts/mutation*.ts`, the h2h harness, `pr-blockers`) do not poll
  with patterns that match their own command line. They wait on a pid or on a file, and every wait
  has a timeout. Two incidents of the self-matching kind on 2026-11-02 and 11-03 left loops that
  could never exit.

## 4. How it is proven

- **B0 — load bench, before any lever.** In `packages/oxmutate/bench`:
  - Fixed corpora: the caique subset (`subset.sh`) and a compat-oracle subset.
  - Synthetic load: N node busy-loops at 0, 1× and 3× cores.
  - KPIs: wall time, phases, stops by kind, verdicts. Both engines run, in alternating order.
  - Results go into the SC8 ledger format (`scripts/sc8-ledger.mjs`), so P1–P3 and F1–F2 are read
    from the same ledger.
- **Each lever is one PR,** red first, with its `stall.qnt` change where it touches stop states.
  It reports bench deltas on the subset at 0 and 3× cores, and must not move a detected↔undetected verdict.
- **The full SC8 runs again at the end** on both packages, at load ≤ 12 and at 3× cores, against
  Stryker.

## 5. Order

| Batch | Contents | Unblocks |
| :-- | :-- | :-- |
| B0 | load bench + ledger integration | measuring everything else |
| B1 | L1 (self-judged deadlocks in tests *and* hooks, no respawn) + `stall.qnt` | the biggest win: 706 of 708 stops |
| B2 | L2 + L3 (CPU budgets for the few real loops, drop the 3× re-run and the fixed floor) + `stall.qnt` | P2, F2; the 3× re-run overturned 0–4 of 354 |
| B3 | L6 (pollution detector) | F4, closes the A-20261101 gap |
| B4 | L5 (fingerprint, audit, weekly default) | P4, F5 |
| B5 | L4 (`concurrency: auto`) | P2 tail |
| B6 | L7 (equivalent mutants) | survivor signal |
| B6b | L8 (bounded re-runs with overturn accounting, progress prediction) | L-1 |
| B7 | SC8 re-run at two load levels on both packages | P1, P3 |

B1 and B2 should bring caique from about 3,143 s to about 600–900 s. That is an estimate from O1's stop
log, not a measurement; B0 and B7 measure it.

## 6. Open questions (defaults assumed)

1. **Does 96/96 wait on this?** Default: no. The SC8 runs queued tonight measure oxmutate 1.2.3
   as it ships, and this becomes the next intent.
2. **Should `strykerCompat` keep Stryker's wall-clock timeouts?** Default: yes, so SC8's like-for-like
   comparison stays honest. The new semantics are oxmutate's default.
3. **Does an idle stop count as Timeout or as Killed?** Default: Timeout, unchanged
   (D-20261101-idle-stall-is-timeout). Only how quickly it is decided changes.
4. **Sophos.** Excluding `$TMPDIR` and the burgee worktrees would give back about 4 cores. That is an
   IT/Kandji request, outside this spec.

## 7. Built, measured, and left out (2026-11-03)

**L1, deadlocks the worker calls itself** (`quiescence.ts`, `runner.ts`, `stall.qnt`). The replay
used caique's three most hang-heavy files (`clack-date.ts`, `clack-prompts.ts`, `inquirer.ts`;
964 mutants). Both builds ran back to back, `strykerCompat`, concurrency 4, with mean loads of 20.3
(old) and 15.9 (new):

| | 1.2.2 | L1 |
| :-- | --: | --: |
| wall | 1,308 s | 308 s |
| watchdog stops | 398 | 15 |
| deadlocks called by the worker | – | 215 |
| servers spawned | 405 | 22 |
| isolated phase | 712 s | 29 s |
| Killed / Survived / Timeout | 595 / 168 / 220 | 597 / 168 / 218 |

- **0 detected↔undetected flips.** 10 mutants (1.0%) moved between Killed and Timeout. That is above
  the 0.27% that two runs of 1.2.2 disagree by, so F2 (≤ 0.05%) is **not met**. The score is the same
  either way.
- **The detector did not misjudge any waiting case it was tested on:** a real timer, an unref'd timer,
  a child process, a busy loop, or the slow-survivor fixture. Fake timers that nobody advances are
  called deadlocks, as they should be (`quiescence.test.ts`).
- **Event-loop utilisation was dropped from the signal.** A test's fake timers move the clock Node
  computes it from: it read 5.8e9.

**L6, writes outside the sandbox** (`diskguard.ts`). The `disk-write` fixture rebuilds #1453's shape:
an emptied staging path joined to `copy/`.

- **Without the guard:** every later mutant of the untested `shout` is **Killed** (false kills),
  and `copy/` stays in the project.
- **With the guard:** they are **Survived**, the writer is named (`wrote: ['copy']`), and the project
  is clean.
- **Cost:** a snapshot of 0.14 s (caique) to 6.8 s (compat-oracle, 1,721 files, first read under
  Sophos), and one check per unit of 0.6 ms (caique) to 23 ms (compat-oracle).

**L5, a fingerprint that cannot go stale.** In the `incremental-graph` fixture the helper module the
test asserts through stops checking anything, while the mutated file and the test file stay the same.
1.2.2 reuses the mutant's **Killed**. This build decides it afresh: **Survived**.

**Left out, on the evidence:**

- **L2 (CPU budgets for busy loops).** O1 had 2 real loops in 6,394 mutants; the "busy" stops were
  deadlocks outside a test body, and L1 handles those.
- **L3 (drop the fixed floor) and L8's re-run accounting.** They are moot until a run shows that
  watchdog stops, now 15 of 964, cost something.
- **L4 (`concurrency: auto`).** With verdicts independent of load, this is throughput only, and
  unmeasured.
- **L7 (equivalent mutants through `oxc_minifier`).** It needs a new native dependency and a rebuild
  of the binding, for a gain not yet measured. It belongs in its own PR, with the NumericLiteral
  survivor triage that would size it.

**Added during review (owner, 2026-11-04).**

- **Deadlocks are torn down.** The unit ends where the deadlock was called. The verdicts no canary has
  vouched for go back to a fresh context, and the worker that holds the pending run is dropped.
- **No test is waited on past 5 s** (`MAX_TEST_MS`). The cap applies per test, on every watchdog
  budget, the 3× re-run included.
- **The local mutation lane gets 45 minutes, not 11** (D-20261104-local-mutation-lane). The 11 came
  from a GitHub job that no longer runs it. A run is stopped with SIGKILL at its budget: SIGINT had
  let one run 354 minutes.
