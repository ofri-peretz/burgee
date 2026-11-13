# SC8 profile: where oxmutate's minutes go, against Stryker's

Intent: [`intent.md`](./intent.md) (`SC8`) · Metrics: [`metrics.md`](./metrics.md) (`S4`) ·
Decisions: [`D-20261101-oxmutate-s3-fixture-sc11-week`](../../decisions/D-20261101-oxmutate-s3-fixture-sc11-week.md),
[`D-20261101-idle-stall-is-timeout`](../../decisions/D-20261101-idle-stall-is-timeout.md) ·
Model: [`stall.qnt`](./stall.qnt)
· Evidence: [`sc8/`](./sc8/README.md), every head-to-head run with its load and per-mutant verdicts; ledger [`sc8/RUNS.md`](./sc8/RUNS.md)

**The bar (owner, 2026-11-01).** oxmutate takes less time than Stryker on the same package, on the
same machine, measured the same way: both engines one after the other, one package at a time,
`concurrency: 4`, with the load average recorded. The headline compares equal mutant sets. Each tool
run as it runs by default is reported beside it. A per-mutant number is supporting evidence and does
not count as a pass. Measurements are local only: no oxmutate runs in GitHub Actions (owner, same
day).

## 1. What the CI logs showed (free, before any local run)

Weekly runs on GitHub's `ubuntu-latest` (4 vCPU), `concurrency: 4` for both engines, `timeoutMS:
10000` (`scripts/mutation.ts`, `PR_BUDGET`). Logs pulled with `gh run view --log`.

| Package | Run | Engine | Commit | Mutants (graded / ignored) | Minutes | Phases (s) |
| :-- | :-- | :-- | :-- | :-- | --: | :-- |
| compat-oracle | 40074196603 (10-24) | Stryker 10.1.1 | `80c8eaa52b` | 4,620 / **1,298** | 57.7 | dry run 25 s; 952 static (21%, "85% of the time") |
| compat-oracle | 40818077916 (10-29) | oxmutate 1.0.2 | `bd98…`-ish | 6,314 / 25 | 203.4 | dry 32.6 · warm 4,314.8 · isolated 7,855.6 |
| compat-oracle | 41185206028 (10-31) | oxmutate 1.1.0 | `bd98f43aae` | 6,668 / 25 | 186.6 | dry 34.6 · warm 1,532.9 · isolated 2,913.0 · **unrecorded 6,713** |
| caique | 40074196603 (10-24) | Stryker 10.1.1 | `80c8eaa52b` | 6,222 / 5 | 80.2 | 417 Timeout; 537 static (9%) |
| caique | 40818077916 (10-29) | oxmutate 1.0.2 | — | 6,506 / 8 | 135.4 | dry 7.0 · warm 2,553.0 · isolated 5,561.6; 1,142 runaways |
| caique | 41185206028 (10-31) | oxmutate 1.1.0 | `bd98f43aae` | 6,870 / 8 | 107.5 | dry 4.5 · warm 1,474.5 · isolated 4,781.3 · unrecorded 191; 825 runaways, 375 overturned at 3x |

Pollution restarts: 1,306 in 7 files on 10-29 (1.0.2) came from the file-level hook defect fixed
in #1374. On 1.1.0 (10-31) they are 80 in 4 files on compat-oracle and 28 in 3 files on caique, a
small share of either run. Pollution written to disk, which a restart cannot clear, is gap
[`A-20261101-oxmutate-disk-pollution-restart`](../../gaps/A-20261101-oxmutate-disk-pollution-restart.md).

Findings from the logs alone:

1. **A phase was missing from the stats.** On compat-oracle's 10-31 run the phases in the summary
   line add up to 4,480 of 11,193 s. The other 6,713 s (60%) were the live static phase (section
   5b of `coordinator.ts`, added in 1.1.0), which no stat recorded. It is now `stats.staticMs`, and
   the summary line prints it (`e2e.test.ts` checks the phases account for at least 95% of the run).
2. **The 10-24 Stryker run graded a different, smaller mutant set on compat-oracle.** Stryker
   ignored 1,298 mutants and its report never named them. All of them are in `hosts.ts`. Four
   `// Stryker restore all` comments sat on the line above a row's closing `},`. Stryker reads a
   directive only as the *leading comment of the next AST node* (`directive-bookkeeper.js`), and a
   comment above a `}` leads nothing. So each `// Stryker disable all` before it ran to the end of
   the file. Replaying that rule over oxmutate's mutants predicts 1,294 of them at `80c8eaa52b`
   (Stryker reported 1,298), and 1,374 at `bd98f43aae`. Those are static data rows, the most
   expensive mutants either tool has. So SC8 on compat-oracle as measured in CI compares oxmutate
   grading 6,668 mutants against Stryker grading 4,620. That is not like for like.
