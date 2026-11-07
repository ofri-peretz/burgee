# Landscape — API contract tooling in JS/TS, 2026-11-06

Intent: [`intent.md`](./intent.md) · Roadmap: [`roadmap.md`](./roadmap.md) · **Status:** reading of
2026-11-06. Re-read before any claim that quotes a number here.

## How this was read

Weekly downloads: `curl https://api.npmjs.org/downloads/point/last-week/<pkg>`. Version and last publish:
`npm view <pkg> version time.modified`. 46 packages across OpenAPI, JSON Schema, GraphQL, protobuf/gRPC,
AsyncAPI, MCP and the TypeScript RPC frameworks. **Downloads overstate packages that others pull in**
(`ajv` arrives with the MCP SDK and most validators), so each row says whether teams pick it directly.
The competitor and ecosystem facts come from the sources at the end; where a fact is from memory and was
not re-read on this date, the row says so.

## The four layers

| Layer | What it does | Size (weekly downloads of its leaders) | Health | Who owns it |
| :-- | :-- | :-- | :-- | :-- |
| **Producers** — code → contract | Zod, TypeBox, NestJS, tRPC/oRPC code that *is* the contract, or emits one | very large: typebox 163M, zod-to-json-schema 95M, nestjs/swagger 11.5M, zod-to-openapi 7.7M | active | many, none dominant |
| **Consumers** — contract → code | Types and clients generated from a spec | large: openapi-typescript 15.4M, graphql-codegen 10.7M, hey-api 7.0M, json-schema-to-typescript 6.2M, orval 3.6M | **OpenAPI→TS stalled**; GraphQL and protobuf healthy | openapi-ts (quiet), hey-api, The Guild, Buf |
| **Runtime** — the protocol itself | Validators, clients, servers, SDKs | very large: ajv 518M, MCP SDK 88M, grpc-js 83M, graphql 70M | active | protocol owners |
| **Governance** — is the contract good, and did it change? | Lint, breaking-change diff, drift | **small**: Redocly CLI 4.2M + Spectral 2.3M; diff is Go (oasdiff) or archived (Optic) | lint healthy; **no TS diff** | Redocly, Stoplight; diff unowned in TS |

The product sits in the governance layer and makes it usable by agents, and enters through the consumer
layer, where the users already are (the openapi-typescript drop-in). Governance is the smallest layer
because nobody has made it cheap enough to run on every change. That is the bet, and it is why the
Phase 2 eval has to show agents benefit before the launch claims it.

## The top 20 by weekly downloads

| # | Package | Weekly | Last publish | Job | Picked directly | Our stance |
| --: | :-- | --: | :-- | :-- | :-: | :-- |
| 1 | ajv | 518,007,029 | 2026-04-24 | JSON Schema validation | mostly pulled in | Incumbent for `-guard` |
| 2 | @sinclair/typebox | 162,765,268 | 2026-07-16 | TS code that emits JSON Schema | partly | Input (code-first) |
| 3 | protobufjs | 122,869,268 | 2026-10-11 | protobuf runtime | pulled in | — |
| 4 | zod-to-json-schema | 94,673,756 | 2026-03-27 | Zod → JSON Schema | pulled in | Input (Zod 4 now converts natively) |
| 5 | @modelcontextprotocol/sdk | 88,065,412 | 2026-10-23 | MCP | ✓ | Input: the MCP adapter's source |
| 6 | @grpc/grpc-js | 82,989,631 | 2026-10-29 | gRPC runtime | ✓ | `check` call sites |
| 7 | graphql | 69,607,299 | 2026-11-04 | GraphQL runtime | ✓ | `check` call sites |
| 8 | @bufbuild/protobuf | 40,701,223 | 2026-11-05 | protobuf-es | ✓ | Read its descriptors |
| 9 | msw | 32,912,284 | 2026-11-06 | Mocking | ✓ | Out of scope; feed it a contract |
| 10 | openapi-types | 22,980,333 | **2023-05-24** | Types of OpenAPI documents | pulled in | **Stale**: `/core` exports a compatible, current set |
| 11 | swagger-ui-dist | 17,849,492 | 2026-09-16 | Docs UI | ✓ | Out of scope |
| 12 | openapi3-ts | 16,287,057 | 2026-07-28 | OpenAPI document builder | partly | Input |
| 13 | openapi-fetch | 15,897,028 | **2026-06-15** | Client on openapi-typescript's types | ✓ | **Output contract**: must keep working on `gen` |
| 14 | **openapi-typescript** | **15,430,085** | **2026-06-15** | OpenAPI → TS types | ✓ | **Primary drop-in target** |
| 15 | graphql-request | 13,072,633 | **2025-12-12** | GraphQL client | ✓ | `check` call sites |
| 16 | @nestjs/swagger | 11,540,963 | 2026-11-06 | NestJS code → OpenAPI | ✓ | Input (code-first) |
| 17 | @graphql-codegen/cli | 10,654,882 | 2026-11-05 | GraphQL codegen | ✓ | Owner; read its schema |
| 18 | @connectrpc/connect | 8,588,816 | 2026-10-27 | Connect RPC | ✓ | `check` call sites |
| 19 | @apollo/client | 8,391,399 | 2026-11-05 | GraphQL client | ✓ | `check` call sites |
| 20 | @trpc/server | 8,050,873 | 2026-11-06 | TS-only RPC, the contract is the code | ✓ | Input (code-first) |

