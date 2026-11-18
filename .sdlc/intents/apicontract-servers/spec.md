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
- **Not yet:** AsyncAPI gateways and microservice handlers (R1 `asyncapi` input).

## As built: shared helpers, `hono`, `fastify`, `express` (2026-11-18)

- **Shared helpers moved on the third copy** (Design above), and NestJS uses them with every golden
  byte unchanged: `plugin-server-routes.ts` (the model, R4–R6; `routesOf(contract, framework)`),
  `plugin-server-example.ts`, `plugin-server-code.ts` (`literal`, input type assembly and response
  unions, `routePath` for path-to-regexp 8, `colonPath` for Hono and Fastify, stubs),
  `plugin-server-runtime.ts` (`RUNTIME`, and `ROUTER_RUNTIME` = `RUNTIME` + `handle`),
  `plugin-server-contract.ts` (options, the contract test with a per-framework `Harness`),
  `plugin-server-sample.ts` (R7's document, one for all four). The finding wording became
  framework-neutral ("is not a route NestJS serves", "… in your handler"); no golden file holds it.
- **One generator, three frameworks.** `plugin-server-router.ts` writes, per spec: `routes.ts`
  (generated: each route's `<Op>Input`/`<Op>Output`, a `Handlers` interface, a typed route table
  `readonly Route<Handlers>[]` of data — method, path, params with their coercion kind and validator,
  body, responses — and the framework's registration), `handlers.ts` (user, written once: an object
  typed `Handlers`, each method answering the spec's example), `contract-runtime.ts` and one
  `<op>.contract.test.ts` per operation. `plugin-<framework>.ts` gives only what differs: the path
  syntax, the registration, the contract-test harness.
  - `hono`: `registerRoutes(app, handlers)`, `app.on` per row, answered as a Fetch `Response`;
    contract tests call `app.request`.
  - `fastify`: `registerRoutes`, a `FastifyPluginAsync<{ handlers }>` (`app.register(registerRoutes,
    { handlers })`), encapsulated, that replaces the content-type parsers with one reading every body
    as text and registers each row with `exposeHeadRoute: false`; contract tests listen on port 0.
  - `express`: `createRouter(handlers)`, an Express 5 `Router` with `text({ type: () => true })` per
    route (a body a parser before the router read is kept); a rejected handler reaches the app's error
    middleware through Express 5's async errors. Contract tests listen on port 0.
- **`handle`** (in `contract-runtime.ts`) answers one request from one row, framework-free: reads each
  part by its key (headers lower-cased, path parameters by segment name), coerces it, takes the first
  of a repeated value unless the kind is a list, parses the body (JSON for a JSON media type, empty is
  absent), refuses with 400 Problem Details (`/body` `is not JSON` for malformed JSON), calls the
  handler, and passes what it answers through NestJS's `send`, so an undeclared answer is a 500.
- **Deviation from the intent's table: Fastify validates with the `validator` target, not with its
  own Ajv/JSON Schema.** R2 and the intent's constraint (validators from the `validator` target)
  win over the table's "Fastify's own validator/serializer": one validator for all four targets, the
  same Problem Details and `errors[].pointer`, and no Ajv semantics differing from the contract's.
  Route `schema` for `fast-json-stringify` serialization, fed by the `json-schema` target's output
  by path option, is not built; it would change speed, not what is accepted.
- **Paths.** Express escapes path-to-regexp 8's reserved characters as NestJS does. Hono and Fastify
  cannot escape `:`, `*` or `?`, nor route a parameter that is part of a segment (`/{name}:cancel`,
  `/{file}.json`): such an operation is left out with `server-path-unsupported`. Rows are registered
  static segments first (`/pets/mine` before `/pets/{id}`), because Hono and Express try in order.
- **Out-of-lockfile reading, 2026-11-18** (scratch folder: `hono@4.13`, `fastify@5.12`,
  `express@5.3` + `@types/express@5`, TypeScript 5.9 `strict`, `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, vitest 3): the sample, generated
  through `gen` with the `types` and `validator` targets, type-checks for all three; 9/9 contract tests
  pass against the stubs (N3 = 100% on the sample). `GET /pets/abc`, `?limit=0`, a body without
  `name` and a body `{` answer 400 Problem Details with the pointer, and a handler answering
  `{ id: 'x' }` answers 500, the same bytes from all three (Fastify and Express add `; charset=utf-8`
  to the content type). After the N1 spec change every `tsc` error is in the user's `handlers.ts`
  (the stubs' `name` no longer types; with that fixed, `TS2741 Property 'deletePet' is missing`).
- **Not yet:** `--test-runner` readings beyond vitest for the routers; a Fastify `schema` for
  serialization (above); the corpus lane's `consumers.ts` readings (N2 across the bench specs, TS 6.0).

## Verification

`npm test -w apicontract -- src/plugin-nest src/plugin-server` (the routers' goldens and N1 are in `plugin-server-router*.test.ts`); the regeneration test
(N1) is the check that would have caught overwriting user code. Boot and type-check readings come
from `benchmarks/apicontract/consumers.ts` (corpus lane).

## Rejected alternatives

- **Protected regions inside one file.** Users lose code across region edits; files are the boundary.
- **Generating full handler bodies.** Business logic is the user's; we generate the shape and the test.
- **Mustache templates.** Templates hide types from the compiler; generators are TypeScript.

## Out of scope

Koa, Elysia, Next.js route handlers (a plugin each, on request). Database code.
