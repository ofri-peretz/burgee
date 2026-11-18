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