## The rest of the 46

| Package | Weekly | Last publish | Layer | Our stance |
| :-- | --: | :-- | :-- | :-- |
| @apidevtools/swagger-parser | 7,909,263 | 2026-09-20 | consumer (parse, `$ref`) | `/core` replaces it for our own use |
| @asteasolutions/zod-to-openapi | 7,690,606 | 2026-07-19 | producer | Input |
| @hey-api/openapi-ts | 7,014,670 | 2026-09-30 | consumer | Competitor for the openapi-typescript audience |
| json-schema-to-typescript | 6,169,053 | 2026-08-28 | consumer | `/jsonschema` drop-in target; maintained |
| swagger-ui-express | 5,631,390 | **2024-05-31** | runtime (docs) | Out of scope |
| @hono/zod-openapi | 4,329,023 | 2026-09-04 | producer | Input |
| @redocly/cli | 4,194,718 | 2026-10-28 | governance (lint) | Lint incumbent; Phase 6 only |
| orval | 3,626,379 | 2026-10-30 | consumer | Competitor; SDK-shaped, not a target |
| @orpc/server | 3,052,316 | 2026-11-06 | producer | Input |
| ts-proto | 2,413,977 | 2026-11-04 | consumer | Owner for protobuf → TS |
| @stoplight/spectral-cli | 2,308,762 | 2026-11-06 | governance (lint) | Ruleset format to read in Phase 6 |
| @scalar/api-reference | 2,266,752 | 2026-11-05 | runtime (docs) | Out of scope; possible sponsor |
| @openapitools/openapi-generator-cli | 2,054,508 | 2026-10-20 | consumer (Java engine) | Out of scope (SDKs) |
| swagger-jsdoc | 1,996,502 | 2026-05-22 | producer | Input |
| zod-openapi | 1,935,466 | 2026-08-31 | producer | Input |
| @asyncapi/parser | 1,820,481 | 2026-10-16 | consumer (parse) | AsyncAPI adapter's reference parser |
| gql.tada | 1,334,581 | 2026-10-02 | consumer | `check` reads its documents |
| @pact-foundation/pact | 998,141 | 2026-09-07 | governance (consumer tests) | Out of scope |
| @ts-rest/core | 990,329 | **2025-06-02** | producer | Input |
| express-openapi-validator | 697,146 | 2026-01-20 | runtime (validation) | `-guard` comparison |
| tsoa | 576,787 | 2025-12-14 | producer | Input |
| @kubb/core | 504,858 | 2026-11-06 | consumer | Competitor; SDK-shaped |
| @stoplight/prism-cli | 326,862 | 2026-07-17 | runtime (mock) | Out of scope |
| quicktype | 251,742 | 2026-07-20 | consumer | Not a target |
| openapi-backend | 197,198 | 2026-10-28 | runtime | Input |
| @asyncapi/modelina | 191,973 | 2026-09-01 | consumer | AsyncAPI codegen incumbent |
| @asyncapi/cli | 94,668 | 2026-11-02 | consumer + governance | AsyncAPI diff and agent surface are open |