3. **oxmutate read no `disable`/`restore` range at all.** It read only `disable next-line`, so it
   graded the 116 mutants the ranges in `hosts.ts` meant to turn off.
4. **The mutator sets differ by about 7% by default.** At `80c8eaa52b` oxmutate generates 6,287
   mutants on compat-oracle (Stryker: 5,918) and 6,703 on caique (Stryker: 6,227). With
   `strykerCompat: true` it generates 5,915 and 6,230, within 3 of Stryker's set.
5. **Runner and concurrency were equal** in CI (same `ubuntu-latest` image, `--concurrency 4`). The
   commits were not. The Stryker numbers are a week older, and compat-oracle grew from 21 to 24
   files in between.

Per graded mutant, from CI (supporting only): compat-oracle oxmutate 1.68 s against Stryker 0.75 s;
caique 0.94 s against 0.77 s.

## 2. The async-hang hypothesis on caique: confirmed

Method: `OXMUTATE_DEBUG_WATCHDOG=1` prints each watchdog stop with the age of the test worker's
heartbeat (event-loop liveness, `heartbeat.ts`) and the server's CPU share over the stall. The
first measurement used `ps` sampled 500 ms apart at the stop. The shipped one uses
`process.cpuUsage()` samples the server sends every 250 ms, read over the last second. Subset:
caique `src/inquirer-select.ts` + `src/inquirer-keys.ts` (248 mutants, 21 static), `concurrency: 4`,
Apple M4 Pro (14 cores, 48 GB), macOS 26.2, Node 24.12.0.

**Result: 18 of 19 stops read 0–2% CPU with a live heartbeat.** These are async hangs: the test
awaits input the mutant never lets arrive. **1 of 19 read 72% CPU with a stale heartbeat**, a loop.
The old path re-ran the hangs at 3x the isolated budget (about 34.5 s), where Vitest's own 30 s
`testTimeout` failed the test, and reported them Killed. That is the "timeouts that finished given
3x the time" line.

## 3. Changes, each measured on the subset, verdicts compared mutant by mutant

`A` is the 1.1.0 build (`main`). Wall times on a laptop whose load average sat at 10–37
(recorded per run), so they are indicative; verdicts are exact.

| Run | Change | Wall (s) | Warm | Static | Isolated | Stops | Verdicts against A |
| :-- | :-- | --: | --: | --: | --: | --: | :-- |
| A | baseline 1.1.0 | 179.7 | 42.7 | 41.2 (unrecorded) | 87.8 | 13, 5 overturned | — |
| C | wait in place past the budget while the worker is idle, warm *and* isolated, up to 3x | 375.1 | 251.5 | 41.2 | 63.1 | 6 | identical |
| D | the same wait, isolated runs only | 169.3 | 46.8 | 40.7 | 76.8 | 9, 1 overturned | identical |
| G | idle stop = Timeout at its budget, no 3x re-run | 139.9 | 49.4 | 42.4 | 35.7 | 13, 13 idle, 0 overturned | identical except **5 Killed → Timeout**, exactly the idle-stall set |
| H | **G, idle only inside a test body, + grouped static re-collections (shipped)** | **119.3** | 48.4 | 36.4 | 29.0 | 13, 5 idle, 0 overturned | identical except the same **5 Killed → Timeout** |

- **C was rejected: 2.1x slower, same verdicts.** Waiting out a 30 s test timeout in the warm run
  costs more than a stop. After a warm stop, the isolated run usually kills the mutant within
  milliseconds through another covering test.
- **D was superseded.** It saved the stop at 1x and the cold re-run, but kept the 30 s floor per
  hung mutant.
- **H is G made safe on a loaded machine.** In the `stall` fixture, at load 33, a mutant that
  only fails its assertion was stopped at its 1.5 s budget while the worker still collected the
  file, at 3% CPU. G scored it Timeout. Idle now also needs the worker inside a test body (the
  runner marks it, and the heartbeat carries the mark). Warm stops therefore read busy (`runArmed`
  is not marked) and go to an isolated run as before. On the subset, the static phase also
  dropped from 41 s to 36 s, with 52 grouped re-collections.
- **G is [`D-20261101-idle-stall-is-timeout`](../../decisions/D-20261101-idle-stall-is-timeout.md).**
  The 5 flips are the mutants A had re-run at 3x and "overturned". The score is unchanged, because
  a Timeout is detected.
