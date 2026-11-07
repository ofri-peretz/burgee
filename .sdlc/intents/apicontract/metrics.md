# Metrics — what "better than the incumbents" means, per package

Intent: [`intent.md`](./intent.md) · Design: [`spec.md`](./spec.md) · **Status:** draft, 2026-11-06.

`apicontract` is better than an incumbent only on a metric measured by the same script, on the same
subject and machine, where it beats the incumbent by the stated margin. Every number is published,
including the ones we lose. `TBM` means to be measured in Phase 0.

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
| G5 | TypeScript 7 | Leading | Generated output passes `tsrs --noEmit` and TS 6 `tsc --noEmit` | ✗ (#2841) | ✓ both |
| G6 | Type-check time of output | Leading | `tsrs --noEmit` time on the generated Stripe types | TBM | ≤ baseline |
| G7 | Upstream bugs fixed | Lagging | Of #941, #1464, #2012, #2366, #2577, #1922: fixed behind `--fix-upstream-bugs` | 0 / 6 | 6 / 6 |
| G8 | Migrations | Lagging | Public repos that replaced openapi-typescript with `apicontract` | 0 | Tracked weekly |

## 3. `apicontract` · `diff` — vs oasdiff, mcpdiff / mcp-lint, schema-registry checks

| ID | Metric | Kind | Definition | Baseline | Target |
| :-- | :-- | :-- | :-- | :-- | :-- |
| D1 | Verdict agreement | Leading | Share of oasdiff corpus cases with the same breaking/non-breaking verdict; each disagreement explained | — (reference) | ≥ 98% |
| D2 | Missed breaks | Leading | Planted breaking changes not reported, on the planted corpus | TBM (each incumbent) | 0 |
| D3 | False breaks | Leading | Non-breaking changes reported as breaking | TBM | ≤ incumbent |
| D4 | Diff time | Leading | Wall-clock for Stripe spec, two adjacent versions | TBM (oasdiff) | ≤ oasdiff |
| D5 | Families covered | Leading | Of OpenAPI, JSON Schema, MCP, AsyncAPI, OpenRPC, burgee CLI | 1 (oasdiff), 1 (mcpdiff) | 6 |
| D6 | Real breaks found | Lagging | Unannounced breaking changes found in the 10 MCP server histories | — | ≥ 1 (SC4) |
| D7 | Lattice laws | Leading | `compat.qnt` invariants passing in `models.yml` | — | 100% |

## 4. `apicontract-check` — vs openapi-usage, API Ghost Hunter

| ID | Metric | Kind | Definition | Baseline | Target |
| :-- | :-- | :-- | :-- | :-- | :-- |
| C1 | Precision | Leading | Reported unknown calls that are real, on the labelled fixture corpus | TBM | ≥ 95% |
| C2 | Recall | Leading | Real unknown calls that are reported | TBM | ≥ 90% |
| C3 | Scan time | Leading | Wall-clock per 10,000 source files | TBM | ≥ 5x faster |
| C4 | Binary size | Leading | Per-platform `.node` bytes | — | ≤ oxmutate's binary |
| C5 | Families checked | Lagging | HTTP, WebSocket, MCP call sites | 1 (HTTP) | 3 |

## 5. `apicontract-guard` — vs ajv, Zod runtime validation

| ID | Metric | Kind | Definition | Baseline | Target |
| :-- | :-- | :-- | :-- | :-- | :-- |
| R1 | Bundle bytes | Leading | Min+gzip bytes of the guard for the bench MCP server's tools | TBM (ajv + compiled schemas) | ≤ 50% |
| R2 | Validations per second | Leading | Median, bench payloads | TBM (ajv) | ≥ ajv |
| R3 | Cold start | Leading | Time to first verdict | TBM | ≤ ajv |

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
