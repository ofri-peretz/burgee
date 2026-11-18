# Intent — code → spec: a contract from the schemas and servers a team already wrote, with the round trip proven

> Opened from the 2026-11-18 program ([`../apicontract/program.md`](../apicontract/program.md)).
> Owner, 2026-11-12: "for both directions also code to specs". Roadmap Phase 2 (extract core and
> R-RT) and Phase 3/4 (NestJS, Hono, tRPC/oRPC extraction).

**Status:** approved · **Opened:** `2026-11-18` · **Owner:** `@ofri-peretz` · **Lane:** `ac-extract` ·
**Accepted by:** [`D-20261118-contracts-program-go-ahead`](../../decisions/D-20261118-contracts-program-go-ahead.md)

---

## What is wanted

Extractor plugins (the `extractors` key, `apicontract-gen-command` R9), in this order:

1. **`standard-schema`** — any value implementing Standard JSON Schema (`~standard.jsonSchema`): our
   validator, Zod 4, Valibot, ArkType and every other conforming library at once, with no
   per-library code. The user points at a module and its exports become a JSON Schema document.
2. **`openapi-from-schemas`** — a module exporting `{ [operationId]: { method, path, input, output } }`
   built from any Standard Schema values becomes an OpenAPI 3.1 document. This is the code-first
   route for teams with no framework integration.
3. **`nest`** — extraction from NestJS controllers without booting the app (decorator metadata read
   from the imported classes), DTO types through the Standard Schema route or class-validator metadata.
4. **`hono`**, **`trpc`/`orpc`** — routes and their validators, statically where the source allows
   and by importing the router object where it does not, with a finding saying which.
5. **`ts-rest`** — a ts-rest contract object becomes OpenAPI 3.1, and `gen` then writes the server
   and client it had. Read 2026-11-18: ts-rest is archived (`archived: true` on GitHub) with
   `@ts-rest/core` at 967k weekly and `@ts-rest/open-api` at 440k; the original `trpc-openapi`
   (last release 2023) is abandoned at 37k. Both user bases need a way out, and this is it.

Why import and not only static reading: read 2026-11-18, every no-run extractor (tsoa,
`@trpc/openapi`, next-openapi-gen, nestia) reads TypeScript *types*, so the constraints carried by
schema *values* (min, max, format, description) are lost or re-parsed from the AST and break
(next-openapi-gen #246). Standard JSON Schema gives the values exactly; static reading is kept for
routes and decorators, where the information is in the source.

And the round trip (R-RT): `extract(gen(spec))` equals `spec` after normalisation for every
generator that has an extract half, run on the corpus.

## Why now

@asteasolutions/zod-to-openapi 7.6M weekly, zod-to-json-schema 94.5M, @nestjs/swagger 11.6M: all
one direction, one library each. Standard JSON Schema makes one extractor cover every conforming
library, which turns B5 from a per-framework grind into one plugin.

## Affected users and systems

`packages/apicontract/src/extract/**`, `src/plugins/{standard-schema,nest-extract,hono-extract,trpc-extract}/**`.

## Constraints

- Zod is read, never emitted (R-SC0); Zod is a dev dependency of tests only (already in root
  `node_modules`).
- A refinement, transform or decorator the extractor cannot express is a finding (B3 = 0 silent).
- Static extraction does not execute user code; the import route says it does, in a finding.

## Success criteria

- B1: round trip on 100% of the corpus documents for the `validator` and `json-schema` targets.
- B2: zod-to-openapi's own fixtures produce an equivalent document through `openapi-from-schemas`.
- B3 = 0 on the fixture set; B4 below @nestjs/swagger (which boots the app) on the NestJS bench.
- B5 counted per extractor as it lands.

## Defaults taken

- NestJS routes are read by importing the controller classes (not booting the app) and reading the
  metadata Nest's decorators record at class definition (`path`, `method`, route arguments): no
  module graph, no providers, no compiler. A purely static reader is a later step through oxc's
  parser, which oxmutate's native core already links (`oxc_parser` in `packages/oxmutate/native`)
  but does not export to JavaScript; exporting it is the oxmutate lane's PR, asked for by this lane.
- Not the TypeScript compiler API: read 2026-11-18, TypeScript 7.0 (GA 2026-07-08) has no
  programmatic API and 7.1's differs from 6's, so a compiler-API extractor would be pinned to
  `@typescript/typescript6` and ported again.
