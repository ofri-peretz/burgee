# Design — Full marks on cli-agent-lint

Intent: [`intent.md`](./intent.md). **Status:** approved.

**Accepted by the owner, 2026-10-12, by instruction: create and execute.** The instruction and the
evidence are recorded in [`next-wave-2026-10.md`](../../research/next-wave-2026-10.md).

> Requirement ids are `R1`… so they cannot collide with the floor ids `scripts/run-evals.ts`
> reads from `burgee/spec.md`.

---

## Requirements

- **R1 — `--no-color` and `--color=<when>` are global.** `--no-color` is `--color=never`.
  `--color=always|never|auto` feeds `roundel/policy`'s decision with the precedence its README
  already states: `NO_COLOR` and `FORCE_COLOR=0` are never overridden into colour, the flags
  come next, and `FORCE_COLOR`'s level after them. Both are listed under `Global options:` in
  root help and in `--schema`'s global arguments.
- **R2 — `--quiet` / `-q` is global.** It sets the Runtime's output policy to silence everything
  `flagstaff` and `caique` draw (spinners, progress, task lists, `log` lines) and every
  framework hint. Stdout's payload, the `--json` envelope and every failure message stay. A
  prompt under `--quiet` in a non-TTY is the same usage error it already is.
- **R3 — `--timeout <duration>` is global, and a timeout has its own exit code.** The duration
  takes `ms`, `s` and `m` suffixes. A bare number is milliseconds. On expiry:
  1. `ctx.signal`, an `AbortSignal` added to the run context by this requirement, aborts.
  2. `closeout` runs the exit handlers inside its existing deadline.
  3. The process exits **124**, added as `ExitCode.TIMEOUT`.
  4. The envelope's error kind is `timeout`.

  124 is the code GNU `timeout` exits with, so scripts already branch on it. No published code
  moves.
- **R4 — Root help prints the exit-code contract.** An `Exit codes:` section after the commands
  lists each `ExitCode` entry with one line on what to do about it. It is generated from
  `exit-code.ts`, never typed, so a new code appears the day it is added.
- **R5 — `completion` is listed.** Root help's command list shows `completion <shell>` with its
  shells, as the engine already serves it. `--schema` lists it as an `opaque`-output command.
- **R6 — Examples are expected, and shown.**
  - `checkCommand` (`definition.ts`) reports a runnable command with no `examples` as a
    warning, which `burgee dev` prints.
  - Root help shows an `Examples:` section from the root's own examples, or from each top-level
    command's first example when the root declares none.
  - The reference demo declares one example per command, as the docs tell every author to.
- **R7 — Re-measured, and the ratchet raised.** After R1–R6 land, and SD-1
  (`clispec-conformance` R6) and SD-5 (`agent-skill` R4), the `external-floor` job's reading on
  `main` is promoted as `benchmarks/results/external-floor/<date>.json`.
  `BURGEE_FLOOR.agentLint` in `benchmarks/axes/floor.ts` rises to it. Any check still failing is
  named on the benchmarks page with the probe's own output.

## Design

**One slice per requirement, R1 to R6 in any order, R7 last.**

- **Where the globals live.** `GLOBAL` and `ROOT_GLOBAL` in `help.ts` hold the rows.
  `completions.ts`'s flag table holds the spellings. The parse takes them in `execute.ts`
  before dispatch, the same place `--json` is taken, so no command can shadow them. A program
  that declares its own `--quiet` or `--timeout` keeps it, and the global steps aside, exactly as
  a program's own `schema` command wins over the alias (D-151).
- **Colour.** The engine forwards the decision into the Runtime it already builds, and
  `roundel/policy`'s `decide()` reads it. No package detects the terminal itself (`U2`).
- **Quiet.** It is a Runtime field `quiet: true`. `flagstaff`'s loop and `caique`'s renderer read
  it through the policy they already consult, so the family honours it without an import of
  burgee.
- **Timeout.** It is a `setTimeout` armed after parse and unref'd, aborting an
  `AbortController` the engine creates per run and exposes as `ctx.signal`. The run context has
  no signal today (`ctx.ts`), so this is new API, and `mcp-current` R4 reuses it for an MCP
  client's cancellation. closeout's registry, which ends every
  run, maps the abort reason `timeout` to `ExitCode.TIMEOUT`. `isExitCode` and the exit-code lock
  learn the eighth code in the same PR.
- **Byte cost.** The help sections are strings the help chunk already loads. The timeout path
  is a few lines in the core. `runtime-ratchets-lock` reads the cost on the PR, and a breach
  moves the code behind `surfaces.ts`.

## Verification

| R | Check | Proven red by |
| :-- | :-- | :-- |
| R1 | `packages/burgee/src/color.test.ts`: `--no-color` with `FORCE_COLOR=3` prints no SGR; `--color=always` under a pipe prints SGR | today's tree: exit 2, `unknown option --no-color` |
| R2 | `packages/burgee/src/quiet.test.ts` (new): a command with a spinner and a `--json` result, under `--quiet`: stderr empty, stdout byte-identical to the run without it; a failure still prints | today's tree: exit 2 |
| R3 | `packages/burgee/src/timeout.test.ts` (new): a handler awaiting forever under `--timeout 50` exits 124 inside 50 ms plus closeout's deadline, its exit handler ran once, `ctx.signal.aborted` is true; `scripts/exit-code-lock.test.ts` knows 124 | today's tree: exit 2; the lock without the new code fails on the literal |
| R4 | `packages/burgee/src/help-snapshot.test.ts`: the section lists every `ExitCode` key; a mutation adding a key to `ExitCode` without a help line fails | today's snapshot has no section |
| R5 | `help-snapshot.test.ts` and `schema.test.ts` list `completion` | today's root help |
| R6 | a new `packages/burgee/src/definition.test.ts`: `checkCommand` warns on a runnable command with no examples; `help-snapshot.test.ts` holds the root section | today's demo help has none |
| R7 | `benchmarks/floor.test.ts`, gated by `BURGEE_FLOOR` | the gate fails any reading below the raised minimum |

