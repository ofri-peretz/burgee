# Design — the Windows cells pass on a saturated runner

Intent: [`intent.md`](./intent.md). **Status:** approved — accepted under the owner's 2026-10-12 delegation.

Refreshed 2026-10-18 against `main` at `1013b65db5`. R3 moved first and was rewritten from
measured durations. R1, R2, R4 and R5 are kept, with stale facts updated.

---

## Requirements

- **R3 — `pwsh` cannot hang the case, and stops paying for the runner's load.** Ordered by
  evidence, cheapest first. All of R3a–R3c land in one PR, in the test-file group. R3d is the
  same PR only if R3a–R3c miss the target.

  - **R3a — Phase timing.** `scripts/complete-pwsh.ps1` writes one stderr line per phase:
    `pwsh-phase start|lookup|dot-source|complete:<n> <ms>`, from `[Diagnostics.Stopwatch]`.
    The test prints those lines when the case takes more than 10 s, so the next slow run names
    the phase that ate the time. Today only vitest's total is known.
  - **R3b — The three cheap candidates, in the owner's order.**
    1. `stdio: ['ignore', 'pipe', 'pipe']` and `-NonInteractive`. stdin is no longer a pipe.
    2. `POWERSHELL_UPDATECHECK=Off` and `POWERSHELL_TELEMETRY_OPTOUT=1` in the call's env,
       which turns off the first-run checks.
    3. An `execFileSync` `timeout` of **100 s**, under the case's 120 s, so a hang fails with
       pwsh's own stderr and phase lines instead of vitest's generic timeout.

    100 s, not the 60 s first proposed: the case took 59,682 ms on a passing run on `main`
    (run 39161241576). A 60 s ceiling would turn the slow passing runs into failures.
  - **R3c — Off the contended pool.** The shell-driving cases (`pwsh`, `zsh`, `fish`,
    `bash`) move into `packages/burgee/src/completions-shells.test.ts`. That file runs after the
    package's parallel pool, alone: `poolMatchGlobs` or a second vitest project with
    `fileParallelism: false`, and the package's `test` script runs it second. Every assertion
    moves verbatim. The manifest-only cases stay where they are.
  - **R3d — If R3a names a phase that R3b and R3c leave slow,** the fix goes to that phase. For
    example: always create the stub, skipping the `Get-Command` PATH walk. Or dot-source once
    with `$PSModuleAutoLoadingPreference = 'None'`. Whatever lands is recorded here with the
    phase lines that justified it.

  *Checks:*
  - `completions.test.ts` › `R3 — pwsh runs non-interactive, without first-run checks, under an
    inner timeout`. It asserts the call's options through an exported `pwshCall()`. Red on
    main: none of `stdio[0]: 'ignore'`, `-NonInteractive`, the two env vars or `timeout` is set.
  - `completions.test.ts` › `R3 — the PowerShell script reports its phases on stderr`. Red on
    main: stderr is empty.
  - `scripts/vitest-pool-lock.test.ts` (new), or a case in an existing pool lock ›
    `R3 — shell-driving cases run outside the parallel pool`. Red on main: they share the pool.

  **The proof is a duration distribution, measured on `main`, not one green run.** The baseline
  is already collected from `main`'s own pushes, so no dispatch is spent on the unfixed side.
  It was read from job logs on 2026-10-18 (compat runs 39149980298 to 39163516235):

  | cells | n | min | median | max | above 60 s | above 50 s |
  | :-- | --: | --: | --: | --: | --: | --: |
  | `Node 24/26 · windows-latest` (full matrix) | 15 | 13.7 s | 22.0 s | 59.7 s | 0 | 3 |
  | `… · published suites` (lighter) | 22 | 0.9 s | ≈1.8 s | 2.3 s | 0 | 0 |

  The 2026-10-12/13 failures (#1092, #1094: 122,208 ms) are the tail of the first row.

  *Fixed* means ten consecutive full Windows cells on `main` after the merge, each with the case
  at or under 60 s, and a median under 10 s. The table of the ten is recorded in this spec.
  `main` produced 15 such cells on 2026-10-18 alone, so this costs nothing.

  If `main` is quiet, the fallback is the owner's proposal: dispatch the Windows cell about ten
  times, using the `os` and `node` inputs R1 adds. Without those inputs, each dispatch is a
  full 13-job matrix on a queue already about six jobs deep.

- **R1 — Durations from the cell.** `compat.yml`'s `matrix` and `floor` steps run vitest with the
  `json` reporter beside the default, and upload the files as an artifact on every OS. Its
  `workflow_dispatch` takes `os` and `node` inputs that select one cell. It has no inputs on
  `main` today (`compat.yml` line 31).

  *Check:* an `npm run lint:workflows` rule: both jobs upload a durations artifact, and the
  dispatch has both inputs.

  *Red on main:* no artifact and no inputs.

- **R2 — A half-budget check.** `scripts/slow-cases.mts <report.json…>` lists every case whose
  duration exceeds half its effective timeout, and exits 1 when any does.

  *Check:* `scripts/slow-cases.test.ts` (new), over a fixture report with one case at 61 of 120
  s.

  *Red on main:* the script does not exist.

  Run against the first Windows report after R1, it must name the cases this intent fixes.
  Otherwise the evidence is wrong, and R4 and R5 are re-scoped from what it names.

- **R4 — `changeset-check-lock` builds its repository once per file.** A `beforeAll` builds the
  base repository. Each case clones it (`git clone --local --no-hardlinks` into a temp
  directory) instead of running `git init` and committing.

  *Check:* the R2 report, and a case that counts `git` spawns per case through a wrapper: at
  most three.

  *Red on main:* each case runs `git init` plus its commits. The file's own comment (line 176)
  says "`git init` took 5.0 s and a single `git commit` took 15.8 s. One case took 52 s."

- **R5 — One `npm` install per file.** Files that run an install do it once, in `beforeAll`,
  with `--prefer-offline --no-audit --no-fund`, and share the tree across cases.

  *Check:* the R2 report, and `scripts/spawn-budget-lock.test.ts` (new), which scans
  `scripts/*.test.ts` for `npm install` or `npm ci` inside an `it(` body.

  *Red on main:* `?`. Ten files spawn `npm`. Whether any does it inside an `it` body is read by
  the lock the day it is written.

- **R6 — `changeset-check-lock` and `dependabot-automerge-lock` start the step's shell once per
  file.** Added 2026-10-27. After
  R4 the build was cheap, and the cost was the first `bash` the file started from Node. That
  `bash` returns before any git, and it took 3.2–8.5 s over ten full Windows cells on `main`, then
  65.9 s in run 40537347822 (timeout 30 s). The second took 0.9–5.9 s. The four that run git took
  0.2–0.9 s. Now `beforeAll` spawns one driver `bash` that runs the step's own script for every
  scenario, each as its own `bash -x` in a subshell with only its own variables and
  `$GITHUB_OUTPUT`. The cases read the answers and spawn nothing. The Dependabot block's 120 s
  budget goes, because its slowest case over those cells was 850 ms.

  `dependabot-automerge-lock` started one `bash` per call, ten per file. Its first case took
  328–561 ms on eight of the ten cells, 6.8 s on one and 29.7 s of 30 s in run 40513685943. Its
  calls became named scenarios on the same driver, `scripts/step-scenarios.ts`, which both files
  share.

  *Check:* `changeset-check-lock.test.ts` › `R6 — starts the step's shell once per file, and
  every scenario got an answer from it`; `dependabot-automerge-lock.test.ts` › `R6 — starts the
  step's shell once per file, and every PR got an answer from it`. The step's defects that the old file caught, written in
  by hand, fail the same cases (D-20261027-windows-lane-one-shell-per-file); the R2 report.

  *Red on main:* six `bash` spawns from Node in one file and ten in the other.

- **R7 — controlroom's Ink case packs its three peers in one `npm pack`.** Added 2026-10-27. It
  took 11.2–27.0 s of 120 s over the same ten cells, and 72.7 s in run 39441261818. npm takes
  several folders and prints one tarball per line. A `cmd.exe` and a cold npm are saved per
  peer.

  *Check:* `packages/controlroom/src/shape.test.ts` › `runs an Ink program once react and
  react-reconciler are installed`, which now also asserts that three tarballs were packed; the R2
  report. A `renderToString` that ignores `columns` fails it.

  *Red on main:* three `npm pack` runs in the case.

## Design

Measure first, then fix by spawn count. The measurement for R3 already exists: `gh run view
--job <id> --log` on `main`'s Windows cells gives the case's duration. R1 makes that an
artifact, so nobody has to scrape a log.

What the numbers say: the same `pwsh` call takes about 2 s on a lightly loaded Windows cell, and
14–60 s on a full one. So the dominant cost scales with load. The candidates in R3b do not
scale with load:
- an update check and telemetry are network calls;
- `spawnSync` closes the stdin pipe it creates when no `input` is given, so stdin was unlikely
  to block.

They stay because they are cheap and remove two sources of variance. R3c is the change the
evidence points at, and R3a is how the next run proves or disproves it.

Order:
1. R3, alone, because it touches no workflow and its failure mode fails unrelated PRs.
2. R1 and R2, in one workflow PR.
3. R4 and R5, in any order.

## Verification

| R | Check | Red on main |
| :-- | :-- | :-- |
| R3 | `completions.test.ts` › `R3 — pwsh runs non-interactive, …`; `R3 — the PowerShell script reports its phases on stderr`; `vitest-pool-lock.test.ts` › `R3 — shell-driving cases run outside the parallel pool`; the duration table over ten full Windows cells on `main` | no option set; no stderr; shared pool; median 22.0 s, max 59.7 s (n = 15) |
| R1 | `lint:workflows` rule | no artifact, no dispatch inputs |
| R2 | `scripts/slow-cases.test.ts` | no script |
| R4 | the R2 report; the git-spawn count case | `git init` + commits per case |
| R5 | the R2 report; `spawn-budget-lock.test.ts` | `?` |
| R6 | the R2 report; the one-shell case in each file | six and ten `bash` spawns from Node per file |
| R7 | the R2 report; the Ink case's three-tarball assertion | three `npm pack` runs in the case |

## Quint model: needed? No

There is no state machine, ordering protocol, retry or deadline in the product. The inner
`timeout` in R3b is a test harness bound, not behaviour a user meets. The tracker's `Q?` for
this intent is `n`.

## Rejected alternatives

- **Raise the timeouts, or skip on Windows.** Refused by D-20261012-windows-lane-fix-the-case.
- **Larger Windows runners.** A paid outward change the owner has not taken.
- **Retry on timeout.** "Flake" is not a root cause, and a retry hides the same cost every run.
- **A 60 s inner timeout.** It sits under a measured passing run (59.7 s), so it would turn slow
  passes into failures.
- **Twenty dispatches to measure unfixed against fixed.** `main`'s own pushes already produced
  15 full Windows cells in one day. Dispatches are the fallback, not the plan.

## Out of scope

- macOS cells, which run at concurrency two and are not named in the evidence.
- The 2026-10-18 Windows failures on data PRs (`clispec-document.test.ts`,
  `mcp-config-block.test.ts`, on every OS, not timing). They are a different defect.

## Status

Re-read against `main` 2026-10-26. R1–R5 merged in #1135 (`0dc0e0231e`, 2026-10-19); R3d is
built in the change that wrote this section. R6 and R7 were added and built 2026-10-27.

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R3 | Built (R3a–R3c in #1135; R3d 2026-10-26) | `scripts/complete-pwsh.ps1`, `packages/burgee/src/completions-shells.test.ts`, the package's vitest config | `completions-shells.test.ts` › `R3 — pwsh runs non-interactive, without first-run checks, under an inner timeout`, › `R3 — the PowerShell script reports its phases on stderr`; `vitest-pool-lock.test.ts`; `scripts/complete-pwsh-lock.test.ts` (R3d); ten-cell table below |
| R1 | Built | `.github/workflows/compat.yml`, `scripts/vitest-durations-reporter.ts` | `lint:workflows` rule (`durationsProblems`) |
| R2 | Built | `scripts/slow-cases.mts` | `scripts/slow-cases.test.ts` |
| R4 | Built | `scripts/changeset-check-lock.test.ts` | › `R4 — builds its repository once per file, in at most three git runs`; R2 report |
| R5 | Built | the `npm`-spawning root-suite files | `scripts/spawn-budget-lock.test.ts`; R2 report |
| R6 | Built (2026-10-27) | `scripts/step-scenarios.ts`, `scripts/changeset-check-lock.test.ts`, `scripts/dependabot-automerge-lock.test.ts` | › `R6 — starts the step's shell once per file, …` in each; R2 report |
| R7 | Built (2026-10-27) | `packages/controlroom/src/shape.test.ts` | › `runs an Ink program once react and react-reconciler are installed`; R2 report |

**Built: 7. Not built: 0.** The intent's criterion 2 is open; see its § Where the criteria stand.

**R3d, from the phase lines.** R3a's lines on the full cells, for the first pwsh of the file:

| run | `lookup` | case | other phases |
| :-- | --: | --: | :-- |
| 40178182310 | 52,289 ms | 54,724 ms | start 221, dot-source 9, complete 62 and 9 |
| 40261602993 | 60,380 ms | 62,401 ms | start 260, dot-source 7, complete 46 and 4 |
| 39441261818 | 65,277 ms | 68,555 ms | start 243, dot-source 8, complete 187 and 3 |

The phase called `Get-Command` for the demo's name, which is not on PATH, then `Join-Path`,
`New-Item`, `Set-Content` and `Select-Object`, and in `finally` `Remove-Item`. Each is a command
PowerShell must resolve, four of them from modules a `-NoProfile` session loads on first use by
searching `PSModulePath`, which on a hosted Windows image holds many modules. The later pwsh
processes in the same cell, which find that work done, take 2–7 s for the whole case. R3d
replaces all of them with .NET calls: a file check per PATH directory and PATHEXT entry (an
execute bit on Unix, which is what `Get-Command -CommandType Application` required), and
`System.IO` for the stub and its removal. The lock reads the phase and refuses any Verb-Noun
command in it but `Where-Object`, `ForEach-Object` and the script's own functions; on `main` it
names `Get-Command`, `Join-Path`, `New-Item`, `Out-Null`, `Select-Object` and `Set-Content`, and
`Remove-Item` in the cleanup. Whether module discovery was the cost is a hypothesis the next
cells' `lookup` lines test, not a measurement.

**The ten full Windows cells of criteria 3 and 4** (consecutive on `main`, every one green, with
every floor Windows cell between them green), the PowerShell case's duration from each cell's
`vitest-durations` artifact:

| run | cell | commit | PowerShell case |
| :-- | :-- | :-- | --: |
| 39362061065 | Node 24 | `0a9a49a843` | 5,528 ms |
| 39362061065 | Node 26 | `0a9a49a843` | 2,890 ms |
| 39367709198 | Node 24 | `71dbe45e16` | 5,315 ms |
| 39371177113 | Node 24 | `ff3562ac1a` | 4,732 ms |
| 39374273265 | Node 24 | `32b0665d3f` | 4,982 ms |
| 39375850349 | Node 24 | `a7d8fb7386` | 6,322 ms |
| 39428959370 | Node 24 | `769129f75b` | 3,240 ms |
| 39437498239 | Node 24 | `de2209f813` | 3,795 ms |
| 39441261818 | Node 24 | `86b97b35bf` | 3,810 ms |
| 39445745760 | Node 24 | `fc834e0267` | 4,740 ms |

Maximum 6.3 s, median 4.7 s (baseline: maximum 59.7 s, median 22.0 s, n = 15). The streak ran
three cells further (39450172905, 39461730377, 39468510809) before run 39473811263's Windows cell
failed alone (`flagstaff`'s `src/shape.test.ts` did not load; the other cells passed). Over all 68 full cells that ran the case from 2026-10-19 to 2026-10-26: 2.1–6.7 s,
median 4.4 s.
