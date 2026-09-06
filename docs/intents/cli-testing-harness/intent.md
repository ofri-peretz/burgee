# Intent — Run any CLI in-process, with everything injected

> Stage 1 artifact. Child of [`agent-native-cli-layer`](../agent-native-cli-layer/intent.md),
> requirement T1. First in the order of work because every other requirement is
> verified through it.

**Status:** draft · **Opened:** 2026-09-06 · **Owner:** @ofri-peretz

---

## What is wanted

A test can run a commander or yargs program **in the same process** with an injected
`argv`, `env`, `stdin`, `cwd` and TTY-ness, and get back `{ code, stdout, stderr, json }`
without the program touching the real `process`. The same call shape works for both
hosts, so one suite can run one CLI built twice (the adapter contract in the umbrella
design).

Concretely:

1. `@interlace/cli-core` exports a `Runtime` interface — `env`, `argv`, `cwd`, `stdin`,
   `stdout`, `stderr`, `isTTY`, `exit` — and a `processRuntime` default. Every layer
   above the parser reads the world through it, never through `process.*` directly.
2. `commander-harness` exports `runCommander(program, { argv, env, stdin, tty })` and
   `yargs-testing` exports `runYargs(cli, …)`, both returning the same `RunResult`.
3. A failed run is data, not a thrown exception: `code` carries the E1 exit code, and
   `json` is parsed when `--json` was given and stdout parsed cleanly.

## Why now

- **The incumbents cannot do this.** commander #2549 (2026-07, open): "Allow passing
  custom env instead of process.env … mostly for testing." yargs #2450: `getHelp` cannot
  take `args`, so help for a subcommand cannot be rendered in a test. yargs #914 and
  #2038: mocking nested `commandDir` and attaching a debugger are open questions since
  2017.
- **Every floor requirement is stated in terms of the output** (O1 envelope, E1 exit
  code, O2 nothing but plain text when not a TTY). Without a harness they would be
  tested by spawning `node` per case: slow, flaky, and unable to fake a TTY.
- **The benchmark (intent 5) and the lint fixtures (intent 4) both consume the demo
  CLIs through this seam.** It has to exist first.

## Affected users and systems

- `packages/cli-core` (`Runtime`, `RunResult`), new `packages/commander-harness`, new
  `packages/yargs-testing` (`commander-testing` is taken on npm).
- `examples/demo-cli-commander` and `examples/demo-cli-yargs`, created here as the first
  consumers so the harness has something real to run.
- The root `npm test`, which gains the shared conformance suite.

## Constraints

1. **No child processes** on the default path. A `spawn` mode may exist for
   end-to-end checks but is not what the suite runs.
2. **No monkey-patching of `process`** in the product code. Only the harness may
   substitute `process.env` for the duration of a run, and only because commander
   reads `Option.env()` from `process.env` at parse time (#2549) — documented, scoped,
   restored in `finally`.
3. Host public APIs only: commander's `exitOverride()`, `configureOutput()`,
   `parseAsync(argv, { from: 'user' })`; yargs' `.exitProcess(false)`, `.fail()`,
   `.parseAsync()`. Nothing from `getInternalMethods()` in the harness.
4. Zero runtime dependencies in `@interlace/cli-core`; each harness depends only on
   its host as a peer.

## Success criteria

- The same conformance suite passes against both demo CLIs, and a deliberate
  regression in either demo (wrong exit code, ANSI in non-TTY) turns it red.
- `runCommander` resolves in under 20 ms for the demo CLI on a warm process, measured
  in the suite and pinned as a lock with a generous ceiling.
- `process.env` is byte-identical before and after a run that injected `env`, pinned by
  a lock test.
- No `process.` reference in `packages/*/src/**` outside `processRuntime`, pinned by a
  grep lock (and later by `eslint-plugin-cli`).

## Open questions

- Should `RunResult.stdout` be the raw string, or split into `lines` with ANSI already
  stripped when `tty: true`? Leaning raw plus a `stripAnsi` helper.
- `stdin` as a string, a `Readable`, or both? Both, string being sugar.
- Does yargs' `.parseAsync` leave a completed handler promise un-awaited in any path
  (yargs #1069 says it did for `parse(argv, cb)`)? Needs a probe before the design is
  accepted.