The graded façades are checked in the same PRs by `npm run compat -- commander yargs`: unchanged
grades are the evidence the globals did not leak into them.

## Rejected alternatives

- **Add the strings to the demo's epilogue.** It would pass TE-3, TE-4, PV-1 and PV-4 by text
  alone, with flags that do nothing. The constraint against gaming the checker exists for this
  option.
- **Reuse `CANCELLED` (4) for a timeout.** A caller cancelled and a deadline passed want
  different responses: one is a decision, the other is retry-with-more-time. Sharing a code is
  the oxlint defect `cli-market-requirements.md` §5 names.
- **Make `--quiet` drop the hint lines from failures too.** The hint is why an agent recovers in
  one turn (`agent-headroom` R6: no hint is ever removed to save a byte). `--quiet` silences
  decoration, not instruction.
- **Turn the globals on in `burgee/commander` and `burgee/yargs`.** Their help is graded byte for
  byte against the incumbents' suites, and an extra row in help fails those cases.

## Out of scope

- SD-1, built in `clispec-conformance` R6, and SD-5, built in `agent-skill` R4. Both are
  re-measured here in R7.
- `--silent` as a second spelling. One spelling, global and framework-owned, is what
  `cli-market-requirements.md` asks for. TE-4 accepts `quiet` alone.
- A network timeout per request. The family opens no sockets (`agent-headroom` Out of scope);
  `--timeout` bounds the whole run.

## Status

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | **Built** 2026-10-11 (#1006) | `globals.ts` (read only when `isGlobal` in `argv.ts` spots a word), `execute.ts`, `ctx.ts` (`ctx.runtime` carries the colour flag), `surfaces.ts` (help's rows). `roundel/policy` needed no change: it already read `--no-color` / `--color=` from the argv it is handed. `--schema`'s global arguments are clispec-conformance R3's, read from the same rows | `color.test.ts` › `--no-color and --color=<when> are global options (R1)`. Red: exit 2, `unknown option --no-color` |
| R2 | **Built** 2026-10-11 (#1006), caique excepted | `ctx.quiet`, `ctx.runtime.quiet`, roundel's `Runtime.quiet` (type only), flagstaff's `hoist` (draws nothing, never arms the clock), the deprecation hint (`deprecation.ts`). **caique is not changed**: its clack port takes no runtime from the caller, so there is no seam to read `quiet` through. Gap [B-20261011-caique-quiet](../../gaps/B-20261011-caique-quiet.md) | `quiet.test.ts`; flagstaff `loop.test.ts` › `under quiet, nothing is drawn`. Red: exit 2; flagstaff drew in all five modes |
| R3 | **Built** 2026-10-11 (#1006), **exit 6, not 124** | `exit-code.ts` (`TIMEOUT: 6`, [D-20261011-timeout-exit-code](../../decisions/D-20261011-timeout-exit-code.md): 124 is inside `defineError`'s published 7–125), `globals.ts` (the deadline), `failure.ts` (`code: 'TIMEOUT'`). The deadline is the engine's, not closeout's registry: `leave` already runs closeout's teardown inside its deadline. The timer is **not** unref'd: a handler awaiting a promise with no handle would otherwise exit before it. The envelope's `kind` is clispec-conformance R2's, derived from the name | `timeout.test.ts`; `exit-code.test.ts`; `scripts/exit-code-lock.test.ts` reads eight codes. Red: exit 2, `unknown option --timeout`; the contract held seven |
| R4 | **Built** 2026-10-11 (#1002) | `root-help.ts` (`EXIT_ADVICE`, a `Record` over `ExitCode`'s keys; `exitRows`), handed to `help.ts` by `surfaces.ts`: `./help` had 18 bytes of headroom | `help-snapshot.test.ts` › `R4: …`. Red: `expected [] to have a length of 7` |
| R5 | **Built** 2026-10-11 (#1002) | `root-help.ts` (`completionNode`), `surfaces.ts` (listed; `completion --help`), `schema-surface.ts` (published last, drillable). The `opaque` output kind is clispec-conformance R5's vocabulary, which does not exist yet | `help-snapshot.test.ts` › `R5: …`; `schema.test.ts` › `lists the completion command the engine serves…` |
| R6 | **Built** 2026-10-11 (#1002) | `examples-check.ts` beside `checkCommand`, not inside it: `definition.ts` is on `./plugin` and both front-ends, and the warning cost 337 bytes there. `burgee dev` prints it; `root-help.ts` (`rootExamples`); `defineProgram({ examples })`; the demo declares one per command | `definition.test.ts`; `help-snapshot.test.ts` › `R6: …` |
| R7 | **Built** 2026-10-11, short of full marks | `BURGEE_FLOOR.agentLint` 81 → 91; `benchmarks/results/external-floor/2026-10-11.json` (taken on `main` at `733e5e0` plus this PR's bench-only changes); the benchmarks page names each failing check with the probe's message. Measured on the demo: **91.5% (A)**, from 81.4% (B). Still failing: FS-4 (the `auth` exit-code row trips its "auth-related content" probe in a program with no auth), SD-1 (clispec-conformance R6), SD-5 (agent-skill R4) | `benchmarks/floor.test.ts` › `the published floor reading and the ratchet`. Red: `expected 81 to be greater than or equal to 90`; `expected 81.4 to be greater than or equal to 91` |
