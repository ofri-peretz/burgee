# Design — extractors and the round trip

Intent: [`intent.md`](./intent.md). **Status:** approved, 2026-11-18.

---

## Requirements

- **R1** `src/extract-normalise.ts`: `normalise(document)` sorts keys, drops annotations that do not
  change validation (`title`, `description`, `examples` unless `--keep-docs`), and canonicalises
  `type` arrays, so two equal contracts compare equal byte for byte.
- **R2** `src/extract-roundtrip.ts`: `roundtrip(spec, generator, extractor)` returns
  `{ equal, diff }`, using `ac-diff`'s `compareContracts` when available and a structural diff until then.
- **R3** `src/plugin-extract-standard-schema.ts`: `extractors['standard-schema']` (host's `Extractor`: `{ description, sample: { options, document }, run(options) }`, added in 6.0) takes `module` (path) and
  `export` (name or `*`), imports it, and calls `~standard.jsonSchema.input`/`output` per value; a
  value without it is a finding naming the library.
- **R4** `openapi-from-schemas` takes the operation map and writes OpenAPI 3.1 with the schemas under
  `components.schemas`, named by export.
- **R5** `src/plugin-extract-nest*.ts`: imports the controller modules the user names, reads the
  metadata `@Controller`, the HTTP method decorators, `@Param`, `@Query`, `@Body` and `@Headers`
  record (`path`, `method`, `__routeArguments__`), and the DTO schemas through R3; decorators it does
  not know are findings. Tests use hand-written metadata fixtures, so `@nestjs/common` stays out of
  the lockfile; the consumer harness checks one real NestJS app.
- **R7** `src/plugin-extract-ts-rest*.ts`: imports a ts-rest contract object (plain data:
  `{ method, path, pathParams, query, body, responses }` per route) and writes OpenAPI 3.1 through R4.
- **R6** Round-trip tests live beside each extractor and run on the corpus lane's documents.

## Design

Order: R1, R3, R2, R4, R5,
then Hono and tRPC/oRPC. Fixtures live in `src/__fixtures__/extract/`.

## Verification

`npm test -w apicontract -- src/extract- src/plugin-extract-standard-schema src/plugin-extract-nest`;
the round-trip test is the check that would catch a generator and an extractor disagreeing.

## Rejected alternatives

- **One extractor per validation library.** Standard JSON Schema is the shared interface; per-library
  code is only for a library that does not implement it, and then on request.
- **Booting the app to read its routes** (@nestjs/swagger's way) as the default. Slow, needs every
  provider mocked; it stays a fallback.

## Out of scope

Extracting from Express or Fastify handlers without schemas (there is nothing typed to read).
