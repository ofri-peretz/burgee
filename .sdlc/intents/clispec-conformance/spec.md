# Design — `--schema` is a clispec v0.3 document

Intent: [`intent.md`](./intent.md). **Status:** approved.

**Accepted by the owner, 2026-10-12, by instruction: create and execute.** The instruction and the
evidence are recorded in [`next-wave-2026-10.md`](../../research/next-wave-2026-10.md).

> Requirement ids are `R1`… so they cannot collide with the floor ids `scripts/run-evals.ts`
> reads from `burgee/spec.md`.

---

## Requirements

- **R1 — The document says what it conforms to.** `--schema` gains `clispec: "0.3"` and
  always carries `version`: the program's declared version, else the owning `package.json`'s,
  which `commander-env` already resolves. `schemaVersion` stays 1: the published
  `program-schema.json` says it is "bumped only when a field changes meaning", and no field
  does. That file sets `additionalProperties: false`, so it gains the new keys in the same PR.
- **R2 — Every failure has a kind, and the kinds are declared.**
  - Each framework failure carries `error.kind`: `usage`, `runtime`, `config`, `cancelled`,
    `auth`, `interrupted`, and `timeout` once `agent-lint-conformance` R3 lands.
  - A `defineError` class declares its own `kind`, defaulting to its kebab-cased name.
  - `--schema` lists them all as `errors: [{ kind, exit_code, retryable, description }]`.
    Framework rows come from `ExitCode`; program rows come from the errors the program
    registers.
  - `retryable` is `true` only for `timeout` and for a defined error that says so.
- **R3 — Global arguments are declared once.** `global_args` lists every flag the engine takes
  before dispatch: `--json`, `--schema`, `--help`, `--explain`, `--fields`, `--format`,
  `--max-bytes`, and the `agent-lint-conformance` globals. Each has `name`, `type`,
  `description` and, where one exists, `enum` and `default`. It is read from the table root
  help renders (`GLOBAL` in `help.ts`), so the two cannot disagree.
- **R4 — Each command carries an `example`.** `example` is the first of the command's declared
  `examples`, as one invocation string. burgee's own `examples` array stays.
- **R5 — A command declares its output.**
  - `output?: { kind?: 'data' | 'stream' | 'opaque'; cardinality?: 'single' | 'bounded' | 'unbounded'; schema?: JsonSchema }`
    is added to `Command`.
  - `--schema` emits `output_kind`, `cardinality` and `stdout_schema` from it, and
    `output_fields` from the `fields` the command already declares.
  - `kind: 'stream'` is a declaration only. Emitting records one per line is `agent-headroom`
    R5's `--format=ndjson`, which is not built, and this intent does not build it.
  - `checkCommand` warns on a runnable command with no `output.cardinality`.
  - TypeScript checks `run`'s return type against `output.schema` where one is given, through
    the same inference `InferOptions` uses.
- **R6 — The error is structured on stderr too.** On a failure:
  - **Under `--json`**: stdout keeps the envelope exactly as today. Stderr is exactly one line,
    `{"error":{"kind","code","message"}}`.
  - **Without `--json`, when stderr is not a TTY**: the human message is followed by that same
    line, last.
  - **At a terminal**: unchanged.

  This one mechanism passes clispec's "Structured errors" and cli-agent-lint's SD-1.
  `recovery-bytes` is measured on the PR before and after, and the delta is recorded here.
- **R7 — An explicit human format, and the piped default declared.**
  - `--format text` selects the human rendering whatever the TTY or agent detection says.
  - The top-level `output: { default: 'text', piped: 'text', formats: [...] }` declares that a
    pipe gets text unless `--json` or `--format` asks otherwise.
  - The default does not change. It is declared, which is what clispec's rule allows.
- **R8 — The reference demo is a complete declaration.** Each demo command declares
  `examples`, `output.cardinality` and `fields`, as the docs ask of every author. The docs page
  for `--schema` shows the clispec keys and links the specification.
- **R9 — Re-measured, and the ratchet raised.** After R1–R8, the `external-floor` reading on
  `main` is promoted, and `BURGEE_FLOOR.clispec` rises to it. A decision
  (`npm run ledger -- new decision clispec-remainder-built`) records that D-151's "argued with the checker" remainder is superseded by this build. Any
  point still lost is named on the benchmarks page with the probe's own output.

## Design

