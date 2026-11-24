# Intent — server modules from a contract that regenerate without touching your code

> Opened from the 2026-11-18 program ([`../contractdiff/program.md`](../contractdiff/program.md)).
> Roadmap Phases 3 and 4, server half. Vision row 3: generated servers get abandoned because
> regeneration overwrites hand-written code; only fastify-openapi-glue is regeneration-safe today,
> and openapi-generator's NestJS server is beta and overwrites.

**Status:** approved · **Opened:** `2026-11-18` · **Owner:** `@ofri-peretz` · **Lane:** `ac-servers` ·
**Accepted by:** [`D-20261118-contracts-program-go-ahead`](../../decisions/D-20261118-contracts-program-go-ahead.md)

---

## What is wanted

Four generator plugins, one per framework, one pattern: **generated abstract base + user-owned
implementation**.

| Plugin | Generated (rewritten every run) | User-owned (written once) |
| :-- | :-- | :-- |
| `nest` | Abstract base controller per tag with route decorators, DTO types, validation pipe wired to `gen validator`; WebSocket gateway and microservice handler bases from AsyncAPI; a module file | `<tag>.controller.ts` extending the base, one method stub per operation |
| `hono` | A typed route table and a `registerRoutes(app, handlers)` that validates request and response | `handlers.ts` with one stub per operation |
| `fastify` | A plugin registering routes with JSON Schema for request and response (Fastify's own validator/serializer) | `handlers.ts` |
| `express` | A router with validation middleware per operation, Express 5 async errors | `handlers.ts` |

Every plugin also generates **one contract test per operation** (`<op>.contract.test.ts`, generated):
it calls the route with the spec's examples and asserts the response validates against the spec.
A missing handler fails the type-check, not the run.

Every plugin models errors as data: declared non-2xx responses are part of the handler's return
union, and validation failures answer with RFC 9457 Problem Details (`application/problem+json`)
that are themselves in the generated spec. Read 2026-11-18: error responses are the most reported
gap in code-first tools (Hono zod-openapi #579, 31 👍; oRPC #2488; trpc-to-openapi #168, #172;
Effect #9907), so the generated server's spec lists every error it can return.

## Why now

@nestjs/swagger 11.6M weekly extracts but cannot generate; @hono/zod-openapi 4.3M is code-first only.
Metrics N1–N4 have no reading yet. Phase 3's exit (X3, an agent writes a plugin in one turn) is
graded on the plugin authors see first, which is the NestJS one.

## Affected users and systems

`packages/contractdiff/src/plugin-nest*.ts, src/plugin-hono*.ts, src/plugin-fastify*.ts, src/plugin-express*.ts`.

## Constraints

- Generated code imports validators from the `validator` target's output, never Zod (R-SC0).
- No framework is a dependency of apicontract. Output is type-checked by the corpus lane's
  consumer harness, which installs each framework in a temporary folder.
- A handler signature change in the spec is a type error in the user file, never a silent rewrite.

## Success criteria

- N1 = 0: a test generates, edits every user file, changes the spec (add an operation, add a field,
  remove a field), regenerates, and asserts zero user bytes changed.
- In-lane exit: N1 (above) and golden-file tests of each generator's output. Follow-up readings,
  through the corpus lane's `consumers.ts`, which installs each framework outside the lockfile:
- N2 = 100% on the corpus lane's server bench specs: output type-checks and the app boots in the
  consumer harness under TypeScript 5.9 and 6.0 (7.0 when the harness has it).
- N3 = 100%: every generated contract test passes against the stub implementation that returns the
  spec's example.
- NestJS first; Hono, Fastify, Express each land as their own PR with the same three readings.

## Defaults taken

- NestJS 11 decorators, with NestJS 12 Standard Schema support used when the consumer harness reads it.
- Contract tests use `node:test`-compatible `describe`/`it` imports from `vitest` by default, with
  `--test-runner node|vitest|jest`.
- The `nest` plugin's extract half (spec from controllers) is the `ac-extract` lane's, not this one.

## Evidence sweep 2026-11-22

Read on `main` at `daee10f` (2026-11-22) against the merged Wave 6 PRs (#1617–#1653) and the committed readings under `benchmarks/apicontract/results/`; `vitest run` in `packages/contractdiff` (2,545 tests) and `packages/valz` (1,153) is green there. 1 of 4 criteria met (N1 and golden files). N2 and N3 on the bench specs are unread.

| # | criterion | held by | state |
| --: | :-- | :-- | :-- |
| 1 | N1 = 0: edit every user file, change the spec, regenerate, zero user bytes changed | `plugin-nest-regen.test.ts` (#1635); `plugin-server-router-regen.test.ts` for hono, fastify, express (#1641) | met |
| 2 | N2 = 100%: output type-checks and boots on the server bench specs under TS 5.9 and 6.0 | one out-of-lockfile check of the NestJS sample (spec § As built), not committed; no `consumers.ts` reading | **open** |
| 3 | N3 = 100%: every contract test passes against the example stubs | NestJS sample: 3 / 3 out of lockfile; bench specs not read | **open** |
| 4 | Hono, Fastify, Express each with the same three readings | all three generators landed in #1641 with N1 and golden files; N2, N3 unread | **open** (as N2, N3) |

Status stays `approved`: `apicontract` is `private` and unpublished, and [`D-20261119-apicontract-stays-private`](../../decisions/D-20261119-apicontract-stays-private.md) reserves `shipped` for published work; a lane that meets every criterion is recorded as "criteria met, unpublished".
