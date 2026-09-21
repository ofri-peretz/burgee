# Intent — `commander-schema`: declare once, derive everything

> Stage 1 artifact. Child of [`burgee`](../burgee/intent.md),
> requirements S1–S4, plus the TypeScript cluster (research §5) and the validation
> cluster (§4). Proposes floor additions S5–S8.

**Status:** review · **Opened:** 2026-09-06 · **Owner:** @ofri-peretz

**State assigned 2026-09-09** from repo evidence, at the owner’s direction. **Evidence:** `schema.ts`, `schema-dsl.test.ts`, `validate.ts` (S1–S8).

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

## Verified against `main` — 2026-09-09

Checked criterion by criterion on `61bd11b9`. **Zero met in full; one partly.** The status stays
`review`. This is the weakest of the surfaces intents against its own criteria, and it says so
here rather than on the wave table, where wave 3 is marked complete.

- **Every issue named has a conformance case that fails on plain commander and passes with the
  schema** — not met, on both halves. `schema-dsl.test.ts` cites eleven issues (#439, #846, #887,
  #933, #1079, #1093, #1186, #1318, #1322, #1532, #1679) and all fifteen tests pass; this intent
  names roughly twenty-three. Uncovered: yargs #1188, #1649, #1392, #2437, #2137, #2401, #898,
  #1198, #1323, #1864, #2199, #2064, citty #244. And **no test anywhere asserts "fails on plain
  commander"** — the differential half of the criterion has no implementation.
- **`options.replicas` infers `number`, `args.env` infers `'dev' | 'prod'`, a variadic positional
  `string[]`, pinned with `expectTypeOf`** — partly met. `schema-dsl.test.ts:54-60` pins those
  types statically (and `tsc --noEmit` covers the test files, so the assertions are enforced) —
  but `env` there is an **option**, not a positional. Positionals still arrive as untyped
  `ctx.positionals: string[]`; there is no per-argument type inference.
- **`--schema` output gains `min`, `max`, `relations`, and validates against `schemaVersion: 2`**
  — **not met.** The demo emits `"schemaVersion": 1`; `schemaVersion: 2` exists nowhere in the
  repo (`schema.ts` hard-codes `1` in four places). On a synthetic program, `schemaOf()` does
  emit `minimum` and `maximum`, but **drops `relations` entirely** — `schema.ts` never reads
  `node.relations`. The relations engine itself is real and tested in `validate.ts`; it simply
  does not reach the schema.

**Stale:** this intent's own code block does not typecheck against the shipped API.
`OptionSpec.type` is `'string' | 'boolean' | 'number'` — there is no `'choice'`, `'flag'`, or
`'file'` with `mustExist`, and positionals are `arguments: ArgumentSpec[]` with no `type`.

## Open questions

Decided — none open. The items below were settled when this intent was written and are
kept as the record they always were (confirmed 2026-09-20, D-072).

None open. Decided at finalisation (2026-09-06):

- Decided: **Floor additions S5–S8 are adopted** into the umbrella (see its design).
- Decided: **Nested and dotted options are an `object` type** declared once, with the flat CLI
  syntax `--bq.project x` and env `PREFIX_BQ_PROJECT`; the layer reassembles the object
  and `--schema` shows the nested shape. No new grammar.

## Incumbents

`commander, yargs` — the trackers whose issues are this surface's demand signal, and the input
`scripts/mine-issues.ts` (PLAN 4.1) needs in order to write the `issues.md` beside this file.

It is declared here because the miner's own `LAYERS` table, in
`packages/compat-oracle/src/demand.ts`, knows the nine *packages* and not the surfaces of any
one of them: `burgee`'s entry names `commander` and `yargs` for the whole package, and the six
surface intents are not in the table at all. Until that table reads this line,
`npx tsx scripts/mine-issues.ts commander-schema` answers `no layer matched`.

Chosen from evidence rather than from the slug, which is the reason to write it down at all.
The rule: **the front-end this surface adapts, plus every other tracker this intent's own body
cites three or more times.** Here that is `commander`, and `yargs`, which it cites nine times. Trackers cited once or twice
(citty) are comparisons this intent draws, not incumbents it replaces; mining them would file
issues under a surface no criterion here answers.

<!-- incumbents: commander, yargs -->