## Every protocol, and where we add value

The goal is to cover every protocol where `apicontract` adds value. "Covered" does not mean
reimplementing what an owner already does well. Where an owner has a good engine, `apicontract`
reads its output and adds the parts that are missing: one command across every protocol in a repo,
an agent surface (`--json`, `--mcp`, `fix:` lines), and code call-site checks.

| Protocol | Owner's tools | `gen` | `explain` | `diff` | `check` (call sites) |
| :-- | :-- | :-- | :-- | :-- | :-- |
| OpenAPI 3.0–3.2 | openapi-typescript (stalled), hey-api, oasdiff (Go) | **ours** (drop-in) | **ours** | **ours**, oasdiff ids | **ours** |
| JSON Schema | json-schema-to-typescript, ajv | **ours** (drop-in) | **ours** | **ours** | — |
| MCP tools | MCP SDK; v0.1 diff tools (mcpdiff, mcp-lint, …) | **ours** (typed tool clients) | **ours** | **ours** | **ours** (`callTool`) |
| AsyncAPI (WebSocket, SSE, Kafka, MQTT, AMQP) | @asyncapi/cli, Modelina | Modelina's job; read it | **ours** | **ours**, direction-aware | **ours** (emit/on) |
| Code-first (Zod, TypeBox, NestJS, tRPC/oRPC, Hono) | the frameworks | — (the code is the contract) | **ours** | **ours**, across git refs with no spec file | **ours** |
| protobuf / gRPC / Connect | Buf (`buf breaking`, protobuf-es), ts-proto | owner's | **ours** | wrap `buf breaking`, add the agent surface ‡ | **ours** |
| GraphQL | The Guild (graphql-codegen, graphql-inspector) | owner's | **ours** | wrap graphql-inspector, add the agent surface ‡ | **ours** (gql documents) |
| OpenRPC (JSON-RPC) | small | **ours** | **ours** | **ours** | **ours** |
| CloudEvents / Avro | schema registries | owner's | **ours** | **ours**, registry modes | — |
| burgee CLIs | burgee `--schema` | — | **ours** | **ours** (dogfood) | — |

‡ From memory, not re-read on 2026-11-06: `buf breaking` is Buf's breaking-change check for protobuf,
and graphql-inspector is The Guild's schema diff. Phase 5 reads both before wrapping them.

## What the landscape says

1. **The entry is OpenAPI-in-TypeScript, and the reason is maintenance, not features.** openapi-typescript
   and openapi-fetch last published 2026-06-15, openapi-types 2023-05-24, swagger-ui-express 2024-05-31,
   ts-rest 2025-06-02. GraphQL and protobuf ship weekly. The vacuum is specific.
2. **The governance layer is small and has no TS diff.** Redocly and Spectral lint; oasdiff (Go) diffs
   OpenAPI only; Optic was archived on 2026-01-12. Nothing diffs MCP, AsyncAPI or code-first contracts
   with one model.
3. **Code-first is bigger than spec-first.** Producers (typebox, zod-to-json-schema, nestjs/swagger,
   zod-to-openapi) outweigh consumers. Many teams have no spec file. Diffing a Zod- or Nest-defined API
   across two git refs is a job nothing does. This moves the code-first input up the roadmap.
4. **MCP is the fastest-moving protocol here** (SDK at 88M a week) and its contract tooling is a handful
   of v0.1 tools in Go, Python and JS. Phase 3 stands.
5. **Owners exist for protobuf and GraphQL.** Cover them through their engines and add the cross-protocol
   and agent layer, not a rewrite.
6. **Commercial vendors fund the OSS but do not maintain it.** Speakeasy and Zuplo are Gold sponsors of
   openapi-typescript, which still went quiet after 2026-02-27. Speakeasy sells SDK and MCP-server
   generation and sponsors free type generation as a funnel. Staying out of SDK generation keeps
   `apicontract` sponsorable by the same vendors (Speakeasy, Stainless, Zuplo, Scalar) instead of
   competing with them.

## Competitor review — where the value is significant

Read 2026-11-06 by three parallel reviews (generators; lint, diff and docs; testing, runtime and
agent tools), each citing its sources. "Significant" means a user of that tool has a concrete reason
to add or switch to `apicontract`; where the answer is no, we read the tool's output or rules
instead of competing.

