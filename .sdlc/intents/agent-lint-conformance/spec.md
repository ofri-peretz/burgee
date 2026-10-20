# Design — Full marks on cli-agent-lint

Intent: [`intent.md`](./intent.md). **Status:** approved — accepted under the owner's 2026-10-12 delegation.

**Accepted by the owner, 2026-10-12, by instruction: create and execute.** The instruction and the
evidence are recorded in [`next-wave-2026-10.md`](../../research/next-wave-2026-10.md).

**Refreshed 2026-10-18** against `main` at `1013b65db5`. R1–R7 are kept as built. **R8**
repairs a regression R4 introduced: the `auth` row it printed made FS-4 fail on a program that
has no auth, and FS-4 passed at the 81.4% baseline. **R9** finishes R7, raising the ratchet to
a CI reading. See "Remainder (2026-10-18)" below.

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

### Remainder (2026-10-18)

**What broke.** cli-agent-lint 0.3.5's FS-4 (`checks/flow_safety.go`, read at `v0.3.5`)
decides in two steps.
1. It passes when help names an auth flag (`token`, `api-key`, …) or an env var matching
   `_(TOKEN|API_KEY|CREDENTIALS|SECRET|PASSWORD)`.
2. Otherwise it fails if *any* help contains one of `auth`, `login`, `token` or `credential`
   (`authRelatedTerms`, `checks/flagpatterns.go`), and passes as "auth not applicable" if none
   does.

R4's generated row reads `auth: a credential is missing or refused; log in and run it again`
(`root-help.ts` lines 21–31, from `EXIT_ADVICE`). That makes every burgee program look like an
auth program with no non-interactive path. So FS-4 passed at 81.4% (no `Exit codes:` section
existed) and has failed in every reading since:
- 91.5% local, 2026-10-11;
- 94.9% published, `2026-10-12.json`;
- 96.6% on CI, run 39166723369, 2026-10-18.

**How burgee knows which codes a program can produce.** Every code but one is produced by the
engine itself, for any program:
- `USAGE`: parsing;
- `CONFIG`: config and plugin loading (`failure.ts` lines 78 and 168; `surfaces.ts` line 196);
- `CANCELLED`: an `action_required` result (`failure.ts` line 150);
- `TIMEOUT`: the engine's own `--timeout` (`globals.ts` line 158);
- `SIGINT`: the engine's teardown.

`AUTH` is produced only when a handler throws `AuthError` (`errors.ts` line 30), or a façade
maps one (`facade-failure.ts` line 12). Nothing in the manifest says a handler will: `OptionSpec`
has no credential notion, and no `defineProgram` key names one. **So burgee cannot know today,
and the fix needs a declaration.**

