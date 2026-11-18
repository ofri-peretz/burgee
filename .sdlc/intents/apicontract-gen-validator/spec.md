# Design — `gen validator` and `gen json-schema`

Intent: [`intent.md`](./intent.md). **Status:** approved, 2026-11-18.

---

## Requirements

- **R1** `src/plugin-validator.ts` exports a plugin with `generators.validator`; inputs:
  every adapter name. Output: `validators.ts` (generated) with one exported validator per payload,
  named `<operationId><PayloadName>` in PascalCase, collisions suffixed deterministically.
- **R2** Each payload schema is resolved against the document with `core/resolve.ts`, translated with
  `fromJsonSchema` from `validator/json-schema`, and emitted with `validator/emit`. A keyword the validator cannot
  express is a finding and falls back to the run-time door, never dropped.
- **R3** `src/plugin-json-schema.ts` exports `generators['json-schema']`; options `draft`
  (`2020-12` | `07`), `refs` (`keep` | `inline`), `dialect`.
- **R4** `src/plugin-json-schema-dialect-<provider>.ts` is data: `{ source, read, keywords: {
  [kw]: 'keep' | 'drop' | { rewrite } }, rootMustBeObject, additionalPropertiesFalseRequired,
  allRequired }`. The transform is one function over that table.
- **R5** `draft: '07'` rewrites `$defs`→`definitions`, `prefixItems`→`items` array, `const` kept,
  `dependentRequired`→`dependencies`, each with a finding.
- **R6** Generation is deterministic and sorted by operation id.
- **R7** With `dialect` set, each payload yields `<name>.<dialect>.json` (narrowed) and, when anything
  was dropped, a `recheck.ts` export `<name>Recheck` (a `validator` for the full schema) whose doc
  comment lists the dropped constraints. Dialect limits that are per request, not per schema
  (Anthropic's 24 optional / 16 union parameters), are checked across the generated set and reported.

## Design

Two file prefixes, `plugin-validator*.ts` and `plugin-json-schema*.ts`, each with its tests; fixtures in `src/__fixtures__/validate/`. The dialect tables are the
only provider knowledge, so updating one when a provider changes its docs is a one-file PR. Order:
`json-schema` without dialects (J1, J2), then `validator` (R1, R2), then dialects.

## Verification

`npm test -w apicontract -- src/plugin-validator src/plugin-json-schema`; the keyword
enumeration test (intent J3) is the check that would catch a silent drop. J2 agreement test runs ajv
from the root `node_modules` (dev only).

## Rejected alternatives

- **Emitting Zod for providers that document Zod** (OpenAI's SDK helpers). R-SC0.
- **Calling `zod-to-json-schema`-style converters.** They are the seam the vision removes.
- **One `--provider` flag on the validator target.** Providers consume JSON Schema, not code.

## Out of scope

Runtime schema registries, schema publishing, and generating Standard Schema adapters (the validator
package implements Standard Schema itself).

## As built, 2026-11-18

Files: `plugin-json-schema-build.ts` (payload → whole document, R2, R3, R5),
`plugin-json-schema-dialect.ts` (the one narrowing function, R4) and one table per provider
(`-openai`, `-anthropic`, `-gemini`, `-mcp`, `-mcp-elicitation`, each citing its page, read
2026-11-18), `plugin-json-schema.ts`, `plugin-validator.ts`, `plugin-validator-code.ts` (emit or
run-time door), `plugin-validator-names.ts` (R1, R6). Fixtures in `src/__fixtures__/validate/`.

| Reading | Value | How |
| :-- | :-- | :-- |
| J1 | 3 of 3 fixture documents, every payload, in 2020-12 and draft-07, refs kept and inlined, and every dialect's output: compile in ajv 8.20.0 strict | `plugin-json-schema.test.ts`; formats registered from `validator/formats`, as a team registers `ajv-formats` |
| J2 | 100% agreement on 2020-12 (kept and inlined); on draft-07 the only differences are where the output reports `draft-07 has no minContains/maxContains` | `plugin-validator.test.ts`; every payload sees a pass and a fail |
| J3 | 0 silent losses: 49 keywords + 21 others × 3 sources × 2 drafts, and 50 × 5 dialects | the two keyword-enumeration tests |
| R2 | generated 15.6–17.7 M valid/s and 15.2–15.8 M invalid/s, ajv 10.0–11.6 M and 7.9–8.3 M | bench order schema, same process, load average 30, so the ratio (about 1.5× valid, 1.9× invalid) and not the absolutes |

Where the design was wrong or silent:

- The emitter returned `(value) => boolean`, not a type guard, with untyped parameters, so the
  module started with `// @ts-nocheck`. Closed 2026-11-18 (gap A-20261118-validator-emit-untyped):
  each validator is now `export const <Name>: (value: unknown) => value is <Name>`, with
  `export type <Name>` (and `<Name>_<n>` for a schema that names itself) written beside it from
  `typeOf`, and `emit(schema, { typescript: true, type: name })` writes the body. No `@ts-nocheck`;
  `plugin-validator-types.test.ts` type-checks the corpus, the sample and both door shapes under
  `strict` with TypeScript 5.9, 6.0 and 7.0, and checks that a validator narrows. The `json-schema`
  target's `recheck.ts` still writes untyped validators under `@ts-nocheck` (`typed` is opt-in in
  `validatorCode`): typing it is a one-line change in `plugin-json-schema.ts`, outside this lane.
- OpenAI's every-key-required rule makes an optional key arrive as `null`, which the full schema
  refuses. The re-check's doc comment and a finding say so; stripping those `null`s before the
  re-check is not generated yet.
- A dialect whose root must be an object cannot take a payload whose root is a `$ref`, so the table
  carries `refs` (inline for OpenAI, Anthropic and elicitation) beside the R4 fields, and `recursion`,
  `formats`, `flat` and `limits`. A payload whose root is still not an object is not written, with a
  finding. A payload that says nothing is sent (`false`) is not given to a model.
- R5's draft-07 cannot carry `minContains`, `maxContains` or `unevaluated*`: they are findings, and
  J2 is read on 2020-12.
- The corpus lane's bench-spec payloads (J1 on the real corpus) are a follow-up: this lane reads J1
  on its own fixtures.
