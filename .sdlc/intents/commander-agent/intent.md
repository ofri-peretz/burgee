# Intent — `commander-agent`: the floor on commander's public hooks

> Stage 1 artifact. Child of [`agent-native-cli-layer`](../agent-native-cli-layer/intent.md),
> step 2 of its order of work. Requirements F1, F2, F4, O1–O5, E1–E5.

**Status:** dropped (superseded 2026-09-06) · **Opened:** 2026-09-06 · **Owner:** @ofri-peretz

---

> **Superseded 2026-09-06 by the competitor decision.** With the engine as the product,
> a layer over commander's parser and a compatible front-end over our own engine are the
> same package — and the front-end is the one that needs no host dependency. This
> intent's requirements (F, O, E, M) moved to
> [`replacement-parser`](../replacement-parser/intent.md) and
> [`commander-compat`](../commander-compat/intent.md). Kept for the record; nothing is built
> from it. See [`architecture.md`](../../research/architecture.md).


## What is wanted

One call turns an existing commander program into an agent-driveable one:

```ts
import { Command } from 'commander';
import { withAgentLayer } from 'commander-agent';

const program = withAgentLayer(new Command('mytool'));
```

After that, without touching any command:

1. `mytool --schema` prints the whole command tree as JSON (F1); `mytool <cmd> --help
   --json` prints that command's help as data (F2); groups and hidden commands are
   honoured (F4).
2. `--json` exists on every command and wraps the handler's return value in one
   envelope `{ ok, data, error?, meta }` (O1). Handlers write through `ctx.out`, not
   `console` (O3), and colour comes from `util.styleText` (O4).
3. When stdout is not a TTY or `NO_COLOR` is set, nothing decorative is written (O2);
   stdout is flushed before every exit (O5).
4. Exit codes are E1's contract; a runtime failure never prints help and a usage error
   never prints a stack (E2); every error carries `code`, `message`, `hint` and, where
   known, `fix` (E3); the lifecycle is explicit and async handlers are awaited (E4);
   SIGINT restores the terminal and exits 130 (E5).

## Why now

- **commander has the hooks and no layer uses them together.** `hook('preAction')`,
  `exitOverride()`, `configureOutput()`, `configureHelp()`, `showHelpAfterError(false)`
  and `Option.env()` have all existed since v7–v9; commander #2505 (2026-04, open) asks
  what a plugin API should look like and has one comment. This extension is a concrete
  answer to that RFC.
- **The costliest agent misreads are commander-shaped.** yargs #2394 (help printed on
  handler failure) has an exact commander equivalent by default: `showHelpAfterError`
  is opt-in, and an unhandled rejection in an action prints a stack. clack #533
  (2026-05) reports agents "hang forever" on prompts; O2 plus E3 is the fix at the
  layer that owns output.
- **Nobody ships `--schema`.** yargs #1005, #2121 and citty #117 ask for the CLI as
  data; oclif's manifest is the closest thing and is why oclif exists. commander's
  `Command`, `Option` and `Argument` objects carry everything the manifest needs
  (`flags`, `description`, `defaultValue`, `envVar`, `argChoices`, `hidden`,
  `mandatory`, `variadic`), so F1 is a walk, not a parser change.

## Affected users and systems

- New `packages/commander-agent`, peer `commander@>=12`; `@interlace/cli-core` gains
  `CliError`, the envelope type, the manifest schema and `Runtime` (intent 1).
- `examples/demo-cli-commander` and the conformance suite (intent 1).
- `interlace-ui` in the interlace repo is the first real consumer once v0.1 tags.
- The npm name `commander-agent`, free on 2026-09-05.

## Constraints

1. Public commander APIs only; no monkey-patching of `Command.prototype`, no parsing
   of argv. If a needed seam is missing, the fix is a commander PR referenced from the
   design, never a fork.
2. The program stays a plain `Command`: every commander method keeps working after
   `withAgentLayer`, and a program that never uses `--json` behaves exactly as before
   except for E1/E2 (which are corrections, and documented as such).
3. Zero runtime dependencies beyond `@interlace/cli-core`; colour via
   `util.styleText` (Node ≥ 20.12, the repo targets 24).
4. The `--schema` document validates against a JSON Schema in `@interlace/cli-core`
   that is versioned independently (`schemaVersion: 1`); agents pin on it.

## Success criteria

- The conformance suite (intent 1) passes every F1/F2/F4/O/E case on the commander
  demo; each case fails when its guarantee is reverted (proven once, in the PR).
- `mytool --schema | jq` on `interlace-ui` returns its full tree with zero manual
  annotations; the docs site renders that output as the reference example.
- A non-TTY run of every demo command through a pipe contains no ESC byte, no `\r`
  and no prompt, pinned by a lock.
- Every error path in the demo produces `fix` for the three cases the research names
  most: unknown command (yargs #2481), reserved option collision (yargs #1864), missing
  required option in non-TTY (clack #533).

## Confirmed still dropped — 2026-09-09

Re-read against `main` at `61bd11b9`; **the recorded reason for dropping is still true.** It is
not re-graded, per the roadmap's rule that a dropped intent is closed rather than measured.

The reason recorded on 2026-09-06 was that a layer over commander's parser and a compatible
front-end over our own engine are the same package, and the front-end is the one that needs no
host dependency. `packages/burgee/package.json` declares `"dependencies": {}` and
`"peerDependencies": {}` — commander is not installed at all, which is only possible because the
parser is ours. The exports map ships `./commander` as a subpath front-end, backed by a full
reimplementation (`commander-command.ts`, `commander-help.ts`, `commander-option.ts`,
`commander-suggest.ts`), graded byte-for-byte against real commander rather than wrapping it.
Nothing named `commander-agent` exists in `packages/`, and neither `withAgentLayer` nor
`withAgentMiddleware` appears anywhere in the repo.

**One consequence to fix elsewhere:** four still-open intents cite `commander-agent` in a success
criterion — `first-adopter` ("ships a release depending on `commander-agent`"),
`cli-help-renderer`, `agent-native-cli-layer` and the README's coverage table. Those criteria
cannot be met as written, because the thing they name was dropped. They need rewriting to the
subpath front-end, not reinterpreting.

## Open questions

None open. Decided at finalisation (2026-09-06):

- **Envelope `meta` is `{ command, durationMs, schemaVersion }`.** `provenance` arrives
  with `commander-env` as an additive key under the same `schemaVersion` rule (adding
  keys never bumps the version; renaming or removing does).
- **`data` is `null` when a handler returns nothing**, so the key set is stable.
- **Agent detection is `!runtime.isTTY.stdout || env.CI || --json || --schema`.** No
  sniffing of `CLAUDECODE` or parent processes: honest signals only. `--agent` is not a
  flag; `--json` already means "no human here" (P2, R6 in `caique`).
- **SIGINT on Windows**: `process.on('SIGINT')` fires for console apps on Windows; the
  conformance suite runs on `windows-latest` as well as Ubuntu and macOS so E5 is
  measured, not assumed. Batch-file wrappers (oclif/oclif #958) are out of scope.
