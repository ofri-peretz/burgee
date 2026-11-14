# oxmutate

## 2.3.0

### Minor Changes

- [#1579](https://github.com/ofri-peretz/burgee/pull/1579) [`a7c33ac`](https://github.com/ofri-peretz/burgee/commit/a7c33ac8b3bc16bf213be0655bb9be1f27506e15) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `static.budgetMs` (`oxmutate run --static-budget <ms>`): the most the static phase may take. Once it is spent no static unit starts; a static mutant still undecided is reported `Ignored`, with the reason `static mutant (static budget spent)`, and left out of the score. A kill found before that stands, and nothing is called Survived on part of its test files. The summary line says how many were left undecided. Unset, there is no limit.

## 2.2.0

### Minor Changes

- [#1566](https://github.com/ofri-peretz/burgee/pull/1566) [`926bff9`](https://github.com/ofri-peretz/burgee/commit/926bff919fb8df524b2daf3bef6b4582cd1fb2bc) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `oxmutate run --ignore-static` skips static mutants (module-level code), as the `ignoreStatic` config key already did: the run is faster and the score leaves them out. The summary now says what the static phase cost, or how many mutants `ignoreStatic` left out, and names the flag once that phase is half the run.

- [#1566](https://github.com/ofri-peretz/burgee/pull/1566) [`926bff9`](https://github.com/ofri-peretz/burgee/commit/926bff919fb8df524b2daf3bef6b4582cd1fb2bc) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `static.group` (`oxmutate run --static-group <n>`): arm up to `n` static mutants together in a test file that is not their first. A static survivor runs in every test file that loads its module, and most of those runs pass; a group's run that passes decides all of its members for that file at once, and one that fails is halved until each failing mutant is found alone. On a file of import-time data the static phase was 3.0x shorter with every verdict unchanged.

  It is off by default (`1`), because it is a heuristic: two mutants armed together can hide each other. Only mutants that change one value are grouped (strings, numbers, regexes), no two that touch the same source text, and one group survivor in twenty is run again alone on every run. One that fails alone is reported Killed and the run exits 1, naming the cause.

### Patch Changes

- [#1566](https://github.com/ofri-peretz/burgee/pull/1566) [`926bff9`](https://github.com/ofri-peretz/burgee/commit/926bff919fb8df524b2daf3bef6b4582cd1fb2bc) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - A run no longer loses its result when its work directory cannot be removed. The directory was removed straight after the servers were told to close, while a worker could still write into it; a removal that met a write threw `ENOTEMPTY` and replaced the finished run with that error, and no report was written (seen at the end of a 60-minute run). The removal now retries, and a directory that still cannot be removed is named in a warning.

## 2.1.0

### Minor Changes

- [#1561](https://github.com/ofri-peretz/burgee/pull/1561) [`16b5e09`](https://github.com/ofri-peretz/burgee/commit/16b5e0925c7d45104736ecd430814f44fbaf4d0a) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `oxmutate run --ignore-static` skips static mutants (module-level code), as the `ignoreStatic` config key already did: the run is faster and the score leaves them out. The summary now says what the static phase cost, or how many mutants `ignoreStatic` left out, and names the flag once that phase is half the run.

## 2.0.2

### Patch Changes

- [#1547](https://github.com/ofri-peretz/burgee/pull/1547) [`95ffaeb`](https://github.com/ofri-peretz/burgee/commit/95ffaebf3e6675f551d7f1d2a6072b137d345756) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - A mutant whose only failing tests failed by their own timeout is run once more before it is reported. On a loaded machine a slow test times out with no help from the mutant, and that was scored Killed: 8 of 15 static mutants on one file, by tests that clone repositories, all of which survive a quiet run. A second run that passes is Survived; one that is slow again is a Timeout with its reason; a failed assertion in either run is Killed, as before.

## 2.0.1

### Patch Changes

- [#1532](https://github.com/ofri-peretz/burgee/pull/1532) [`4af62e4`](https://github.com/ofri-peretz/burgee/commit/4af62e42013c448e12fa7c7454c84e9b699588b3) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The warm runner writes its progress mark and its result records through descriptors it keeps open, instead of opening and closing both files for every mutant run. On a machine whose endpoint scanner inspects every file close, that open-and-close was most of the warm phase: on burgee's `paratext` (1,415 mutants, about 5,000 test executions) the warm phase fell from 25 s to under 10 s and the whole run from 38 s to about 20 s, with identical verdicts. The mark is padded over the last one, never truncated, and the watchdog reads it in place on every poll. A machine without such a scanner gains less.

- [#1532](https://github.com/ofri-peretz/burgee/pull/1532) [`4af62e4`](https://github.com/ofri-peretz/burgee/commit/4af62e42013c448e12fa7c7454c84e9b699588b3) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The run's stats say what the warm and isolated phases were made of. `warmUnitMs` is the warm servers' time and `warmArmedMs` the part of it inside test runs; the rest is starting workers, collecting files, canaries and hooks. `isolatedByCause` counts what sent each mutant to an isolated run: a static fallback, a watchdog stop, unfinished work, a re-run at 3x, a survivor's confirmation, or a flaky test. The summary prints both, for a phase that ran.

## 2.0.0

### Major Changes

- [#1491](https://github.com/ofri-peretz/burgee/pull/1491) [`5054fb7`](https://github.com/ofri-peretz/burgee/commit/5054fb72746ccb28bc08d63d9895a5aa2c50fa77) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Requires Node 22.13 or later; Node 18 and 20 are end-of-life. `engines.node` is now `>=22.13.0` (was `^20.19.0 || >=22.13.0`), and Node 22.13, 24 and 26 are the versions tested. `burgee migrate` now warns when a project's `engines.node` admits a Node below 22.13.0, and its suggested fix is `npm pkg set "engines.node=>=22.13.0"`.

### Patch Changes

- Updated dependencies [[`5054fb7`](https://github.com/ofri-peretz/burgee/commit/5054fb72746ccb28bc08d63d9895a5aa2c50fa77)]:
  - bellpull@2.0.0
  - burgee@2.0.0

## 1.6.2

### Patch Changes

- [#1483](https://github.com/ofri-peretz/burgee/pull/1483) [`3e69fb2`](https://github.com/ofri-peretz/burgee/commit/3e69fb2d8d068210347ac71d2886d6a4309859d1) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The package manifest names its author and publishes with `publishConfig` `{ "access": "public", "provenance": true }`. burgee's `homepage` is its landing page, https://burgee.interlace.tools. oxmutate gains `keywords`, so npm search finds it, and a `sideEffects` list (its CLI, its worker and its Vitest runner run on load), so a bundler can drop the rest. No code changes.
- Updated dependencies [[`3e69fb2`](https://github.com/ofri-peretz/burgee/commit/3e69fb2d8d068210347ac71d2886d6a4309859d1)]:
  - bellpull@1.0.11
  - burgee@1.10.2

## 1.6.1

### Patch Changes

- [#1481](https://github.com/ofri-peretz/burgee/pull/1481) [`a2902a0`](https://github.com/ofri-peretz/burgee/commit/a2902a0f1cbbbbb8d2e1c0d30ee58bf7329cf494) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The dry run no longer writes new entries into the project's snapshot files. To find run-once test files, the dry run runs a suite's first passing test a second time. That second run's `toMatchSnapshot()` counted as the test's second snapshot, and outside CI Vitest wrote it to disk: one dry run of burgee added 90 lines to two committed `.snap` files. The probe now resets the per-try state first, as the mutant loop does before each run.

## 1.6.0

### Minor Changes

- [#1477](https://github.com/ofri-peretz/burgee/pull/1477) [`79f6d4c`](https://github.com/ofri-peretz/burgee/commit/79f6d4cb099dc21444b37f4625aafa4b143a8639) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - A mutant whose only effect is an unhandled rejection or an uncaught error is now Killed, as a failing `vitest run` scores it; it was Survived. A suite that raises one with no mutant active is refused at the dry run, as a failing test is.

## 1.5.0

### Minor Changes

- [#1467](https://github.com/ofri-peretz/burgee/pull/1467) [`16938cb`](https://github.com/ofri-peretz/burgee/commit/16938cb03cbc4794efb90d90609d3964822d08c9) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The incremental cache can no longer reuse a stale verdict, and it checks itself on every run.

  - **The fingerprint now covers everything the verdict rested on:**
    - every project file the covering tests evaluated (their module graph, recorded in the dry run);
    - the test files that load a static mutant's module (before, a static mutant's fingerprint was its source alone);
    - oxmutate's version, Node's version, the lockfile, and the options that decide a verdict.

    Before, a change to a helper module a test imports left the cached verdict in place.

  - **Each run decides 5% of the reusable verdicts afresh.** If any disagrees with the cache on detected or not, the cache is rebuilt from that run (`stats.auditSampled`, `stats.auditDisagreed`).

## 1.4.0

### Minor Changes

- [#1465](https://github.com/ofri-peretz/burgee/pull/1465) [`5b4c3d1`](https://github.com/ofri-peretz/burgee/commit/5b4c3d151dae21912c0d7a4aec24179fada49e87) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - A mutant that writes into the project is caught after its unit, its write is put back, and the verdicts that could have run on the changed project run again.

  oxmutate snapshots the project's tracked files and the directories that hold them before the run. After each unit:

  - a changed or deleted tracked file is written back from the snapshot;
  - a new entry git does not ignore is removed;
  - the unit's verdicts, and those of the units running beside it, are dropped and re-run in halves, until the mutant that writes is alone in its unit.

  That mutant carries `wrote`, and `stats.diskWrites` counts the units. Scratch a suite keeps where git ignores it is left alone. Set `OXMUTATE_NO_DISKGUARD=1` to turn the guard off.

  The case this guards against is [#1453](https://github.com/ofri-peretz/burgee/pull/1453): a compat-oracle mutant overwrote its package's `package.json`, and every later mutant ran against a broken package for four hours.

## 1.3.0

### Minor Changes

- [#1463](https://github.com/ofri-peretz/burgee/pull/1463) [`a67cb8b`](https://github.com/ofri-peretz/burgee/commit/a67cb8b606163723cafc1dbc6f09bfdc9160f7cf) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - A test that can never resume is a Timeout in about half a second, decided by its own worker instead of the watchdog's clock.

  Before, a promise nothing would settle, or input nobody would send, held its worker for the whole watchdog budget (10–12 s with `timeoutMS: 10000`), then cost a server respawn and often a 3× re-run. The worker now samples its own thread: its CPU, the other threads' CPU, Vitest calls in flight, pending timers (ref'd or not) and its native resources. When all of them stay quiet for the confirm window, the worker fails the test itself. A real timer, a child process, a socket or a busy loop is never called a deadlock.

  On caique's three most hang-heavy files (964 mutants, back to back at comparable load):

  - wall time: 1,308 s → 308 s
  - watchdog stops: 398 → 15
  - servers spawned: 405 → 22
  - no mutant changed between detected and undetected

  The status reason reads `its test deadlocked`, and `stats.deadlocks` counts them.

  A deadlock is also torn down. The unit ends where it was called; the verdicts no canary has vouched for go back, with the rest of the unit, to a fresh context; and the worker that holds the pending run is dropped, its timers and handles with it. A static batch goes back to the fresh-worker path.

  No single test execution is waited on for more than 5 seconds (`MAX_TEST_MS`). Every watchdog budget, including the 3× re-run of a busy stop, is capped at 5 seconds per test the run executes.

## 1.2.5

### Patch Changes

- [#1459](https://github.com/ofri-peretz/burgee/pull/1459) [`c3038d5`](https://github.com/ofri-peretz/burgee/commit/c3038d5ca4157132b7bc1abdef6d37db56fab793) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - A test file that opens with plain tests and holds a RuleTester block further down is now found run-once. The dry run probed only each file's first passing test, which passes when run again, so the block's tests still restarted the context for every mutant. It now probes the first passing test of each suite.

## 1.2.4

### Patch Changes

- [#1455](https://github.com/ofri-peretz/burgee/pull/1455) [`d94e9b6`](https://github.com/ofri-peretz/burgee/commit/d94e9b6b3ddb1904a22a61edbb224249fcf3f40b) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - A test file whose tests can run only once per collection now gets a fresh copy of the test for each run after the first, instead of a context restart for every mutant. ESLint's RuleTester is the common case: it records each case as its test runs and fails one it has already seen ("detected duplicate test case"). oxmutate re-runs a test once per mutant and again unmutated as the canary, so each canary failed, read as pollution and restarted the context. On one eslint-plugin helper with 279 mutants that cost 13,868 restarts and 69 minutes. The dry run now runs each file's first passing test a second time. If that second run fails, each later run takes its copy of the test from a fresh collection of the file, made before the test starts. Only the test file is evaluated again, so a mutant's leftovers in the code under test still fail the canary. A file with `beforeAll` hooks keeps the restart, because a fresh collection's `beforeAll` never ran. Each fresh collection's `afterAll` hooks run once its file is done. Verdicts do not change.

## 1.2.3

### Patch Changes

- [#1449](https://github.com/ofri-peretz/burgee/pull/1449) [`ee9f7b1`](https://github.com/ofri-peretz/burgee/commit/ee9f7b10639d0c295b617dd491220b2062e5bd42) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - **The command runner's sandbox keeps a tsconfig `extends` that climbs out of the project resolvable.**
  The sandbox is a copy of the project under `<root>/.oxmutate-tmp/sandbox-*/`, two directories deeper
  than the project itself. A tsconfig's relative `extends` is resolved from the file that holds it, so a
  monorepo package's `"extends": "../../tsconfig.base.json"` pointed at nothing once copied, Vite failed
  to load the config, and the dry run stopped with "make the command pass on the unmutated project
  first" on a project whose command passes. Each copied `tsconfig*.json` now has its relative `extends`
  rewritten to reach the same file from its new place.

  Found running oxmutate over the eslint monorepo (`ofri-peretz/eslint`): every package there extends
  the root `tsconfig.base.json`, so `testRunner: "command"` could not start in any of them. With the
  fix, `eslint-plugin-vercel-ai-security`'s `require-max-steps` ran end to end: 165 mutants, 81.8%.

## 1.2.2

### Patch Changes

- [#1444](https://github.com/ofri-peretz/burgee/pull/1444) [`a96446c`](https://github.com/ofri-peretz/burgee/commit/a96446c7a0a9439a70d450c85d06d701af1d8d0d) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - A Vitest server whose run is killed while it is still loading Vitest now exits at once. Before, it listened for its coordinator going away only after Vitest had loaded, and on a busy machine that takes seconds. A server whose coordinator was already gone before it started also exits now.

## 1.2.1

### Patch Changes

- [#1436](https://github.com/ofri-peretz/burgee/pull/1436) [`a6b9f9a`](https://github.com/ofri-peretz/burgee/commit/a6b9f9aeec8962ee81bf96fb4cdd04c5dcf99077) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The watchdog now times each mutant by the real clock. Before, a test that froze the clock with `vi.useFakeTimers()` and never restored it made every later mutant in that file look as if it had been running since the freeze. The watchdog then stopped it however briefly it had run, and each stop cost a killed server and an isolated run. On a full caique run, such stops read 100 to 1,055 s "elapsed". Verdicts do not change, because a stopped mutant is decided again in an isolated run.

- [#1436](https://github.com/ofri-peretz/burgee/pull/1436) [`a6b9f9a`](https://github.com/ofri-peretz/burgee/commit/a6b9f9aeec8962ee81bf96fb4cdd04c5dcf99077) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The tarball no longer ships comments in its JavaScript. The build now runs the same comment stripper every other package in the family runs. Excluding the native core, the pack shrinks from 63,247 to 49,937 bytes gzipped. Declarations keep their summaries.

## 1.2.0

### Minor Changes

- [#1427](https://github.com/ofri-peretz/burgee/pull/1427) [`cbe1c2f`](https://github.com/ofri-peretz/burgee/commit/cbe1c2f1d57b65f42c041ed858633086dec5b219) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - A mutant that leaves its test waiting on an idle worker is now a Timeout at its budget, as Stryker scores it. This changes verdicts. Such a test waits on something the mutant never lets happen, such as a prompt awaiting a keypress: the worker is inside the test body, its event loop still turns, and its server burns almost no CPU. Before, the watchdog re-ran it with 3x the budget, and it came out Killed only when the test's own timeout (Vitest's, 30 s in burgee) fell inside that window. On caique that was about 375 mutants. Those verdicts move from Killed to Timeout, and the mutation score does not change, because a Timeout counts as detected. A stop whose worker was busy, a loop or a slow test on a loaded machine, keeps its re-run at 3x. The watchdog tells the two apart from a heartbeat the test worker writes and from the server's CPU time over the last second: idle is a live heartbeat from inside a test body and under 25% of a core. A worker still loading its test file is never idle (`.sdlc/decisions/D-20261101-idle-stall-is-timeout.md`, `.sdlc/intents/oxmutate/stall.qnt`).

  The run's stats gain `staticMs`, the time spent deciding static mutants in live workers, and the summary line prints it. That time was missing before, so the phases now add up to the run. The stats also gain `idleStalls`. `OXMUTATE_DEBUG_WATCHDOG=1` prints each stop with its heartbeat age and CPU share.

## 1.1.0

### Minor Changes

- [#1374](https://github.com/ofri-peretz/burgee/pull/1374) [`6e1673b`](https://github.com/ofri-peretz/burgee/commit/6e1673b5c75229a341117c6b60d2b65225a8503f) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Three fixes to the warm runner, each reproduced by a fixture, and one less waste. The first showed up as a
  pollution restart on nearly every mutant of a real suite; modelling the loop in Quint
  (`.sdlc/intents/oxmutate/canary.qnt`) then found the second.

  **File-level `beforeEach`/`afterEach` hooks now re-run between mutants.** Vitest 5 does not link a
  top-level `describe` back to its file, so the hook walk stopped at the `describe` and skipped the hooks
  at the top of the test file, where most suites reset their state. Every canary then ran on the previous
  mutant's leftovers, failed, and was reported as pollution: the unit's remaining verdicts were thrown
  away and re-run in a fresh context, one restart per mutant. On a Mongo-backed service suite each mutant
  cost seconds instead of the test's ~140 ms, and the spec-oracle verdicts from those runs were discarded.

  **No kill is decided on an earlier mutant's leftovers any more.** Once the canary interval had doubled,
  a mutant could run on state the mutant before it left behind (a cleanup function mutated to do nothing).
  When that run failed and the test's own `finally` cleaned up, the batch canary passed and the wrong kill
  was reported. A kill that follows unchecked runs is now checked at once: the canary runs, and the mutant
  is decided again from clean state. Survivors were already confirmed in isolation.

  **A mutant is armed through the test's own `beforeEach`, as Stryker arms it.** The dry run credits code a
  hook runs to the test, so a mutant in a fixture builder or a seed was planned for it, but the hooks ran
  before the mutant was armed: it always survived the warm run and was killed later by an isolated run in a
  fresh process. On a Mongo-backed suite that was 58 of 400 mutants; now the warm run kills them.

  **A unit no longer runs a mutant another unit has already killed.** Units are filtered against the kills
  known when a server takes them, not when they were built; most units wait in the queue while others run.
  On burgee/paratext warm executions fell from 6,548 to 5,209 and the warm phase from 85 s to 77 s, with
  every verdict unchanged (modelled in `.sdlc/intents/oxmutate/dispatch.qnt`).

  **Static mutants are decided in a live worker.** Each one used to get a fresh worker per test file that
  loads its module, about 80 ms of start-up around tests that take milliseconds. Now a live worker arms
  the mutant, resets the module registry (dependencies inlined) and collects the file again, so its tests
  run against modules evaluated under the mutant. A file whose own collection changes globals,
  `process.env` or a built-in prototype, a mutant that leaves such a trace, or an unarmed re-collection
  that fails sends the batch back to the fresh-worker path; `OXMUTATE_ISOLATE_STATIC=1` keeps that path
  for everything. burgee/paratext: 35 s to 17.5 s, 6.2x faster than Stryker 10, every verdict unchanged
  (modelled in `.sdlc/intents/oxmutate/staticwarm.qnt`, locked by the `static-const` and `static-leak`
  fixtures).

  **A mutator Stryker does not have: `NumericLiteral`.** Numbers are mutated the way PIT's "inline
  constant" does it: 0 becomes 1, 1 becomes 0, anything else n + 1, the off-by-one a test of a limit or
  an index should notice. Object and destructuring keys, types and enum members are left alone. On
  burgee/paratext that is 78 more mutants (1,446 against Stryker's 1,356), 19 of them survivors no
  Stryker run reports; on controlroom 70 more, 17 survivors. `--stryker-compat` leaves numbers alone, so
  it still produces Stryker's mutant set exactly.

## 1.0.3

### Patch Changes

- [#1364](https://github.com/ofri-peretz/burgee/pull/1364) [`8299218`](https://github.com/ofri-peretz/burgee/commit/8299218e54736c7343afab369160e7b19d2001a6) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - A Vitest config with `projects` is mutation-tested. Each project resolves `runner` from its own inline config rather than from the options oxmutate passes, so such a suite ran with Vitest's runner, recorded no test, and the run stopped at "the dry run ran no tests". oxmutate now sets its runner on every project; each keeps its own pool.

## 1.0.2

### Patch Changes

- [#1354](https://github.com/ofri-peretz/burgee/pull/1354) [`9b9aac7`](https://github.com/ofri-peretz/burgee/commit/9b9aac7f9662d1488c4fa18f0a3e19e45e602ad5) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Graded against Stryker 10.0.0's own mutator specs (`npm run compat:mutation`): 236 of 236 pass, 4 that test Stryker's internals are listed as not applicable. Two fixes it found: `"use strict"` and other directive prologues are no longer mutated, as Stryker never mutates them; and a `switch` case mutant is reported as Stryker reports it (`case 1:`, its body emptied) rather than as the whole clause removed. What runs under each mutant is unchanged.

## 1.0.1

### Patch Changes

- [#1350](https://github.com/ofri-peretz/burgee/pull/1350) [`53512ae`](https://github.com/ofri-peretz/burgee/commit/53512aea54f0b4cb3ac62a4c877a07ac30951117) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Depend on `burgee` and `bellpull` by caret range (`^1.9.2`, `^1.0.10`), as every other family package does. 1.0.0 published `"*"`, which would install a future major of either under it.

## 1.0.0

### Major Changes

- [#1302](https://github.com/ofri-peretz/burgee/pull/1302) The first release: mutation testing
  for JavaScript and TypeScript on the oxc engine, run warm inside your own Vitest.

  - **Your Stryker setup, unchanged.** Reads `stryker.config.*` and writes Stryker's JSON report
    (schema 2), so `mutation-testing-elements`, dashboards and ratchets read it as they read
    Stryker's. Every Stryker 10.0.0 mutator family (all 17, Regex included), with Stryker's exact
    mutant set, and verdicts that agree with Stryker's on 99.9% of mutants across the suites
    measured. Also HTML, SARIF, clear-text and progress reporters; `// Stryker disable` with a
    reason; `buildCommand`, `dryRunOnly`, `dryRunTimeoutMinutes`, `allowEmpty`,
    `testRunnerNodeArgs`, `warnings`, the command runner (`testRunner: 'command'`) and the
    TypeScript checker (`checkers: ['typescript']`, on surviving mutants, with tsgo or tsc).
  - **One config file, the Vite+ way.** A `mutate` block in `vite.config.ts` beside `test`, typed
    by `/// <reference types="oxmutate/vite" />`. `defineMutate` types a block kept in its own file. `oxmutate.config.*` and `stryker.config.*` work too.
  - **Fast where Stryker spends its time.** The instrumenter is Rust and runs every file in
    parallel (35 ms for 720 mutants). Each covering test re-runs per mutant inside a live Vitest
    worker instead of a fresh run per mutant, on a work-stealing pool of warm servers.
  - **Correct where speed would cut corners.** A canary after mutants restarts a context a mutant
    polluted; survivors are confirmed with the mutant armed across the whole file; a watchdog stop
    is re-run at 3x before it is called a timeout; static mutants are re-run with the mutant armed
    from import; every instrumented file is re-parsed before it runs; and no server outlives its
    run.
  - **Built for CI and for agents.** `--since <ref>` (changed lines), `--shard i/n`,
    `--incremental`, `--frozen-oracle <ref>` (exits 1 when a change weakened its own tests),
    `oxmutate survivors --json`, `--json`, `--schema` and an MCP server (`--mcp`), and exit codes
    that mean one thing each.
  - **Formal methods as a second verdict.** Spec oracles replay a model's traces (Quint, or any
    tool that writes ITF) against each mutant, through a test that imports `oxmutate/spec`, and
    report the mutants only the model catches, each with the trace that caught it.
  - **Ignore rules as data**: `ignore: [{ call: 'console.*', reason }]` in place of ignorer plugins.
  - The native core ships inside the package for macOS (arm64, x64), Linux (glibc x64 and arm64,
    musl x64) and Windows (x64). Node `^20.19.0 || >=22.13.0`, Vitest 4.1 or later.
