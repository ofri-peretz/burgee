# oxmutate

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
