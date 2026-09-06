# Design — `commander-agent`

Intent: [`intent.md`](./intent.md). **Status:** draft.

---

## Requirements

Floor ids from the umbrella design, restated as testable statements on the demo CLI.

- **R1 (F1)** `--schema` on the root prints `Manifest` JSON: `{ schemaVersion: 1, name,
  version, description, commands: CommandNode[] }` where each node has `name, aliases,
  description, hidden, group?, arguments[], options[], examples[], deprecated?,
  exitCodes, subcommands[]`. Options carry `flags, long, short, description, type
  ('boolean'|'string'|'number'|'choice'|'variadic'), default, env, required, hidden,
  choices?, negate`.
- **R2 (F2)** `--help --json` on any command prints that command's `CommandNode`; the
  text help is rendered from the same node through `configureHelp({ formatHelp })`.
- **R3 (F4)** `group` is read from a `Command` "group" tag set via `withGroup(cmd,
  'name')`; hidden commands are excluded from text help and included in `--schema`
  with `hidden: true`.
- **R4 (O1)** `--json` is a hidden global option added to every command; when present,
  the envelope is the only thing on stdout, and `ctx.out.*` calls are buffered into
  `meta.output[]` rather than printed.
- **R5 (O2)** With `!runtime.isTTY.stdout || env.NO_COLOR`, `ctx.out.style()` is the
  identity, `ctx.out.spinner()` is a no-op that logs one line on start and one on
  stop, and `ctx.out.progress()` prints only on completion. `FORCE_COLOR` wins over
  `NO_COLOR` as Node does.
- **R6 (O3/O4)** `ctx.out` is the only writer the layer hands to handlers; it uses
  `util.styleText`. `eslint-plugin-cli` (intent 4) forbids `console.*` in command files.
- **R7 (O5)** Every exit path awaits a drain of `runtime.stdout` before `runtime.exit`.
- **R8 (E1)** Exit codes come from `ExitCode` only: commander usage errors → `USAGE`,
  `CliError.exitCode` as thrown, unknown thrown errors → `RUNTIME`, SIGINT → `SIGINT`.
- **R9 (E2)** `showHelpAfterError(false)` is forced; a `RUNTIME` failure prints
  `error.message` and `hint`, never help; a `USAGE` failure prints the one-line usage
  and `fix`, never a stack. Stacks appear only with `--debug` or `DEBUG=cli*`.
- **R10 (E3)** `CliError` in `@interlace/cli-core`: `{ code: string; exitCode: ExitCode;
  message; hint?; fix?: { command?: string; flag?: string } }`. The layer synthesises
  `fix` for unknown command (nearest by Levenshtein, as commander's own suggestion
  does), unknown option, missing required argument/option, and reserved-name
  collision.
- **R11 (E4)** Order: parse → `preAction` hook (layer: runtime, output mode, env) →
  validate → handler (awaited via `parseAsync`) → render envelope → drain → exit. A
  validation failure never reaches the handler.
- **R12 (E5)** A single SIGINT handler installed by the layer: restores raw mode if the
  layer set it, prints nothing in non-TTY, exits `SIGINT`.

## Design

### Shape

```
packages/commander-agent/src/
  index.ts          withAgentLayer(program, { runtime?, name?, version? }) → program
  manifest.ts       walk(Command) → CommandNode; program → Manifest      (F1, F4)
  help.ts           formatHelp from CommandNode; --help --json           (F2)
  output.ts         createOut(runtime): { write, style, spinner, progress, table }  (O2–O4)
  envelope.ts       ok(data, meta) / fail(CliError, meta); JSON writer  (O1)
  errors.ts         mapping commander errors → CliError with fix        (E2, E3)
  lifecycle.ts      hooks, exitOverride wiring, drain, SIGINT           (E1, E4, E5, O5)
packages/cli-core/src/
  runtime.ts        (intent 1)
  exit-code.ts      (landed)
  cli-error.ts      CliError                                            (E3)
  envelope.ts       Envelope<T> type + JSON Schema                      (O1)
  manifest.ts       Manifest types + JSON Schema, schemaVersion 1       (F1)
```

