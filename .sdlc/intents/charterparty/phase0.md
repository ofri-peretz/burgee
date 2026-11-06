# Phase 0 — readings and status

Roadmap: [`roadmap.md`](./roadmap.md). Each row is a dated reading with the command that produced it.

## Checklist

| Item | Status | Evidence |
| :-- | :-- | :-- |
| npm names free | ✅ 2026-11-06 | `npm view charterparty`, `charterparty-check`, `charterparty-guard`: all E404. Not yet reserved |
| Upstream offer on openapi-typescript#2841 | ⏸ pending owner approval | Public post; wording not yet drafted |
| Competitor state | ✅ 2026-11-06 (first pass) | Table below |
| hey-api plugin for openapi-typescript | ✅ 2026-11-06, none yet | No `openapi-typescript` mention in the last 30 hey-api/openapi-ts GitHub releases |
| Baseline eval, arm without the tool | ⬜ | `evals/` task set not written |
| `TBM` bench readings | 🔨 G2–G5 incumbent side read | [Below](#gen-baseline-openapi-typescript-2026-11-06). Open: G6, D1–D4 (oasdiff), R1–R3 (ajv), A1 |
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

`node benchmarks/charterparty/incumbents.ts <workdir>`. Subject: GitHub REST
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
  `charterparty` needs no TypeScript at runtime. **G4** compares against 32 packages.
- **G2** is ≈ 2.1–2.8 s per 1,261 operations, under load. Target: ≥ 2x faster on the same machine,
  same load.