**Order.** R2 first, because the error `kind` is core API every other requirement reads. Then
R1, R3 and R4, which are `schema.ts` only. Then R5 (the `Command` type), R6 (`failure.ts`), R7
(the format switch), R8 (the demo and docs), and R9.

**The schema emitter stays one function.** `schema.ts` builds the document from the manifest, and
the clispec keys are more properties on the same objects. A test fixture holds clispec-cli's
`schemas/v0.3.json`, vendored as `packages/burgee/src/__fixtures__/clispec-v0.3.json` with its
CC BY 4.0 attribution beside it. The demo's document is validated against it by the hand-written
JSON Schema walker the family already uses for its own published schemas (`schema-is-validated`,
D-123), so no validator dependency is added.

**`kind` is derived, and declared when it is not obvious.** `ExitCode` names become kinds
lower-cased (`USAGE` → `usage`), with `SIGINT` → `interrupted`. A `defineError` class without an
explicit `kind` takes its class name in kebab case (`QuotaExceededError` → `quota-exceeded`),
with the trailing `-error` dropped.

**The stderr line is the last write of the run.** closeout's registry already orders the final
writes, and the line goes after any handler output. That is the order clispec's rule reads, "the
envelope is the last line of stderr".

**What R5 costs in types.** `run` already returns `unknown`. With `output.schema` present the
handler's return is checked against the inferred type, and with it absent nothing changes. That
keeps every existing program compiling.

## Verification

| R | Check | Proven red by |
| :-- | :-- | :-- |
| R1, R3, R4, R5 | `packages/burgee/src/clispec-document.test.ts` (new): the demo's `--schema` validates against the vendored v0.3 schema; each required key present; a mutation deleting `errors` or `version` fails it | running it on `3a05dc8aad`: no `clispec`, no `errors` |
| R1 | `scripts/program-schema.test.ts` and `packages/burgee/src/schema.test.ts`: the published `program-schema.json` admits the new keys and `schemaVersion` is still 1 | today's `program-schema.json` (`additionalProperties: false`) rejects `errors` |
| R2 | `packages/burgee/src/define-error.test.ts`: a defined error's `kind` and its row in `errors[]`; `exit-code.test.ts`: every `ExitCode` key has a kind | today's envelope has no `kind` |
| R3 | `schema.test.ts`: `global_args` equals root help's `Global options:` rows, name for name | adding a row to `GLOBAL` without the schema reading it fails |
| R5 | `packages/burgee/src/schema-fields.test.ts` and a type test in `facade-types.test.ts`: `output_fields` from `fields`; a `run` returning the wrong shape for `output.schema` fails `tsc` | today's schema emits neither |
| R6 | `packages/burgee/src/json-failure.test.ts`: under `--json`, `JSON.parse(stderr)` has `error.kind`; under a piped stderr without `--json`, the last line parses; at a TTY (the `burgee/testing` PTY runtime), no JSON on stderr | today: stderr is prose in all three |
| R7 | `packages/burgee/src/machine-json.test.ts`: `--format text` under a pipe and with `CLAUDECODE=1` prints the human rendering, exit 0 | today: `unknown option --format` |
| R8 | `clispec-document.test.ts` over the demo; the docs page through `apps/docs/tests/` | the demo today has no examples |
| R9 | `benchmarks/floor.test.ts` gated by `BURGEE_FLOOR`; `scripts/decisions-lock.test.ts` reads the new decision | the gate refuses a reading below the raised minimum |

Plus, on every PR: `npm run compat -- commander yargs` unchanged, and `runtime-ratchets-lock`
for the core bytes.

## Rejected alternatives

- **A separate `--schema=clispec` projection.** Two documents for one program is a drift
  surface, and the scorer and every agent read the default document. The keys are additive, so
  one document carries both vocabularies.
- **Rename burgee's keys to clispec's (`exitCodes` → `errors`).** It breaks every consumer of
  schemaVersion 1. Adding beside is free. Renaming waits for a major, if one is ever wanted.
- **Leave the remainder as D-151 left it.** That was the right call while the checker was a
  black box. Its source shows the remainder is product work, not checker quirks.
- **Put the error only on stderr under `--json`, as both checkers would accept.** The stdout
  envelope is the published payload contract (`json-failure.test.ts` holds it), and agents
  already parse it. Writing both costs one line on failure and breaks nobody.
- **Make `output` required.** It would turn every published program's next `burgee dev` red. A
  warning that `checkCommand` prints teaches the same thing without breaking anyone.

## Out of scope

