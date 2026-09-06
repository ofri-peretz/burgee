# Intent — `commander-schema`: declare once, derive everything

> Stage 1 artifact. Child of [`agent-native-cli-layer`](../agent-native-cli-layer/intent.md),
> requirements S1–S4, plus the TypeScript cluster (research §5) and the validation
> cluster (§4). Proposes floor additions S5–S8.

**Status:** draft · **Opened:** 2026-09-06 · **Owner:** @ofri-peretz

---

## What is wanted

Options and positionals declared **once** as a schema, from which the parser wiring,
the TypeScript type of the parsed values, the help data and the `--schema` manifest
are all derived:

```ts
const cmd = defineCommand({
  name: 'deploy',
  args: { env: { type: 'choice', choices: ['dev', 'prod'], required: true } },
  options: {
    region: { type: 'string', env: 'REGION', default: 'eu-1' },
    force: { type: 'flag' },                       // never takes a value (yargs #1532)
    replicas: { type: 'number', min: 1, max: 20 }, // NaN is a validation error (yargs #1079)
    config: { type: 'file', mustExist: true },     // yargs #1188
    tags: { type: 'string', multiple: true, separator: ',' }, // yargs #846
  },
  relations: [
    { exactlyOneOf: ['config', 'inline'] },        // yargs #1093, #439
    { implies: ['force', (v) => v.env === 'prod'] },// yargs #1322
    { conflicts: ['dryRun', 'force'] },
  ],
  run: ({ args, options }) => { /* options.replicas: number */ },
});
```

Any Standard Schema implementation (zod, valibot, arktype) is accepted where a
`type` is written, so a team with a schema library keeps it.

## Why now

- **The TypeScript cluster is entirely a symptom of declaring things twice.** yargs
  #1649 (a required positional cannot be typed), #1679 (camelCase in code, kebab-case in
  help), #1392 (variadic typing), #2437 (`type` typed too optimistically), #2137 (nested
  objects), #2401 (default functions typed as functions), citty #244 (wrong alias
  types). One source of truth ends the class.
- **Relationships are the second-largest validation ask and nobody has them.** yargs
  #1093 "one and only one of" (since 2018), #439 "required group" (since 2016), #1322
  `implies` as a function, #898 `implies` misses `--no-flag`, #1186 validation order
  (`exclusive` before `choices`).
- **Silent coercion is a bug class.** yargs #1079 (`NaN`), #1198 (invalid `type` name
  accepted), #887 (duplicate aliases shadow silently), #933 (`-output` parses as `-o
  utput`), #1323/#1864/#2199/#2064 (reserved `version`). S3 and V5 make each a
  definition-time error.

## Affected users and systems

- New `packages/commander-schema`; `@interlace/cli-core` gains the schema types (host-
  neutral) so `yargs-schema`-equivalent work later is an adapter (the npm name
  `yargs-schema` is taken; the yargs side ships inside `yargs-agent`).
- `commander-agent`'s manifest reads the schema when present, giving richer `--schema`
  output (types, min/max, relations) than the walk of plain commander objects.

## Constraints

1. Parsing stays commander's: the schema is compiled to `Option`/`Argument` objects
   with `argParser`/`choices`/`env`; validation of relations runs in `preAction`.
2. Types are derived by TypeScript inference from the literal schema; no code
   generation step.
3. Standard Schema is the only external contract; no dependency on any one library.

## Success criteria

- Every issue named above has a conformance case that fails on plain commander and
  passes with the schema.
- `options.replicas` infers as `number`, `args.env` as `'dev' | 'prod'`, a variadic
  positional as `string[]` — pinned with `expectTypeOf` tests.
- `--schema` output for the demo gains `min`, `max`, `relations` and validates against
  `schemaVersion: 2` (additive).

## Open questions

- Proposed floor additions for review: **S5** every option has exactly one declared
  type and one canonical camelCase key; **S6** relations validated before choices and
  before the handler; **S7** `flag` type never consumes a value; **S8** `multiple`
  options accept repetition and a declared separator.
- Nested/dotted options (`--bq.project`, yargs #2137, #1858, #2472): support as an
  `object` type (yargs #890) or reject? Leaning object type with a flat CLI syntax.
