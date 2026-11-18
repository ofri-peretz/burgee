# Design — closing the types target

Intent: [`intent.md`](./intent.md). **Status:** approved, 2026-11-18.

---

## Requirements

- **R1** `src/plugin-types.ts` exports `plugin` with `generators.types`, wrapping
  `gen-ts-index.ts`; inputs `openapi`, `jsonschema`. The wrapper is the only new import edge.
- **R2** Each of the 24 failing upstream cases gets a row in this design's case table (below, filled
  as they are worked): cause, fix, test.
- **R3** `--fix-upstream-bugs` is one option object threaded through the context; each bug fix reads
  one field of it.
- **R4** JSON Schema input: each top-level definition becomes an exported type; `--compat
  json-schema-to-typescript` reproduces its naming (`title` first, then key) and its banner comment.

## Design

Work the 24 cases by cluster (the compat-oracle report groups them). R1 first so `gen` can run it the
day the spine lands. The case table lives here and is the progress record.

First reading on this branch, 2026-11-18, `grade()` on the vendored host: control **61 / 61**
gated (informational 51 / 203, see below); `apicontract/openapi-typescript` **37 / 61**, the
number #1560 recorded. The host row stays `planned` and has no baseline fragment:
`hosts-record.test.ts` holds a fragment to `active` rows only, and an active row must be in
`burgee migrate`'s `DROP_INS`, which would publish an unpublished package as a migration path.

| Case cluster | Count | Cause | Fix | Test | Status |
| :-- | --: | :-- | :-- | :-- | :-- |
| `inject option` (`index.test.ts`) | 1 | `inject` was refused as a compiler option; it is a string | Written above the types as given (`gen-ts-index.ts`), not re-printed | `gen-ts-index.test.ts` "writes `inject`…", `openapi-typescript.test.ts` | **closed** |
| `Unresolved $ref error messages` (`invalid.test.ts`) | 1 | No reference check: upstream's bundler prints every dangling local `$ref` and throws on the last | `unresolvedRefs` + a `GenerateError` naming the last (and the others); the drop-in prints each with `console.error` | `gen-ts-index.test.ts` "refuses a document whose local references lead nowhere…", `openapi-typescript.test.ts` | **closed** |
| `$refs > parameters get hoisted`, `path object`, `path object & paths enum`, `YAML anchors`, `JSONSchema > $defs are respected`, `Generates path parameters` (`index.test.ts`) | 6 | The document `$ref`s another file; upstream bundles it with Redocly | A bundler for `file:` sources over `seniority/yaml` | — | open |
| `options > transform` ×4, `postTransform`, `transformProperty` ×2 (`node-api.test.ts`) | 7 | The option takes or returns TypeScript compiler nodes | None without the compiler (Rejected alternatives); a data-shaped equivalent is the plan | — | open: ceiling |
| `cli.test.ts` (`enum root types filtering`, `--help`, `--version`, four `Redocly config`) and `yaml.test.ts` (2) | 9 | They spawn `bin/cli.js`; a target run writes a module there, not a program | A `--compat openapi-typescript` CLI, plus a `run.ts` change so a target's entry is executable: both outside this lane's paths | — | open: other lane |

After this branch: **39 / 61**.

The control's informational line is 51 / 203 here, against 203 / 203 on
`feat/compat-openapi-typescript`: that branch also taught `run.ts` that openapi-typescript
publishes its internals as `dist/<x>.mjs` (`publishedInternalExtension`). `run.ts` is not this
lane's, so the field was left out of the row; the gated line does not read internals.

## Verification

`npm test -w apicontract -- src/gen-ts src/openapi-typescript src/plugin-types` and the
compat-oracle run for the vendored host; G5 through `benchmarks/apicontract/consumers.ts --typescript 5.9,6.0,7.0`.

## Rejected alternatives

- **Emitting through the TypeScript compiler's printer** (upstream's way). It is what breaks on TS 7.
- **Fixing upstream bugs by default.** Byte identity is the migration path; fixes are opt-in.

## Out of scope

Runtime enums and path helpers beyond what openapi-typescript's options already produce.