- One run, F, between D and G with the same build as G, read 15 extra stops at 0% CPU with no
  heartbeat for the whole budget, in the survivor-confirmation phase. They were not reproduced in
  G. Process freezes from the endpoint agent are the likely cause, and the old path would have
  re-run them the same way. Noted, not explained.

`OXMUTATE_DEBUG_WATCHDOG` also showed that a heartbeat path set per unit could reach a worker
started under an earlier unit (stops read "beat never"). The beat file is now per server, set in
its environment before Vitest starts.

The burgee root import in `child.ts` costs 19–62 ms here (121–139 ms reported on CI) per server
start. caique's 10-31 run started about 830 servers, about 108 CPU-s, under 0.5% of the run. The
spare server also hides each start from the critical path. With idle stops still killing their
server, the count is unchanged, so this stays below the line. Not taken.

## 4. The full comparison on this machine

Apple M4 Pro (14 cores, 48 GB), macOS 26.2, Node 24.12.0, Stryker 10.1.1, `concurrency: 4`,
`timeoutMS: 10000`, the lane's own mutate list (`scripts/mutation.ts full`). Engines alternate
S, O, O, S on one package. The 1-min load average is sampled every minute while each run goes.
oxmutate runs with `strykerCompat: true`: 6,394 mutants against Stryker's 6,397. The oxmutate
build is frozen at `2527452150` (#1427's head).

### caique, round 1 (stopped after two runs; not a result)

| Run | Engine | Wall | Load: mean / median / max | Verdicts |
| :-- | :-- | --: | :-- | :-- |
| S1 | Stryker | 4,153 s (69.2 min) | 26.9 / 24.5 / 71.3 | killed 5,187 · timeout 457 · survived 744 · no coverage 2 |
| O1 | oxmutate | 8,084 s (134.7 min) | 24.6 / 20.5 / 85.3 | killed 5,271 · timeout 366 · survived 747 · no coverage 2 · ignored 8 |

Mean loads were within 1.1x of each other, so the pair is comparable. **oxmutate lost, 1.95x
slower.** The verdicts agree: Timeout is now 366 against Stryker's 457, where 1.1.0 reported 15.

The profile of O1 found the cost. The warm phase took 5,977 s, against 1,475 s on the 10-31 CI
run. There were 799 watchdog stops, 806 servers spawned and 1,104 units. 19 stops read 100 to
1,055 s "elapsed": caique's tests call `vi.useFakeTimers()`, and the runner wrote each mutant's
start time from `Date.now()`, which a test that never restores the clock freezes. Every later
mutant in that worker then looked as if it had run since the freeze. It was stopped at once, its
server killed, and it was sent to an isolated run. The fix writes the start from the real clock
captured at load (`realNow`, #1436). The `fake-clock` fixture reproduces the defect: 2 stops before
the fix, 0 after. Continuing the S, O, O, S round on a build with a known defect would only have
measured that defect, so the round was stopped after O1 and restarts on the fixed build.

### caique, round 2 (build at main `a96446c7a`; S2 not run)

Same method as round 1, on the build with every fix: the real clock (#1436), comment stripping, and
the server-start fix (#1444). Each run started below a 1-min load of 30; the load was sampled every
minute.

| Run | Engine | Wall | Load: mean / median / max | Verdicts |
| :-- | :-- | --: | :-- | :-- |
| S1 | Stryker | 4,835 s (80.6 min) | 29.4 / 29.9 / 48.4 | killed 5,210 · timeout 490 · survived 688 · no coverage 2 |
| O1 | oxmutate | 3,147 s (52.5 min) | 24.1 / 17.6 / 69.6 | killed 5,267 · timeout 370 · survived 747 · no coverage 2 · ignored 8 |
| O2 | oxmutate | 3,143 s (52.4 min) | 35.7 / 38.7 / 71.1 | — |
| S2 | Stryker | not run | — | stopped by the owner at about 35 min, before it finished |

- **S1 against O1:** mean loads within 1.22x, so the pair is comparable. **oxmutate 1.54x faster**
  (3,147 s against 4,835 s).
- **O2** under a heavier load (mean 35.7) took the same time as O1.
- **SC8 is not graded met.** S2 did not run, so there is no Stryker median and no second pair. The
  head-to-head on compat-oracle has not been measured.

#### The survivor diff is open

oxmutate reports 59 more Survived than Stryker (747 against 688) and 120 fewer Timeout. By mutant
location:

- 69 mutants survive under oxmutate that Stryker detected.
- 10 survive under Stryker but not under oxmutate (key mismatches in Stryker's summary, not yet
  examined).
- Of the 69, 49 are StringLiteral, 8 ArrayDeclaration, 5 LogicalOperator, 5 MethodExpression, 1
  ConditionalExpression and 1 ObjectLiteral.
- 48 are in `clack-core.ts`, almost all module-level constants: the step and bar glyphs
  (`unicodeOr('◆', '*')` and the rest), the key aliases, and the instruction strings. They are
  static mutants.

What is known so far:

- They were already survivors on 1.1.0, before any SC8 change (10-31 CI artifact).
- oxmutate's live static path and its fresh-worker path (`OXMUTATE_ISOLATE_STATIC=1`) agree:
  Survived on 6 of 6 sampled, lines 161–163.

What is not known: whether Stryker scored them **Killed** or **Timeout**. Stryker runs every test of
the package for a static mutant. A Timeout would mean a slow full-suite run, not a test that caught
the mutant. The summary `scripts/mutation.ts` keeps does not say which. A Stryker run on those lines,
with its JSON report kept, decides it. Until then, oxmutate missing real kills is not ruled out, and
a missed kill outranks speed.

#### The survivor diff, closed (2026-11-06)

Read against the second valid Stryker run, `sc8r2-caique-S2b` (mean load 10.0), instead of S1
(29.4): **12** mutants survive under oxmutate that Stryker detected, not 69. The other 57,
`clack-core.ts`'s glyph and instruction constants among them, are Survived for Stryker too on the
quiet run; S1 detected them only as Timeouts under load.

The 12 were re-run on both engines alone (the 11 lines, one quiet run each, `main` at `1d638905be`):
59 of the 61 mutants on those lines agreed. The other two, `inquirer-choices.ts:22`
(`item !== undefined` → `true`) and `inquirer-theme.ts:105` (the spinner `{}`), pass every
assertion and raise unhandled rejections, which fail `vitest run`. Stryker's runner crashed
printing them (RuntimeError); oxmutate scored them Survived. **That was a missed kill**, fixed:
the runner counts unhandled errors per mutant run and scores one Killed, and the dry run refuses a
suite that raises one unmutated. On the fix, 61 of 61 mutants on those lines agree with Stryker,
the two as Killed. Fixtures `test/fixtures/unhandled` and `unhandled-baseline`; both cases fail
on the previous build.

## 6. compat-oracle's `hosts.ts`: the 1.1.0 kills were false (2026-11-12)

[`oxmutate-fastest`](../oxmutate-fastest/intent.md) criterion `F0`. The 2026-10-31 run (1.1.0)
left **0** survivors in `packages/compat-oracle/src/hosts.ts`; the 2026-11-05 run (1.5.0) left
**963**, and the package's score fell from 91.17% to 74.61%. Either 1.1.0 scored false kills or
the live static path misses real ones. Checked on one line, `hosts.ts:699`
(`EXECA_UNGRADED`, 10 static mutants), in the full-run worktree at `c44a2ce6d8`, `concurrency: 2`:

| Engine and path | Killed | Survived | Wall |
| :-- | --: | --: | --: |
| 1.6.2-dev, live static path | 0 | 10 | 425 s |
| 1.6.2-dev, fresh worker per mutant (`OXMUTATE_ISOLATE_STATIC=1`) | 0 | 10 | 808 s |
| published 1.1.0 | 2 | 8 | 991 s |

- **The live path and the fresh-worker path agree**, 10 of 10.
- **1.1.0's two kills do not reproduce by hand.** They were `'convert'` → `''` and `'io'` → `''`,
  credited to tests `1573152066_0_8` and `1573152066_0_0`. With `'convert'` → `''` written into
  the source, `npx vitest run` in the package passes: 917 of 917 tests, exit 0. The mutant
  survives, as the current engine says.
- **So the drop is the score becoming true, not a missed kill**, on this line. What 1.1.0 did to
  fail those two tests is not traced; 1.1.0 is superseded, and the candidates are the defects
  fixed since (the file-level hooks in #1374, the on-disk pollution in #1453).

**A second sample, the first row of `HOSTS`** (`hosts.ts:708-718`, the commander row, 15 static
mutants), same worktree, with the machine's load average between 45 and 120 from other work:

| Engine and path | Killed | Survived | Wall |
| :-- | --: | --: | --: |
| 1.6.2-dev, live static path | 3 | 12 | 1,765 s |
| 1.6.2-dev, fresh worker per mutant | 11 | 4 | 2,446 s |
| published 1.1.0 | — | — | refused: a test failed unmutated in its dry run |

- **The two paths disagree on 8 mutants**, all Survived live and Killed in a fresh worker, all
  credited to tests in `vendor-run.test.ts` and `vendor.test.ts`. Those tests clone repositories
  and ask npm for a release.
- **By hand, the live path is right on the two checked.**
  - `reexportDefault: false` → `true` (714:72): both files pass, 64 of 64.
  - `repo` → `''` (709:11), run three times: 64 of 64 once, and twice two tests failed, a
    different two each time, each by its own timeout after 60 to 139 s.
- **So the fresh-worker kills were tests timing out under load, not the mutants.** The same
  cause stopped the 1.1.0 run: one of those tests failed with no mutant active.
- **What this leaves open.** A test that fails by its own timeout is scored Killed. A watchdog
  stop is re-run before it is believed; a test timeout is not. That is a false-kill path on a
  loaded machine, in both the fresh-worker path and the warm one. Filed as
  [`A-20261112-oxmutate-test-timeout-kill`](../../gaps/A-20261112-oxmutate-test-timeout-kill.md).

**`F0`, as it stands:** 25 static mutants on two samples. The live static path gave no verdict a
hand run contradicts. Every disagreement found was a false kill by the other path or the older
engine. The sample is 25, not 30, and all 8 disputed mutants were not each run by hand.

**The cost, as a side reading.** The live path spent 389 s at two workers on these 10 mutants,
about 78 worker-seconds each: every survivor runs every test file that loads `hosts.ts`. That is
the cost `M1` (grouped static survivors) is aimed at.

## 7. caique after #1532 and #1547: 3.65x faster than Stryker, on the same mutants (2026-11-13)

One pair, in a checkout nothing else touched (`burgee-mutation-weekly` at `0a8ecee757`), Apple M4
Pro, `concurrency: 4`, `bench/burgee-pair.mts --package caique --stryker-compat`, Stryker first.
The 1-minute load was sampled every minute.

| Run | Engine | Wall | CPU | Peak memory | Load: mean / max | Killed · Timeout · Survived |
| :-- | :-- | --: | --: | --: | :-- | :-- |
| S1 | Stryker 10.1.1 | 3,391 s | 2,343 s | 597 MB | 19.3 / 52.6 | 5,743 · 468 · 7 (5 runtime errors) |
| O1 | oxmutate at `0a8ecee757` | 928 s | 1,108 s | 688 MB | 13.4 / 26.6 | 5,635 · 562 · 1 |

- **3.65x faster** (3,391 s against 928 s). The mean loads are 1.44x apart, inside the 1.5x a
  pair needs to count. Stryker's maximum, 52.6, was in its first minutes, while a push from
  another checkout was finishing.
- **The same mutants.** Stryker reported 6,441 and oxmutate 6,428. All 6,428 matched a Stryker
  mutant; 13 are Stryker's alone.
- **99.74% agreement** on the matched set: 6,411 of 6,428. The 17 disagreements are two causes,
  and neither is a verdict oxmutate got wrong:
  - **12 are mutants oxmutate ignores and Stryker grades**, at six places where the source says
    `// Stryker disable next-line <mutator>: <reason>` above an `else if`, or above a call in the
    middle of a method chain (`clack-date.ts:223`, `clack-prompts.ts:256` and `:344`,
    `inquirer-checkbox.ts:129`, `inquirer-keys.ts:44`). Stryker reads a directive only as the
    leading comment of the next node, and a comment in those two positions leads none, so it
    grades the mutants the author meant to switch off; five of its seven survivors are these.
    oxmutate reads the comment where it is written. The same rule hid `hosts.ts`'s `restore`
    comments (§1).
  - **5 are Regex mutants in `locale.ts:83` that Stryker reports RuntimeError** ("An error
    occurred outside of a test run") and oxmutate Killed: the unhandled-error rule from #1477.
- **Where oxmutate's 926 s went:** warm 537 s, isolated 336 s, static 49 s, dry run 4 s. The warm
  servers ran 1,988 s for 1,448 s inside test runs, so on this package most of the warm phase is
  the tests themselves. 670 watchdog stops, 281 of them deadlocks the worker called itself, and
  200 pollution restarts across 1,531 units.

**Against the earlier readings** (`sc8/RUNS.md`, before #1532): Stryker 3,322 to 4,835 s and
oxmutate 3,143 to 3,147 s, 1.30x to 1.54x. Stryker is where it was. oxmutate is 3.4x faster than
its own earlier runs. The two changes in between were the open descriptors (#1532) and the slow
test that is no longer a kill (#1547); which one carried how much is not separated here.

**What this is not.** One pair, not a median. caique's suite also changed since 2026-11-03
(Stryker's survivors went from about 740 to 7), so the earlier runs and this one are not the same
workload. A second pair in the other order (oxmutate, then Stryker) is owed before this number
goes anywhere public.
