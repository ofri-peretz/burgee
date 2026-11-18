# Design — closing the types target

Intent: [`intent.md`](./intent.md). **Status:** approved, 2026-11-18.

---

## Requirements

- **R1** `src/plugins/types/index.ts` exports `plugin` with `generators.types`, wrapping
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

| Case cluster | Count | Cause | Status |
| :-- | --: | :-- | :-- |
| (filled from the first compat-oracle reading on this branch) | 24 | | open |

## Verification

`npm test -w apicontract -- src/gen-ts src/openapi-typescript src/plugins/types` and the
compat-oracle run for the vendored host; G5 through `benchmarks/apicontract/consumers.ts --typescript 5.9,6.0,7.0`.

## Rejected alternatives

- **Emitting through the TypeScript compiler's printer** (upstream's way). It is what breaks on TS 7.
- **Fixing upstream bugs by default.** Byte identity is the migration path; fixes are opt-in.

## Out of scope

Runtime enums and path helpers beyond what openapi-typescript's options already produce.
