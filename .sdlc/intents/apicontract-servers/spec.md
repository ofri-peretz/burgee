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
