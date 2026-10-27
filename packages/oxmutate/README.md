# oxmutate

Mutation testing for JavaScript and TypeScript, on the [oxc](https://oxc.rs) engine. It reads your
Stryker config as it stands, runs your tests in your own Vitest, and is built for CI lanes and coding
agents. Community project, built on oxc, not affiliated with the oxc project.

```bash
npx oxmutate            # every mutant, with stryker.config.* if there is one
vpx oxmutate            # the same, from a Vite+ project
```

## What it does

A mutation tester changes your code one small step at a time (`a < b` becomes `a <= b`, a block
becomes empty, `true` becomes `false`) and runs the tests that cover each change. A change no test
notices is a **survivor**: a line your suite runs but does not check. oxmutate reports each one with
the file, the line, the change, and what to assert.

## How it is fast

- **Instrumentation in Rust.** oxc parses every file in parallel and the mutants are emitted as span
  edits: all 17 of Stryker 10.0.0's mutator families, with its exact mutant set (720 of 720 on es-toolkit's array module; Regex equal to weapon-regex on 928 of 932 real patterns), in 35 ms.
- **Warm runs inside Vitest.** Each covering test is re-run per mutant inside a live Vitest worker,
  with its hooks, `vi.mock` and environment, instead of a Vitest run per mutant.
- **A work-stealing pool.** Test files are split into small units over warm Vitest servers. A
  mutant that loops for ever kills only its own server; the rest of its unit moves to the others.

## How it stays correct

| Guard | What it catches |
| :-- | :-- |
| Dry run must pass | A suite that fails with no mutant active scores nothing (exit 3) |
| Canary after every mutant | The same test, unmutated, must still pass; if a mutant left a cache, registry or fixture behind, the context restarts fresh |
| Watchdog | A synchronous runaway is stopped and counted as a timeout |
| Flaky detector | Tests that behave differently across two dry runs: their mutants are re-run, and a verdict that changes is reported `flaky` |
| Static mutants | Code that runs at import is re-run with the mutant armed from process start |

## Commands

```bash
oxmutate run                                   # the default command
oxmutate run --since origin/main --reporter sarif   # PR lane: changed lines, annotated in code scanning
oxmutate run --shard 2/8                       # one cell of a CI matrix (shards partition exactly)
oxmutate run --incremental                     # reuse verdicts whose source and tests did not change
oxmutate run --break 80                        # exit 1 below this mutation score
oxmutate survivors --json                      # the list a coding agent writes tests from
```

Every command has `--json`, `--schema` and `--format=agent`, and the whole CLI is an MCP server
(`oxmutate --mcp`), from one declaration on [burgee](https://burgee.interlace.tools).

## Coming from Stryker

oxmutate reads `stryker.config.{mjs,js,cjs,json}` unchanged, writes Stryker's JSON report format
(so `mutation-testing-elements` renders it), and honors `// Stryker disable next-line <Mutator>:
<reason>`. Keys it does not use are listed in the report with the reason. Differences:

- Code inside TypeScript `as` casts and enums **is** mutated; Stryker 10.0.0 skips it. Use
  `--stryker-compat` for the same mutant set.
- The default timeout slack is 500 ms, not 5,000 ms: a warm in-process run has no process
  start-up noise to absorb. `timeoutMS` in your config wins.
- Static mutants are scored, not skipped.

## Requirements

Node 22.13 or later, Vitest 4.1 or later as a dev dependency of your project, and the prebuilt native
core for your platform (installed automatically as an optional dependency).

## License

MIT

## Benchmarks

Every number here is produced by `npm run bench` and published at [burgee.interlace.tools/docs/benchmarks](https://burgee.interlace.tools/docs/benchmarks).

No suite is graded against this package yet, so there is no compatibility number to quote.
