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
