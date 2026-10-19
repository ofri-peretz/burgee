# Design — `--schema` is a clispec v0.3 document

Intent: [`intent.md`](./intent.md). **Status:** review: built, R1–R9 verified (2026-10-12).

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
| R1 | **Built** 2026-10-12 | `clispec.ts` (`CLISPEC`), `schema-surface.ts` (`clispec` after `schemaVersion`; `version` filled), `surfaces.ts` (`declaredVersion`: the declared one, else the owning `package.json`'s, the read `--version` already made), `program-schema.json` (`clispec`, `global_args`, `output`, the command keys; `schemaVersion` still `const: 1`). With no version anywhere none is invented, and the summary over budget does not claim `clispec`: it lists commands without what clispec requires of one | `scripts/clispec-document.test.ts` (the demo, spawned as the scorer runs it, against the vendored `__fixtures__/clispec-v0.3.json`, with a walker that refuses a keyword it does not enforce, because `flagstaff/src/conforms.ts` reads no `allOf`/`if`/`then`/`anyOf`/`not` and would pass a document with no cardinality); `schema.test.ts` › `R1 — …`; `scripts/program-schema.test.ts` › `describes every clispec key…`. Red: `$.clispec: required`; `expected [ 'schemaVersion', 'name' ] to deeply equal [ 'schemaVersion', 'clispec' ]`; `expected undefined to be '9.8.7'` |
| R2 | **Built** 2026-10-12 | `error-kinds.ts` (`kindOf`: the `ExitCode` name lower-cased, `SIGINT` → `interrupted`; `definedErrors`: each defined class's kind settled), `failure.ts` (`error.kind` in both envelopes), `define-error.ts` (`kind`, `retryable`, `description`; the registry), `clispec.ts` (`errors[]`, read by `schema-surface.ts` only), `program-schema.json` (`errors`, `$defs.error`). **Two departures from the design.** Kinds are **snake_case** (`quota_exceeded`), not kebab: clispec v0.3's `$defs.error.kind` is `^[a-z][a-z0-9_]*$` and refuses `quota-exceeded`. And kinds are **settled where they are read**, not at `defineError`: `define-error.js` is on `.`'s static walk with 401 B of budget, and settling there cost 1,723 B (35,280 → 37,003). Settled lazily it is 35,610 B. So a class's kind is not a static on the class; a declared kind is still refused at definition when it is not snake_case or another class declared it, and a kind the contract or an earlier class holds (a class named `TimeoutError`) is told apart by its code, `timeout_12`, so no class that defined before stops defining. Façades: no `errors` (see the note under the table) | `exit-code.test.ts` › `every exit code has a kind (R2)`; `define-error.test.ts` › `derives its kind…`, `never takes a kind someone already holds…`, `lists itself under --schema errors…`. Red: `Cannot find module './error-kinds.js'`; `expected undefined to be 'quota'`; `Cannot read properties of undefined (reading 'find')` (no `errors`) |
| R3 | **Built** 2026-10-12 | `clispec.ts` (`globalArgsOf`: `ROOT_GLOBAL` from `help.ts` and `globalRows` from `globals.ts`, on the same condition `surfaces.ts` renders them; `--color` carries `enum` and `default` from `globals.ts`'s `WHEN`). Seven rows on the demo: `json`, `help`, `schema`, `color`, `no-color`, `quiet` (`short: -q`), `timeout`. **Not** `--format`, `--fields`, `--explain` or `--max-bytes`, which the design listed: root help does not print them (`--explain` is a command's, and `--max-bytes` does not exist), and the rule is that the two cannot disagree | `schema.test.ts` › `R3 — global_args are root help's Global options: rows, name for name`, `R3 — a program with no root node…`. Red: `Cannot read properties of undefined (reading 'map')` |
| R4 | **Built** 2026-10-12 | `clispec.ts` (`exampleOf`). **An object, not a string**: clispec's `$defs.command.example` is `{ args: string[], stdin? }`, and its probe runs `args` as the whole argument vector, so the program's name is dropped and quotes are honoured | `schema.test.ts` › `R4 — each command carries its first example…`; `scripts/clispec-document.test.ts` › `runs its declared example with --json…`. Red: `expected undefined to deeply equal { args: [ 'say', 'two words', … ] }` |
| R5 | **Built** 2026-10-12 | `manifest.ts` (`CommandOutput`, `OutputOf`), `execute.ts` (`Command<S, O>`; `run` returns `OutputOf<schema>` when a schema is given; `helpFields` is now one loop over the keys, which paid for `output` and then some: `.` 35,610 → 35,105 B, bundled core 24,214 → 23,905 B), `clispec.ts` (`commandKeysOf`), `root-help.ts` (`completion` is `opaque`, `text/plain`), `examples-check.ts` (`missingCardinality`, printed by `burgee dev`, beside `checkCommand` for the reason R6 of agent-lint-conformance gave). **Three departures.** `mediaType` is added to the type, because clispec requires `media_type` of an opaque command. `stdout_schema` is the `--json` envelope with the declared result as `data`, since that is what stdout carries. And `output_fields` is not emitted: each entry needs a `type`, and `fields` names keys without one, so they go in `stdout_schema` as untyped properties | `schema-fields.test.ts` › `a command's declared output, as --schema publishes it (R5)`; `facade-types.test.ts` › `a declared output schema types the handler`; `definition.test.ts` › `…no output.cardinality is warned about, never refused (R5)`. Red: `'output' does not exist in type 'Command<OptionSpecs>'` (TS2353); `missingCardinality is not a function` |
| R6 | **Built** 2026-10-12 | `failure.ts` (`reportFailure`: the envelope or the prose where O1 puts it, then the one line unless `stderr.isTTY === true`), `execute.ts` (calls it; `stderr` takes `isTTY`), `testing-helpers.ts` (`runBurgee` forwards `tty.stderr`). Written before `leave`, not through closeout's registry: an `onExit` handler that writes to stderr after it would follow the line, and none in the family does. A bare program run with no command still prints root help and exits 2 with no line: that is help, not a failure report. **recovery-bytes on the demo, 109 → 164 B** (median, `npm run bench -- --axis reliability`, before and after on this machine); `schema-bytes` 2,392 → 3,235 B, all of it R2's `errors`, which steps the `agent-schema-bytes` control band up | `json-failure.test.ts` › `$name: the envelope is on stdout, alone, and stderr is the one structured line (R6)`, `$name: plain mode keeps its prose…`, `$name: at a terminal, stderr is the prose alone — no JSON (R6)`, `an unknown command is structured on stderr too…`. Red: `Unexpected token 'u', "usage: app sync" is not valid JSON`; `Unexpected end of JSON input` (stderr empty under `--json`) |
| R7 | **Built** 2026-10-12 | `unknown-option.ts` (`textSpelling`; `--format text`, `--format=text`, `--output text`, `--output=text` become an `Again` without those words), `surfaces.ts` (the same typed before the command), `clispec.ts` (`OUTPUT`). Text is what a command prints with no format asked for, so the request runs the line without it: the failure chunk holds all of it, and the core pays nothing. A command's own `--format` keeps the word; a declared `--formats` beside it keeps it a refusal. **`output` is `{ tty, piped, formats }`**, clispec's own word `tty` for the design's `default` | `machine-json.test.ts` › `--format text is the human rendering, asked for (R7)`. Red: `expected 2 to be +0` (`unknown option --format`); `expected undefined to deeply equal { tty: 'text', piped: 'text', … }` |
| R8 | **Built** 2026-10-12 | `examples/demo-cli-burgee/src/index.ts`: each command declares `output: { cardinality: 'single', schema }` (`greet` and `config get` return a string; `fail` never returns, `{ not: {} }`). The demo returns strings, so it declares no `fields`, which name an object's keys. `apps/docs/content/docs/agent-surfaces.mdx` § *It is also a clispec v0.3 document* (every key, where it is read from, a link to the specification and its schema); `concepts/agent-surfaces.mdx` runs `--schema deploy --field example` and `--field cardinality`. **clispec 0.3.0 scores the demo 24 / 24** locally on this branch, from 14 | `scripts/clispec-document.test.ts`; `apps/docs/tests/examples.test.ts` (42 / 42). Red: `greet: expected undefined to deeply equal { args: … }` |
| R9 | **Built** 2026-10-12 | `benchmarks/results/external-floor/2026-10-12.json` (now `2026-10-12-35ded07-local.json`, since agent-lint-conformance R9 published a CI reading; published with `npm run bench -- --axis floor --check --publish` at `35ded07`, on this branch's gate edit only), `benchmarks/axes/floor.ts` (`BURGEE_FLOOR.clispec` 14 → **24**, the scorer's maximum), [`D-20261012-clispec-remainder-built`](../../decisions/D-20261012-clispec-remainder-built.md) (D-151's remainder superseded; D-151's alias decision stands), `apps/docs/content/docs/benchmarks.mdx` (regenerated by `npm run bench:page`). **clispec 0.3.0: 14 → 24 / 24** (Fair → Excellent), no check failed, so the page names no lost point. **cli-agent-lint 0.3.5: 91.5% → 94.9%** (A). SD-1 passes, from R6. FS-4 (`warn`) and SD-5 (`info`) remain. `BURGEE_FLOOR.agentLint` stays 91, because `agent-lint-conformance` owns it. commander and yargs are unchanged (2 / 24; 71.2%, 70.9%) | `benchmarks/floor.test.ts` › `holds clispec at its maximum, 24 of 24…`, `the latest published reading clears both ratchets`, `the decision that supersedes D-151’s remainder…`; `scripts/decisions-lock.test.ts` reads the new file. Red: `expected 14 to be greater than or equal to 24` (the published 2026-10-11 reading against the raised gate); `expected undefined to be defined` (no decision) |

**Built: 9. Not built: 0.** Every row from R1 to R9 is built.

**The façades do not carry the clispec keys.** The design had `burgee/commander` and
`burgee/yargs` gain them "through the same `schema.ts`". Both build `--schema` synchronously from
`schemaOf`, which `schema.ts` holds statically, and the budgets that walk it had **21 B
(`./yargs`, 220,879 / 220,900) and 34 B (`./schema`, 15,666 / 15,700)** to spare on `main` at
`733e5e0` (`weight.test.ts`). `errors` alone is more than that. So the keys live in `clispec.ts`,
which only the native `--schema` surface loads, behind its `await import()`, and the façades'
documents are unchanged. No ratchet was raised. `machine-json.test.ts` holds the native document
equal to the façades' once the native-only keys are set aside.

**What the document costs.** `schema-bytes` on the demo (reliability axis, one run each on this
machine): 2,392 B on `main` at `733e5e0`, 3,235 B with R2's `errors`, **4,752 B** with R1–R8. All
of it is keys the spec asks for; the `agent-schema-bytes` control band will read it as a step up,
and that step is this intent, not drift.

**The tarball ratchet, and how it was passed without raising it (2026-10-11).**
`npm run check:artifacts` holds burgee's packed tarball to `.sdlc/bands/artifact-size-baseline.json`
with 10% allowed. `main` with R2 and R6 (#1015) packed **251,814 B gzipped, +9.9% of the recorded
229,114 B**, and R1, R3–R5, R7 and R8 took it to 256,211 B (+11.8%). The owner chose to ship less
rather than raise the ratchet. #1022 stopped every family package publishing the declaration files
no `exports` entry reaches, pruned at build by the closure TypeScript computes
([D-20261011-tarball-unreachable-declarations](../../decisions/D-20261011-tarball-unreachable-declarations.md)).
burgee went to 225,278 B gzipped and 865,969 B unpacked, and its baseline was lowered to that. This
branch on top of it packs **228,301 B (+1.3%) and 876,067 B (+1.2%)**. This intent's own
`clispec.d.ts` and `error-kinds.d.ts` are among the pruned files, so its declarations cost the
tarball nothing. No ratchet was raised.
