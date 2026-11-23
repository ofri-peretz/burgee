# Intent — a public scoreboard: every generator graded on thousands of real contracts, beside its incumbents

> Opened from the 2026-11-18 program ([`../apicontract/program.md`](../apicontract/program.md)).
> PRINCIPLES rule 4: measured or it is a slogan. Every metric in
> [`../apicontract/metrics.md`](../apicontract/metrics.md) that says "on the bench specs" or "on the
> corpus" needs a corpus and a harness that does not exist yet, and every generator lane's exit
> reads from it.

**Status:** approved · **Opened:** `2026-11-18` · **Owner:** `@ofri-peretz` · **Lane:** `ac-corpus` ·
**Accepted by:** [`D-20261118-contracts-program-go-ahead`](../../decisions/D-20261118-contracts-program-go-ahead.md)

---

## What is wanted

`benchmarks/apicontract/` gains three things:

1. **The corpus.** A pinned list (URL + sha256) of real contracts: the APIs.guru OpenAPI directory
   (every document it lists), the Stripe, GitHub, Twilio and Kubernetes specs as the named bench,
   the AsyncAPI examples, the MCP `tools/list` snapshots of the ten SC10 servers, the
   JSON-Schema-Test-Suite and SchemaStore's schemas. Downloaded into a cache outside the repo; the
   list is the only thing committed.
2. **The grader.** `corpus.ts` runs each adapter and generator over the corpus and records, per
   document: read ok, generate ok, output type-checks (TS 5.9, 6.0, 7.0), round trip equal, time.
   The same for each incumbent where one exists (openapi-typescript, @hey-api/openapi-ts, orval,
   kubb, json-schema-to-typescript), installed into a temporary folder at a pinned version.
3. **The consumer harness.** `consumers.ts` installs a framework (NestJS, Hono, Fastify, Express,
   MSW, TanStack Query, the MCP SDK) at a pinned version into a temporary folder, drops a
   generator's output in, and type-checks and boots it. No framework ever enters the lockfile.

Results land in `benchmarks/results/apicontract/<date>-<sha>/` and render as a table on the docs site
through the integrator, so "we generate valid types for 99.x% of public OpenAPI documents, they do
for N%" is a number anyone can re-run.

## Why now

No incumbent publishes a pass rate on real specs; their issue trackers are full of "crashes on spec
X". A reproducible scoreboard is both the regression net for nine lanes and the strongest claim the
project can make in public. Every lane's success criteria point here.

## Affected users and systems

`benchmarks/apicontract/**`. Nightly CI (integrator wires the workflow).

## Constraints

- Nothing downloaded is committed; the pin list is. A changed sha is a failed run, not a silent update.
- Incumbents run at pinned versions in temporary folders; a version bump is a reviewed PR.
- Runs within the nightly budget: a `--sample N` mode (seeded) for PRs, the full corpus nightly.

## Success criteria

- The pin list holds ≥ 2,000 OpenAPI documents, ≥ 30 AsyncAPI, ≥ 10 MCP snapshots, ≥ 500 JSON Schemas.
- `npx tsx benchmarks/apicontract/corpus.ts --sample 100` runs in under ten minutes locally and
  writes a results folder with one row per document and tool.
- The first full reading is published for the `types` target against openapi-typescript and
  @hey-api/openapi-ts, losing rows included.
- `consumers.ts --framework nest` type-checks and boots one generated NestJS module.

## Defaults taken

- Kubb and orval are read for the client/mock targets only, when those lanes land.
- The APIs.guru snapshot is pinned to one commit of `APIs-guru/openapi-directory`.

## Evidence sweep 2026-11-22

Read on `main` at `daee10f` (2026-11-22) against the merged Wave 6 PRs (#1617–#1653) and the committed readings under `benchmarks/apicontract/results/`; `vitest run` in `packages/apicontract` (2,545 tests) and `packages/validator` (1,153) is green there. 2 of 4 criteria met. MCP snapshots (0 of ≥ 10) and the NestJS boot are open; PLAN 6.13 (nightly, public page) is not started.

| # | criterion | held by | state |
| --: | :-- | :-- | :-- |
| 1 | Pins: ≥ 2,000 OpenAPI, ≥ 30 AsyncAPI, ≥ 10 MCP, ≥ 500 JSON Schema | `corpus/pins.json`: 4,265 OpenAPI, 52 AsyncAPI, **0 MCP**, 1,101 JSON Schema | **open**: MCP |
| 2 | `corpus.ts --sample 100` under ten minutes, one row per document and tool | first reading `--sample 100 --seed 1` (#1636), results in `benchmarks/apicontract/results/`; wall time not recorded there | met (time unrecorded) |
| 3 | First full reading for `types` vs openapi-typescript and hey-api, losing rows included | `results/2026-11-18-types-losses-full/summary.md`: 95.2% / 94.2% / 48.5% usable; 13 documents lost to hey-api, 2 to openapi-typescript, each listed | met |
| 4 | `consumers.ts --framework nest` type-checks and boots one generated module | harness booted a hand-written module (not committed); the generator now exists (#1635), not re-read | **open** |

Status stays `approved`: `apicontract` is `private` and unpublished, and [`D-20261119-apicontract-stays-private`](../../decisions/D-20261119-apicontract-stays-private.md) reserves `shipped` for published work; a lane that meets every criterion is recorded as "criteria met, unpublished".
