# Design — Run any CLI in-process, with everything injected

Intent: [`intent.md`](./intent.md). **Status:** review — corrected from `shipped` 2026-09-09; see the intent's verification section.

**Restated:** 2026-10-18 — see § Restated 2026-10-18

---

## Restated 2026-10-18

**R1–R7 restated to the shipped names and all held; the design's perf lock is restated to the relative bound — the intent stays REMAINING only on its S1 ANSI-in-non-TTY case.**

The requirements below name packages that were never built under those names. The behaviour
each one specifies is on main; only the location moved. `@interlace/cli-core` is `burgee`;
`commander-harness` and `yargs-harness` are the private
`packages/compat-oracle/src/drivers/{commander,yargs}.ts`, and the burgee-native host runs
through `runBurgee` from `burgee/testing`.

| ID | promised | on main | check | disposition |
| :-- | :-- | :-- | :-- | :-- |
| R1 | `Runtime` + `processRuntime` in `@interlace/cli-core` | `packages/burgee/src/runtime.ts`, plus a `clock` member | `packages/burgee/src/runtime.test.ts` › "argv drops node and the script; env and cwd are the process’s own", › "the three streams are whichever are installed now, and isTTY asks each of them", › "exit leaves through process.exit with the code" | restated |
| R2 | `RunResult` with `durationMs`; an unparsable `--json` stdout is `RUNTIME` | `packages/burgee/src/testing-helpers.ts` `RunResult`, `finish` | `packages/burgee/src/testing-helpers.test.ts` › "parses stdout under --json and fails the run when it does not parse", › "leaves json unset without --json" | held |
| R3 | `runCommander(program, RunOptions)` | `compat-oracle/drivers/commander` `runCommander`, which also takes a factory | `packages/compat-oracle/src/drivers/commander.test.ts` › "builds the program against the fake runtime when given a factory", › "treats help and version as OK, program.error codes as given, the rest as USAGE" | restated |
| R4 | `runYargs(build, RunOptions)` takes a builder | `compat-oracle/drivers/yargs` `runYargs(build, opts, factory = yargs)` | `packages/compat-oracle/src/drivers/yargs.test.ts` › "renders --help itself, without parsing", › "is USAGE with nothing printed when yargs fails without a message" | restated |
| R5 | the host never exits the process or writes to the real streams | yes, both drivers and `fakeRuntime` | `packages/compat-oracle/src/drivers/commander.test.ts` › "never lets commander reach the real process: output and exit are captured"; `packages/compat-oracle/src/drivers/yargs.test.ts` › "never lets yargs reach the real process: output, failures and exit are captured"; `packages/burgee/src/testing-helpers.test.ts` › "exit unwinds with the code instead of ending the process" | held |
| R6 | conformance suite over both demos, run by root `npm test` | `examples/conformance/src/*.test.ts` over five hosts; the package's `test` script runs under `turbo run test` | `examples/conformance/src/harness.test.ts` › "runs a command and captures stdout with exit OK" (`describe.each` over `HOSTS`) | restated |
| R7 | `process.env` restored in `finally`, locked including a throwing run | yes | `packages/burgee/src/testing-helpers.test.ts` › "leaves process.env byte-identical after a run, even one that throws" | held |

- **Verification section.** `packages/cli-core/src/runtime.lock.test.ts` was never created. Its two
  assertions live in `packages/burgee/src/testing-helpers.test.ts` (the env swap) and
  `packages/burgee/src/process-reference-lock.test.ts` (the grep lock, now one `runtime.ts`
  per package rather than one file overall). The perf lock "p95 under 20 ms over 50 runs" is
  restated to the relative bound held by `examples/conformance/src/harness.test.ts` › "is fast:
  a warm in-process run beats half a spawned run of the same CLI, measured in the same run";
  the reason is in the intent's § Restated 2026-10-18 (S2).
- **TTY and cwd forwarding** — the row the umbrella spec calls T1's likeliest false pass — is
  held by `packages/burgee/src/testing-harness-forward.test.ts` › "forwards TTY-ness, so
  `tty: true` is a terminal and not the agent floor" and › "forwards cwd, so config discovery
  starts where the test said". The file's header also names `stdin` as dropped and fixed, but
  no case in it drives `stdin` through `runBurgee`; only `fakeRuntime`'s conversion is held
  (`packages/burgee/src/testing-helpers.test.ts` › "turns a string stdin into a readable").

## Requirements

- **R1** `Runtime` in `@interlace/cli-core`: `{ argv: string[]; env: Record<string,
  string | undefined>; cwd: string; stdin: NodeJS.ReadableStream; stdout: Writer;
  stderr: Writer; isTTY: { stdout: boolean; stderr: boolean; stdin: boolean };
  exit(code: ExitCode): never }`. `processRuntime` implements it over `process`.
- **R2** `RunResult = { code: ExitCode; stdout: string; stderr: string; json?: unknown;
  durationMs: number }`. `json` is set only when `--json` was in `argv` and stdout
  parses; a parse failure sets `code` to `RUNTIME` and `stderr` to the parse error, so
  a broken envelope cannot pass a test by accident.
