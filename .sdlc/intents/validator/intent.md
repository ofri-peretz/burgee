# Intent — `validator`: a Zod alternative that beats Zod in every aspect

> Stage 1 artifact of the AI-native SDLC. Opened 2026-11-11 from two owner directions given on the
> `apicontract` review: we do not use Zod and build our own validator
> ([`D-20261111-apicontract-own-validator`](../../decisions/D-20261111-apicontract-own-validator.md)),
> and it has a code-first authoring API, which makes it a product of its own
> ([`D-20261111-layer-bar`](../../decisions/D-20261111-layer-bar.md)). `validator` is a working
> name; the name is chosen after the capabilities are implemented.

**Status:** draft · **Opened:** `2026-11-11` · **Owner:** `@ofri-peretz`

**Proposed name, not accepted and not reserved:** `loadline` — the line painted on a ship's hull
that marks how far it may be loaded; what is over the line does not sail. Read 2026-11-11
(`curl https://registry.npmjs.org/<name>`): `loadline`, `load-line` and `loadlines` are free on npm;
the `@loadline` scope belongs to someone else. Also free: `scantling`, `leadline`, `truemark`,
`gunwale`. Taken: `muster`, `touchstone`, `assay`, `plumbline`, `proofmark`, `caliper`.

---

## What is wanted

One validator with two front doors over one engine:

- **Code-first.** Schemas written in TypeScript, the static type inferred from the schema, as Zod,
  Valibot and ArkType users write them today.
- **Contract-first.** The same validators compiled ahead of time from a contract (OpenAPI, JSON
  Schema, AsyncAPI, MCP) by `apicontract` ([`spec.md` § R-SC](../apicontract/spec.md)).

It implements Standard Schema and Standard JSON Schema, so it works wherever Zod works with no shim.
It beats Zod on every metric in the table, measured with the same script, subject and machine, and
until it does the losing numbers are published and the claim is not made. The other validators are
read beside it and published too; they are context, not the bar.

## Why now

Read 2026-11-11: `curl https://api.npmjs.org/downloads/point/last-week/<pkg>`,
`curl https://registry.npmjs.org/<pkg>/latest` (`dist.unpackedSize`, `dependencies`) and
`gh api repos/<owner>/<repo>` (`open_issues_count`, which includes pull requests).

| Package | Weekly downloads | Latest | Unpacked | Runtime deps | Open issues + PRs |
| :-- | --: | :-- | --: | --: | --: |
| ajv | 519,401,290 | 8.20.0 | 1.03 MB | 4 | 408 |
| zod | 453,993,805 | 4.6.7 | 6.15 MB | 0 | 122 |
| @sinclair/typebox | 161,310,650 | 0.34.52 | 1.91 MB | 0 | 1 (shared repo) |
| valibot | 32,312,540 | 1.5.0 | 1.87 MB | 0 | 241 |
| typebox | 17,063,753 | 1.4.6 | 1.57 MB | 0 | 1 |
| arktype | 3,033,181 | 2.2.9 | 0.35 MB | 3 | 240 |
| typia | 511,313 | 15.3.1 | 6.68 MB | 3 | 4 |
| @standard-schema/spec | 191,775,701 | 1.1.0 | 0.02 MB | 0 | — |

- The audience is the largest in this repo's reach, and `@standard-schema/spec` at 192M a week means
  frameworks now accept any conforming validator, so switching no longer needs framework support.
- The owner's direction is the reason this intent exists. **It is not yet a measured gap.** These
  incumbents are maintained and good, unlike openapi-typescript. PRINCIPLES rule 13 asks for a gap
  the incumbent actually has, checked before it is claimed; that check is the first open question.

## Affected users and systems

- **Primary:** TypeScript teams validating API input, and coding agents that write schemas and read
  validation errors.
- **`apicontract`:** its runtime-validation package (`apicontract-schema`, R-SC) becomes the
  contract-first front door of this product, not a second validator.
