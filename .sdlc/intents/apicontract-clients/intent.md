# Intent — typed clients and MSW mocks from the same model as the server

> Opened from the 2026-11-18 program ([`../apicontract/program.md`](../apicontract/program.md)).
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

`packages/apicontract/src/plugin-fetch*.ts, src/plugin-tanstack-query*.ts, src/plugin-msw*.ts`.

## Constraints

- No runtime dependency in generated `fetch` output beyond the platform `fetch`.
- MSW and TanStack Query are the user's dependencies, never ours; output is type-checked in the
  corpus lane's consumer harness.
- Mock values are deterministic (seeded by operation id), so snapshots do not churn.

## Success criteria

- The `fetch` output type-checks on every corpus bench spec under TypeScript 5.9 and 6.0, and a test
  against a local `node:http` server built from the `msw` scenarios round-trips each operation.
- Every MSW handler's response validates against the spec (validator target), 100% on the fixtures.
- Query keys are stable: the same input in a different property order yields the same key.
- Each generator has a `sample`; X1 = 0.

## Defaults taken

- axios and ky clients are not built until asked; `fetch` covers both runtimes they target.
- SWR is the next client plugin after these three (Hey API #1479, 119 👍, read 2026-11-18); Vue Query,
  Solid Query and Zustand one plugin each, written by the kit's scaffold, on request.
