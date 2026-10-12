# Intent — `--schema` is a clispec v0.3 document, and every failure says what kind it is

> Stage 1 artifact. Opened from the next-wave ranking
> ([`next-wave-2026-10.md`](../../research/next-wave-2026-10.md)), after reading the scorer's
> source at the version the `external-floor` suite pins.

**Status:** approved · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz

---

## What is wanted

Every program built on burgee emits a `--schema` that is a valid clispec v0.3 document, with no
work from its author beyond declaring what the program already does. The document carries:

- the error kinds the program can fail with and the exit code each maps to;
- the global arguments every command accepts;
- per data command, how many records it returns and which fields they carry.

Every failure names its kind, so a consumer branches on a word rather than parsing prose. Under
`--json` it does so on stderr as well as in the stdout envelope. The reference demo scores
**24 / 24** on clispec 0.3.0, against 14 today.

The point is not the checker. clispec is the one published specification for agent-facing CLIs
(`agent-requirements.md` §6), its `effects` vocabulary is already burgee's word for word, and
the keys it asks for are what an agent needs before its first call: what can go wrong, what
comes back, and how much. burgee is the framework best placed to give every program that by
construction.

## Why now

**Measured.** The `external-floor` reading on `main`
(`benchmarks/results/external-floor/2026-09-27-4b8ef1c-local.json`) scores the demo **14 / 24 (Fair)** on
clispec 0.3.0; commander and yargs score 2. Ten checks fail. Each was read in clispec-cli's own
source at `v0.3.0` (`src/checks/schema.rs`, `output.rs`, `bounded.rs`, and
`schemas/v0.3.json`, through `gh api repos/rvben/clispec-cli/contents/<path>?ref=v0.3.0`):

| failing check | what the scorer reads | what burgee emits today |
| :-- | :-- | :-- |
| Validates against clispec v0.3 | the document against `schemas/v0.3.json`: top level requires `clispec: "0.3"`, `name`, `version`, `commands`, `errors`; a command requires `name`, `description`, `effects` | no `clispec`, no `errors`; `version` only when the program declares one |
| Error kinds documented | a top-level `errors[]` | `exitCodes` as a name → number map |
| Exit codes on error kinds | `exit_code` on every `errors[]` entry | no kinds to carry one |
| Global args declared | a top-level `global_args` array (an empty array is a valid "none") | absent; `--json`, `--schema`, `--help`, `--explain`, `--fields`, `--format` are undeclared |
| Output fields declared | per command `output_fields`, `stdout_schema`, or a non-`data` `output_kind` | absent; a command's `fields` (N14) is not emitted under that name |
| Cardinality declarations | `cardinality: single \| bounded \| unbounded` on every `data` command | absent |
| Valid JSON output | `<command> --json` with the command's own `example` arguments exits 0 with JSON on stdout | the demo declares no examples, so the probe runs `greet` without its required argument and exits 2 |
| Explicit format wins | `--format text` (or `--output text`) under a pipe exits 0 with non-JSON stdout | `--format text` is `unknown option` |
| Structured or declared piped output | JSON on stdout when piped, or a top-level `output.piped` naming a human format | human text when piped, undeclared |
| Structured errors | on `tool __nonexistent_command__`, stderr's last non-empty line is `{"error":{"kind":…}}` | stderr is prose and the envelope has a numeric `code`, no `kind` |

**What reading the source changed.** D-151 recorded these ten as disagreements "argued with the
checker, not bent into the parser". On reading the scorer, none needs the parser bent:

- **Six are additive keys.** v0.3's schema sets no `additionalProperties: false` at the top or on
  a command, so burgee's own keys stay where they are.
- **Two come from the demo declaring examples**, which the docs already tell authors to do.
- **Two are a `kind` on the error and an explicit human format.** Both are things agents ask
  for: cli-agent-lint's SD-1 probes the same stderr (see
  [`agent-lint-conformance`](../agent-lint-conformance/intent.md)).

D-151's stance was right on the evidence it had. The evidence is now the checker's source, and it
points the other way.

**The output gap is wider than one checker.** `agent-requirements.md` §4 quotes Cobra #2362's
inventory of what a CLI framework cannot give a tool definition. "Output schema: absent" is the
row nobody fills, and the MCP `Tool.outputSchema` that [`mcp-current`](../mcp-current/intent.md)
emits needs the same declaration.

## Affected users and systems

- **Every program on burgee**: its `--schema` gains keys, and every failure gains a `kind`.
- `packages/burgee`: `schema.ts`, the published `program-schema.json`,
  `failure.ts`, `define-error.ts`, `execute.ts`, `definition.ts`, `help.ts`.
- **Consumers of `--schema`**: additive only. `schemaVersion` stays 1, because no field changes
  meaning, and no key is renamed or removed.
- `examples/demo-cli-burgee`, `benchmarks/axes/floor.ts` (`BURGEE_FLOOR.clispec`), the
  benchmarks page, and `.sdlc/decisions/` (one decision recording that D-151's remainder is
  superseded).
- The graded façades do not change: `burgee/commander` and `burgee/yargs` keep their incumbents'
  bytes. The opt-in agent surface they carry gains the keys through the same `schema.ts`.

## Constraints

- **Additive.** No existing `--schema` key, envelope field or exit code changes meaning. The
  numeric `error.code` stays beside the new `kind`.
- **One vocabulary, not two documents.** The clispec keys are emitted in the one `--schema`
  document, not by a second `--schema=clispec` projection, because the checker and every agent
  read the default.
- **Nothing is typed twice.** `errors[]` comes from `ExitCode` and the program's `defineError`
  registry. `global_args` comes from the same table root help renders. `output_fields` comes
  from the `fields` a command already declares.
- **The core byte budget holds.** `--schema` already loads lazily through `surfaces.ts`, and the
  new keys ride there. The error `kind` is the only addition to the core path.
- **Agent recovery bytes are measured before and after** (`recovery-bytes`, `agent-headroom`
  R7), because R6 writes the error twice under `--json`.

## Success criteria

1. `npx vitest run --config vitest.root.config.ts packages/burgee/src/clispec-document.test.ts`
   validates the demo's `--schema` against the vendored `schemas/v0.3.json`. It is proven red on
   `3a05dc8aad`, where the document lacks `clispec` and `errors`.
2. Every failure envelope carries `error.kind`. Under `--json` stderr is one JSON line; without
   it, when stderr is not a TTY, the last line is that JSON. Held by
   `packages/burgee/src/json-failure.test.ts`.
3. The next `external-floor` reading on `main` scores burgee **24 / 24**, and
   `BURGEE_FLOOR.clispec` rises to it. If a point is still lost, the benchmarks page names it
   with the probe's output and a decision records why.
4. `npm run compat -- commander yargs` is unchanged in the same run.

## Open questions

- Whether `--schema` adopts clispec's snake_case keys beside its own camelCase. **Answered
  2026-10-12 in `spec.md`**: yes, for the keys clispec defines, because a second vocabulary
  for the same facts is what a consumer would have to map. burgee's existing keys stay.
- Whether output declaration is required. **Answered 2026-10-12 in `spec.md`**: a warning from
  `checkCommand` for a runnable command with no `output`, never an error, so no published
  program breaks.
