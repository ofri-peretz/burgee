# Design — server generators

Intent: [`intent.md`](./intent.md). **Status:** approved, 2026-11-18.

---

## Requirements

- **R1** One file per framework, `src/plugin-<framework>.ts` (helpers `plugin-<framework>-*.ts`), each exporting `plugin` with one generator
  named after the framework; inputs `openapi` (all four) and `asyncapi` (`nest` only).
- **R2** Each generator takes option `validators` (import path of the `validator` target's output,
  default `./validators.js`) and never emits validation logic itself.
- **R3** Generators return bodies only. The spine's writer adds the generated header
  (`apicontract-gen-command` R6) when it writes, so `sample.files` hold bodies without it.
- **R4** Operation → method name: `operationId` camelCased; without one, `<method><Path>` with path
  params as `By<Param>`; collisions suffixed deterministically.
- **R5** Each operation's request params, query, headers and body are one typed `input` object; the
  return type is a discriminated union of the declared responses `{ status, body, headers }`.
- **R6** Contract tests read examples from `example`/`examples`; an operation without one gets a
  synthesised example from its schema with a finding.
- **R7** Each generator's `sample` covers one GET with a path param, one POST with a body and two
  responses, and one operation without an `operationId`.

## Design

Shared helpers (naming, `input` type assembly, response unions) start in `plugin-nest-*.ts` and are copied,
not imported, by the next framework; the third copy moves to `src/plugin-server-*.ts` in the PR that
makes it. Order: `nest` (R1–R7, then AsyncAPI gateways), `hono`, `fastify`, `express`.

## As built: `nest` (2026-11-18)

- **Files.** Per controller (first tag, kebab-case; untagged → `default`): `<tag>.controller.base.ts`
  (generated: per route a `type <Op>Operation = paths[path][method]`, `<Op>Input`, `<Op>Output`, the
  abstract method, and a decorated `handle<Op>` that coerces and validates path/query/header/body,
  calls the abstract method and checks the answer) and `<tag>.controller.ts` (user, written once,
  each stub answering the first 2xx with the spec's example). Also generated: `api.module.ts`,
  `contract-runtime.ts` (coercion, `invalid`, `problem`, `send`) and `<op>.contract.test.ts`.
- **Types come from the `types` target, by path option** (`types`, default `./types.js`), the same
  way validators come from the `validator` target (R2). R5 did not say where the typed `input`
  and response union come from; re-deriving TypeScript from JSON Schema here would have been a
  second types generator. `paths[path][method]` is used for every operation, so one without an
  `operationId` is typed the same way.
- **Problem Details.** A refused request answers `400 application/problem+json` with RFC 9457
  `errors[].pointer` (`/path/petId`, `/query/limit`, `/body`). A handler answer the contract does
  not declare (status or body) answers `500` Problem Details instead of being sent. An operation
  that validates input but declares no `400`/`4XX`/`default` gets `server-problem-undeclared`.
- **Findings.** `server-operation-skipped` (webhooks, `trace`, `query`, `additionalOperations`),
  `server-parameter-skipped` (cookies), `server-media-type-skipped` (one media type served, JSON
  first), `server-stream-skipped` (`itemSchema`), `server-example-synthesised` (R6).
- **Contract tests** boot `ApiModule` with `NestFactory`, listen on `127.0.0.1:0`, `fetch` the
  example request, and assert the status is declared (code, range, `default`) and the body passes
  its validator. Assertions use `node:assert/strict`, so only the `describe`/`it` import changes
  with `testRunner` (`vitest`, `node`, `jest`).
- **Out-of-lockfile reading, 2026-11-18** (scratch folder, `@nestjs/*@11`, TS 5.9 `strict` +
  `noUnusedLocals`, vitest 3): the sample type-checks; 3/3 contract tests pass against the stubs
  (N3 = 100% on the sample); a stub edited to answer a wrong body fails its contract test with a
  500; `GET /pets/abc`, `?limit=0` and a body without `name` answer 400 Problem Details. After the
  N1 spec change, `tsc` reports `TS2515 … does not implement inherited abstract member deletePet`
  in the user's `pets.controller.ts`, and nothing else of the user's moved.
- **Not yet:** AsyncAPI gateways and microservice handlers (R1 `asyncapi` input); Hono, Fastify,
  Express.

## Verification

`npm test -w apicontract -- src/plugin-nest` (and per framework); the regeneration test
(N1) is the check that would have caught overwriting user code. Boot and type-check readings come
from `benchmarks/apicontract/consumers.ts` (corpus lane).

## Rejected alternatives

- **Protected regions inside one file.** Users lose code across region edits; files are the boundary.
- **Generating full handler bodies.** Business logic is the user's; we generate the shape and the test.
- **Mustache templates.** Templates hide types from the compiler; generators are TypeScript.

## Out of scope

Koa, Elysia, Next.js route handlers (a plugin each, on request). Database code.
