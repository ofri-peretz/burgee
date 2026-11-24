# Intent — typed clients and MSW mocks from the same model as the server

> Opened from the 2026-11-18 program ([`../contractdiff/program.md`](../contractdiff/program.md)).
> Roadmap Phase 4, client half, and the MSW row reopened by
> [`D-20261113-apicontract-mocks-and-mcp-generation`](../../decisions/D-20261113-apicontract-mocks-and-mcp-generation.md).

**Status:** approved · **Opened:** `2026-11-18` · **Owner:** `@ofri-peretz` · **Lane:** `ac-clients` ·
**Accepted by:** [`D-20261118-contracts-program-go-ahead`](../../decisions/D-20261118-contracts-program-go-ahead.md)

---

## What is wanted

Three generator plugins:

- **`fetch`** — a typed client over `fetch` with zero runtime dependencies: one function per
  operation, `input` typed as the server plugins type it, responses as a discriminated union on
  status, optional response validation through the `validator` target. A `--compat openapi-fetch`
  mode emits only the `paths` types openapi-fetch consumes (the types target already does this).
- **`tanstack-query`** — `queryOptions`/`mutationOptions` factories over the `fetch` client, with
  stable query keys derived from operation id and input.
- **`msw`** — one handler per operation returning the spec's example (or a schema-synthesised value
  with a finding), plus a `scenarios` map for each declared non-2xx response.

## Why now

Read 2026-11-13: openapi-fetch 16.5M weekly, orval 3.7M, msw 33.2M. Clients and mocks generated from
one model are vision row 1 ("cannot disagree"); orval generates both but from its own parser.

## Affected users and systems

`packages/contractdiff/src/plugin-fetch*.ts, src/plugin-tanstack-query*.ts, src/plugin-msw*.ts`.

## Constraints

- No runtime dependency in generated `fetch` output beyond the platform `fetch`.
- MSW and TanStack Query are the user's dependencies, never ours; output is type-checked in the
  corpus lane's consumer harness.
- Mock values are deterministic (seeded by operation id), so snapshots do not churn.

## Success criteria

- In-lane: a test against a local `node:http` server answering from the `msw` scenarios round-trips
  each fixture operation through the `fetch` client, and every scenario body validates against its
  schema (with ajv from the root dev dependencies).
- Follow-up readings, not the lane's exit: the `fetch` output type-checks on the corpus bench specs
  and the MSW output runs under real MSW, both through `consumers.ts`.
- Query keys are stable: the same input in a different property order yields the same key.
- Each generator has a `sample`; X1 = 0.

## Defaults taken

- axios and ky clients are not built until asked; `fetch` covers both runtimes they target.
- SWR is the next client plugin after these three (Hey API #1479, 119 👍, read 2026-11-18); Vue Query,
  Solid Query and Zustand one plugin each, written by the kit's scaffold, on request.

## Evidence sweep 2026-11-22

Read on `main` at `daee10f` (2026-11-22) against the merged Wave 6 PRs (#1617–#1653) and the committed readings under `benchmarks/apicontract/results/`; `vitest run` in `packages/contractdiff` (2,545 tests) and `packages/truefit` (1,153) is green there. 3 of 4 criteria met in-lane. The consumer-harness readings are open.

| # | criterion | held by | state |
| --: | :-- | :-- | :-- |
| 1 | In-lane: client against the MSW scenarios on a local `node:http` server; every body validates | `src/plugin-msw-roundtrip.test.ts` (#1634) | met |
| 2 | Follow-up: `fetch` type-checks on the bench specs; MSW runs under real MSW (`consumers.ts`) | no reading committed | **open** |
| 3 | Query keys stable across property order | `plugin-tanstack-query.test.ts` "makes the same key for the same input in any property order" | met |
| 4 | Each generator has a `sample`; X1 = 0 | `plugin-fetch-sample.ts`, `plugin-msw-sample.ts`, `plugin-tanstack-query-sample.ts`, `plugin-swr-sample.ts` | met (SWR landed too) |

Status stays `approved`: `apicontract` is `private` and unpublished, and [`D-20261119-apicontract-stays-private`](../../decisions/D-20261119-apicontract-stays-private.md) reserves `shipped` for published work; a lane that meets every criterion is recorded as "criteria met, unpublished".
