# Contracts in the agent era: state of the landscape (researched 2026-11-18)

Sources are linked inline. "unverified" means the claim comes from secondary sources only, or I could not reach a primary page for it.

## 1. MCP

### Spec versions
| Revision | Status | Notes |
|---|---|---|
| **2026-07-28** | **Current** ([versioning](https://modelcontextprotocol.io/specification/versioning)) | Stateless rewrite. Drops `initialize`, sessions and `Mcp-Session-Id`. Adds `server/discover`, `_meta`-carried version and capabilities, MRTR (`InputRequiredResult`), `resultType`, and `CacheableResult` (`ttlMs`/`cacheScope`). Tasks move to an extension. Roots, Sampling and Logging are deprecated. ([changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)) |
| 2025-11-25 | Final | Made JSON Schema 2020-12 the default dialect (SEP-1613). Added URL-mode elicitation and experimental tasks. ([changelog](https://modelcontextprotocol.io/specification/2025-11-25/changelog)) |

### Schema-relevant rules in 2026-07-28
- **Dialect:** if `$schema` is absent, the schema is **JSON Schema 2020-12**. A schema MAY declare another dialect. Implementations MUST support 2020-12, MUST validate against the declared or default dialect, and MUST return an error for a dialect they don't support. ([basic § JSON Schema Usage](https://modelcontextprotocol.io/specification/2026-07-28/basic/index.md))
- **SEP-2106:** `inputSchema`/`outputSchema` are loosened to allow **any 2020-12 keyword**. Previously the TS schema typed them as a narrow `{type:"object", properties, required}`. `structuredContent` may now be **any JSON value** (arrays, primitives, null), not only an object. `inputSchema` must still be an object schema, and the spec recommends `{type:"object", additionalProperties:false}` for a tool with no parameters. ([tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools.md))
- **`$ref`:** implementations MUST NOT auto-dereference network `$ref`s. Any fetch mode must be opt-in and should use an allowlist and block SSRF targets. A schema with an unresolved external `$ref` SHOULD be rejected rather than treated as permissive.
- **Composition-keyword DoS bounds:** implementations SHOULD bound depth, subschema count or validation time for `anyOf`/`oneOf`/`allOf`/`if-then-else`/`$defs`.
- **outputSchema:** servers MUST return conforming `structuredContent`, and clients SHOULD validate it. For backward compatibility, a server SHOULD also return the JSON serialized in a `TextContent` block.
- **`x-mcp-header`:** a new in-schema annotation that mirrors a primitive property (string, integer or boolean, not `number`) into an `Mcp-Param-{name}` HTTP header. Clients MUST drop a tool whose annotation is invalid. This is a new keyword a generator or validator must handle.
- **Elicitation `requestedSchema`** (unchanged restricted subset): a flat object of primitive properties only.
  - string: `title`, `description`, `minLength`, `maxLength`, `format` ∈ {email, uri, date, date-time}, `default`
  - number/integer: `minimum`, `maximum`, `default`
  - boolean: `default`
  - enum: `enum`; titled single-select via `oneOf:[{const,title}]`; multi-select via `type:array` with `items.enum` or `items.anyOf[{const,title}]` plus `minItems`/`maxItems`
  - No nesting, and no arrays of objects. Under MRTR, elicitation now travels inside `InputRequiredResult.inputRequests`. `elicitationId` and `notifications/elicitation/complete` are removed. ([elicitation](https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation.md))

### Official TypeScript SDK
| Package | Latest | Date | Validator deps |
|---|---|---|---|
| `@modelcontextprotocol/sdk` (v1 line) | 1.32.2 | 2026-10-23 | deps: `ajv ^8.17.1`, `ajv-formats`, `zod ^3.25 \|\| ^4.0`, `zod-to-json-schema`, `json-schema-typed`. Peer: `@cfworker/json-schema` ([npm](https://registry.npmjs.org/@modelcontextprotocol/sdk/latest)) |
| `@modelcontextprotocol/server` / `client` / `core` (v2) | 2.4.0 | 2026-10-23 | deps: `zod ^4.2.0` only. No peers. ([npm](https://registry.npmjs.org/@modelcontextprotocol/server)) |

v2 details ([upgrade guide](https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2.md)):
- `inputSchema`, `outputSchema` and `argsSchema` take **Standard Schema** objects (typed as `StandardSchemaWithJSON`). JSON Schema is obtained through **Standard JSON Schema** (`~standard.jsonSchema`). The guide names Zod v4, ArkType and Valibot as working.
- Zod v3 is dropped. Zod ≥4.2 self-converts. Zod 4.0–4.1 falls back to `z.toJSONSchema()` and loses `.describe()`.
- `fromJsonSchema()` wraps a raw JSON Schema object.
- Runtime validation is automatic: **AJV on Node**, **`@cfworker/json-schema` on workerd**. The validator is pluggable through `jsonSchemaValidator`, but that option does not reach schemas built with `fromJsonSchema`; those take a validator directly.
- Dialects: absent or 2020-12 validates as 2020-12, 2019-09 as 2019-09, and draft-06/07 as draft-07. Anything else is rejected.
- `client` and `server` keep a Zod-free public surface. Zod is still an internal dependency.
- Opportunity: a Standard-Schema + Standard-JSON-Schema validator plugs straight in, and a precompiled validator could stand in for the AJV runtime compile.

## 2. LLM structured output / strict tool-call JSON Schema subsets

Primary docs: [OpenAI](https://developers.openai.com/api/docs/guides/structured-outputs) · [Anthropic](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) · Gemini: [AI Studio guide](https://aistudio.google.com/docs/structured-output), [Nov 2025 JSON Schema blog](https://blog.google/technology/developers/gemini-api-structured-outputs/), [Vertex `responseSchema`](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/control-generated-output)

Legend: Y = supported/enforced · N = rejected (400) · I = accepted but ignored/stripped (not enforced) · ? = unverified

| Keyword / feature | OpenAI (strict) | Anthropic (`output_config.format` / `strict:true`) | Gemini API (`responseJsonSchema`) |
|---|---|---|---|
| root type | must be `object`, not `anyOf` | object | any (?) |
| `additionalProperties` | must be `false` | must be `false` (maps go to an array of `{key,value}`) | Y (since Nov 2025) |
| all props in `required` | **required** (optional = `T\|null`) | no; limit of 24 optional params total; required props are emitted first | no |
| `enum` | Y (≤1000 values total; >250 values capped at 15k chars) | Y (primitives only; casing not guaranteed) | Y |
| `const` | Y | Y | ? |
| `anyOf` | Y (not at root) | Y (≤16 union params per request) | Y |
| `oneOf` | N | N (not listed) | ? (not documented) |
| `allOf` | N | Y, but not with `$ref` | ? (not documented) |
| `not`, `if/then/else`, `dependent*` | N | N (not listed) | ? |
| `$ref` / `$defs` | Y (local) | Y (local; also `definitions`) | Y (local, `#`) |
| recursion | Y (`#` or `$defs`) | **N** | Y (recursive ref must be optional or nullable) |
| type arrays / `null` | Y | Y (counts as a union) | Y |
| `pattern` | Y | Y (no backreferences, lookaround or `\b`) | ? (not listed) |
| `format` | date-time, time, date, duration, email, hostname, ipv4, ipv6, uuid | same plus `uri` | Y (values ?; Vertex lists date, date-time, duration, time) |
| `minLength`/`maxLength` | N (strict) / ? | **N** (SDK moves it into the description) | I |
| `minimum`/`maximum` | Y (plus `exclusive*`, `multipleOf`) | **N** (SDK moves it into the description) | Y |
| `minItems`/`maxItems` | Y | `minItems` 0 or 1 only | Y |
| `prefixItems` | ? | ? | Y |
| `uniqueItems`, `contains`, `min/maxProperties` | ? | N | I |
| `patternProperties` | N (on fine-tuned models; ? on base) | N | ? |
| `default` | ? | Y | ? |
| size limits | 5,000 properties, depth 10, 120k chars of names/enums | 20 strict tools, 24 optional, 16 unions, 180 s compile timeout | "states, branching, depth" (no numbers) |
| unsupported-keyword behaviour | 400 error | 400 error | strips some keywords silently |

Notes:
- Anthropic's feature is GA (no beta header). It uses `output_config.format`; the old `output_format` needs the `structured-outputs-2025-11-13` header. The schema is cached for 24 h, so keep PHI out of enums and patterns.
- Gemini's older `responseSchema` (OpenAPI 3.0 subset, with `nullable` and `propertyOrdering`) still exists on Vertex, where unsupported fields are ignored. For Gemini function declarations, `parametersJsonSchema` is the JSON Schema path. The exact Gemini 4 keyword table is **unverified**: the current AI Studio page documents a `response_format` on the Interactions API.
- **Vercel AI SDK**: `ai@7.0.176` is latest. 7.0 shipped around 2026-06-25 (unverified, third-party source). Its peer is `zod ^3.25.76 || ^4.1.8`. `inputSchema` accepts Zod 3/4, Valibot, **Standard JSON Schema** objects, or raw `jsonSchema()` ([v7 tools docs](https://ai-sdk.dev/v7/docs/foundations/tools)). v6 made `strictJsonSchema` the default, with per-tool `strict` ([v6 migration](https://ai-sdk.dev/v5/docs/migration-guides/migration-guide-6-0)). v7 adds `contextSchema` and "stricter JSON Schema post-processing for Zod/Standard Schema" ([changelog](https://vercel.com/changelog/ai-sdk-7)). The per-provider keyword down-levelling rules are **unverified**.
- Implication: no provider accepts the full 2020-12 dialect. A generator that emits **per-provider projections** (OpenAI: all-required plus null unions; Anthropic: drop numeric and length constraints into the description, no recursion; Gemini: strip unenforced keywords) and then **re-validates locally with the full schema** fills a real gap. The Anthropic SDKs already do a narrow version of this.

## 3. Standard Schema / Standard JSON Schema
- **Spec:** `@standard-schema/spec` **1.1.0** (2025-12-15), which added `StandardJSONSchemaV1` and the base `StandardTypedV1`. Both carry `version: 1`. JSON Schema targets are `"draft-2020-12"`, `"draft-07"` (both strongly recommended), `"openapi-3.0"`, and any string. A library should throw on an unsupported target. ([standardschema.dev](https://standardschema.dev/json-schema), [npm](https://registry.npmjs.org/@standard-schema/spec))

| Implementer | Standard Schema | Standard JSON Schema | Latest (npm) |
|---|---|---|---|
| Zod | 3.24+ | **4.2+** (also Zod Mini) | 4.6.7 (2026-10-12) |
| Valibot | 1.0+ | 1.2 (via external function) | 1.5.0 |
| ArkType | 2.0+ | 2.1.28 | 2.2.9 |
| Effect Schema | 3.13+ via adapter; v4 has `Schema.toStandardSchemaV1` | v4 has `toStandardJSONSchemaV1`, marked "experimental" in its d.ts | effect 4.1.4 |
| TypeBox (`typebox` 1.x) | **not native**: no `~standard` in the 1.4.7 tarball | n/a (it *is* JSON Schema) | 1.4.7 |
| Others (SS) | yup 1.7+, joi 18+, typia 9.2+, VineJS 4+, Sury, decoders, Mongoose 9.7+, protovalidate-es, about 33 in all | VineJS 4.3+, Sury 11-alpha, stnl, GraphQL Std Schema | — |

| Consumer | Accepts | Source |
|---|---|---|
| tRPC, Hono middleware, Elysia, oRPC, TanStack Form, TanStack Router, React Hook Form, T3 Env, next-safe-action, RTK Query, Inngest, Restate, FastMCP, Muppet, xsMCP, xsAI, Nuxt UI | Standard Schema | [standardschema.dev/schema](https://standardschema.dev/schema) |
| **MCP TS SDK v2** | Standard Schema plus Standard JSON Schema (required for tools) | upgrade guide |
| **Vercel AI SDK 6/7** | Standard JSON Schema in `inputSchema` | ai-sdk.dev v7 |
| **NestJS** | `StandardSchemaValidationPipe` (in `@nestjs/common` 11.1.19+ types); NestJS 12 adds a `schema` option on `@Body/@Query/@Param` ([docs](https://docs.nestjs.com/techniques/validation)). The NestJS 12 decorator detail is **unverified** (secondary source). `@nestjs/common` 12.5.1 is latest. | |
| Listed Standard JSON Schema consumers | only xsAI, GQLoom and Restate are on the official list (MCP SDK and AI SDK are not listed, but do consume it) | standardschema.dev/json-schema |

## 4. API description specs
| Spec | Latest | Date | Notes |
|---|---|---|---|
| **OpenAPI** | **3.2.1** (3.2.0 shipped 2025-09-19) | 2026-09-10 | 3.2 adds: `QUERY` method plus `additionalOperations`; `in: querystring`; streaming/sequential media (`itemSchema`; SSE, jsonl, json-seq, multipart/mixed); `$self`; nested tags (`parent`, `kind`, `summary`); new cookie `style`. 3.2.1 is editorial (encoding clarifications, ABNF). There is no 3.3 or 4.0 (Moonwalk) release. ([releases](https://github.com/OAI/OpenAPI-Specification/releases)) |
| **Arazzo** | **1.1.0** | 2026-05-18 | Adds AsyncAPI v3 sources, JSONPath/XPath wherever JSON Pointer is allowed, `querystring` (OAS 3.2), `$self`, and inputs on success/failure actions. ([release](https://github.com/OAI/Arazzo-Specification/releases)) |
| **Overlay** | **1.2.0** | 2026-09-22 | 1.1 (2026-01-16): `copy` action, RFC 9535 JSONPath, primitive update/delete. 1.2: reusable `components.actions`, `$self`/`extends` rules. ([releases](https://github.com/OAI/Overlay-Specification/releases)) |
| **AsyncAPI** | **3.1.0** | 2026-01-31 | Minor, non-breaking (ROS 2 binding). ([release notes](https://www.asyncapi.com/blog/release-notes-3.1.0)) |
| **JSON Schema** | 2020-12 is still the current published dialect ([json-schema.org](https://json-schema.org/specification)) | — | The IETF WG draft `draft-ietf-jsonschema-json-schema` is at **-04 (Oct 2026)** ([datatracker](https://datatracker.ietf.org/doc/draft-ietf-jsonschema-json-schema/)). The "v1/2026" stable-release naming appears in spec-repo docs, but json-schema.org does not announce it: **unverified/not released**. Tools should keep targeting 2020-12. |

**Generators with OpenAPI 3.2 support** (primary evidence where available):
- **Kubb:** yes. QUERY method closed 2026-10-13. `itemSchema`/streaming and the remaining 3.2 fields merged 2026-11-05 ([#4541](https://github.com/kubb-labs/kubb/pull/4541)). Docs updated 2026-11-15.
- **Orval:** partial. HTTP `QUERY` support closed 2026-07-15 ([#3729](https://github.com/orval-labs/orval/issues/3729)). Other 3.2 fields: unverified.
- **openapi-typescript:** **no**. The "support for 3.2?" issue has been open since 2026-02-04 ([#2577](https://github.com/openapi-ts/openapi-typescript/issues/2577)).
- **openapi-generator:** **no** (parser gap). An open request from 2026-10-29 asks to parse 3.2 docs via a swagger-parser adapter ([#25477](https://github.com/OpenAPITools/openapi-generator/issues/25477)).
- **Swagger OSS tooling:** 3.2 support announced April 2026 ([blog](https://swagger.io/blog/swagger-launches-support-for-openapi-3-2-0/)). Swagger Studio: beta.
- **Redocly:** full support for lint, render and mock, but it is not a code generator ([blog](https://redocly.com/blog/openapi-3-2)).
- **Speakeasy, Scalar:** claimed in a third-party blog. **unverified**.
- **Hey API (`@hey-api/openapi-ts`):** **unverified** (repo search failed).
- Takeaway: among the major TS generators, only Kubb is clearly done. Full 3.2 support (QUERY, querystring, `itemSchema` SSE streams, `$self`) plus Arazzo 1.1 and Overlay 1.2 is an open lane.

## 5. TypeScript 7 (native Go port, "Corsa")
| Release | npm | Date |
|---|---|---|
| 7.0 RC | 7.0.1-rc | 2026-06-18 |
| **7.0 GA** | **7.0.2** (`latest`) | **2026-07-08** |
| 7.1 beta | 7.1.0-beta | 2026-10-20; the RC and stable dates of Nov 10/24 are **unverified** |
| nightly | 7.1.0-dev.20261117.1 | 2026-11-17 |

What it breaks for code generators and type-heavy validators ([7.0 RC post](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-rc/), [InfoQ](https://infoq.com/news/2026/08/typescript-7-released/), [7.1 beta](https://devblogs.microsoft.com/typescript/announcing-typescript-7-1-beta/)):
- **No programmatic API in 7.0.** Anything that `import ts from "typescript"` to read the AST or checker (ts-morph, typia transformers, ts-patch/custom transformers, contract-extraction-from-code tools, typescript-eslint type-aware rules, Vue/Svelte/Angular tooling) must pin `@typescript/typescript6` (`tsc6`, the 6.0 API via npm alias). **7.1 beta introduces a new API split into multiple entry points**, with a different shape from the Strada API, so an extractor needs a port. The stable 7.1 date is unverified.
- Custom transformers and compiler plugins have no equivalent in 7.0, which hurts AOT validators built on TS transformers (typia-style). Not documented in detail: **unverified** beyond "no API".
- **`stableTypeOrdering` is always on**, so union and declaration member order in emitted `.d.ts` and in error messages can differ from 5.x/6.x. Snapshot tests of generated types will churn.
- Removed or hard-errored options: `target es5`, `downlevelIteration`, `baseUrl`, `moduleResolution node/node10/classic`, `module amd/umd/systemjs/none`; `esModuleInterop`/`allowSyntheticDefaultImports`/`alwaysStrict` can't be `false`. New defaults: `strict`, `module esnext`, `types: []`, `rootDir ./`, `noUncheckedSideEffectImports`. Generated code and consumer tsconfigs must not rely on the removed options.
- JS/JSDoc checking now mirrors `.ts` (no Closure types, no `@enum`, no `@class`). This matters for generators that emit JSDoc-typed JS.
- Template-literal inference now works in **Unicode code points**, which breaks type-level string parsers that model UTF-16 units. Relevant to type-level route and regex parsers in validators.
- Type checking is claimed to match 6.0. Deep-instantiation limits and perf heuristics differ in the Go port: **unverified**. Benchmark type-heavy inference (`Infer<>` on large schemas) on both compilers.
- Performance is roughly 8–12x faster full checks (VS Code: 125.7 s → 10.6 s, secondary source).
