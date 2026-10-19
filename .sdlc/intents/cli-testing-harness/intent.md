# Intent — Run any CLI in-process, with everything injected

> Stage 1 artifact. Child of [`burgee`](../burgee/intent.md),
> requirement T1. First in the order of work because every other requirement is
> verified through it.

**Status:** shipped · **Opened:** 2026-09-06 · **Owner:** @ofri-peretz · **Shipped:** 2026-10-19 by
`docs/restate-superseded-intents`, verified on a branch from `main` at `51fec1ba` — S1–S4 each held by the check named in § Restated 2026-10-18; the last one, S1's ANSI half, by `examples/conformance/src/harness.test.ts` › "writes no ANSI escape when no stream is a terminal — help, output, a failure and a usage error"

**Corrected from `shipped` 2026-09-09** — two of four criteria met, one superseded, one unbuilt; see [Verified against `main`](#verified-against-main--2026-09-09)

**Restated:** 2026-10-18 — see § Restated 2026-10-18

> Approved 2026-09-06 by @ofri-peretz in session ("Approve. lets move forward.").

---

## Restated 2026-10-18

**Criteria restated to the shipped `burgee/testing` harness and the compat-oracle drivers; S2 and S4 restated and held, S3 held, the ANSI half of S1 has no check on main — REMAINING: S1 ANSI-in-non-TTY conformance case.** *Closed 2026-10-19 by a conformance case on all five hosts; all four criteria held.*

What shipped differs from the 2026-09-06 design in vocabulary, not in behaviour.
`@interlace/cli-core` became the `burgee` package: `Runtime` and `processRuntime` live in
`packages/burgee/src/runtime.ts` (with a `clock` member added for cli-output-stack R14), and
the harness is the `burgee/testing` entry (`runBurgee`, `fakeRuntime`, `swapEnv`, `stripAnsi`,
in `packages/burgee/src/testing-helpers.ts`). `commander-harness` and `yargs-harness` were never
published as packages: `runCommander` and `runYargs` are
`packages/compat-oracle/src/drivers/{commander,yargs}.ts`, private tooling. The conformance
suite runs over **five** hosts (`commander`, `burgee-commander`, `yargs`, `burgee-yargs`,
`burgee`; `examples/conformance/src/hosts.ts`), not two. The success-criteria bullets are
numbered S1–S4 here in their order; the text of each is kept below with an annotation.

| ID | promised | on main | check | disposition |
| :-- | :-- | :-- | :-- | :-- |
| S1a | the conformance suite passes on both demos; a wrong exit code turns it red | yes, on five hosts | `examples/conformance/src/harness.test.ts` › "an unknown command is USAGE", › "a runtime failure is RUNTIME with the message on stderr and no help text", › "runtime.exit unwinds with its E1 code" | held |
| S1b | a deliberate ANSI-in-non-TTY regression in a demo turns the suite red | yes since 2026-10-19, on five hosts: `--help`, a command's output, a runtime failure and a usage error, with no stream a TTY (the harness default) | `examples/conformance/src/harness.test.ts` › "writes no ANSI escape when no stream is a terminal — help, output, a failure and a usage error" | held (2026-10-19) |
| S2 | `runCommander` under 20 ms warm, pinned with a generous ceiling | yes, as a relative bound | `examples/conformance/src/harness.test.ts` › "is fast: a warm in-process run beats half a spawned run of the same CLI, measured in the same run" | restated |
| S3 | `process.env` byte-identical after an injected-env run | yes, on five hosts, after a failing run | `examples/conformance/src/harness.test.ts` › "leaves process.env byte-identical after a run that injected env and failed"; `packages/burgee/src/testing-helpers.test.ts` › "leaves process.env byte-identical after a run, even one that throws" | held |
| S4 | no `process.` in `packages/*/src/**` outside `processRuntime`, grep lock | yes, one seam per package | `packages/burgee/src/process-reference-lock.test.ts` › "no layer source reads process.* outside the three files that own it" | restated |

- **S1b (held, 2026-10-19).** The case runs `--help`, `greet ada`, `fail` and `confg` on every
  host and fails on any `\u001b` in stdout or stderr. Proven red against a deliberately coloured
  demo: wrapping the greeting in `examples/demo-cli-burgee/dist/index.js` with `\u001b[1m` …
  `\u001b[22m` reads `burgee greet ada: expected '\u001b[1mHello\u001b[22m, ada!\n' not to
  contain '\u001b'`, and the case is green again once the file is restored. What follows is the
  2026-10-18 reading that found the gap. Plain text off a terminal is held for burgee's own help by
  `packages/burgee/src/color.test.ts` › "is styled on a terminal, and only there". That is the
  engine's O2 check, called through `execute` directly; it is not a conformance case, does not
  run on the commander or yargs hosts, and would not see colour emitted by a demo handler. The
  promise here — a demo that regresses to ANSI under a pipe turns the shared suite red — needs a
  conformance case plus a demo output that can carry colour, proven red on a deliberately
  coloured demo (rule 4). No other intent covers it, so it stays here.
- **S2 (restated).** The absolute 20 ms (and 40 ms yargs) ceiling was removed after it failed two
  PRs that touched no relevant code (#27). The shipped bound is relative and contention-proof:
  the harness p95 over warm in-process runs must be under half the median of spawned runs of the
  same demo CLI, sampled in the same test. That is the claim T1 actually makes (in-process is
  cheaper than spawning), so the criterion now says that.
- **S4 (restated).** The lock is real, unit-tests its own regexes (`PROCESS_READ`,
  `PROCESS_BIND`, four `it.each` tables in the same file), and also catches a `node:process`
  import or a `globalThis.process` binding. Its shape is "one `runtime.ts` seam per package,
  plus the `bin` a package declares (derived from its `package.json`, not listed), plus three
  compat-oracle files that own a process by job" — ten listed paths on FETCH_HEAD, down from the
  18 counted on 2026-09-09. The 2026-09-09 paragraph below is kept as the record of that count.
- **The spec's R1–R7** are restated in [`spec.md`](./spec.md) § Restated 2026-10-18; all seven
  are held.

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
  **Restated 2026-10-18 (S1):** the suite runs on five hosts and the exit-code half is
  held by `examples/conformance/src/harness.test.ts` › "an unknown command is USAGE";
  the ANSI-in-non-TTY half has no check on main and is **remaining**.
- ~~`runCommander` resolves in under 20 ms for the demo CLI on a warm process, measured
  in the suite and pinned as a lock with a generous ceiling.~~
  **Restated 2026-10-18 (S2):** a warm in-process run's p95 is under half the median of
  spawned runs of the same demo CLI, measured in the same test — held by
  `examples/conformance/src/harness.test.ts` › "is fast: a warm in-process run beats half
  a spawned run of the same CLI, measured in the same run".
- `process.env` is byte-identical before and after a run that injected `env`, pinned by
  a lock test. **Held (S3)** by `examples/conformance/src/harness.test.ts` › "leaves
  process.env byte-identical after a run that injected env and failed".
- ~~No `process.` reference in `packages/*/src/**` outside `processRuntime`, pinned by a
  grep lock (and later by `eslint-plugin-cli-floor`).~~
  **Restated 2026-10-18 (S4):** no `process` read or binding in `packages/*/src/**`
  outside each package's `runtime.ts` seam, its declared `bin`, and three compat-oracle
  files — held by `packages/burgee/src/process-reference-lock.test.ts` › "no layer source
  reads process.* outside the three files that own it". (`eslint-plugin-cli-floor` moved
  to the eslint repo as eslint#1137 and is not a check here.)

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

Decided — none open. The items below were settled when this intent was written and are
kept as the record they always were (confirmed 2026-09-20, D-072).

None open. Decided at finalisation (2026-09-06):

- Decided: **`RunResult.stdout` is raw.** A `stripAnsi(result)` helper is exported; tests that
  want lines call `result.stdout.split('
')`. One shape, no hidden transformation.
- Decided: **`stdin` accepts a string or a `Readable`**; the string form is sugar for
  `Readable.from([text])`.
- Decided: **yargs `parseAsync` completion (yargs #1069, #1797)** is the first verification task of
  the yargs harness, not an open question: the harness awaits `parseAsync` and, in
  addition, awaits a `handlerDone` promise the layer resolves in its after-handler
  middleware. If yargs resolves early, the suite catches it; the design does not depend
  on the answer.
