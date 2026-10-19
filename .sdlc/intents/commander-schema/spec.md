# Design — `commander-schema`

Intent: [`intent.md`](./intent.md). **Status:** review.

---

## Restated 2026-10-18

**R5, R6 and R7 are held. R1 and R2 are held for options, and their positional half moves to `typed-positionals` R1–R2. R3 and R4 are held except one piece each — REMAINING: R2 (option `file`/`path`/`object` types), R3 (`--no-x` honoured, yargs #898), R4 (`file` existence check).**

Verified against burgee `main` at `1013b65db5` with `git grep`; no test was run. The § Design
tree below (`packages/cli-core/src/schema/`, `packages/commander-schema/src/`) was never
built. The engine's `manifest.ts` (`OptionSpec`, `ArgumentSpec`), `definition.ts`,
`validate.ts` and `schema.ts` carry it, and `CliError` became the engine's usage error with
`fix`/`hint`. The intent-level criteria (C1–C3) are in
[`intent.md` § Restated 2026-10-18](./intent.md#restated-2026-10-18).

| ID | promised | on main | check | disposition |
| :-- | :-- | :-- | :-- | :-- |
| R1 | `defineCommand(spec)` returns a commander `Command`; handler gets `{ args, options, ctx }` typed from the spec | a native `defineCommand`, not a commander `Command`; `options` typed; positionals arrive untyped as `ctx.positionals` | `packages/burgee/src/schema-dsl.test.ts` › "infers choices as a union, number as number, multiple as an array, and presence from required/default"; › "reaches the handler typed, without a generic" | restated (native); `args` moved → `typed-positionals` R2 |
| R2 | types `flag`, `string`, `number`, `choice`, `file`, `path`, `object`, Standard Schema; `multiple`/`separator`; `required`, `default`, `env`, `hidden`, `alias`, `deprecated` | options: `string`, `boolean` (was `flag`), `number`; `choices` (was `choice`); Standard Schema as `schema`; `multiple`/`separator`; `required`, `default`, `env`, `hidden`, `short` (was `alias`), `deprecated`. Positionals: `type: 'file'` only. Not built: option `file`, `path`, and the `object` type the § Open questions decided | `packages/burgee/src/schema-dsl.test.ts` › "runs the Standard Schema on the parsed value and reports its issues as a usage error"; › "collects repetitions and splits on the separator, from flags and from env"; `packages/burgee/src/schema.test.ts` › "carries choices, defaults and requiredness as data in a JSON Schema per command (N9)"; `packages/burgee/src/help.test.ts` › "hides hidden commands and options, and marks deprecated ones inline (yargs #2248)" | options held; positional types moved → `typed-positionals` R1; option `file`/`path`/`object` remaining |
| R3 | relations `exactlyOneOf`, `atLeastOneOf`, `atMostOneOf`, `implies` (name or predicate), `conflicts`; after parsing, before choices and the handler; honouring `--no-x` (yargs #898) | yes, in `validate.ts`, plus the option-level spelling `dependsOn`/`exclusive`. No test cites #898 or exercises `--no-x` against a relation | `packages/burgee/src/schema-dsl.test.ts` › "atMostOneOf, conflicts, and a value-aware implies (yargs #1093, #439, #1322)"; › "checks relations before choices (yargs #1186): a bad choice with a conflict reports the conflict"; › "exactlyOneOf and atLeastOneOf"; `packages/burgee/src/option-relations.test.ts` › "a default does not satisfy it (oclif/core #1639)" | held, except `--no-x` remaining |
| R4 | `number` rejects NaN/Infinity, enforces `min`/`max`/`integer`; `file` checks existence when asked; unknown `type` throws at definition time | numbers: yes (`minimum`/`maximum`/`integer`). Unknown `type`: yes. `file` existence: not built (`type: 'file'` means "`-` is stdin" only) | `packages/burgee/src/schema-dsl.test.ts` › "parses and enforces integer, minimum and maximum, each with the fix in the hint"; › "never lets NaN or Infinity through from env or the default path"; › "rejects two keys that meet on the command line, and a repeated short alias, at definition time (yargs #887)" (asserts `unknown type "text"`) | held, except `file` existence remaining |
| R5 | `file`/`path` positionals accept `-` as stdin; `--` pass-through preserved | yes for `type: 'file'` (S4, D-113); `path` is not a type | `packages/burgee/src/stdin-dash.test.ts` › "hands the handler the injected stdin, and the positional still reads `-`"; `packages/burgee/src/parsing-edges.test.ts` › "commander #2530, yargs #1527 — `--` ends options and everything after it survives verbatim" | held (`path` is under R2) |
| R6 | duplicate aliases, reserved names, camel/kebab collisions are definition-time errors; camelCase key, kebab-case CLI, both in `--schema` | yes | `packages/burgee/src/schema-dsl.test.ts` › "rejects two keys that meet on the command line, and a repeated short alias, at definition time (yargs #887)"; › "types --dry-run and reads options.dryRun; help, schema and env agree"; `packages/burgee/src/env.test.ts` › "reserves version and explain like the other surfaces (V5)" | held |
| R7 | `flag` takes no value; `multiple` splits on `separator` | yes (`boolean`) | `packages/burgee/src/schema-dsl.test.ts` › "leaves the next word as a positional and rejects --force=value"; › "collects repetitions and splits on the separator, from flags and from env" | held |

The `typed-positionals` move is checked. Its spec R1 widens `ArgumentSpec.type` to
`'string' | 'number' | 'integer' | 'boolean' | 'file'` with `choices`. Its R2 adds
`RunContext.args`, "a variadic one as an array, typed through the program's inference like
`options`", pinned by `expectTypeOf`. Both are unbuilt (`typed-positionals.test.ts` is not on
main).

## Requirements

- **R1 (S1)** `defineCommand(spec)` returns a commander `Command` with `Option`s and
  `Argument`s compiled from `spec.options` / `spec.args`; the handler receives
  `{ args, options, ctx }` typed from the spec.
- **R2 (S1)** Types: `flag`, `string`, `number`, `choice`, `file`, `path`, `object`,
  plus any Standard Schema (`{ '~standard': … }`) as a `type`; `multiple` with an
  optional `separator`; `required`, `default`, `env`, `hidden`, `alias`, `deprecated`.
- **R3 (S2/S6)** `relations`: `exactlyOneOf`, `atLeastOneOf`, `atMostOneOf`, `implies`
  (name or predicate), `conflicts`; evaluated in `preAction` after parsing and before
  `choices`/handler, honouring `--no-x` (yargs #898).
- **R4 (S3)** `number` rejects `NaN`/`Infinity` and enforces `min`/`max`/`integer`;
  `file` checks existence and readability when asked; an unknown `type` string throws
  at definition time with a `CliError` naming the option.
- **R5 (S4)** `file`/`path` positionals accept `-` as stdin; `--` pass-through is
  preserved by leaving commander's `passThroughOptions` semantics untouched.
- **R6 (S5/V5)** Duplicate aliases, reserved names, and camelCase/kebab-case collisions
  are definition-time errors; the canonical key is camelCase, the CLI form kebab-case,
  and both appear in `--schema`.
- **R7 (S7/S8)** `flag` compiles to a boolean `Option` with no value; `multiple` compiles
  to a variadic `Option` with `argParser` splitting on `separator`.

## Design

```
packages/cli-core/src/schema/
  types.ts        OptionSpec, ArgSpec, Relation, CommandSpec, Infer<Spec>
  validate.ts     definition-time checks (R4, R6); relation evaluation (R3)
packages/commander-schema/src/
  compile.ts      spec → new Option(flags).default().env().choices().argParser()…
  define.ts       defineCommand(spec) → Command with preAction validation
```

`Infer<Spec>` maps each `type` to a TS type (`choice` → union of `choices`, `multiple`
→ array, `required: false` without default → `| undefined`). Standard Schema types
infer through the library's own `~standard.types`.

Validation messages are `CliError`s with `fix` (e.g. `fix: { flag: '--replicas 20' }`
for `max` exceeded), so `commander-agent` renders them like every other error.

## Status (2026-09-08)

| Req | State | Where |
| :-- | :-- | :-- |
| R1 (S1) | `defineCommand` infers the handler's `options` from the spec (`const` type parameter, `NoInfer` on the handler): choices → union, `number` → number, `multiple` → array, presence from `required`/`default` | `execute.ts` `InferOptions`, `schema-dsl.test.ts` (expectTypeOf) |
| R2 (S1) | types `string`, `boolean`, `number`; `multiple` + `separator`; `required`, `default`, `env`, `hidden`, `short`, `deprecated`; any Standard Schema as `schema` (interface declared locally, no dependency) | `manifest.ts` |
| R3 (S2/S6) | `relations`: `exactlyOneOf`, `atLeastOneOf`, `atMostOneOf`, `conflicts`, `implies` (name or predicate); validated after resolution, before choices and the handler; a typed `--no-x` counts as set | `validate.ts` `checkRelations` |
| R3b (S2) — PLAN 2.5.2 | the same two constraints spelled **on the option**: `dependsOn` → `implies`, `exclusive` → `conflicts`. Desugared by `relationsOf` and enforced by the one engine; published on the option in `--schema`, on its line in help, and as Fig's `dependsOn` / `exclusiveOn`; an undeclared or self name is a definition-time error | `manifest.ts` `optionRelations`/`relationsOf`, `definition.ts`, `option-relations.test.ts` |
| R4 (S3) | `number` rejects NaN/Infinity, enforces `minimum`/`maximum`/`integer` with the fix in the hint; an unknown `type`, a numeric bound on a non-number, are definition-time errors | `toNumber`, `checkDefinition` |
| R5 (S4) | `--` pass-through preserved (G5, already); `file`/`path` types and `-` as stdin — not yet (2026-10-18: `type: 'file'` and `-` as stdin shipped with S4, `stdin-dash.test.ts`; `path` not built) | — |
| R6 (S5/V5) | canonical camelCase key, kebab-case on the command line, both in `--schema` (`flag`); duplicate short aliases and camel/kebab collisions are definition-time errors | `kebab`/`camel`, `checkDefinition` |
| R7 (S7/S8) | `boolean` never consumes a value (parseArgs); `multiple` collects repetitions and splits on `separator` (`,` by default), from flags, env and config | `splitMultiple` |
| `object` type (dotted options) | not yet | — |
| commander front-end | commander's own `Option` API stays (it is the compatibility contract); `relations` on commander syntax — not yet | — |

### `dependsOn` / `exclusive` are an alias, deliberately (PLAN 2.5.2)

The plan's reading is the one implemented: **`exclusive` is `conflicts` and `dependsOn` is
`implies`**, and neither adds an engine. `relationsOf(node)` concatenates the command's own
`relations` with the ones its options spell on themselves, and that single list is what
`validate.ts` enforces and what `--schema` publishes. There is therefore one evaluation order
(S6: relations, then numbers, then choices, then Standard Schema), one error vocabulary (E3: a
`UsageError` carrying the flag that fixes it, exit 2, the `{ ok: false, error: { code, message,
hint } }` envelope under `--json`), and no way for the two spellings to disagree.

Why a second spelling exists at all, since the first was already there:

- **It is where the reader is looking.** A `relations` entry states the constraint away from
  the option it constrains. Nothing in the declaration of `out` said it needed `force`, and
  nothing in `--out`'s help line did either — help did not render `relations` in any form.
- **It is what both incumbents spell.** commander has `.implies({...})` and `.conflicts()` on
  the `Option`; yargs has `.implies()` / `.conflicts()` keyed by the option's own name. A
  drop-in surface that only offered the command-level form would be asking a migrating CLI to
  move a constraint it had already written.
- **The projection one layer out already has these exact names.** Fig's `Option` declares
  `dependsOn` and `exclusiveOn` — copied into `fig-schema.test.ts`'s allow-list from
  `@withfig/autocomplete-types@1.31.0` with its file hash, well before this step. Ours emits
  both, so the completion surface carries the constraint too.

**Decisions taken here rather than asked:**

- **One-sided.** `exclusive: ['table']` on `csv` is declared once, not on both options; the
  `conflicts` relation it compiles to holds in either argv order.
- **Names, not flags, in the declaration**; flags, not names, in every projection. The author
  writes the canonical camelCase key (`dependsOn: ['dryRun']`), and `--schema`, help and the
  Fig spec all render `--dry-run`, because their reader is composing a command line (S5).
- **Omitted when empty.** An option declaring neither carries neither key, so absent reads as
  "no constraint" rather than "not published" — the rule `relations` already follows.
- **Ordered declared-first.** `relationsOf` yields the command's `relations` before the
  derived ones, so adding an option-level constraint cannot change which error an existing
  command reports first.

## Verification

- Conformance cases per issue number listed in the intent.
- `expectTypeOf` suite for inference.
- Definition-time error suite: each R6 case throws with the option name in `message`.

## Rejected alternatives

- **A code generator producing `.d.ts` from the spec.** Inference is enough and has no
  build step.
- **Adopting zod as the schema language.** Locks consumers to one library; Standard
  Schema gives the same power without the dependency.
- **Reimplementing parsing to support nested objects natively.** Compile them to flat
  dotted options commander already parses; the layer reassembles.

## Out of scope

- Config-file and env precedence (`commander-env`).
- Interactive prompting for missing required values (`caique`).
