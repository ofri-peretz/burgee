# Roadmap — `oxmutate-fastest`: extremely fast, on one machine

Intent: [`intent.md`](./intent.md) · Design: [`spec.md`](./spec.md) · **Written:** 2026-11-13, at
the owner's request: "build a roadmap how we can improve oxmutate performance. we would like to
become extremely fast (without remote servers, etc.)".

Everything here runs on the machine that runs the tests. No remote workers, no hosted cache, no
service (PRINCIPLES rule 1).

**Estimates are estimates.** A number marked _measured_ names its run. Every other gain below is
what the profile suggests, and each item ships only when its own measurement says so.

## Where we are

| Package | Against Stryker | Reading |
| :-- | :-- | :-- |
| paratext | at least **21.5x faster** | _measured_ 2026-11-12, one machine, 4 workers, load about 50: Stryker 380.0 s, oxmutate 17.7 s. oxmutate graded more mutants (1,332 against 1,255), so equal sets can only raise it. One run each. |
| caique | **3.65x faster** | _measured_ 2026-11-13, equal sets (6,428 mutants matched), one machine, 4 workers: Stryker 3,391 s, oxmutate 928 s, mean loads 19.3 and 13.4. One pair. Before #1532 it was 1.3x to 1.5x (`sc8/RUNS.md`). |
| compat-oracle | **unknown, probably slower** | No valid head-to-head. The last full run took 1,063 minutes here; Stryker's took 58 on a CI runner while skipping 1,298 mutants. |

**Where a run's time goes** (_measured_, the 2026-11-04/05 full run, all 12 packages):
static mutants 68%, isolated runs 19%, warm runs 13%, the oxc core 0%.

**Inside the warm phase** (_measured_, paratext, 2026-11-12): the servers ran 11.5 s for 1.7 s
of test runs. A CPU profile put about 20 s of 53 s busy in starting Node and loading modules,
across 152 process starts for 72 units.

So "extremely fast" is four things, in this order of size: **run fewer tests per mutant, start
fewer processes, never decide the same mutant twice, and use the machine well.**

## Targets