- **Repo:** one new package and its docs page; a `compat-oracle` lane per incumbent; bench scripts
  under `benchmarks/validator/`; control bands for every leading metric; an oxmutate floor.

## Constraints

- No dependency outside this repo (PRINCIPLES rule 2). Zod, Valibot, ArkType, typia, TypeBox and ajv
  are never dependencies or peers; their test suites are vendored for grading only.
- Built on our own: no other validator inside it, and not a fork of one.
- Drop-in paths are graded by the incumbent's own suite through `compat-oracle`, with a control run
  and a pass rate that only rises (rule 3).
- No TypeScript compiler plugin or transformer needed at build time (typia's requirement).
- Node `^20.19.0 || >=22.13.0`; ESM and CJS; works in browsers and edge runtimes (no `eval` or
  `new Function` on the default path, which CSP forbids).
- No public name, publish or claim before the capabilities are implemented and the metrics read.

## Success criteria

Every row's target is against **Zod 4**. The other names in the Against column are read with the
same script and published beside it, win or lose. Leading metrics run on every PR as
control bands; lagging metrics run weekly and at each phase end. `TBM`: to be measured before design.

| ID | Metric | Kind | Definition | Against | Baseline | Target |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| V1 | Suite parity | Leading | Share of the incumbent's own tests passing through its drop-in façade | Zod 4 | — (reference) | 100% of the claimed subset |
| V2 | JSON Schema conformance | Leading | JSON-Schema-Test-Suite 2020-12 pass rate | Zod 4, where it reads JSON Schema (to confirm when measured); ajv, TypeBox | TBM | > Zod |
| V3 | Throughput | Leading | Validations per second, valid and invalid payloads, median of 5 | all six | TBM | > Zod |
| V4 | Schema construction | Leading | Time to build 500 schemas at start-up | Zod 4, Valibot, ArkType, TypeBox | TBM | < Zod |
| V5 | Bundle bytes | Leading | Min+gzip of a fixed 10-schema fixture, tree-shaken | all six | TBM | < Zod |
| V6 | Install size and deps | Leading | Unpacked bytes and runtime dependencies | all six | Zod: 6.15 MB, 0 deps (smallest read: arktype, 0.35 MB) | < Zod; 0 deps |
| V7 | Type-check cost | Leading | `tsc` time and instantiations on a 500-schema fixture | Zod 4, Valibot, ArkType, TypeBox | TBM | < Zod |
| V8 | Standard Schema | Leading | Standard Schema and Standard JSON Schema conformance cases passing | all that implement it | TBM | 100% |
| V9 | Error quality | Leading | Share of errors carrying a JSON Pointer, the keyword and a `fix:` line | all six | TBM | 100%, > Zod |
| V10 | Lossless export | Leading | Refinements and transforms dropped silently on export to JSON Schema | Zod 4 (`z.toJSONSchema`) | TBM | 0 |
| V11 | Agent authoring | Lagging | Eval: schemas an agent writes correctly in one turn, and errors it repairs in one turn | Zod 4, Valibot, ArkType | TBM | > Zod |
| V12 | Migrations | Lagging | Public repos that replaced an incumbent | — | 0 | Tracked weekly |
| V13 | Upstream tracking | Lagging | Days from an incumbent's release to its suite re-graded | — | — | ≤ 7 |
| V14 | Fix time | Lagging | Median days from an accepted issue to its release | Zod's median | TBM | < Zod |

Done when every leading row holds on `main` against Zod, and the first lagging readings are
published.

## Open questions

- **Which gap do the incumbents actually leave?** Owed before design: the "support X too", declined
  and hand-rolling counts of PRINCIPLES rule 7 across the six trackers
  (`scripts/fetch-competitor-issues.sh` needs a validator set).
- **How much of Zod's API is the drop-in subset** V1 claims?
- **Where does it land relative to `apicontract`'s phases?** `apicontract` generates it in its Phase 2, so its contract-first side has to exist by then.
- **Does it need a Quint model?** Likely not (stateless), unless async refinements or streaming
  validation come into scope.
