# oxmutate

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