- **R3** `runCommander(program: Command, opts: RunOptions): Promise<RunResult>`.
  `RunOptions = { argv: string[]; env?: Record<string,string>; stdin?: string |
  Readable; cwd?: string; tty?: boolean | Partial<Runtime['isTTY']> }`.
- **R4** `runYargs(build: (y: Argv) => Argv, opts: RunOptions): Promise<RunResult>` —
  takes a builder, not an instance, because a yargs instance holds parse state.
- **R5** The harness never lets the host exit the process or write to the real
  streams: commander via `exitOverride()` + `configureOutput()`, yargs via
  `.exitProcess(false)` + `.fail()`.
- **R6** A conformance suite `examples/conformance/*.test.ts` parameterised over both
  demo CLIs, run by root `npm test`. *(Restated 2026-10-18: five hosts, see the table above.)*
- **R7** `process.env` restored in `finally`; a lock test asserts equality before and
  after, including when the run throws.

## Design

### The seam

Everything above the parser gets its `Runtime` explicitly: `withAgentLayer(program,
{ runtime })`. The default is `processRuntime`; the harness passes a fake. This is the
whole trick — the layers never learn where output goes or whether a TTY exists, so a
test can lie to them freely.

```ts
// packages/cli-core/src/runtime.ts
export interface Runtime { /* R1 */ }
export const processRuntime: Runtime = {
  argv: process.argv.slice(2), env: process.env, cwd: process.cwd(),
  stdin: process.stdin, stdout: process.stdout, stderr: process.stderr,
  isTTY: { stdout: !!process.stdout.isTTY, stderr: !!process.stderr.isTTY, stdin: !!process.stdin.isTTY },
  exit: (code) => process.exit(code),
};
export function fakeRuntime(opts: RunOptions): Runtime & { out: string[]; err: string[] } { /* buffers */ }
```

### commander-harness

```ts
export async function runCommander(program: Command, opts: RunOptions): Promise<RunResult> {
  const rt = fakeRuntime(opts);
  program.exitOverride();                              // throw CommanderError instead of exit
  program.configureOutput({ writeOut: (s) => rt.out.push(s), writeErr: (s) => rt.err.push(s) });
  const saved = swapEnv(opts.env);                     // ponytail: commander reads Option.env() from process.env (#2549)
  const t0 = performance.now();
  try {
    await program.parseAsync(opts.argv, { from: 'user' });
    return result(rt, ExitCode.OK, t0);
  } catch (e) {
    if (e instanceof CommanderError) return result(rt, mapCommanderExit(e), t0);
    return result(rt, ExitCode.RUNTIME, t0, e);
  } finally { restoreEnv(saved); }
}
```

`mapCommanderExit`: commander's own usage errors carry `exitCode` 1 and `code` like
`commander.unknownOption` — the harness maps those to E1 `USAGE` (2); `commander.helpDisplayed`
and `commander.version` map to `OK`. The agent layer (intent 2) later makes commander emit
E1 codes itself, at which point this map becomes a lock that they agree.

### yargs-harness

Same shape: `.exitProcess(false)`, `.fail((msg, err) => …)` recording the E1 code,
`.parseAsync(argv)`; help text is captured through `.showHelpOnFail(false)` plus
`await y.getHelp()` when `--help` is in `argv` (yargs #2450 is why the harness renders
help itself).

### Demo CLIs and the conformance suite

`examples/demo-cli-commander` and `examples/demo-cli-yargs` implement the same three
commands — `greet <name> [--shout]`, `config get <key>`, `fail [--code]` — deliberately
covering a positional, a boolean, a subcommand group, an env-bound option and a
runtime failure. `examples/conformance/` runs each floor case against both:

```ts
for (const [name, run] of Object.entries({ commander: runDemoCommander, yargs: runDemoYargs })) {
  describe(`${name} · E1`, () => { it('fail exits RUNTIME, never prints help', async () => { … }); });
}
```

Cases are added per floor id as intents 2 and 6 land; the suite is the contract.

## Verification

- `npm test` at the root runs the harness unit tests and the conformance suite.
- `packages/cli-core/src/runtime.lock.test.ts`: `process.env` unchanged after a run;
  no file under `packages/*/src` matches `/\bprocess\.(env|argv|exit|stdout|stderr|cwd)\b/`
  except `runtime.ts`.
- ~~Perf lock: `runCommander(demo, ['greet','x'])` p95 under 20 ms over 50 runs.~~
  *Restated 2026-10-18:* warm p95 under half a spawned run of the same CLI; see the table above.

## Rejected alternatives

- **Spawning `node` per test case.** 100–300 ms each, no TTY faking, no coverage, and
  flaky under CI load. Kept as an optional `mode: 'spawn'` for a handful of true
  end-to-end checks.
- **Patching `process.stdout.write` globally.** Leaks between tests, breaks vitest's
  own reporter, and hides exactly the `process.*` reads the floor wants gone.
- **A harness per host with different result shapes.** The whole point is one suite
  over two hosts; the result type is the contract.

## Out of scope

- Snapshot testing of help text (intent 2 owns help rendering and its locks).
- A CLI test DSL or matchers beyond the plain result object.
- Windows PTY emulation; `tty` is a boolean flag, not a terminal.
