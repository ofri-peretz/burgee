# Metrics — what "better than the incumbents" means, per package

Intent: [`intent.md`](./intent.md) · Design: [`spec.md`](./spec.md) · **Status:** draft, 2026-11-06.

`apicontract` is better than an incumbent only on a metric measured by the same script, on the same
subject and machine, where it beats the incumbent by the stated margin. Every number is published,
including the ones we lose. `TBM` means to be measured in Phase 0.

Ids for the plugin API are `X1`–`X5` and for `extract` `B1`–`B6`: `P` and `E` are letters the
family's floor ids already use (`scripts/run-evals.ts`).

**The bar (owner, 2026-11-11, [`D-20261111-layer-bar`](../../decisions/D-20261111-layer-bar.md)):**
every layer has at least one leading and one lagging metric against each competitor it names, and
the target is to beat each of them on each metric. A tie is not a pass. A metric we lose is published
and blocks the phase exit it belongs to.

- **Leading** metrics move first and predict the outcome. They run on every PR, as control bands.
- **Lagging** metrics are the outcome users feel. They run weekly and at each phase end.

Bench subjects (fixed for comparability): GitHub REST, Stripe, and a 50-operation fixture for
OpenAPI; openapi-typescript's own fixtures; oasdiff's test corpus; 10 MCP servers' published
`tools/list` histories; an AsyncAPI WebSocket fixture.

## 1. Agent surface (every command) — vs reading the raw spec

| ID | Metric | Kind | Definition | Baseline | Target |
| :-- | :-- | :-- | :-- | :-- | :-- |
| A1 | Bytes per operation | Leading | `explain --json` bytes for the median bench operation | TBM: the raw spec slice with `$ref`s resolved | ≤ 1 KB, ≤ 30% of baseline |
| A2 | Parse reliability | Leading | Share of `--json` outputs that validate against the envelope schema | — | 100% |
| A3 | Fix-line coverage | Leading | Share of findings and non-zero exits carrying a `fix:` line | 0% (oasdiff, openapi-typescript) | 100% |
| A4 | Exit-code determinism | Leading | Share of scenarios whose exit code matches the documented contract | TBM | 100% |
| A5 | Invented endpoints and fields | Lagging | Per 100 eval tasks, calls to operations or fields not in the spec | TBM (arm without the tool) | ≤ 20% of baseline |
| A6 | Tokens per task | Lagging | Median tokens an agent spends per eval task | TBM | ≤ 60% of baseline |
| A7 | Task success | Lagging | Share of eval tasks that pass their tests | TBM | ≥ baseline + 15 points |

## 2. `apicontract` · `gen` — vs openapi-typescript, json-schema-to-typescript, Modelina

