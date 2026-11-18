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

## As built (2026-11-18, PR for PLAN.md 6.5)

Landed: R1 (`extract-normalise.ts`: `normalise`, `inline`, `stable`), R3
(`plugin-extract-standard-schema.ts`, shared code in `extract-standard.ts`), R4
(`plugin-extract-openapi.ts`, extractor `openapi-from-schemas`), R2 (`extract-roundtrip.ts`), R7
(`plugin-extract-ts-rest.ts`). Not yet: R5 (NestJS), Hono, tRPC/oRPC.

Where the design was wrong or silent, and what was done:

- **Findings have no channel.** `Extractor.run` returns a document; `apicontract extract` writes it
  and reports no findings. Every extractor here puts its findings in the document's root
  `x-findings` (an extension key both JSON Schema and OpenAPI allow) rather than dropping them.
  The spine should give `Extractor.run` a `{ document, findings }` return, as `Generator` has.
  **Closed 2026-11-18** (gap `A-20261118-extractor-findings-channel`, branch
  `integrate/extractor-findings`): an extractor may return `{ document, findings }`; the three
  extractors here (`standard-schema`, `openapi-from-schemas`, `ts-rest`) always do, and no longer
  write `x-findings`. Their samples are the document alone: `checkPlugin` compares the document
  part, so a finding never makes a sample stale.
- **A schema library writes a document of its own**, with `$defs` and `$ref: "#"` (Zod's recursion
  and `.meta({ id })`). `relocate` moves those `$defs` to the extracted document's `$defs` or
  `components.schemas` and rewrites every reference; a clashing name is renamed with a finding.
- **Responses have two sides.** A response schema is written as its output by default (what a
  server's schema hands out: Zod's object output has `additionalProperties: false`), and as its
  input with `responseSide: "input"`, which is what zod-to-openapi writes.
- **R2 uses `compareContracts`** now that `ac-diff` has landed, but alongside the structural diff,
  not instead of it: `equal` is the structural verdict, `comparison` the classified one.
- **The `json-schema` target is not on main** (6.4), so the round trip's generator half is the
  validator at run time: `fromJsonSchema` then `standardJson`, the module the `validator` target
  would export, without writing it.

Readings, 2026-11-18:

- **B1 (round trip).** The validator's own Standard Schema fixtures: equal (2/2 schemas). The
  five-document fixture corpus through the validator: 0/5 equal on the first pass (a format is
  written back as its pattern, an enum as `anyOf` of `const`, `type: "null"` as `const: null`),
  4/5 a fixed point after it; a tuple (`prefixItems` with `items: false`) grows on every pass — the
  validator lane's to fix. `compareContracts` calls 1/5 of those round trips non-breaking; the
  other four are rewrites that validate the same values, which the classifier reads as breaking
  (the diff lane's to refine). Zod through `z.fromJSONSchema` on the same corpus, for comparison:
  1/5 equal.
- **B2 (zod-to-openapi's own examples).** 2/2 equivalent on `paths` after `inline` and `normalise`
  with `responseSide: "input"` (README quick example; `example/index.ts` against
  `example/openapi-docs.yml`, at 9af9229). With the default output side the one difference is
  Zod's `additionalProperties: false` on the response object. Operation ids are left out of the
  grade: zod-to-openapi writes none unless given one.
- **B3 = 0 on the fixture set:** a value without Standard JSON Schema, a converter that throws, a
  `c.type<T>()` body or response, a non-object parameter schema, an unknown method, a duplicate
  route and a renamed definition are each a finding with a `fix`.
- Mutation on the changed lines: 1016 killed, 3 timeout, 0 survived.
