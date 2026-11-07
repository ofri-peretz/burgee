# Phase 0 — readings and status

Roadmap: [`roadmap.md`](./roadmap.md). Each row is a dated reading with the command that produced it.

## Checklist

| Item | Status | Evidence |
| :-- | :-- | :-- |
| npm names free | ✅ 2026-11-06 | `npm view apicontract`, `apicontract-check`, `apicontract-guard`: all E404. Not yet reserved |
| Upstream offer on openapi-typescript#2841 | ✗ moot | The project entered maintenance mode on 2026-09-19 and its author is not handing it over ([#2874](https://github.com/openapi-ts/openapi-typescript/issues/2874)); `gen` becomes the migration path instead |
| Competitor review | ✓ 2026-11-06 | [`landscape.md` § Competitor review](./landscape.md#competitor-review--where-the-value-is-significant) |
| Competitor state | ✅ 2026-11-06 (first pass) | Table below |
| hey-api plugin for openapi-typescript | ✅ 2026-11-06, none yet | No `openapi-typescript` mention in the last 30 hey-api/openapi-ts GitHub releases |
| Baseline eval, arm without the tool | 🔨 cases written, not run | `apicontract-baseline-allocate` and `-manifest` on a synthetic spec ([below](#baseline-eval-cases-2026-11-06)); a reading needs a weekly `evals.yml` run with a credential |
| `TBM` bench readings | 🔨 G2–G5 and A1 read | [`gen`](#gen-baseline-openapi-typescript-2026-11-06), [A1](#a1-baseline-raw-operation-bytes-2026-11-06). Open: G6, D1–D4 (oasdiff 1.35.0 fetched, checksum OK, 38.0 MB binary; runs wait for a quiet machine), R1–R3 (ajv) |
| `compat.qnt` draft | ✅ 2026-11-06 | `safety` holds; `fullChains` violated as expected and gated in `models.yml` |

## Competitor state, 2026-11-06

`npm view <pkg> version time.modified` and
`curl https://api.npmjs.org/downloads/point/last-week/<pkg>`.

| Package | Latest | Last publish | Weekly downloads |
| :-- | :-- | :-- | --: |
| openapi-typescript | 7.13.0 | 2026-06-15 | 15,430,085 |
| @hey-api/openapi-ts | 0.99.0 | 2026-09-30 | 7,014,670 |
| json-schema-to-typescript | 16.0.0 | 2026-08-28 | 6,169,053 |
| quicktype | 26.0.0 | 2026-07-20 | 251,742 |
| @asyncapi/modelina | 5.10.1 | 2026-09-01 | 191,973 |

Read: openapi-typescript is the largest audience in the space (15.4M a week) and has not published
for almost five months, while its TS 7 crash (#2841) is open. json-schema-to-typescript is a second
large audience (6.2M) and still publishing, so the `/jsonschema` drop-in competes with a maintained
tool and has to win on metrics, not on a vacuum.

## `gen` baseline: openapi-typescript, 2026-11-06

`npx tsx benchmarks/apicontract/incumbents.ts <workdir>`. Subject: GitHub REST
(`github/rest-api-description`, 1,261 operations). Node 24.21.0, Apple Silicon. **The machine was
loaded** (load average 111, two other repos' pre-push suites running), so the times are an upper
bound; re-read on a quiet machine before any claim.

| Reading | TS 5.x | TS 6.0.3 | TS 7.0.2 |
| :-- | --: | --: | --: |
| Plain `npm i` resolves the `typescript` peer (`^5.x`) | ✓ | ✗ ERESOLVE | ✗ ERESOLVE |
| Generation, median of 5 | 2,779 ms | 2,053 ms | **crashes** in `dist/lib/ts.mjs:11` (#2841) |
| Install, `node_modules` total | 39.4 MB | 40.1 MB | 45.7 MB |
| Install without `typescript` itself | ≈ 15.4 MB | ≈ 15.4 MB | — |
| Packages in openapi-typescript's tree | 32 | 32 | 32 |

What this sets:

- **G5** is a fact, not a forecast: the incumbent cannot be installed cleanly beside TypeScript's
  `latest` tag, and with `--legacy-peer-deps` it crashes on TS 7.
- **G3** compares against ≈ 15.4 MB plus the TypeScript it requires (≈ 24 MB for TS 5/6), since
  `apicontract` needs no TypeScript at runtime. **G4** compares against 32 packages.
- **G2** is ≈ 2.1–2.8 s per 1,261 operations, under load. Target: ≥ 2x faster on the same machine,
  same load.

## A1 baseline: raw operation bytes, 2026-11-06

`node benchmarks/apicontract/explain-baseline.ts github.json`: each GitHub REST operation with its
path parameters and every local `$ref` inlined, which is what an agent has to read to use the
operation without `explain`.

| Operations | p50 | p90 | p99 | Max | Whole spec |
| --: | --: | --: | --: | --: | --: |
| 1,261 | 4,006 B | 35,762 B | 154,163 B | 460,337 B | 14,151,310 B |

The median is small; the tail is the problem. One operation in ten costs an agent more than 35 KB,
and the largest costs 460 KB. So A1 is judged at p90 as well as p50: `explain` meets ≤ 1 KB at p50
and ≤ 30% of 35,762 B at p90, which means it has to summarise large schemas (depth limit, `--expand
<pointer>`), not only inline them.

## Baseline eval cases, 2026-11-06

Two cases under `evals/cases/`, on `evals/fixtures/apicontract/harbour.openapi.json`, an API invented
for this so no model knows it from training (agents know GitHub's API by heart, which would measure
memory, not contract reading). Each check was run both ways before commit:

| Check | Correct module | Plausible wrong module | Result |
| :-- | :-- | :-- | :-- |
| `check-allocate.mjs` | exit 0 | `POST` instead of `PUT` | exit 1, `method POST, contract says PUT` |
| `check-allocate.mjs` | — | `draught` in metres instead of `draughtDm` | exit 1, body mismatch |
| `check-manifest.mjs` | exit 0 | invented `dangerousGoods` field | exit 1, `returned []` |
| `check-manifest.mjs` | — | packing group `III` read as most dangerous | exit 1, `returned []` |

The reading (A5 invented calls, A6 tokens, A7 success) comes from the next `evals.yml` run with a
credential, which records turns and tokens per case in `evals/history/`. The arm with the tool reuses
the same cases with `apicontract explain` allowed.