- **R8 — The exit-code contract lists only codes the program can produce; `auth` is declared.**
  - `defineProgram` accepts `auth?: { env: string }`. That is the variable a non-interactive
    caller sets, for example `DEMO_TOKEN`. It is checked by the definition check (a non-empty
    `SCREAMING_SNAKE` name) and copied into the manifest.
  - `producibleExits(manifest)` (`root-help.ts`) returns `ExitCode`'s entries in order:
    - without `AUTH`, unless `auth` is declared;
    - without `TIMEOUT`, when the program declares its own `timeout` option. The global then
      steps aside (R3), and the engine never exits 6.
  - `exitRows` and `--schema`'s `errors` list both read `producibleExits`, so help and schema
    never disagree. clispec's document reads the same list.
  - With `auth` declared, the row's advice names the variable: `auth: a credential is missing
    or refused; set DEMO_TOKEN and run it again`. That is the non-interactive recovery an agent
    can perform, where "log in" is the one thing it cannot do without a person. The same
    sentence becomes `AuthError`'s default `hint` when the handler gives none. It is localised
    through `messages.ts` (`exit.auth`), as R4's advice already is.
  - The reference demo declares no `auth`. It has no credential, so it lists six codes.

  This is not gaming FS-4. A program that declares `auth` prints an `_TOKEN`-style variable and
  passes FS-4 by step 1, because the path it names is real. A program that declares none no
  longer claims an auth failure it cannot produce.

  *Checks:*
  - `packages/burgee/src/help-snapshot.test.ts` ›
    `R8: lists only the exit codes the program can produce; auth only when declared`. The
    demo's root help has no `auth` row, and a program with `auth: { env: 'DEMO_TOKEN' }` lists
    `5  auth: … set DEMO_TOKEN …`. The R4 case is renamed `R4: lists every producible ExitCode…`.
  - `packages/burgee/src/schema.test.ts` › `R8: --schema errors match the help rows`.
  - `packages/burgee/src/define-error.test.ts` line 112, which asserts the seven built-in kinds
    on a program with no `auth`. It becomes six, plus a case that declares `auth` and gets
    seven.
  - `benchmarks/floor.test.ts`, through R9's reading: FS-4 no longer listed as failing.

  *Red on main:* the demo's root help prints `5  auth: a credential is missing or refused; log
  in and run it again`, and `define-error.test.ts` gets `auth` without a declaration.

- **R9 — The ratchet stands on a CI reading, at that reading.** After R8 merges, the
  `floor-results` artifact of the first `main` push whose N10 job is green is promoted as
  `benchmarks/results/external-floor/<date>.json`. That file has `machine.ci: true`; the
  published `2026-10-12.json` has `ci: false`, Node 22 and a `-dirty` commit, so it was a
  laptop or cloud reading. `BURGEE_FLOOR.agentLint.min` is set to the reading rounded down. If
  FS-4 was the last failing check, that is 100.

  Expected reading, not yet measured: FS-4 is the only remaining failing check, *if* SD-5 now
  passes. 94.9% → 96.6% between 10-12 and 10-18 is consistent with SD-5 having turned green
  (agent-skill R4), but the failing list must be read from the artifact (run 39166723369,
  artifact 12150887611, kept 30 days) before R9's number is written.

  *Check:* `benchmarks/floor.test.ts` ›
  `the published floor reading and the ratchet (agent-lint-conformance R7)`, with two new
  cases:
  - `R9 — the published reading was measured on CI`: `machine.ci === true`;
  - `R9 — the ratchet sits at the published reading`:
    `BURGEE_FLOOR.agentLint.min === Math.floor(reading('cli-agent-lint-score'))`.

  *Red on main:* `2026-10-12.json` has `ci: false`, and `91 !== 94`.

## Design

**One slice per requirement, R1 to R6 in any order, R7 last. Then R8, then R9.**

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
| R8 | `help-snapshot.test.ts` › `R8: lists only the exit codes the program can produce; auth only when declared`; `schema.test.ts` › `R8: --schema errors match the help rows`; `define-error.test.ts` (six kinds, seven with `auth`) | the demo prints the `auth` row; FS-4 fails in every reading since 2026-10-11 |
| R9 | `benchmarks/floor.test.ts` › `R9 — the published reading was measured on CI`; `R9 — the ratchet sits at the published reading` | `2026-10-12.json` is `ci: false`; `91 !== 94` |

The graded façades are checked in the same PRs by `npm run compat -- commander yargs`: unchanged
grades are the evidence the globals did not leak into them.

## Quint model: needed? For R3, not for the remainder

The tracker marks this intent `Q? y`, because of the engine's `--timeout` timer racing a handler
that settles at the same moment (R3, built). `registry.qnt` covers closeout's teardown deadline,
not the engine timer, so that model stays *partial* and is tracked there. **R8 and R9 need no
model.** R8 is a pure function from the manifest to a list of rows. R9 is a number in a file and
a comparison. Neither has state, ordering or time.

## Rejected alternatives

- **R8: reword the `auth` row so it avoids `auth`, `login`, `token` and `credential`.** It
  would pass FS-4 by dodging the probe while still claiming a code the program cannot produce.
  The constraint against gaming the checker covers evasion as much as padding.
- **R8: drop the `AUTH` row for every program.** A program that does authenticate would then
  hide the code its scripts branch on, and PV-4 measures that the contract is printed.
- **R8: infer auth from option names (`--token`) or env names (`*_TOKEN`).** That decides by
  name rather than evidence, which is the defect class `lint:name-inference` gates. An author
  states it once, in `auth`.
- **R8: read the handler source for `throw new AuthError`.** Static analysis of the author's
  code, defeated by a helper, and costly at help time.
- **R9: keep the ratchet at 91, below the reading.** A ratchet 5 points under the published
  reading lets five points slide without a red. A ratchet is worth what it can catch.
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
| R7 | **Built** 2026-10-11, short of full marks | `BURGEE_FLOOR.agentLint` 81 → 91; `benchmarks/results/external-floor/2026-10-11-986c3a1-local.json` (published as `2026-10-11.json` until clispec-conformance R9 promoted a newer reading; taken on `main` at `733e5e0` plus this PR's bench-only changes); the benchmarks page names each failing check with the probe's message. Measured on the demo: **91.5% (A)**, from 81.4% (B). Still failing: FS-4 (the `auth` exit-code row trips its "auth-related content" probe in a program with no auth), SD-1 (clispec-conformance R6), SD-5 (agent-skill R4) | `benchmarks/floor.test.ts` › `the published floor reading and the ratchet`. Red: `expected 81 to be greater than or equal to 90`; `expected 81.4 to be greater than or equal to 91` |
| R8 | **Built** 2026-10-19 ([D-20261019-exit-codes-producible-auth-declared](../../decisions/D-20261019-exit-codes-producible-auth-declared.md)) | `root-help.ts` (`producibleExits`, `adviceOf`, `exitRows(manifest)`), `clispec.ts` (`errorsOf(manifest)`), `skill.ts` (the contract table reads the same list), `execute.ts` (`Program.auth`, checked in `defineProgram`) and `manifest.ts` (`auth`), `failure.ts` (an `AUTH` failure without a hint gets the advice; `AuthError` itself is unchanged), `messages.ts` (`exit.auth`: `set {env} and run it again`). **Departures:** the check is in `execute.ts`, not `definition.ts`, because every front-end loads `definition.ts` and the façades would pay 230 B for a key only a native program has; the default hint is applied where the failure is described, not in `AuthError`'s constructor, which cannot see the manifest. The demo's committed `SKILL.md` and `AGENTS.md` lose the `auth` row. **FS-4 on CI:** held by name in the N10 job (`BURGEE_HELD_CHECKS`, `benchmarks/axes/floor.ts`) | `help-snapshot.test.ts` › `R8: lists only the exit codes the program can produce; auth only when declared`, `R8: the global --timeout steps aside…`, `R8: auth names a variable a shell can set…`; `schema.test.ts` › `R8: --schema errors match the help rows`; `define-error.test.ts` (six kinds; seven with `auth`); `auth-exit.test.ts` › `a declared credential is named in the refusal`; `benchmarks/floor.test.ts` › `the held checks`. Red on `main` (`b700f4dd`): the demo-shaped root help `not to contain 'auth'` failed; `auth: { env: 'lower' }` did not throw; `--schema` kinds `+ "auth"`; `Expected: "…set APP_TOKEN and run it again"`, `Received: "…log in and run it again"`; the `AuthError` hint absent |
| R9 | **Built** 2026-10-19 | `benchmarks/results/external-floor/2026-10-19.json`: the `floor-results` artifact of run 39228945490, the first green N10 run on `main` after R8 (`28843a5`), `machine.ci: true`, burgee **100% (A)** with nothing failing and clispec 24 / 24; `benchmarks/axes/floor.ts` (`BURGEE_FLOOR.agentLint.min` 91 → 100) | `benchmarks/floor.test.ts` › `R9 — the published reading was measured on CI`; `R9 — the ratchet sits at the published reading`. Red on `main` (`9930e086`): `2026-10-12.json was not measured on a CI runner: expected false to be true`; `expected 91 to be 94` |

**Built: 9. Not built: 0.**

**R9, what remains (2026-10-19).** No committed `external-floor` reading has `machine.ci: true`
and measurements after 2026-09-24 (78%): every `-ci.json` since is the `cheap` job's `not-run`
file, and the floor job keeps its reading only as the `floor-results` artifact. So R9 is: take the
`floor-results` artifact of the first green N10 run on `main` after this merges, commit it as
`benchmarks/results/external-floor/<date>.json`, set `BURGEE_FLOOR.agentLint.min` to its floor,
and add the two R9 cases. Fetching the artifact is a download the owner has to allow. The N10 job
on this PR is the expected reading's evidence: its log prints burgee's `cli-agent-lint-score`. R8 must land with clispec held at 24 of 24 and both façades' grades
unchanged (`npm run compat -- commander yargs`). The new key is engine-only, and neither façade
prints an `Exit codes:` section.
