# Intent — the TypeScript types target closes Phase 1: a plugin, 61 of 61 upstream cases, three TypeScript majors

> Opened from the 2026-11-18 program ([`../apicontract/program.md`](../apicontract/program.md)).
> On `main` (#1560) the compiler-free types generator matches 196 of 203 extracted openapi-typescript
> expectations byte for byte, and the `apicontract/openapi-typescript` drop-in passes 37 of 61 of
> upstream's own gated cases. It is not yet registered as a plugin, so `gen` cannot reach it.

**Status:** approved · **Opened:** `2026-11-18` · **Owner:** `@ofri-peretz` · **Lane:** `ac-types` ·
**Accepted by:** [`D-20261118-contracts-program-go-ahead`](../../decisions/D-20261118-contracts-program-go-ahead.md)

---

## What is wanted

- The generator registered as the built-in plugin `types` on the public host API, with a `sample`
  (X1 = 0: it imports nothing the public API does not export).
- `apicontract/openapi-typescript` passes 61 of 61 of upstream's gated cases (G1 = 100%), and the
  seven unmatched expectations are matched or explained in the design.
- Output type-checks under TypeScript 5.9, 6.0 and 7.0 (G5), read on the corpus lane's bench specs.
- A second input: types from JSON Schema documents, with a `--compat json-schema-to-typescript`
  mode graded on that package's own test fixtures.
- G7: the six openapi-typescript bugs the metrics name (#941, #1464, #2012, #2366, #2577, #1922)
  fixed behind `--fix-upstream-bugs`, each with a test.
- Three options the incumbents' users ask for and orval closed as not planned (read 2026-11-18): case
  transforms for generated names (Hey API #558, 55 👍), output split into one file per tag (orval
  #2535), and dates and branded types (orval #1222, #1432 not planned): `format: date-time` typed as
  `Date` or `Temporal.Instant` when the `validator` target's codecs decode it, so the type is true at
  run time, not just declared. All behind options; the default output stays byte-identical.

## Why now

openapi-typescript (16.7M weekly) entered maintenance mode on 2026-09-19 and crashes on TypeScript 7.
This is the roadmap's open window (Phase 1); the kill rule says lead with Phase 2 if a fork or
hey-api closes it first, so time matters more here than anywhere else in the program.

## Affected users and systems

`packages/apicontract/src/gen-ts-*.ts`, `src/openapi-typescript*.ts`, `src/plugin-types*.ts`, `src/__fixtures__/types/**`, and the
compat-oracle host it vendors: `packages/compat-oracle/vendor/openapi-typescript/**`,
`baseline/openapi-typescript.json` and its own lines in `src/hosts.ts`. Read 2026-11-18: that host is
not on `main` (#1560's description names it, the tree does not), so vendoring it is this lane's first step.

## Constraints

- No TypeScript compiler at run time; string emission stays.
- Default output stays byte-identical to openapi-typescript 7.13.0; every fix is behind a flag.

## Success criteria

- G1 = 61 / 61, read by compat-oracle on the vendored host.
- G5 ✓ under 5.9, 6.0 and 7.0 on the bench specs (corpus lane's `consumers.ts`).
- G2 (≥ 2× faster per 1,000 operations) and G3 (≤ 25% install size) read and published.
- json-schema-to-typescript's fixtures graded; the number published, whatever it is.

## Defaults taken

- The plugin is named `types`, with `--compat openapi-typescript` as its default mode until the
  naming pass.
