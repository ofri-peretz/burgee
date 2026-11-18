# Code-first OpenAPI extraction: state of the art, 2026-11-18

Sources: npm registry `/latest` and `api.npmjs.org/downloads/point/last-week` (window 2026-11-10..16), GitHub search API
(`sort=reactions-+1`), package READMEs and manifests. Claims about mechanism that come from my prior knowledge
rather than a fetched README are marked *(prior knowledge)*; anything I could not check is "unverified".

## Extraction modes (terms used below)

- **Boot**: the app must be constructed (DI container, plugins registered, often `listen`/`ready`) before a spec exists.
- **Import**: the spec is built by importing modules that hold route/contract objects; no server, but module side effects run (DB clients, env checks, `server-only`).
- **Static**: reads TS source / types with a compiler or parser; never executes user code.

## 1. Versions and downloads

| Framework | Spec package | Version (published) | Weekly DL | Framework core weekly DL |
|---|---|---|---|---|
| NestJS | `@nestjs/swagger` | 12.1.2 (2026-11-13) | 12,057,274 | `@nestjs/core` 12.5.1 (DL unverified, rate-limited) |
| Hono | `@hono/zod-openapi` | 1.6.3 (2026-09-04) | 4,642,667 | `hono` 4.13.19: 110,731,590 |
| Hono | `hono-openapi` (rhinobase) | 1.6.0 (2026-11-14) | 3,743,287 | |
| Fastify | `@fastify/swagger` | 9.9.5 (2026-11-16) | 4,719,982 | `fastify` 5.12.8: 23,309,154 |
| Fastify | `fastify-openapi-glue` (spec-first) | 4.12.0 (2026-10-18) | 94,326 | |
| Express 5 | `tsoa` | 7.0.0-rc.0 (2026-11-15) | 617,121 | `express` 5.3.0: 200,803,554 |
| Express 5 | `express-openapi-validator` (spec-first) | 5.6.2 (2026-01-20) | 725,865 | |
| Express | `express-zod-api` | 30.0.4 (2026-11-15) | 64,167 | |
| tRPC v11 | `@trpc/openapi` (official, **alpha**) | 11.29.4-alpha (created 2026-03-15) | 34,365 | `@trpc/server` 11.29.4: 8,209,819 |
| tRPC v11 | `trpc-to-openapi` (fork) | 3.5.0 (2026-11-01) | 426,272 | |
| tRPC v10 | `trpc-openapi` (original, dead) | 1.2.0 (2023-05-24) | 37,702 | |
| oRPC | `@orpc/openapi` | 1.16.2 (2026-11-06) | 2,303,511 | `@orpc/server`: 3,249,656 |
| ts-rest | `@ts-rest/open-api` | 3.52.1 (2025-03-04) | 440,293 | `@ts-rest/core`: 967,144 |
| Effect | `effect` v4 (HttpApi in core, `effect/unstable/httpapi` *(prior knowledge)*) | 4.1.4 (2026-11-11) | 71,167,025 | `@effect/platform` 0.97.2 (v3 line): 1,902,911; `@effect/platform-node` 4.1.4: 4,600,469 |
| Elysia | `@elysiajs/openapi` | 1.4.17 (2026-11-04) | 593,959 | `elysia` 1.4.32: 2,141,134 |
| Elysia | `@elysiajs/swagger` (superseded) | 1.3.1 (2025-06-27) | 333,090 | |
| Next.js | `next-openapi-gen` | 1.11.0 (2026-11-13) | 99,187 | `next` 16.4.6: 95,809,261 |
| Next.js | `next-rest-framework` | 6.1.1 (2026-01-06) | 97,338 | |

Schema-to-OpenAPI substrate: `@asteasolutions/zod-to-openapi` 9.1.0: 8,206,386/wk; `zod-openapi` 6.0.2: 2,032,896/wk.

Status flags:
- **ts-rest is archived** (GitHub `archived: true`; README: "ts-rest is no longer maintained ... no planned releases"). Still ~1M/wk core installs: orphaned users.
- **tRPC now has an official, static OpenAPI generator** (`@trpc/openapi`, alpha). Peer deps: `typescript >=7.1.0-beta` (the Go-native compiler), `zod >=4`, `@hey-api/openapi-ts`. README: "statically analyses your router's TypeScript types — it never executes your code."
- tsoa is mid-major (7.0.0-rc.0).

## 2. How each produces a spec