| ID | Metric | Kind | Definition | Baseline | Target |
| :-- | :-- | :-- | :-- | :-- | :-- |
| G1 | Fixture parity | Leading | Share of openapi-typescript fixtures with byte-identical output | — (reference) | 100% |
| G2 | Generation time | Leading | Wall-clock per 1,000 operations, cold, median of 5 | TBM | ≥ 2x faster |
| G3 | Install size | Leading | Unpacked bytes, including all transitive dependencies | TBM (`npm pack` of each) | ≤ 25% |
| G4 | Dependencies outside the family | Leading | Count | TBM (openapi-typescript: Redocly core and more) | 0 |
| G5 | TypeScript versions | Leading | Generated output passes `tsc --noEmit` under each supported TypeScript: 5.9, 6.0 and 7.0 | ✗ on 7 (#2841); peer conflict on 6 | ✓ all three |
| G6 | Type-check time of output | Leading | `tsc --noEmit` time and instantiations on the generated Stripe types, under each supported TypeScript | TBM | < baseline on each |
| G7 | Upstream bugs fixed | Lagging | Of #941, #1464, #2012, #2366, #2577, #1922: fixed behind `--fix-upstream-bugs` | 0 / 6 | 6 / 6 |
| G8 | Migrations | Lagging | Public repos that replaced openapi-typescript with `apicontract` | 0 | Tracked weekly |

## 3. `apicontract` · `diff` — vs oasdiff, mcpdiff / mcp-lint, schema-registry checks

| ID | Metric | Kind | Definition | Baseline | Target |
| :-- | :-- | :-- | :-- | :-- | :-- |
| D1 | Verdict agreement | Leading | Share of oasdiff corpus cases with the same breaking/non-breaking verdict; each disagreement explained | — (reference) | ≥ 98% |
| D2 | Missed breaks | Leading | Planted breaking changes not reported, on the planted corpus | TBM (each incumbent) | 0 |
| D3 | False breaks | Leading | Non-breaking changes reported as breaking | TBM | < each incumbent |
| D4 | Diff time | Leading | Wall-clock for Stripe spec, two adjacent versions | TBM (oasdiff) | < oasdiff |
| D5 | Families covered | Leading | Of OpenAPI, JSON Schema, MCP, AsyncAPI, OpenRPC, burgee CLI | 1 (oasdiff), 1 (mcpdiff) | 6 |
| D6 | Real breaks found | Lagging | Unannounced breaking changes found in the 10 MCP server histories | — | ≥ 1 (SC10) |
| D7 | Lattice laws | Leading | `compat.qnt` invariants passing in `models.yml` | — | 100% |

## 4. `apicontract-check` — vs openapi-usage, API Ghost Hunter

| ID | Metric | Kind | Definition | Baseline | Target |
| :-- | :-- | :-- | :-- | :-- | :-- |
| C1 | Precision | Leading | Reported unknown calls that are real, on the labelled fixture corpus | TBM | ≥ 95% |
| C2 | Recall | Leading | Real unknown calls that are reported | TBM | ≥ 90% |
| C3 | Scan time | Leading | Wall-clock per 10,000 source files | TBM | ≥ 5x faster |
| C4 | Binary size | Leading | Per-platform `.node` bytes | — | < oxmutate's binary |
| C5 | Families checked | Lagging | HTTP, WebSocket, MCP call sites | 1 (HTTP) | 3 |

## 5. `apicontract-schema` (was `-guard`) — vs ajv, Zod 4, Valibot, ArkType, typia

| ID | Metric | Kind | Definition | Baseline | Target |
| :-- | :-- | :-- | :-- | :-- | :-- |
| R1 | Bundle bytes | Leading | Min+gzip bytes of the guard for the bench MCP server's tools | TBM (ajv + compiled schemas) | ≤ 50% |
| R2 | Validations per second | Leading | Median, bench payloads | TBM (ajv) | > ajv |
| R3 | Cold start | Leading | Time to first verdict | TBM | < ajv |

The validator's full table, leading and lagging, against Zod 4, Valibot, ArkType, typia, TypeBox
and ajv, is in [`validator/intent.md`](../validator/intent.md); R1–R3 are its contract-first rows.

## 5a. `apicontract-extract` — vs @nestjs/swagger, zod-to-openapi, @hono/zod-openapi

| ID | Metric | Kind | Definition | Baseline | Target |
| :-- | :-- | :-- | :-- | :-- | :-- |
| B1 | Round trip | Leading | Share of corpus documents where `extract(gen(spec))` equals `spec` after normalisation (R-RT1) | TBM (each incumbent, where it can round-trip) | 100%, > each |
| B2 | Fixture parity | Leading | Share of each incumbent's own fixtures producing an equivalent document | — (reference) | 100% |
| B3 | Silent losses | Leading | Refinements, transforms or decorators dropped without a finding | TBM | 0, < each |
| B4 | Extraction time | Leading | Wall-clock per 500 operations, no app boot | TBM | < each |
| B5 | Frameworks covered | Lagging | Of Zod, TypeBox, NestJS, Hono, tRPC/oRPC | 1 each | 5 |
| B6 | Migrations | Lagging | Public repos that replaced an incumbent | 0 | Tracked weekly |

`lint` (Phase 9, only on an outside request) gets its table before that phase starts.

## 5b. The plugin API — vs hey-api's plugins, openapi-generator's templates, Kubb's plugins

| ID | Metric | Kind | Definition | Baseline | Target |
| :-- | :-- | :-- | :-- | :-- | :-- |
| X1 | Own plugins on the public API | Leading | Imports from our generators that reach outside the public plugin API | — | 0 |
| X2 | Plugin is data | Leading | Share of a plugin's surface that validates against the published JSON Schema without running it | TBM (each incumbent) | 100%, > each |
| X3 | Agent writes a plugin | Leading | Eval, weekly: an agent given the schema and one example writes a plugin passing the conformance suite in one turn | TBM (same task on each incumbent's plugin API) | > each |
| X4 | Third-party plugins | Lagging | Published packages carrying the plugin keyword that pass the conformance suite | 0 | Tracked weekly |
| X5 | Time to a new target | Lagging | Days from an accepted request for a generator to its release | TBM (each incumbent's median) | < each |

## 5c. `gen json-schema` — vs the OpenAPI → JSON Schema converters (named when read in Phase 0)

| ID | Metric | Kind | Definition | Baseline | Target |
| :-- | :-- | :-- | :-- | :-- | :-- |
| J1 | Compiles in ajv | Leading | Share of bench-spec payload schemas that ajv compiles unchanged | TBM | 100%, > each |
| J2 | Same verdicts | Leading | Share of fixture payloads where the output in ajv and `gen validator` agree | — | 100% |
| J3 | Silent losses | Leading | Keywords translated with a loss of meaning and no finding | TBM | 0, < each |
| J4 | Adopters | Lagging | Public repos generating their ajv schemas with it | 0 | Tracked weekly |

## 5d. NestJS generator — vs openapi-generator `typescript-nestjs-server`, hey-api's Nest plugin

| ID | Metric | Kind | Definition | Baseline | Target |
| :-- | :-- | :-- | :-- | :-- | :-- |
| N1 | Regeneration safety | Leading | User-owned lines changed by regenerating after a spec change | TBM (each incumbent) | 0, < each |
| N2 | Output compiles | Leading | Share of bench specs whose generated modules type-check and boot | TBM | 100%, > each |
| N3 | Contract tests | Leading | Share of generated operations with a passing contract test | TBM | 100%, > each |
| N4 | Spec coverage | Leading | Share of each bench spec's operations, parameters and schemas present in the output | TBM | > each |
| N5 | Adopters | Lagging | Public NestJS repos using it | 0 | Tracked weekly |

## 6. Quality, every package — vs each incumbent's published numbers

| ID | Metric | Kind | Definition | Target |
| :-- | :-- | :-- | :-- | :-- |
| Q1 | Mutation score | Leading | oxmutate score, unit tests plus Quint spec oracle | ≥ floor; floor only rises |
| Q2 | Spec-oracle kills | Leading | Mutants killed only by the `compat.qnt` traces | Reported every run |
| Q3 | Quint models green | Leading | All `.qnt` models pass `--invariant=safety` | 100% |
| Q4 | Time to fix an accepted issue | Lagging | Median days, opened to released | ≤ 14 days |
| Q5 | Time to track an upstream release | Lagging | Days from an incumbent's release to its fixtures graded | ≤ 7 days |

## How a reading is taken

Each metric's script lives in `benchmarks/apicontract/<id>.ts`, runs both tools on the same subject,
and writes `bench/history/<date>-<sha>.json`. A run that did not execute records `not-run`, never a
loss. The control bands read that history.
