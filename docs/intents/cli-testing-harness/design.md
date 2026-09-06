# Design — Run any CLI in-process, with everything injected

Intent: [`intent.md`](./intent.md). **Status:** review.

---

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
  demo CLIs, run by root `npm test`.
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

### yargs-testing

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
- Perf lock: `runCommander(demo, ['greet','x'])` p95 under 20 ms over 50 runs.

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