| Framework / tool | Mechanism | Schema libs | Mode | Static (no-run) possible? |
|---|---|---|---|---|
| `@nestjs/swagger` | Decorators + `reflect-metadata`; optional CLI plugin is a TS compile-time transformer that injects `@ApiProperty` from types/JSDoc; `SwaggerModule.createDocument(app)` walks the DI container | class-validator/class-transformer classes; Zod via 3rd-party `nestjs-zod` *(prior knowledge)* | Boot (`NestFactory.create`) | Not natively. **Nestia** (`@nestia/sdk` 14.3.1, 22k/wk) does it statically via TS compiler + typia. `tspec --nestjs` also claims it. |
| `@hono/zod-openapi` | `createRoute()` objects registered on `OpenAPIHono`; `app.getOpenAPIDocument()` | Zod v4 only (peer `zod ^4`) | Import | No |
| `hono-openapi` | `describeRoute()` middleware + validators; `generateSpecs(app)` | Any Standard Schema (Zod, Valibot, ArkType, Effect, TypeBox) | Import | No |
| `@fastify/swagger` | Reads route `schema` objects from the route table on `onRoute`/`ready` | JSON Schema; TypeBox; Zod via `fastify-type-provider-zod` transform | Boot (`await app.ready()`) | No |
| `fastify-openapi-glue` | Spec-first: spec → routes. No extraction. | JSON Schema in the spec | n/a | n/a (it is a consumer, not a producer) |
| `tsoa` | **Static**: TS compiler API over controllers with decorators (`@Route`, `@Get`), JSDoc; emits spec + route glue | TS types only (no Zod inference: #1256 is its top issue) | Static | Yes, natively |
| `express-openapi-validator` | Spec-first validator; no extraction | spec | n/a | n/a |
| `express-zod-api` | Endpoint objects with Zod I/O; `Documentation` class | Zod | Import | No |
| `@trpc/openapi` | **Static** type analysis of the exported `AppRouter` via TS 7 | Zod ≥4 | Static | Yes (alpha) |
| `trpc-to-openapi` | `.meta({ openapi })` on procedures; `generateOpenApiDocument(router)` | Zod 3.25/4 via `zod-openapi` | Import | No |
| oRPC `@orpc/openapi` | `OpenAPIGenerator` over router or contract; schema converters per lib | Zod, Valibot, ArkType (converters) *(prior knowledge for the list)* | Import | No; contract-first routers can be imported without handlers |
| ts-rest `@ts-rest/open-api` | `generateOpenApi(contract)` | Zod (3) | Import (contract only) | No; archived |
| Effect HttpApi | `OpenApi.fromApi(api)` over `HttpApi`/`HttpApiGroup`/`HttpApiEndpoint` definitions | Effect Schema only | Import (definition only, no handlers needed) | No, but the definition is pure data, cheap to import |
| `@elysiajs/openapi` | Runtime: walks registered routes' TypeBox/Standard Schema. Plus `./gen` export (`fromTypes`) that uses the TS compiler to infer response types from the app's types | TypeBox (`t`), Standard Schema | Import + optional TS-type pass | Partially: the `gen` pass is type-based but still feeds the runtime plugin *(mechanism detail unverified)* |
| Next.js route handlers | No built-in. `next-openapi-gen`: **static** (deps: `@babel/parser`, `@babel/traverse`, `typescript`) over `app/**/route.ts` + JSDoc + Zod/TS types. `next-rest-framework`: wrapper `route()` objects + CLI that imports compiled handlers | Zod, TS types | Static (next-openapi-gen) / Import (NRF) | Yes via next-openapi-gen |

## 3. Top open issues by 👍 (spec-generation related)

GitHub search `is:issue is:open sort:reactions-+1`, fetched 2026-11-18. Counts are 👍 only.

**NestJS (`nestjs/swagger`)**: only 3 open issues (aggressive auto-close).
- 9 Registering custom decorators: https://github.com/nestjs/swagger/issues/32
- 9 Static declaration of response transformation while using the CLI plugin: https://github.com/nestjs/swagger/issues/2267
- Top *closed* by 👍 for context: 40 Multiple responses with same status code (#225), 34 Multiple versions support (#1810), 33 OAS 3.1 webhooks (#1827), 40 Auto-detect optional @Query (#30).
- `nestjs/nest` 24 Add dynamic routing: https://github.com/nestjs/nest/issues/1438

**Hono** (`honojs/middleware` zod-openapi, `rhinobase/hono-openapi`, `honojs/hono`)
- 36 Automatic Swagger docs generation like Elysia or NestJS: https://github.com/honojs/hono/issues/2970
- 31 Hono + Zod OpenAPI with Problem Details (RFC 9457): https://github.com/honojs/middleware/issues/579
- 27 Response serialization and validation: https://github.com/honojs/hono/issues/2439
- 22 Typed context inside describeResponse handlers: https://github.com/rhinobase/hono-openapi/issues/145
- 19 [zod-openapi] Support ZodLazy: https://github.com/honojs/middleware/issues/643
- also: 13 middleware loses Context type info https://github.com/honojs/middleware/issues/637; 12 switch to samchungy/zod-openapi https://github.com/honojs/middleware/issues/881; 17 type inference too slow in builds https://github.com/honojs/hono/issues/3869

**Fastify (`fastify/fastify-swagger`)**: low reaction counts.
- 3 Auto-add `schema.security` from route auth: https://github.com/fastify/fastify-swagger/issues/803
- 1 Shared JSON schema "Cannot create property 'in'": https://github.com/fastify/fastify-swagger/issues/791
- 0 Response headers schema format docs: https://github.com/fastify/fastify-swagger/issues/959
- 0 Path param serialization: https://github.com/fastify/fastify-swagger/issues/912
- 0 resolveBodyParams crash on empty `content: {}`: https://github.com/fastify/fastify-swagger/issues/968
- `fastify-openapi-glue`: 0 open issues.

**Express 5 (`lukeautry/tsoa`, `cdimascio/express-openapi-validator`)**
- 79 tsoa: Support Zod's infer type: https://github.com/lukeautry/tsoa/issues/1256
- 17 tsoa: Nullable lost with utility types (Pick, Partial): https://github.com/lukeautry/tsoa/issues/1515
- 13 tsoa: inline type aliases (@tsoaInline): https://github.com/lukeautry/tsoa/issues/911
- 13 tsoa: CLI should use tsconfig paths: https://github.com/lukeautry/tsoa/issues/868
- 8 eov: ESM operation handlers: https://github.com/cdimascio/express-openapi-validator/issues/660
- also eov: 7 custom error handler #546, 7 oneOf+additionalProperties:false #740, 7 exclude examples from response validation #931

**tRPC v11** (`mcampa/trpc-to-openapi`; `trpc/trpc` has 0 relevant open)
- 1 Octet-stream input: https://github.com/mcampa/trpc-to-openapi/issues/144
- 0 Non-JSON content types: https://github.com/mcampa/trpc-to-openapi/issues/142
- 0 Non-nested Zod JSON types in query input: https://github.com/mcampa/trpc-to-openapi/issues/139
- 0 node-http adapter overrides errorFormatter: https://github.com/mcampa/trpc-to-openapi/issues/168
- 0 Error responses repeat description/example: https://github.com/mcampa/trpc-to-openapi/issues/172
- Demand signal is in *closed* tRPC issues: 96 additional Content-Types (#1937), 26 router independent of implementation (#3798), 21 RFC public-facing APIs/OpenAPI (#755), 12 tRPC→OpenAPI generator (#1724).

**oRPC** (repo moved to `middleapi/orpc`; 7 open matching "openapi")
- 4 RTK Query client adapter: https://github.com/middleapi/orpc/issues/345
- 0 Standard Schema input validation errors not in OpenAPI export (contract-first): https://github.com/middleapi/orpc/issues/2488
- 0 More OpenAPI examples: https://github.com/middleapi/orpc/issues/1283
- 0 Auto `.output` from handler return type for OpenAPI: https://github.com/middleapi/orpc/issues/481
- 0 TUS file upload/download: https://github.com/middleapi/orpc/issues/482

**ts-rest**: archived, 0 open. Top closed: 45 Maintained? (#859), 35 Future of ts-rest (#797), 13 deduplicate schemas in generated OpenAPI https://github.com/ts-rest/ts-rest/issues/366.

**Effect (`Effect-TS/effect`)**: 4 open HttpApi issues, `effect-smol` 0.
- 4 Versioned schemas with version negotiation in HttpApi/Rpc/cluster: https://github.com/Effect-TS/effect/issues/10383
- 0 `format: "password"` as `Redacted` in JSON Schema / OpenAPI: https://github.com/Effect-TS/effect/issues/10394
- 0 HttpApiClient: Redacted values in plain text in spans: https://github.com/Effect-TS/effect/issues/9882
- 0 HttpApiClient: map errors per endpoint: https://github.com/Effect-TS/effect/issues/9907

**Elysia** (`elysiajs/elysia-openapi`, `elysiajs/elysia`)
- 14 Support OpenAPI 3.1 (JSON Schema 2020-12): https://github.com/elysiajs/elysia-openapi/issues/327
- 13 "ReadableStream has already been used": https://github.com/elysiajs/elysia-openapi/issues/208
- 11 Enums not generated: https://github.com/elysiajs/elysia-openapi/issues/90
- 11 Allow extending other swaggers: https://github.com/elysiajs/elysia-openapi/issues/204
- 10 Schema creates malformed swagger: https://github.com/elysiajs/elysia-openapi/issues/8
- also core: 9 `t.Date()` in anyOf gives invalid OpenAPI https://github.com/elysiajs/elysia/issues/1400; 7 Elysia / Eden / OpenAPI behaviour mismatch https://github.com/elysiajs/elysia/issues/1142; 5 `t.Nullable()` non-compliant 3.0 https://github.com/elysiajs/elysia/issues/1577; 9 Node adapter with Swagger https://github.com/elysiajs/elysia/issues/1262

**Next.js** (`vercel/next.js` has no OpenAPI feature; ecosystem tools)
- 5 Turbopack compilation error with Swagger: https://github.com/vercel/next.js/issues/86507
- 1 next-rest-framework: generate fails with `server-only`: https://github.com/blomqma/next-rest-framework/issues/166
- 1 next-rest-framework: path aliases don't work: https://github.com/blomqma/next-rest-framework/issues/203
- 0 next-rest-framework: `/route.cjs` appended to every endpoint: https://github.com/blomqma/next-rest-framework/issues/145
- 1 next-openapi-gen: `z.literal` drops negatives / mixed literal arrays: https://github.com/tazo90/next-openapi-gen/issues/246

## 4. Static (no-run) extractors

| Tool | Engine | Scope | Limits |
|---|---|---|---|
| `tsoa` 7.0.0-rc.0 (617k/wk) | TS compiler API | Express/Koa/Hapi controllers with tsoa decorators | Own decorator dialect, so it's not extraction from arbitrary code; no Zod inference (#1256, 79 👍); utility types lose nullability (#1515); ignores tsconfig paths (#868) |
| `@nestia/sdk` 14.3.1 (22k/wk) | TS compiler + typia transformer (`ttsc`) | NestJS controllers | Needs `@nestia/core` decorators for full fidelity; compiler-plugin toolchain (ttsc); single-author project |
| `@trpc/openapi` 11.29.4-alpha (34k/wk) | TS type checker; peer `typescript >=7.1.0-beta` | tRPC routers | Alpha; README TODO lists SSE, non-JSON content types, async generators "generate poorly"; output keeps tRPC envelope (not REST-shaped) |
| `next-openapi-gen` 1.11.0 (99k/wk) | Babel parser/traverse + TypeScript | Next.js `route.ts` + JSDoc tags + Zod/TS types | Re-implements Zod semantics in AST (e.g. #246 literal bugs); relies on JSDoc annotations for paths/responses |
| `tspec` 0.2.11 (6k/wk) | `typescript-json-schema` | Framework-agnostic `Tspec.DefineApiSpec<>` types; `--nestjs` flag | You hand-write an API-spec type, so it's not extracted from handlers; OAS 3.0 only; small |
| `@elysiajs/openapi/gen` (`fromTypes`) | TS compiler | Elysia app types | Supplements runtime extraction; mechanism detail unverified |
| `ts-json-schema-generator` 2.9.0 (1.6M/wk) | TS compiler | Types → JSON Schema only | Building block: no routes/paths |
| `@typespec/compiler` 1.18.0 (432k/wk) | Own language | Spec-first DSL | Not code→spec; listed as the competing "design-first" path |

- **No oxc-based OpenAPI extractor found** (npm search "openapi oxc" returns only oxc's own packages). Unverified beyond npm search; GitHub code search not run.
- Common limit across all static tools: they understand TS *types*, not runtime schema *values*. Zod/Valibot/Effect Schema objects must either be re-interpreted from AST (next-openapi-gen, which is fragile) or resolved via `z.infer`/`Schema.Type` types, which loses constraints (min/max, regex, formats, descriptions). The one tool that does it by types (tRPC) needs TS 7.

## 5. Decision-relevant observations

- The large ecosystems (Nest 12M/wk, Hono zod-openapi + hono-openapi 8.4M/wk, Fastify 4.7M/wk, oRPC 2.3M/wk) all extract by **boot or import**, so a CI drift check has to execute user code (env, DB clients, `server-only`, side effects). This is the documented failure in next-rest-framework #166 and Turbopack/Swagger #86507.
- Static is now validated upstream: tRPC shipped an official static generator (2026-03), on TS 7. That's a signal that the type checker route is viable and that TS 7 speed makes it cheap.
- Biggest unmet demand by 👍: Zod inference in a static extractor (tsoa #1256, 79), automatic docs for plain Hono (#2970, 36), RFC 9457 error shapes (#579, 31), OAS 3.1 in Elysia (#327, 14), ZodLazy/recursive schemas (#643, 19).
- Error responses are under-modelled everywhere: Problem Details (Hono), error formatter / repeated errors (trpc-to-openapi #168/#172), oRPC validation errors missing from spec (#2488), Effect per-endpoint error mapping (#9907).
- Fidelity bugs cluster around nullable/date/enum/literal mapping (tsoa #1515, Elysia #1400/#1577/#90, next-openapi-gen #246). A golden-test corpus per schema lib would be a differentiator.
- Orphans: ts-rest (archived, ~967k/wk core, 440k/wk open-api) and original trpc-openapi (37k/wk, last release 2023) are migration targets.
- Spec-first tools here (fastify-openapi-glue, express-openapi-validator) are consumers, not producers. They pair with spec→code generation, not extraction.