### How it attaches, hook by hook

| commander API | Layer use |
| :-- | :-- |
| `program.exitOverride()` | every exit becomes a `CommanderError` the lifecycle maps to E1 |
| `program.configureOutput({ writeOut, writeErr, outputError })` | routes through `Runtime`; `outputError` renders `CliError` (E2/E3) |
| `program.configureHelp({ formatHelp })` | text help from `CommandNode` (F2); `helper.visibleCommands` respects `hidden` |
| `program.showHelpAfterError(false)`, `showSuggestionAfterError(false)` | E2; the layer's own `fix` replaces commander's suggestion text |
| `cmd.hook('preAction', …)` on every command (recursively, incl. later-added ones via `preSubcommand`) | builds `ctx = { out, runtime, json }` and passes it as the last action argument |
| `cmd.addOption(new Option('--json').hideHelp())` recursively | O1 |
| `program.addOption(new Option('--schema').hideHelp())` + `--help --json` in `helpOption` handling | F1/F2 |
| `Option#env()` / `#envVar` | read, not set: surfaces in `--schema` as `env` (V2 lands with `commander-env`) |

Actions written for plain commander keep their signature; the layer appends `ctx`
after commander's `(…args, options, command)`. A handler's return value becomes
`data` under `--json`; `undefined` → `null`.

### The envelope

```json
{ "ok": true,  "data": { … }, "meta": { "command": "config get", "durationMs": 3, "schemaVersion": 1 } }
{ "ok": false, "error": { "code": "E_UNKNOWN_COMMAND", "exitCode": 2, "message": "unknown command 'confg'", "hint": "…", "fix": { "command": "mytool config" } }, "meta": { … } }
```

Under `--json`, `stderr` carries nothing on success and the same `error` object as text
on failure, so a caller that only captures stderr still sees it.

### Example: what an agent sees

```text
$ mytool confg get user.name
error E_UNKNOWN_COMMAND: unknown command 'confg'
fix: mytool config get user.name
$ echo $?
2
```

Two lines, one exit code, the exact next command. Compare the default: three lines of
"error: unknown command 'confg'\n(Did you mean config?)" followed by full help, exit 1.

## Verification

- Conformance suite (intent 1) gains one `describe` per requirement above, run on the
  commander demo; each case was seen red on the un-layered demo in the PR that adds it.
- `manifest.schema.json` validated with `ajv` against the demo's `--schema` output.
- Non-TTY lock: pipe every demo command, assert `!/\x1b|\r/.test(stdout)`.
- `npm run bench:agent` (intent 5) runs on this package's changes; the tokens-per-task
  band is the number this intent exists to move.

## Rejected alternatives

- **Subclassing `Command` (`class AgentCommand extends Command`).** Forces consumers to
  construct our class, breaks `program.command('x')` which creates plain `Command`s
  unless `createCommand` is also overridden, and is exactly the kind of lock-in a
  layer must not have. Hooks attach to any program, including ones built by others.
- **Wrapping `action()` to intercept handlers.** Loses the `(…args, options, command)`
  contract users know; `preAction` gives the same access without rewriting signatures.
- **`console.log` with a global patch under `--json`.** The floor says O3 for a reason:
  a patched console cannot tell output from debug noise, and it re-introduces the
  `process.*` reads intent 1 removed.
- **Emitting the manifest from a static analysis of the source.** oclif does this with
  its manifest command and it drifts; walking the live `Command` tree cannot drift.

## Out of scope

- V1–V5 (`commander-env`), S1–S4 (`commander-schema`), P1–P2, D1–D2, T1 (intent 1).
- MCP tool-definition export from the manifest (`agent.ts` in the umbrella) — next
  after the benchmark says what agents actually need.
- yargs (intent 6) — but every requirement here is written so that intent can meet it.
