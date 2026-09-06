# Design — `commander-schema`

Intent: [`intent.md`](./intent.md). **Status:** review.

---

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
- Interactive prompting for missing required values (`cli-prompts`).