| Tool | What it covers of ours | Our significant value | Verdict |
| :-- | :-- | :-- | :-- |
| openapi-typescript (+ openapi-fetch) | `gen` | Maintained drop-in on TS 7 and OAS 3.2, migration codemod, plus `diff`/`explain`. Maintenance mode since 2026-09-19 ([#2874](https://github.com/openapi-ts/openapi-typescript/issues/2874)); fork `openapi-typesafe` (2026-11-02) is courting the same users | **Yes** |
| @hey-api/openapi-ts | `gen`, Zod/Valibot validators | Stable on TS 7 ([#4235](https://github.com/hey-api/hey-api/issues/4235)), `diff`/`check` | Partial: types-only users |
| orval, kubb | `gen`, Zod, MCP server generation | `diff`, `check`, `explain` alongside them; both already on TS 7, kubb on OAS 3.2 | Partial: we complement |
| json-schema-to-typescript | `gen` | Draft 2019-09/2020-12, discriminated unions, one engine shared with OpenAPI and MCP | **Yes** for TS schema users |
| @asyncapi/modelina | `gen` (payload models) | Typed channels and messages; AsyncAPI `diff`; no release in a year | **Yes** for TS |
| Redocly CLI | `lint`; experimental `diff` (2026-10-28) for OpenAPI 3.x and AsyncAPI 3 | Mode choice (backward/forward/full, caller/server), MCP and JSON Schema, code-first across git refs, `check` | Partial: it just entered diff |
| oasdiff (Go) | OpenAPI `diff` with the best rules; hosted MCP; paid PR gate | npm-native, every protocol, code-first, mode choice, a local MCP that resolves `$ref`s | Partial: not on OpenAPI rule quality |
| Atlassian openapi-diff | OpenAPI 2/3 `diff`, ~240k/wk, no release since 2025-08 | OAS 3.1/3.2, JSON output, accepts its flags | **Yes** |
| Optic | archived 2026-01-12, ~85k/wk still installing | `diff`/`lint` with a migration note | **Yes** |
| @asyncapi/diff | AsyncAPI `diff` by a fixed path table: any payload edit is breaking, no send/receive direction | Semantic payload diff with direction | **Yes** |
| Spectral, vacuum | `lint` | Nothing in lint | No: read Spectral rulesets |
| buf breaking, graphql-inspector | their protocol's `diff` | One envelope, agent surface, `check` | Only as spawned engines (R9b) |
| Pact / PactFlow bi-directional | consumer-vs-provider check; paid, OAS ≤ 3.1.0, single file | Static, free `check` from source; every protocol | Partial: not its `can-i-deploy` broker |
| Specmatic | contract tests (running server); non-OpenAPI checks in Enterprise | Free AsyncAPI/GraphQL/gRPC compatibility with no server (its #679) | **Yes** for TS teams |
| Schemathesis, Prism, Dredd | fuzzing / proxy validation / conformance — all need a running server | `check`, `diff`, agent surface | No: they complement |
| ajv, TypeBox, zod 4 | the validators `guard` would race | WebSocket/MCP messages, OAS 3.2 | No as a lead: `guard` is Phase 6 with a cut rule |
| mcpdiff, mcp-lint | MCP `diff`/`lint`, strong rules, near-zero users | Reach, every protocol, MCP mode | Partial: their rules are our floor |
| OpenAPI→MCP servers (Stainless, Speakeasy Gram, Postman, ivo-toby, openapi-mcp-generator) | call the live API | `explain`: exact, local, resolved, size-capped | **Yes**: none of them explains |
| kadykov schema-explorer, janwilmake | one operation per request | Fully resolved (kadykov leaves `$ref`s as links), exact and local (janwilmake is hosted LLM summaries) | **Yes** |
| apibreak (2026-09, early access) | caller-side vendor-spec diff, calls in docs | AST scan with oxc, every protocol, code-first | **Yes**: confirms the need |
| Speakeasy, Fern/Postman, Forge | SDK generation; Speakeasy also lint + diff | Lint/diff with no account and no AGPL | Partial; Forge and Scalar are the sponsor candidates now that Stainless's generator closed (2026-05-18) |

**What only we do, after this review:** one model across OpenAPI, AsyncAPI, JSON Schema and MCP;
`diff` of code-first contracts across git refs with no spec file; a chosen compatibility mode and
side; a static, free call-site `check`; and an agent-sized, fully resolved `explain` that runs
locally. "Direction-aware diff" alone is no longer ours: Redocly, oasdiff and openapi-diff all read
request versus response.

## Spec ↔ code landscape (2026-11-07)

Downloads are npm, the week to 2026-11-06. Throughput figures from blogs disagree, so they are used
as a ranking only.

| Area | Incumbents | State | Where we win |
| :-- | :-- | :-- | :-- |
| Runtime schema | zod 4 (455M/wk), valibot (32M), typebox (16M + 162M `@sinclair`), arktype (2.9M), effect Schema, typia (0.5M), ajv (521M) | Interop moved to Standard Schema (`@standard-schema/spec` 190M/wk; NestJS 12, tRPC, oRPC take it). No Zod-API drop-in has gained traction (dhi is the latest attempt) | AOT validators from the model, plain-interface types (cheap `tsc`), exact JSON Schema 2020-12 round trip, agent-readable errors |
| Zod migration | `@valibot/zod-to-valibot` (beta, 28/wk), `zod-to-json-schema` (95M), `z.toJSONSchema` | Exports lose refinements and transforms silently | Zod as code-first input, plus a codemod that reports every unexpressible site |
| NestJS from a spec | openapi-generator `typescript-nestjs-server` (beta), hey-api Nest plugin (beta, signatures only), @fresha (17/wk) | Nothing stable or regeneration-safe; nothing for AsyncAPI | Abstract bases (regeneration touches no user code), Standard Schema validation, gateway + microservice from one AsyncAPI document, a contract test per operation |
| Code → spec | @nestjs/swagger (11.6M), @hono/zod-openapi (4.3M), oRPC (3.0M), trpc-to-openapi, tsoa (stale since 2025-12), Effect HttpApi, Elysia | One framework each, HTTP only | One extractor across frameworks and protocols, round-trip verified |
| Contract-first frameworks | ts-rest (**archived 2026-10-26**), fastify-openapi-glue (regeneration-safe, Fastify only), TypeSpec `http-server-js` (preview) | The regeneration-safe ones never cover NestJS or AsyncAPI | — |

Targets to measure, not results: `tsc` on a 500-endpoint spec ≤ 20% of zod output's time and
instantiations; 100% round trip on JSON-Schema-Test-Suite 2020-12; ≥ 80% of typia's throughput
without a compiler plugin; per-schema bundle under zod/mini's; 0 user lines changed by regeneration;
100% operations with a contract test.

## Sources

- npm registry and downloads API, read 2026-11-06 (commands above).
- [openapi-typescript#2841](https://github.com/openapi-ts/openapi-typescript/issues/2841),
  [#2843](https://github.com/openapi-ts/openapi-typescript/issues/2843), and the
  [README sponsor list](https://github.com/openapi-ts/openapi-typescript).
- [openapi-typescript-codegen wiki](https://github.com/ferdikoomen/openapi-typescript-codegen/wiki) and
  [Speakeasy's migration guide](https://www.speakeasy.com/docs/sdks/languages/typescript/migrating-from-oss.md).
- [Optic is dead (FlareCanary)](https://dev.to/flarecanary/optic-is-dead-what-now-for-api-drift-detection-2kb8),
  [API schema drift tools compared](https://dev.to/flarecanary/api-schema-drift-detection-tools-compared-2026-1ib4).
- [mcpdiff v0.1.0](https://github.com/celaldrg/mcpdiff/releases/tag/v0.1.0),
  [mcp-lint](https://github.com/robert19001-cmyk/mcp-lint),
  [mcp-tools-lint](https://github.com/nawaaaaaAaar/mcp-tools-lint).
- [OpenAPI linters in a real test](https://dev.to/albinator/openapi-linters-which-one-is-the-best-in-a-real-test-1n2j).
- [Standard JSON Schema](https://standardschema.dev/json-schema), [oRPC contract-first](https://orpc.dev/docs/contract-first).