- clispec's `outcomes`, `idempotency_key_arg`, `pagination` objects and `stability`. None is a
  scored check at 0.3.0, and each is its own design question.
- Changing the human error text.
- The commander and yargs front-ends' default help and errors. Their bytes are graded.

## Status

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | Not built | `schema.ts`, `program-schema.json` | `clispec-document.test.ts`, `schema.test.ts` |
| R2 | **Built** 2026-10-12 | `error-kinds.ts` (`kindOf`: the `ExitCode` name lower-cased, `SIGINT` → `interrupted`; `definedErrors`: each defined class's kind settled), `failure.ts` (`error.kind` in both envelopes), `define-error.ts` (`kind`, `retryable`, `description`; the registry), `clispec.ts` (`errors[]`, read by `schema-surface.ts` only), `program-schema.json` (`errors`, `$defs.error`). **Two departures from the design.** Kinds are **snake_case** (`quota_exceeded`), not kebab: clispec v0.3's `$defs.error.kind` is `^[a-z][a-z0-9_]*$` and refuses `quota-exceeded`. And kinds are **settled where they are read**, not at `defineError`: `define-error.js` is on `.`'s static walk with 401 B of budget, and settling there cost 1,723 B (35,280 → 37,003). Settled lazily it is 35,610 B. So a class's kind is not a static on the class; a declared kind is still refused at definition when it is not snake_case or another class declared it, and a kind the contract or an earlier class holds (a class named `TimeoutError`) is told apart by its code, `timeout_12`, so no class that defined before stops defining. Façades: no `errors` (see the note under the table) | `exit-code.test.ts` › `every exit code has a kind (R2)`; `define-error.test.ts` › `derives its kind…`, `never takes a kind someone already holds…`, `lists itself under --schema errors…`. Red: `Cannot find module './error-kinds.js'`; `expected undefined to be 'quota'`; `Cannot read properties of undefined (reading 'find')` (no `errors`) |
| R3 | Not built | `schema.ts`, `help.ts` | `schema.test.ts` |
| R4 | Not built | `schema.ts` | `clispec-document.test.ts` |
| R5 | Not built | `execute.ts` (`Command`), `schema.ts`, `definition.ts` | `schema-fields.test.ts`, `facade-types.test.ts` |
| R6 | **Built** 2026-10-12 | `failure.ts` (`reportFailure`: the envelope or the prose where O1 puts it, then the one line unless `stderr.isTTY === true`), `execute.ts` (calls it; `stderr` takes `isTTY`), `testing-helpers.ts` (`runBurgee` forwards `tty.stderr`). Written before `leave`, not through closeout's registry: an `onExit` handler that writes to stderr after it would follow the line, and none in the family does. A bare program run with no command still prints root help and exits 2 with no line: that is help, not a failure report. **recovery-bytes on the demo, 109 → 164 B** (median, `npm run bench -- --axis reliability`, before and after on this machine); `schema-bytes` 2,392 → 3,235 B, all of it R2's `errors`, which steps the `agent-schema-bytes` control band up | `json-failure.test.ts` › `$name: the envelope is on stdout, alone, and stderr is the one structured line (R6)`, `$name: plain mode keeps its prose…`, `$name: at a terminal, stderr is the prose alone — no JSON (R6)`, `an unknown command is structured on stderr too…`. Red: `Unexpected token 'u', "usage: app sync" is not valid JSON`; `Unexpected end of JSON input` (stderr empty under `--json`) |
| R7 | Not built | `execute.ts`, `schema.ts` | `machine-json.test.ts` |
| R8 | Not built | `examples/demo-cli-burgee`, `apps/docs` | `clispec-document.test.ts` |
| R9 | Not built | `benchmarks/axes/floor.ts`, `.sdlc/decisions/` | `benchmarks/floor.test.ts` |

**The façades do not carry the clispec keys.** The design had `burgee/commander` and
`burgee/yargs` gain them "through the same `schema.ts`". Both build `--schema` synchronously from
`schemaOf`, which `schema.ts` holds statically, and the budgets that walk it had **21 B
(`./yargs`, 220,879 / 220,900) and 34 B (`./schema`, 15,666 / 15,700)** to spare on `main` at
`733e5e0` (`weight.test.ts`). `errors` alone is more than that. So the keys live in `clispec.ts`,
which only the native `--schema` surface loads, behind its `await import()`, and the façades'
documents are unchanged. No ratchet was raised. `machine-json.test.ts` holds the native document
equal to the façades' once the native-only keys are set aside.