| Package | Today | Target | Criterion |
| :-- | :-- | :-- | :-- |
| compat-oracle | unknown | at least 1.5x faster than Stryker, same graded set | `F7` (the owner's) |
| caique | 3.65x (one pair) | at least 3x, as a median of two pairs | new, `F8` |
| paratext | 21.5x | at least 30x | new, `F9` |
| A one-file change, any package | not measured | under 60 s, on the changed lines | new, `F10` |
| The full repository | 37.5 hours | under 4 hours at 4 workers | `F4` asks for 3x; this is 9x |

`F8` to `F10` and the full-repository figure are proposals. They become criteria when the owner
accepts this roadmap.

## The rule every item passes

Speed never buys a verdict. Each change goes through `bench/ab.mjs`: the build before against the
build after, alternating, on the fixture set, paratext and a compat-oracle slice. Any mutant
detected by one build and not the other stops the change. A heuristic that cannot be proven by
that diff ships off by default with an audit on every run.

## Track 1 — Start fewer processes, and start them faster

The warm phase and every small run. Judged on paratext.

| # | Item | Evidence | Expected | Risk to verdicts |
| :-- | :-- | :-- | :-- | :-- |
| `1.1` | Keep the progress and results files open | Done, #1532. _Measured_: paratext warm 24.8–25.8 s → 9.3–9.9 s | — | None; same bytes |
| `1.2` | Node's compile cache for servers and workers | **Tried and dropped, 2026-11-13.** _Measured_ with `bench/ab.mjs`, main against the change, two rounds: every verdict equal, and slower on 9 of 11 targets, paratext 18.4 s → 20.0 s (0.92x), fixtures 0.81x to 1.05x. The cache is more small files to open, which is the cost #1532 removed | — | — |
| `1.3` | Recover from pollution inside the worker | paratext: 18 restarts, each a new process and a unit split in two; the static path already resets a module registry in 0.5 ms | 20–30% of paratext's warm phase | Medium: touches the canary. Needs a model and a fixture |
| `1.4` | Fewer, larger units | About 136 ms a unit outside its tests; the cap is 400 pairs | 10–20% of warm | Low: after `1.3`, since a restart then redoes more |
| `1.5` | A worker that outlives its unit | Most of the remaining start-up. Vitest starts a fresh worker for every `start` when `isolate` is on | Large, up to 2x on warm | High: isolation is what several guarantees rest on. Only if `1.2`–`1.4` leave start-up dominant |
| `1.6` | Start workers from a snapshot | Node can start from a heap snapshot with modules already loaded | Unknown; a spike first | Low if it works; it may not survive Vitest's loader |

## Track 2 — Run fewer tests per mutant

The static and isolated phases, which are 87% of a full run. Judged on the compat-oracle slice
and caique.

| # | Item | Evidence | Expected | Risk to verdicts |
| :-- | :-- | :-- | :-- | :-- |
| `2.1` | Group static survivors (`M1`) | _Measured_: 10 static mutants on one line cost 389 s, each alone in every loading file | 5–15x on the static phase | Real: two mutants can mask each other. Off by default, different statements only, 5% audited |
| `2.2` | A slow test is not a kill | Done on this branch. Fewer false kills, and fewer re-runs they caused | Correctness first | Removes a false-kill path |
| `2.3` | Drop mutants that compile to the same code | Two mutants whose minified output is identical have one verdict; a mutant identical to the original is equivalent. oxc's minifier makes the comparison cheap | Fewer mutants to run; published results for the technique vary, and nothing is measured here | Low: identical code, identical behaviour. Reported, never silently dropped |
| `2.4` | Choose a static mutant's tests by what reads it | Today every file that loads the module runs. `oxc_semantic` knows which functions reference the mutated binding | Large where data is read by few tests; none where one table feeds everything | Low if exact; falls back to all files when a binding escapes |
| `2.5` | Confirm survivors in batches | Each warm survivor gets a fresh process today | Up to 2x on the isolated phase, if the profile says confirmations dominate | Medium: same guards as the static path |
| `2.6` | `ignoreStatic` as a flag, and a static budget | The flag `--ignore-static` and a summary line for the static phase are done (the PR after #1547). The budget, `static.budgetMs`, is not | The user's choice: removes the static phase | None to what is graded; the score covers less, and says so |
| `2.7` | Likeliest killer first | A killed mutant stops at its first failing test. History of which test killed which mutant orders them | 10–20% on warm for a mature suite | None: same tests, another order |

## Track 3 — Never decide the same mutant twice

Every run after the first. This is where "extremely fast" is felt day to day.

| # | Item | Evidence | Expected | Risk to verdicts |
| :-- | :-- | :-- | :-- | :-- |
| `3.1` | Say what the incremental cache did | #1467 shipped a fingerprint and a 5% audit; nothing reports reuse | No speed; makes `3.2` measurable | None |
| `3.2` | Incremental on by default for the changed-lines lane | A push pays 41 s of dry run and 41 s of confirmation for 27 mutants (_measured_, 2026-11-12) | Most of a small run | Low: the audit already runs |
| `3.3` | Keep the dry run's coverage | The dry run is half of a small run. Its per-test coverage is valid until a test or a source it reaches changes | Up to 2x on small runs | Low: same fingerprint as the verdict cache |
| `3.4` | A local daemon that keeps servers warm | Between two runs the servers, their module graphs and the compile cache are thrown away | Seconds instead of tens of seconds for a re-run | Low: a process on the user's machine, opt-in, no network |
| `3.5` | Watch mode | With `3.3` and `3.4`: on save, re-decide only the mutants the change reaches | The interactive loop | Low |

## Track 4 — Use the machine well

| # | Item | Evidence | Expected | Risk to verdicts |
| :-- | :-- | :-- | :-- | :-- |
| `4.1` | The governor (`M2`) | A run at a load of 55 to 92 was stopped by hand; at 45 to 120, tests timed out and were scored Killed | Fewer false verdicts; steadier times | None: acts between units |
| `4.2` | Use every free core when the machine is idle | The default is cores − 1, at most 8, whatever the machine | Up to 1.5x on a 14-core machine | None |
| `4.3` | Memory limits per worker and in total | Jest's known failure is the missing total | No speed; no out-of-memory | None |

## Track 5 — Jest

`M4` and `M5` in the spec. Not a speed item for Vitest users; it brings the warm path to
projects that have only the command runner today, where the gain is the largest of anything
here: a process per mutant with no coverage, against a warm worker with per-test coverage.

## Order

1. **Now:** `2.2` and `2.6`'s flag (done), `1.2` (tried, dropped), `3.1`. Small, safe, and each measurable in a day.
2. **Then the two big ones:** `2.1` for the static phase, `1.3` for the warm phase. Each needs a
   model and a fixture that fails without its guard.
3. **Then:** `1.4`, `2.5`, `2.3`, `3.2`, `3.3`, each decided by the counters after step 2.
4. **Then the governor** (`4.1`–`4.3`), before the long measurements that need a steady machine.
5. **Last, and only with evidence:** `1.5`, `1.6`, `2.4`, `3.4`, `3.5`, then Jest.

## What this roadmap does not do

- **No remote execution, no hosted cache.** A shared cache between machines would be the largest
  single gain on a team, and it is out by the owner's rule.
- **No sampling of mutants** as a default. It is fast and it is no longer a score.
- **No new native code for its own sake.** Parsing and instrumenting twelve packages took 2 s of
  135,000 (`ENGINES.md`).

## Open

- **A quiet machine.** The compat-oracle and caique readings need hours at a load under 30. On
  2026-11-13 the load average here reached 252. Until the governor exists, a measurement waits for
  a window, and the window is the owner's to give.
- **Linux and Windows.** Every reading here is macOS with an endpoint scanner. `1.1`'s gain is
  mostly that scanner. One reading on a plain Linux machine is owed before any of this is claimed
  in a README.
