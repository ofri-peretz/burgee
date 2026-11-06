# Phase 0 — readings and status

Roadmap: [`roadmap.md`](./roadmap.md). Each row is a dated reading with the command that produced it.

## Checklist

| Item | Status | Evidence |
| :-- | :-- | :-- |
| npm names free | ✅ 2026-11-06 | `npm view charterparty`, `charterparty-check`, `charterparty-guard`: all E404. Not yet reserved |
| Upstream offer on openapi-typescript#2841 | ⏸ pending owner approval | Public post; wording not yet drafted |
| Competitor state | ✅ 2026-11-06 (first pass) | Table below |
| hey-api plugin for openapi-typescript | ⬜ | Read hey-api releases for an `openapi-typescript` plugin |
| Baseline eval, arm without the tool | ⬜ | `evals/` task set not written |
| `TBM` bench readings | ⬜ | `benchmarks/charterparty/` not created |
| `compat.qnt` draft | ⬜ | — |

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
