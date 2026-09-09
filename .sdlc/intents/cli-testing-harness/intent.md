# Intent — Run any CLI in-process, with everything injected

> Stage 1 artifact. Child of [`agent-native-cli-layer`](../agent-native-cli-layer/intent.md),
> requirement T1. First in the order of work because every other requirement is
> verified through it.

**Status:** review · **Opened:** 2026-09-06 · **Owner:** @ofri-peretz · **Corrected from
`shipped` 2026-09-09** — two of four criteria met, one superseded, one unbuilt; see [Verified against `main`](#verified-against-main--2026-09-09)

> Approved 2026-09-06 by @ofri-peretz in session ("Approve. lets move forward.").

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
   `yargs-harness` exports `runYargs(cli, …)`, both returning the same `RunResult`.
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
  `packages/yargs-harness` (`commander-testing` is taken on npm).
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
  grep lock (and later by `eslint-plugin-cli-floor`).

## Verified against `main` — 2026-09-09

**Status corrected from `shipped` to `review`.** Two of four criteria met, one deliberately
superseded, one half-built. The harness itself is genuinely good and in daily use — five hosts,
122 conformance tests green — but two of the four checks this intent promised do not exist in the
form it promised them, and one cannot fail.

- **The same conformance suite passes on both demos, and a deliberate regression — wrong exit
  code, ANSI in non-TTY — turns it red** — half. The suite runs over **five** hosts and asserts
  an exit code nearly everywhere, so the exit-code half would catch a regression. The ANSI half
  cannot: `examples/conformance/src/*.test.ts` contains no `isTTY`, `NO_COLOR` or escape-byte
  assertion at all, and the demos emit no colour, so there is nothing for that check to catch.
  By this repo's own rule 4 — a check is not done until it is proven to fail on the unfixed
  state — that half is unbuilt.
- **`runCommander` resolves in under 20 ms, pinned as a lock** — **stale, and deliberately
  superseded.** `examples/conformance/src/harness.test.ts:91` records that the absolute 20 / 40 ms
  ceiling was removed after it failed two PRs that touched no relevant code (#27), and replaced
  with "warm in-process p95 beats half a spawned run of the same CLI". That is a better check;
  the criterion was never rewritten to say so.
- **`process.env` byte-identical before and after an injected-env run, pinned by a lock** —
  **met.** Asserted on all five hosts after a failing run.
- **No `process.` reference in `packages/*/src/**` outside `processRuntime`, pinned by a grep
  lock** — met as a lock, stale as written. `packages/burgee/src/process-reference-lock.test.ts`
  exists, passes, and unit-tests its own regex — but its `ALLOWED` set has grown to **18 paths**
  (`runtime.ts`, `execute.ts`, four `yargs-*` files, `dev.ts`, five flagstaff files,
  `roundel/src/chalk.ts`, three compat-oracle files, and more), each with a written
  justification. The lock survives; the criterion's shape does not.

**Stale vocabulary:** `@interlace/cli-core` is now `burgee`, and `commander-harness` /
`yargs-harness` were never built as packages — the drivers are
`packages/compat-oracle/src/drivers/{commander,yargs}.ts` plus `burgee/testing`.

## Open questions

None open. Decided at finalisation (2026-09-06):

- **`RunResult.stdout` is raw.** A `stripAnsi(result)` helper is exported; tests that
  want lines call `result.stdout.split('
')`. One shape, no hidden transformation.
- **`stdin` accepts a string or a `Readable`**; the string form is sugar for
  `Readable.from([text])`.
- **yargs `parseAsync` completion (yargs #1069, #1797)** is the first verification task of
  the yargs harness, not an open question: the harness awaits `parseAsync` and, in
  addition, awaits a `handlerDone` promise the layer resolves in its after-handler
  middleware. If yargs resolves early, the suite catches it; the design does not depend
  on the answer.
