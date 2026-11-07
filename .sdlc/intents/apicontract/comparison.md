# apicontract — feature comparison

Date: 2026-11-07. Sources: [`spec.md`](./spec.md), [`landscape.md`](./landscape.md),
[`roadmap.md`](./roadmap.md), and the three competitor reviews of 2026-11-06 (generators;
governance, lint and diff; testing, runtime and MCP), each citing its own sources. Facts added on
2026-11-07 cite their URL inline; npm figures added that day come from
`api.npmjs.org/downloads/point/last-week/<pkg>` (week to 2026-11-06) and `npm view`.

## Summary

The field is crowded in three places: OpenAPI → TypeScript generation (openapi-typescript, hey-api,
orval, kubb, all with large install bases), OpenAPI lint (Spectral, Redocly, vacuum and others read
nearly the same rulesets), and runtime validators (zod, valibot, typebox, arktype and ajv, now
interoperable through Standard Schema). OpenAPI breaking-change diff is also well served: oasdiff has
the best rules, and Redocly shipped an experimental `diff` on 2026-10-28. The field is empty in
four places. No tool applies governance rules to the code that implements a contract. No tool diffs a
code-first contract (Zod, NestJS, Hono) across two git refs without a spec file. No tool lets you choose
the compatibility mode (backward, forward, full) and the side (caller or server). No tool checks client
call sites in source against the contract. Five planned features have no incumbent at all: contract-aware
lint on implementing code with forwards-only adoption (R-BL3, R-BL6, R-BL7), code-first diff across refs,
mode and side choice in `diff` (R3), the static call-site `check` (R10), and a regeneration-safe NestJS
generator covering OpenAPI and AsyncAPI (R-NE).

## How to read the tables

- ✓ does it. ◐ partial, beta, paid-only, or one framework only (a numbered note says why). ✗ does not.
  `?` not verified (a note says what is unknown). `—` does not apply.
- The `apicontract` column gives the phase where the feature lands, since nothing ships yet: `Ph1` to
  `Ph7` are the phases in [`roadmap.md`](./roadmap.md); `W1` to `W4` are the technology-extension waves.
  `cut` means a rejected alternative in [`spec.md`](./spec.md); `—` means not planned.
- Weekly downloads are npm, the week to 2026-11-05 unless noted.

## Feature matrix

### (a) Spec → code generators

| Feature | openapi-typescript | hey-api | orval | kubb | openapi-generator | quicktype | json-schema-to-typescript | Fern / Speakeasy | apicontract |
| :-- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-- |
| OpenAPI 3.0 input | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | Ph1 |
| OpenAPI 3.1 input | ✓ | ✓ | ?¹ | ✓ | ◐² | ✗ | ✗ | ◐³ | Ph1 |
| OpenAPI 3.2 input | ✗⁴ | ✗⁵ | ?¹ | ✓ | ?⁶ | ✗ | ✗ | ✗ Fern⁷, ? Speakeasy | Ph1 |
| AsyncAPI input | ✗ | ✗ | ✗ | ✗⁸ | ✗ | ✗ | ✗ | ✗⁹ | Ph3 |
| JSON Schema 2020-12 input | ? | ? | ? | ? | ? | ◐¹⁰ | ◐¹¹ | ? | Ph1 |
| Other inputs | — | Swagger 2.0 | Swagger 2.0 | Swagger 2.0 | Swagger 2.0 | JSON samples, GraphQL, TS | — | ? | MCP Ph3; OpenRPC Ph5 |
| TypeScript types | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Ph2 (W1) |
| Clients / SDKs | ◐¹² | ✓ | ✓ | ✓ | ✓ (~50 languages) | ✗ | ✗ | ✓ | cut |
| Zod / validator output | ✗ | ✓ Zod, Valibot | ✓ Zod | ✓ Zod | ? | ? | ✗ | ? | Ph2 Zod (W1); Ph3 Standard Schema |
| NestJS server code | ✗ | ◐¹³ | ✗ | ✗ | ◐¹⁴ | ✗ | ✗ | ? | Ph3 (W1) |
| Hono / Fastify / Express server code | ✗ | ◐¹⁵ | ◐ Hono | ? | ? | ✗ | ✗ | ? | Ph4 (W2) |
| Regeneration-safe server code | — | ✗¹³ | ? | ? | ✗¹⁴ | — | — | ? | Ph3 (R-NE1) |
| MSW mocks | ✗ | ✗¹⁶ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | cut |
| MCP server generation | ✗ | ✗¹⁷ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ Speakeasy | cut |
| Code → spec | ✗ | ✗ | ✗ | ✗ | ✗ | ◐¹⁸ | ✗ | ✗ | Ph3 |
| Round trip verified | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | Ph3 (R-RT) |
| Breaking-change diff | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ◐¹⁹ | Ph1 |
| Lint / validate | ✗ | ✗ | ✗ | ✗ | ◐ basic | ✗ | ✗ | ◐²⁰ | Ph7 |
| Plugin API | ✗ | ✓ 20+ plugins | ? | ✓ | ? | ? | ✗ | ? | Ph1 (R-EX) |
| Agent surface (MCP, skill, JSON) | ✗ | ✗ | ✗ | ✓²¹ | ✗ | ✗ | ✗ | ◐²² | Ph1 (R-A) |
| Size-capped spec slices for agents | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | Ph1 (R7) |
| Offline, no account | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ◐²³ | Ph1 |
| Runtime / install weight | ? | ? | ? | ? | needs Java | ? | ? | ? | family-only deps (R-DEP1) |
| TypeScript 7 | ✗²⁴ | ◐²⁵ | ✓ | ✓ | ? | ? | ? | ? | Ph2 (string emitter) |
| License | MIT | MIT | MIT | MIT | Apache-2.0 | Apache-2.0 | MIT | Apache-2.0 / AGPLv3 | — |
| Status | maintenance | slowed | active | active | active | revived | slow | active | — |
| Weekly downloads | 15.43M | 7.01M | 3.63M | 505k (core) | 2.05M | 252k (core 858k) | 6.17M | 302k (Fern) | — |

1. orval's README says "OpenAPI 3.x and Swagger 2.0"; 3.1 and 3.2 were not checked separately.
2. openapi-generator: 3.1 is partial, with open 3.1 `$ref` bugs (#22753, #21535).
3. Speakeasy describes an "OpenAPI 3.X toolchain"; Fern's 3.1 coverage was not checked.
4. openapi-typescript silently drops 3.2 `QUERY` operations (#2577, 31 reactions).
5. hey-api: 3.2 is open (#2660, 44 reactions; #2921).
6. openapi-generator: 3.2 not checked; 3.1 is still partial.
7. Fern: 3.2 is an open issue (#9559).
8. kubb: AsyncAPI is proposed only (#3629).
9. Forge (Cloudflare) plans AsyncAPI, GraphQL and protobuf inputs; Fern and Speakeasy were not checked.
10. quicktype reads JSON Schema but has open `$id`/`$ref` (#964) and union (#2213) bugs.
11. json-schema-to-typescript targets the draft-04 era; draft-06+ is its top issue (#120, open since 2017).
12. openapi-typescript emits types only; the client is the separate openapi-fetch.
13. hey-api's Nest plugin is beta and emits signatures only ([`landscape.md`](./landscape.md)).
14. openapi-generator's `typescript-nestjs-server` is beta and not regeneration-safe ([`landscape.md`](./landscape.md)).
15. hey-api ships a Fastify plugin; Hono is its second most-reacted request (#1483, 194 reactions).
16. MSW is hey-api's most-reacted request (#1486, 372 reactions).
17. hey-api: MCP is requested only (#4359).
18. quicktype accepts TypeScript as input, but for model conversion, not API operations.
19. Speakeasy has `openapi diff` (with an open panic, #1464); Fern's CLI reference shows no diff.
20. `fern check` validates links and examples; Speakeasy lints.
21. kubb: an MCP server that drives generation, a Claude Code integration, and `@kubb/mcp` (94k a week).
22. Speakeasy: `speakeasy agent setup-skills` and the Gram MCP gateway; Fern not checked.
23. Speakeasy's lint and diff are pitched against "a platform account or AGPL" in our notes; the exact
    account requirement was not verified.
24. openapi-typescript builds output with `ts.factory`, which TypeScript 7 does not ship (#2841).
25. hey-api: the fix is only on the `@next` prerelease (2026-09-30); stable 0.99.0 is broken (#4235).

### (b) Runtime schema and validators

| Feature | zod 4 | valibot | typebox | arktype | effect Schema | typia | ajv | apicontract |
| :-- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-- |
| Standard Schema | ✓ | ✓ | ?¹ | ✓ | ✓¹ | ? | ? | Ph3 (R-SC1) |
| Standard JSON Schema | ✓ 4.2+² | ✓ 1.2+² | ? | ✓ 2.1.28+² | ? | ? | — | Ph3 (R-SC1) |
| JSON Schema 2020-12 output | ✓ | ✓³ | ✓ | ? | ? | ? | — | Ph3 |
| OpenAPI 3.0 output | ✓⁴ | ? | ? | ? | ? | ? | — | Ph3 |
| JSON Schema → validator (input) | ◐⁵ | ✗⁶ | ✓⁷ | ◐⁸ | ? | ? | ✓ | Ph3 |
| Knows which operation a payload belongs to | ✗ | ✗ | ✗ | ✗ | ? | ? | ✗ | Ph3 |
| Errors carry the spec location | ✗ | ✗ | ✗ | ✗ | ? | ? | ✗ | Ph3 (R-SC3) |
| Ahead-of-time compiled | ? | ? | ◐ JIT | ? | ? | ✓⁹ | ◐¹⁰ | Ph3 (R-SC1) |
| WebSocket / MCP message validation | ◐¹¹ | ◐¹¹ | ◐¹¹ | ◐¹¹ | ◐¹¹ | ◐¹¹ | ◐¹¹ | Ph3 |
| Contract diff over its schemas | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | Ph3 |
| TypeScript 7 | ? | ? | ? | ? | ? | ?¹² | ? | Ph1 |
| Status | active | active | active | active | active | active | active | — |
| Weekly downloads | 453M | 31.9M | 163M + 16.3M | 2.8M | 68.4M (`effect`)¹³ | 507k¹³ | 518M | — |
| Migration into apicontract | `migrate --from zod` Ph3 | reader Ph3 (W3) | reader Ph3 (W3) | reader Ph3 (W3) | — | — | — | — |

1. [Tesseron's SDK docs](https://brainblend-ai.github.io/tesseron/sdk/typescript/standard-schema/) list
   Zod, Valibot, ArkType, Effect Schema and TypeBox as Standard Schema v1 implementers; TypeBox was not
   confirmed in its own docs, so it stays `?`. ArkType co-authored the spec with Valibot and Zod
   ([ArkType docs](https://arktype.io/docs/integrations.md)).
2. Minimum versions for Standard JSON Schema per
   [TanStack AI's docs](https://tanstack.com/ai/latest/docs/reference/type-aliases/SchemaInput.md).
3. valibot: output through the separate `@valibot/to-json-schema` (8.3M a week).
4. `z.toJSONSchema()` targets draft 2020-12, 07, 04 and `openapi-3.0`; many types (date, bigint,
   transform) cannot be represented.
5. `z.fromJSONSchema()` is experimental; third-party `zod-from-json-schema` (4.2M a week) and
   `json-schema-to-zod` (3.7M a week) show the demand.
6. No JSON Schema → valibot package exists on npm.
7. typebox 1.x `Schema.Compile()` JIT-compiles raw JSON Schema, draft 3 to 2020-12.
8. `@ark/json-schema` is 0.0.13, pre-1.0, 9.3k a week.
9. typia compiles validators with a compiler plugin ([`landscape.md`](./landscape.md) targets "≥ 80% of
   typia's throughput without a compiler plugin").
10. ajv JIT-compiles and has standalone code; ESM standalone is an open request (#2209, 32 reactions).
11. Any validator can check a message payload, but none knows the channel, direction or tool it belongs to.
12. typia depends on a compiler transform and TypeScript 7 ships without a JS API (the cause of
    openapi-typescript #2841); its TypeScript 7 status was not checked.
13. Read 2026-11-07 from the npm downloads API; typia is 15.3.0. Effect Schema ships inside `effect`, so
    the figure overstates Schema use; the older `@effect/schema` package has 2.1M a week.

### (c) Code → spec

| Feature | @nestjs/swagger | zod-to-openapi | @hono/zod-openapi | tsoa | oRPC | trpc-to-openapi | apicontract |
| :-- | :-: | :-: | :-: | :-: | :-: | :-: | :-- |
| OpenAPI 3.0 output | ✓¹ | ✓² | ✓³ | ✓⁴ | ✓⁵ | ?⁶ | Ph3 |
| OpenAPI 3.1 output | ?¹ | ✓² | ✓³ | ✗⁴ | ✓⁵ | ?⁶ | Ph3 |
| OpenAPI 3.2 output | ? | ✓² | ? | ✗⁴ | ✓ default⁵ | ?⁶ | Ph3 |
| AsyncAPI output | ✗ | ✗ | ✗ | ✗ | ?⁷ | ✗ | Ph3 |
| JSON Schema 2020-12 output | ? | ? | ? | ? | ? | ? | Ph3 |
| Schema source | decorators; Standard Schema¹ | Zod 4² | Zod | TS types | Zod, Valibot, ArkType, Standard JSON Schema⁵ | Zod 4⁶ | any reader (R-EX) |
| NestJS | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | Ph3 (W1) |
| Hono | ✗ | ◐⁸ | ✓ | ✗ | ? | ◐ example⁶ | Ph4 (W2) |
| Express / Fastify | ✗ | ◐⁸ | ✗ | ◐ Express only⁴ | ? | ✓⁶ | Ph4 (W2) |
| tRPC / oRPC | ✗ | ✗ | ✗ | ✗ | ✓ oRPC | ✓ tRPC | Ph4 (W2) |
| Contract-first too (spec → code) | ✗ | ✗ | ✗ | ✗ | ✓⁹ | ✗ | Ph2–Ph3 |
| Runtime request validation | ? | ✗⁸ | ◐³ | ✓⁴ | ? | ✓ (tRPC parsers)⁶ | Ph3 (R-SC) |
| Round trip verified | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | Ph3 (R-RT) |
| Diff across git refs, no spec file | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | Ph3 |
| Entry points checked against the spec | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | Ph4 (R-TE3) |
| Status | active | active | active | stale since 2025-12 | active | active | — |
| Last publish | 2026-11-06 | 2026-07-19 | 2026-09-04 | 2025-12-14 (7.0.0-alpha.0)¹⁰ | 2026-11-06 | 2026-11-01¹⁰ | — |
| Weekly downloads | 11.5M | 7.69M | 4.33M | 577k | 3.05M (`@orpc/server`) | 512k¹⁰ | — |
| Migration into apicontract | `migrate --from` Ph3 | `migrate --from` Ph3 | reader Ph3 | — | reader Ph3 | reader Ph3 | — |

1. The [NestJS OpenAPI docs](https://docs.nestjs.com/openapi/introduction) say the spec is generated from
   decorators and that Nest's Standard Schema conversion targets `openapi-3.0`; 3.1 is not mentioned there.
2. [zod-to-openapi README](https://github.com/asteasolutions/zod-to-openapi): generators for 3.0, 3.1 and
   3.2; Zod 4 from v8, Zod 3 only on v7.3.4.
3. [@hono/zod-openapi README](https://github.com/honojs/middleware/tree/main/packages/zod-openapi): 3.0
   through `app.doc()` and 3.1 through `app.doc31()`; request bodies are validated only for JSON and form
   media types.
4. [tsoa README](https://github.com/lukeautry/tsoa): OpenAPI 2.0 or 3.0; Express 4 and 5, Hapi and Koa;
   validates request payloads. Fastify is not listed.
5. [oRPC OpenAPI docs](https://orpc.dev/docs/openapi/openapi-specification): 3.2.0 by default, older
   versions by downgrading; Standard JSON Schema is the fallback converter.
6. [trpc-to-openapi README](https://github.com/mcampa/trpc-to-openapi): "supports all OpenAPI versions"
   without naming them; Zod 4 only; Express, Next.js, Fastify, Nuxt, Node HTTP, plus a Hono example.
7. oRPC's OpenAPI docs do not mention AsyncAPI.
8. zod-to-openapi is framework-agnostic: it builds a document from Zod schemas you register, and does no
   request validation itself.
9. [oRPC contract-first](https://orpc.dev/docs/contract-first).
10. Read 2026-11-07 with `npm view` and the npm downloads API.

### (d) Diff and breaking changes

| Feature | oasdiff | openapi-diff | Redocly diff | Optic | Bump.sh | apibreak | buf breaking | graphql-inspector | apicontract |
| :-- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-- |
| OpenAPI 3.0 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | Ph1 |
| OpenAPI 3.1 | ✓ | ?¹ | ✓ | ? | ✓ | ? | — | — | Ph1 |
| OpenAPI 3.2 | ✓ | ? | ?² | ? | ? | ? | — | — | Ph1 |
| Swagger 2.0 | ? | ✓ | ◐² | ? | ✓ | ✓ | — | — | — |
| AsyncAPI | ✗ | ✗ | ◐ 3 only | ✗ | ✓ 2.x, 3.x | ✗ | — | — | Ph3 |
| JSON Schema | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | — | — | Ph1 |
| MCP tool schemas | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | — | — | Ph3 |
| GraphQL | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | Ph5 (wraps it, R9b) |
| protobuf | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | Ph5 (wraps it, R9b) |
| Code-first across git refs, no spec | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ◐³ | ◐⁴ | Ph3 |
| Request vs response aware | ✓ | ✓ | ✓⁵ | ? | ? | ? | —³ | ✓⁶ | Ph1 |
| Mode choice (backward / forward / full) | ✗⁷ | ✗ | ✗⁸ | ? | ? | ✗ | ◐⁹ | ✗ | Ph1 (R3) |
| Side choice (caller / server) | ✗⁷ | ✗ | ✗⁸ | ? | ? | ◐ caller only | — | ✗ | Ph1 (R3) |
| Usage-aware (only what callers use) | ✗ | ✗ | ✗ | ✗ | ✗ | ✓¹⁰ | ✗ | ✓¹¹ | Ph4 (R10) |
| Git refs as input | ✓ | ? | ? | ? | ✗ | ✓ | ✓ | ? | Ph1 |
| Semver verdict (changeset) | ? | ✗ | ✓¹² | ? | ? | ? | ✗ | ✗ | Ph1 (`--changeset`) |
| Stable rule ids | ✓ | ? | ✓ 27 rules | ? | ? | ? | ✓ | ✓ | Ph1 (oasdiff ids, R4) |
| SARIF | ? | ? | ✗¹² | ? | ? | ? | ? | ? | Ph1 |
| PR annotations / comments | ✓¹³ | ? | ✓¹² | ? | ? | ? | ? | ✓¹⁴ | Ph1 |
| Fails CI on a breaking change | ? | ? | ✓ `--fail-on` | ✓ | ? | ? | ? | ? | Ph1 (exit 1) |
| Agent surface (MCP) | ◐¹⁵ | ✗ | ◐¹⁶ | ✗ | ◐¹⁷ | ✗ | ?¹⁸ | ✗ | Ph1 (R-A6) |
| Offline, no account | ✓ | ✓ | ✓ | ✓ | ✗¹⁹ | ✓ | ✓ | ✓ | Ph1 |
| npm install | ✗²⁰ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (Go binary) | ✓ | Ph1 |
| Runtime deps | Go binary | ? | ? | ? | ? | zero | Go binary | ? | family-only (R-DEP1) |
| Paid tier | Pro $100/mo PR gate | — | platform $249+/mo | — | $50–$120/mo | — | BSR | Hive | — |
| Status | active | stale (2025-08-06) | experimental (2026-10-28) | archived 2026-01-12 | active | early access | active | active | — |
| Weekly downloads | not on npm | 240k | 4.19M (whole CLI) | 85.4k²¹ | 359k | 20 | 3.72M | 507k (cli), 1.64M (core) | — |

1. openapi-diff: OpenAPI 3 support is confirmed; 3.1 was not checked (Bitbucket tracker not read).
2. Redocly's 27 rules cover "OpenAPI 3.x" and AsyncAPI 3; other formats only get minor or patch. 3.2 was
   not checked separately.
3. protobuf `.proto` is the source by nature; wire compatibility is symmetric, so there is no request/response split.
4. graphql-inspector loads schemas from SDL, introspection or code files.
5. Redocly derives direction from data flow: readOnly counts as response, writeOnly as request, and a
   component takes its direction from where it is referenced.
6. graphql-inspector marks input-type changes breaking or dangerous through the type system.
7. oasdiff's perspective is fixed to "a consumer that followed the old contract".
8. Redocly diff: "No option selects a perspective".
9. buf's FILE, PACKAGE, WIRE_JSON and WIRE categories are strictness levels, not a direction.
10. apibreak filters vendor-spec changes to the endpoints you declare you call, and scans Markdown for
    calls the spec does not support; it does not scan source with an AST.
11. graphql-inspector `considerUsage` needs Hive (hosted usage data).
12. Redocly diff rates major/minor/patch with `--check-version` and `next-version`; outputs json, markdown,
    html and github-actions.
13. oasdiff: GitHub Action free; a per-change approve/reject gate in PRs is Pro.
14. graphql-inspector has an Action and a GitHub App; its top issues are CI integration bugs (#1978, #2062, #2780).
15. oasdiff: a hosted MCP server (`api.oasdiff.com/mcp`) that takes specs as text and does not resolve external `$ref`s.
16. Redocly: a docs MCP server per published project, not a CLI tooling server.
17. Bump.sh: hosted MCP servers built from Arazzo workflow docs, not a diff tool.
18. buf links an MCP page that returned 404 when checked.
19. `bump diff` calls the Bump.sh API.
20. The `oasdiff` npm name is a reserved placeholder; it ships through GitHub releases, brew and Docker.
21. Week to 2026-11-05; [`landscape.md`](./landscape.md) read 76,588 on 2026-11-07.

### (e) Governance and lint

| Feature | Spectral | Redocly lint | vacuum | Zally | IBM validator | Optic | 42Crunch | Postman | apicontract |
| :-- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-- |
| OpenAPI 3.0 | ✓ | ✓ | ✓ | ✓¹ | ? | ✓ | ✓² | ? | Ph7 (lint); Ph4 (`check`) |
| OpenAPI 3.1 | ✓ | ? | ✓ | ? | ? | ? | ?² | ? | Ph7; Ph4 |
| OpenAPI 3.2 | ✗ | ? | ✓ | ? | ? | ? | ? | ? | Ph7; Ph4 |
| AsyncAPI | ✓ 2.x | ✓ | ✓ 3 | ? | ? | ✗ | ? | ? | Ph7; Ph4 |
| Arazzo | ✓ | ✓ | ✓ | ? | ? | ✗ | ? | ? | — |
| MCP tool descriptions | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ?³ | ?³ | Ph7 (one ruleset with OpenAPI) |
| Reads Spectral rulesets | ✓ | ✗ own format | ✓ | ◐⁴ | ✓⁴ | ✗ | ✗ | ? | Ph4 (R-BL9) |
| Custom rules / plugins | ✓ | ✓ | ✓ | ? | ? | ✓ `optic.yml` | ✗ | ? | Ph1 API, Ph4 rules (R-BL3) |
| Direction-aware rules | ? | ? | ✗⁵ | ? | ? | ? | ? | ? | Ph1 (R3) |
| Forwards-only (only new or changed operations) | ? | ? | ? | ? | ? | ✓⁶ | ? | ? | Ph4 (R-BL6) |
| Rules reach implementing code | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | Ph4 (R-BL3) |
| Findings point at a handler line | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | Ph4 (R-BL7) |
| Spec and code drift in one PR | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | Ph4 (R-BL8) |
| Breaking-change diff | ✗ | ✓ (experimental) | ◐⁷ | ✗ | ✗ | ✓ | ✗ | ? | Ph1 |
| SARIF | ? | ✓ | ? | ? | ? | ? | ? | ? | Ph1 (`diff`), Ph4 (`check`) |
| Baseline file | ? | ? | ? | ? | ? | ? | ? | ? | Ph4 (R-CI2) |
| Quality / security score | ✗⁸ | ? | ? | ? | ? | ✗ | ✓⁹ | ? | — |
| Agent surface | ✗ | ◐¹⁰ | ◐¹¹ | ✗ | ✗ | ✗ | ? | ◐¹² | Ph1 (R-A) |
| Offline, no account | ✓ | ✓ | ✓ | ? | ✓ | ✓ | ✗⁹ | ✗¹² | Ph1 |
| Status | maintained, slow triage¹³ | active | active | ?¹ | active | archived 2026-01-12 | commercial | commercial | — |
| Weekly downloads | 2.31M | 4.19M (whole CLI) | 78.8k | — | 61.8k (+ ruleset 639k)¹⁴ | 85.4k | — | — | — |

1. [Zally](https://opensource.zalando.com/zally/) covers OpenAPI 2 and 3 with Zalando's guideline rules. A
   third-party aggregator reports a last GitHub push on 2026-07-08; maintenance was not confirmed.
2. [42Crunch docs](https://docs.42crunch.com/latest/content/tasks/audit_api_security.htm): static audit of
   OpenAPI v2 and v3; 3.1 was not confirmed.
3. [`landscape.md`](./landscape.md) groups 42Crunch, Postman and Snyk agent-scan as governing "spec / MCP
   descriptions"; which of the two each covers was not split out.
4. [`landscape.md`](./landscape.md) groups vacuum, Zally and IBM validator as "Spectral-compatible rules";
   Zally's own rule format was not checked. IBM's `@ibm-cloud/openapi-ruleset` is a Spectral ruleset.
5. vacuum: "Response vs Request directionality distinction" is an open issue (#667).
6. Optic applied rules only to new or changed operations; [`spec.md`](./spec.md) R-BL6 copies it for code.
7. The same author's `openapi-changes` diffs OpenAPI 3.0–3.2 and AsyncAPI 3 across git history.
8. Spectral: customizable scoring is an open PR (#2353, 22 reactions).
9. 42Crunch scores an audit (≥ 70 is the usual bar before a scan) and needs an API token from its platform
   ([WSO2 docs](https://apim.docs.wso2.com/en/3.2.0/learn/api-security/configuring-api-security-audit/)).
10. Redocly: docs MCP, `llms.txt`, an AI Assistant and Reviewer (early access) on the paid platform.
11. vacuum: an agent `test` command (v0.34) and an "agentic AI output" mode in pb33f's docs generator.
12. Postman MCP server (16.3k a week) needs a Postman account or API key; spec governance needs an enterprise plan.
13. Spectral: SmartBear-owned; 10 issues closed in 2026; a community fork appeared in July 2026.
14. Read 2026-11-07 from the npm downloads API; `ibm-openapi-validator` 1.38.8 published 2026-11-04.

### (f) Testing, mocking and traffic

| Feature | Schemathesis | Specmatic | Prism | Pact / PactFlow | MSW generators | Dredd | apicontract |
| :-- | :-: | :-: | :-: | :-: | :-: | :-: | :-- |
| Works with no running server | ✗ | ◐¹ | ◐² | ◐³ | ✓ | ✗ | Ph1 (static by design) |
| OpenAPI 3.1 | ✓ | ? | ✓ | ◐ 3.1.0 only³ | ? | ✗⁴ | Ph1 |
| OpenAPI 3.2 | ✓ | ? | ? | ✗³ | ? | ✗ | Ph1 |
| AsyncAPI | ✗ | ◐ Enterprise | ✗ | ◐⁵ | ✗ | ✗ | Ph3 |
| GraphQL | ✓ | ◐ Enterprise | ✗ | ◐ plugin | ✗ | ✗ | Ph5 (wrapped) |
| gRPC | ◐ unary | ◐ Enterprise | ✗ | ◐ plugin | ✗ | ✗ | Ph5 (wrapped) |
| MCP servers | ✗ | ✓ MCP Auto Test | ✗ | ✗ | ✗ | ✗ | Ph3 |
| Fuzz / property-based tests | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | — |
| Mocking / stubs | ✗ | ✓ | ✓ | ✓ consumer mock | ✓⁶ | ✗ | cut |
| Consumer-driven contracts, `can-i-deploy` | ✗ | ✗ | ✗ | ✓ Broker | ✗ | ✗ | cut |
| Live traffic validation | ✓ | ✓ | ✓ proxy | ◐ Drift⁵ | ✗ | ✓ | ◐ in-process validators Ph3 (R-SC) |
| Traffic capture → spec | ✗ | ✗ | ✗ | ◐⁷ | ✗ | ✗ | — |
| Version-to-version compatibility | ✗ | ✓ `compare` (OpenAPI in OSS) | ✗ | ✗ | ✗ | ✗ | Ph1 |
| Static call-site check from source | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | Ph4 (R10) |
| Multi-file `$ref` | ? | ? | ◐⁸ | ✗³ | ? | ? | Ph1 |
| Agent surface (MCP) | ? | ✗ | ✗ | ◐⁹ | ✗ | ✗ | Ph1 |
| Offline, no account | ✓ | ✓ OSS | ✓ | ◐³ | ✓ | ✓ | Ph1 |
| Status | active | active | active (last 2026-07-17) | active | ? | archived 2024-11-08 | — |
| Weekly downloads | ~1.36M (PyPI) | 16.9k (npm wrapper) | 327k | 998k | 385k `openapi-msw`, 41k `msw-auto-mock`¹⁰ | 12.6k | — |

1. Specmatic's `compare` is static; its contract tests need a live server, and "run without a live
   server" is an open issue (#679).
2. Prism's mock mode serves itself; its validation proxy needs the real server.
3. Pact verification needs the provider running; bi-directional contract testing is static once the
   provider self-verifies, but is SaaS-only, OAS 2.0/3.0.x/3.1.0, single bundled file, no discriminator mapping.
4. Dredd's OpenAPI 3 support was always experimental.
5. PactFlow Drift added AsyncAPI 2.x/3.x in August 2026; Cloud-only and needs a running provider. Pact v4
   plugins cover message interactions.
6. MSW generators from OpenAPI: `openapi-msw`, `msw-auto-mock`, and the MSW output of orval and kubb.
7. SmartBear MCP can generate Pact tests from traffic, using PactFlow Cloud credits.
8. Prism: `allOf` `$ref` request validation is broken (#2575).
9. SmartBear MCP (`@smartbear/mcp`): test generation and review; AI tools need PactFlow Cloud credits.
10. Read 2026-11-07 from the npm downloads API; `msw-auto-mock` 0.32.1 last published 2026-04-18. Their
    feature sets were not reviewed.

### (g) MCP tooling

| Feature | MCP Inspector | Snyk agent-scan | mcp-lint | mcp-tools-lint | mcpdiff | MCP registry | apicontract |
| :-- | :-: | :-: | :-: | :-: | :-: | :-: | :-- |
| Reads a live server | ✓ | ✓¹ | ✓ | ? | ✓ | ✗ | Ph3 (R9) |
| Snapshot file input | ✗ | ? | ✓ `tools.json` | ? | ✓ | ✗ | Ph3 (`snapshot`) |
| Git revision input | ✗ | ✗ | ? | ? | ✓ | ✗ | Ph3 |
| Breaking-change diff | ✗ | ✗ | ✓ | ? | ✓ | ✗ | Ph3 |
| Direction-aware input / output rules | ✗ | ✗ | ? | ? | ✓ | ✗ | Ph3 |
| Annotation weakening, description drift | ✗ | ✗ | ? | ? | ✓ | ✗ | Ph3 (mcpdiff rules as the floor) |
| Per-client compatibility lint | ✗ | ✗ | ✓ 8 clients | ? | ✗ | ✗ | Ph3 (mcp-lint rules as the floor)² |
| Tool poisoning / prompt injection scan | ✗ | ✓¹ | ✗ | ? | ✗ | ✗ | — |
| Interactive debugging | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | — |
| CI outputs | ◐ CLI for CI | ? | SARIF | ? | text, JSON, markdown, GitHub annotations | — | Ph1 (SARIF, `--json`) |
| Offline, no network | ✓ | ✗¹ | ✓ | ? | ✓ | — | Ph1 |
| Typed `callTool` call-site check | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | Ph4 (R10) |
| Same engine as OpenAPI and AsyncAPI | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | Ph3 |
| Status | active | active | active (one maintainer) | tiny | one release (0.1.0, 2026-07-17)³ | active | — |
| Weekly downloads | 771k | PyPI, ? | 1,175 | ? | 5 | — | — |

1. Snyk acquired Invariant Labs in June 2025 and renamed mcp-scan to Snyk Agent Scan; it checks for
   prompt injection, tool poisoning, tool shadowing and toxic flows, launches stdio servers to read their
   tools, and sends tool names and descriptions to Snyk's API
   ([GitHub](https://github.com/snyk/agent-scan), [AppSec Santa](https://appsecsanta.com/mcp-scan),
   [Rubinlake](https://rubinlake.com/en/technology-radar/ai-security-and-governance/agent-scan)).
2. [`roadmap.md`](./roadmap.md) Phase 3 matches mcp-lint's rule set; the testing review said the
   per-client matrix was not planned. The roadmap wins; the per-client matrix needs a confirmed owner.
3. The two reviews cite different repos (`celaldrg/mcpdiff` in [`landscape.md`](./landscape.md),
   `samlader/mcpdiff` in the testing review); which is canonical was not checked.

## Per tool: what it does, what it is missing

### Spec → code generators

- **openapi-typescript (+ openapi-fetch).** Best at one small `.d.ts` per spec that openapi-fetch
  consumes; 15.4M a week. Missing: TypeScript 6 and 7 (#2723, 97 reactions; #2841), OAS 3.2 (#2577),
  file upload (#1214), enum + union (#941). **Maintenance mode** since 2026-09-19 (#2874). Path:
  `gen --compat openapi-typescript` and `migrate --from openapi-typescript` (Ph2, R6, R-C3), graded by
  its own snapshot suite (R-C2). The fork `openapi-typesafe` (2026-11-02) chases the same users.
- **@hey-api/openapi-ts.** Best at types plus SDKs with 20+ plugins (TanStack Query, Zod, Valibot,
  Fastify). Missing: stable TypeScript 7 (#4235), OAS 3.2 (#2660), MSW (#1486, 372 reactions), Hono
  (#1483), Effect (#2082); users report locked PRs. **Slowed** (last main commit 2026-09-30). Path:
  `migrate --from hey-api` for types-only users (Ph2, R-C3); SDK and plugin users stay.
- **orval.** Best at clients and hooks for React, Vue, Svelte and Angular Query, SWR, Hono, plus MSW and
  an MCP-server generator. Missing: nothing major (22 open issues; TanStack v6 #4030). **Active.** Path:
  `migrate --from orval` (Ph2, R-C3); more likely it runs beside `diff` and `check`.
- **kubb.** Best at breadth: OAS 2.0–3.2, TypeScript 7, clients, hooks, Faker, MSW, Cypress, and an MCP
  server that drives generation. Missing: AsyncAPI (proposed, #3629), 3.2 leftovers (#4542), multi-spec
  dedup (#3660). **Active.** Path: none planned; we complement it with `diff`, `check`, `explain`.
- **openapi-generator.** Best at SDKs in about 50 languages. Missing: correct `anyOf`/`oneOf`/`allOf`
  (#10514, 93 reactions), readOnly/writeOnly (#4190), full 3.1; needs Java. **Active** (5,824 open
  issues). Path: none; TypeScript-types-only users can move to `gen` (Ph2), and `apicontract-nest` (Ph3)
  replaces its beta `typescript-nestjs-server`.
- **quicktype.** Best at models in 20+ languages from JSON samples, JSON Schema, GraphQL or TypeScript.
  Missing: schema `pattern` (#1194), `oneOf` merging (#2213), `$ref` dedup (#1833); not operation-aware.
  **Revived** July 2026 after seven quiet months. Path: none; different job.
- **json-schema-to-typescript.** Best at a simple JSON Schema → `.d.ts` with a programmatic `compile()`.
  Missing: draft-06+ (#120, open since 2017), discriminated unions (#343), `allOf` + `required` (#395),
  duplicate types (#510). **Slow** (16.0.0 on 2026-08-28 after a gap since 2025-01). Path: a `/jsonschema`
  drop-in (Ph1–Ph2, [`landscape.md`](./landscape.md)); needs a programmatic API.
- **Fern / Speakeasy.** Best at commercial-grade SDKs and docs; Speakeasy also lints and diffs, and runs
  the Gram MCP gateway. Missing: Fern OAS 3.2 (#9559); Speakeasy diff panics (#1464), Zod 4 MCP schemas
  (#2008). **Active**; Fern is Postman's since 2026-01-07, Speakeasy's generator went AGPLv3 on
  2026-09-17. Path: none; SDKs are cut. Sponsor candidates, along with Cloudflare Forge.
- **@asyncapi/modelina** (not in the matrix). Payload models from AsyncAPI, OpenAPI or JSON Schema in many
  languages; no channel or operation typing, CVE in a dependency (#2636). **No release since 2025-10-19.**
  Path: AsyncAPI `gen` via `apicontract-nest` and W3 extensions (Ph3, Ph5).

### Runtime schema and validators

- **zod 4.** Best at ergonomics and reach (453M a week), with native `z.toJSONSchema()`. Missing: stable
  JSON Schema input (`fromJSONSchema` experimental), contract awareness; top issues are API wishes
  (#2893, #3884). **Active.** Path: Zod as code-first input to `apicontract-extract` and
  `apicontract-schema migrate --from zod` (Ph3, R-SC4), graded on Zod's suite (R-C2).
- **valibot.** Best at small bundles; Standard Schema co-author. Missing: any JSON Schema → valibot
  package. **Active.** Path: reader through Standard Schema (Ph3), `apicontract-valibot` (W3, Ph5).
- **typebox.** Best at being JSON Schema already, with a JIT compiler for draft 3 to 2020-12 that
  benchmarks at or above ajv. Missing: operation routing, diff, agent surface. **Active**; 1.x is ESM-only.
  Path: reader (Ph3), `apicontract-typebox` (W3, Ph5).
- **arktype.** Best at TypeScript-syntax schemas; Standard Schema co-author. Missing: stable JSON Schema
  input (`@ark/json-schema` 0.0.13). **Active.** Path: reader (Ph3), `apicontract-arktype` (W3, Ph5).
- **effect Schema.** Ships inside `effect` (68.4M a week); listed as a Standard Schema implementer. Not
  reviewed in depth. Path: none planned beyond Standard Schema input.
- **typia.** Best at raw throughput through compile-time validators. Missing: not reviewed; its compiler
  transform makes TypeScript 7 a question. **Active** (15.3.0, 2026-11-06). Path: none; our throughput
  target is ≥ 80% of typia's without a compiler plugin.
- **ajv.** The engine under most OpenAPI validators (518M a week). Missing: OpenAPI awareness,
  type inference with nullable (#1664, #2163), ESM standalone (#2209). **Active.** Path: none;
  `apicontract-schema` replaces it only for our own use (R-DEP1).

### Code → spec

- **@nestjs/swagger.** Best at NestJS decorators → OpenAPI; 11.5M a week. Missing: AsyncAPI, spec → code,
  and 3.1 is not documented. **Active.** Path: `extract --from nest` and `migrate --from @nestjs/swagger`
  (Ph3, R-C3), graded by its fixtures (R-C2).
- **zod-to-openapi.** Best at Zod → OpenAPI 3.0, 3.1 and 3.2 with no framework lock-in. Missing:
  AsyncAPI, request validation, any route discovery. **Active.** Path: `migrate --from zod-to-openapi`
  (Ph3, R-C3).
- **@hono/zod-openapi.** Best at one Hono route definition that both validates and documents. Missing:
  validation only for JSON and form bodies; Hono only. **Active.** Path: Hono reader (Ph3) and
  `apicontract-hono` (W2, Ph4).
- **tsoa.** Best at TypeScript types → OpenAPI and routes for Express, Hapi and Koa. Missing: 3.1, 3.2,
  Fastify. **Stale** (7.0.0-alpha.0 on 2025-12-14). Path: none planned; `apicontract-express` (W2, Ph4)
  covers its framework.
- **oRPC.** Best at contract-first and code-first in one, emitting OpenAPI 3.2 by default from Zod,
  Valibot, ArkType or Standard JSON Schema. Missing: AsyncAPI is not documented. **Active.** Path: reader
  (Ph3), `apicontract-trpc` (W2, Ph4).
- **trpc-to-openapi.** Best at exposing tRPC procedures as REST with a spec. Missing: Zod 4 only; Fetch
  and Workers adapters "soon". **Active** (3.5.0, 2026-11-01). Path: reader (Ph3), `apicontract-trpc` (W2, Ph4).

### Diff and breaking changes

- **oasdiff.** Best OpenAPI rules: request/response checks, fingerprints, stability levels, composed
  mode, 3.0–3.2. Missing: npm package, AsyncAPI, JSON Schema, MCP, code-first, perspective choice;
  hosted MCP does not resolve external `$ref`s; open precision work (#1128, #924, #1383). **Active.** Path:
  oasdiff rule ids in every finding (R4) and its fixtures as the grading corpus (R-C2), Ph1.
- **openapi-diff (Atlassian).** Request/response-aware OpenAPI 2/3 diff on npm, 240k a week. Missing:
  releases since 2025-08-06; 3.1 not confirmed. **Stale.** Path: `diff` accepts its flags (Ph1).
- **Redocly diff.** Inside the 4.2M-a-week CLI: 27 rules, direction by data flow, semver verdict,
  OpenAPI 3.x and AsyncAPI 3. Missing: perspective choice ("No option selects a perspective"), JSON
  Schema, MCP, code-first. **Experimental** since 2026-10-28. Path: `check` reads Redocly's lint config
  (R-BL9, Ph4); no diff migration planned.
- **Optic.** Diff, forwards-only lint and traffic capture for OpenAPI. Missing: everything going forward;
  open dependency issues (#2889, #2850). **Archived** 2026-01-12, still ~85k a week; the founder offers to
  bless a community fork (#2891). Path: `check` reads `optic.yml` (R-BL9, Ph4); [`landscape.md`](./landscape.md)
  plans an `optic diff` → `apicontract diff` migration note, which has no requirement id yet.
- **Bump.sh.** Hosted docs, changelog and diff for OpenAPI and AsyncAPI 2/3, plus hosted MCP servers.
  Missing: local diff (`bump diff` calls its API); open issues are minor (#588, #787). **Active**, paid.
  Path: none; it is a docs platform.
- **apibreak.** Caller-side diff of vendor specs filtered to the endpoints you call, plus a Markdown
  call-site scan; zero deps. Missing: AST source scan, other protocols. **Early access** (20 a week).
  Path: none needed; it confirms the `check` need (Ph4).
- **buf breaking.** protobuf breaking rules in four strictness categories, against git or the BSR.
  Missing: a cross-protocol envelope; its pains are generation, not breaking (#3060). **Active.** Path:
  spawned from the user's install and wrapped (R9b, Ph5).
- **graphql-inspector.** Breaking/dangerous/safe GraphQL diff with usage-aware rules via Hive. Missing:
  CI integration polish (#1978, #2062, #2780, #2058). **Active.** Path: wrapped (R9b, Ph5).
- **@asyncapi/diff** (not in the matrix). Fixed JSON-pointer table: any payload edit is breaking, 31
  unclassified entries, no send/receive direction; the CLI needs 1,700 deps (#1752). **Active.** Path:
  AsyncAPI `diff` (Ph3).
- **openapi-changes (pb33f)** (not in the matrix). OpenAPI 3.0–3.2 and AsyncAPI 3 diff across git history,
  with TUI and HTML reports. Missing: direction in its rule config. **Active.** Path: none.

### Governance and lint

- **Spectral.** The ruleset format everyone reads; OpenAPI 2–3.1, AsyncAPI 2, Arazzo. Missing: 3.2,
  scoring (#2353), overrides on external `$ref` files (#2195); no MCP. **Maintained, slow triage**, forked
  July 2026. Path: `check` reads `.spectral.yaml` (R-BL9, Ph4); `lint` parity in Ph7.
- **Redocly lint.** The default linter (4.2M a week) with plugins, SARIF, bundling and docs. Missing: rules
  on code; pains are minor (#1035). **Active.** Path: `check` reads its config (R-BL9, Ph4).
- **vacuum.** Fast Go linter, Spectral-compatible, OpenAPI 3.0–3.2, AsyncAPI 3, Arazzo, JSON Schema, LSP.
  Missing: direction-aware rules (#667). **Active** (daily releases). Path: none; reads Spectral rulesets,
  as we will.
- **Zally.** Zalando's OpenAPI 2/3 linter with its API-guideline rules. Missing: not reviewed. Status not
  confirmed (last push 2026-07-08 per a third-party aggregator). Path: none.
- **IBM validator.** Spectral-based ruleset and CLI (`@ibm-cloud/openapi-ruleset` 639k a week). Missing:
  not reviewed. **Active** (1.38.8, 2026-11-04). Path: through Spectral rulesets (R-BL9, Ph4).
- **42Crunch.** Security audit with a score, then a conformance scan. Missing: offline use; needs a
  platform token; 3.1 not confirmed. **Commercial**, free tier. Path: none.
- **Postman.** Spec governance and an MCP server (100+ tools) inside Postman workspaces. Missing: git-native
  specs; MCP server pains (#162, #181, #154). **Commercial.** Path: none.

### Testing, mocking and traffic

- **Schemathesis.** Property-based fuzzing from OpenAPI 2.0–3.2, GraphQL and gRPC, with stateful
  workflows. Missing: needs a running server; tracker is healthy. **Active.** Path: none; complement.
- **Specmatic.** Contract tests, stubs and `compare` for OpenAPI; MCP Auto Test. Missing: AsyncAPI,
  GraphQL and gRPC are Enterprise; run without a live server (#679); false positives (#2791, #2788).
  **Active.** Path: none; `diff` covers its OSS compare for TypeScript teams.
- **Prism.** Mock server and validation proxy, OAS 2.0–3.1. Missing: ARM64 Docker (#1966), multipart
  (#2008), `allOf` `$ref` (#2575), proxy start (#2763). **Active** (last release 2026-07-17). Path: none;
  mocking is cut.
- **Pact / PactFlow.** Consumer-driven contracts with the Broker and `can-i-deploy`; plugins for gRPC,
  GraphQL, messages. Missing: BDCT is paid, OAS ≤ 3.1.0, single file; header parsing (#1058). **Active.**
  Path: none; `check` (Ph4) replaces BDCT only for single-repo teams.
- **MSW generators.** Mock handlers from OpenAPI (`openapi-msw`, `msw-auto-mock`, orval, kubb). Not
  reviewed in depth. Path: none; we feed them a contract.
- **Dredd.** Conformance tests against a running server. Missing: OAS 3 beyond experimental, Java hooks
  (#875). **Archived** 2024-11-08, still 12.6k a week. Path: none; successors are Schemathesis or Specmatic.

### MCP tooling

- **MCP Inspector.** Interactive debugger with web UI, CLI and TUI (771k a week). Missing: diff, lint,
  contract checks. **Active.** Path: none; complement.
- **Snyk agent-scan.** Security scan of MCP configs for tool poisoning, prompt injection and toxic flows.
  Missing: offline mode (sends tool descriptions to Snyk). **Active.** Path: none; not planned.
- **mcp-lint.** Per-client compatibility rules for 8 clients, diff, SARIF, offline. Missing: reach (1
  star). **Active.** Path: its rule set is the Phase 3 floor.
- **mcp-tools-lint.** Small MCP linter. Not reviewed. Path: none.
- **mcpdiff.** Feature-complete MCP diff: direction-aware rules, annotation weakening, description drift,
  live, snapshot or git input, stable rule ids. Missing: reach (5 a week, one release). Path: its rule set
  is the Phase 3 floor; if one MCP diff tool clearly leads before Phase 3, we adopt its snapshot format
  ([`roadmap.md`](./roadmap.md)).
- **MCP registry.** Server metadata (`server.json`), not tool schemas. Path: none; tool-schema snapshots
  and gating have no incumbent here beyond mcpdiff and mcp-lint.
- **OpenAPI → MCP servers** (Stainless, Gram, Postman, ivo-toby, openapi-mcp-generator) all call the live
  API; the static explorers (kadykov leaves `$ref`s as links and lacks 3.1; janwilmake is hosted LLM
  summaries) are small. None documents a token cap. Path: `explain` (Ph1, R7).

## Gaps no one fills

Ranked by how much of a user's job they unlock and how empty the field is.

1. **Governance rules on implementing code, selected through the contract.** "Every `security: admin`
   handler calls the audit hook" has no tool; all governance stops at the spec or at live traffic. R-BL1,
   R-BL3, R-BL7, Ph4.
2. **Code-first contract diff across git refs, no spec file.** Many teams have no spec; nothing diffs a
   Zod-, NestJS- or Hono-defined API between two commits. `apicontract-extract` + `diff`, Ph3.
3. **Compatibility mode and side as a choice.** oasdiff, openapi-diff and Redocly each fix one consumer
   perspective; no tool offers forward, full or the server's view. R3, R-Q1, Ph1.
4. **Static call-site check from source.** Only apibreak scans Markdown; Pact BDCT is paid and limited.
   R10, R-TE3, Ph4.
5. **Regeneration-safe NestJS from OpenAPI and AsyncAPI.** Both incumbents are beta; nothing covers
   AsyncAPI or gateway + microservice from one document. R-NE1 to R-NE4, Ph3 (W1).
6. **Forwards-only adoption for code rules.** Optic did it for specs and is archived; nobody does it for
   code. R-BL6, Ph4.
7. **One model across OpenAPI, AsyncAPI (semantic, directional), JSON Schema and MCP.** JSON Schema and
   MCP diffs have no general tool; AsyncAPI diff is a pointer table. R1, Ph1 (OpenAPI, JSON Schema), Ph3
   (AsyncAPI, MCP).
8. **A local, fully resolved, size-capped operation slice for coding agents.** Every OpenAPI → MCP tool
   invokes the API; none sizes a spec slice to a budget. R7, R-A5, Ph1.
9. **Spec and code drift in one PR diff.** R-BL8, Ph4.
10. **Round trip verified both ways.** No code → spec or spec → code tool proves `extract(gen(spec))`
    equals the spec. R-RT1 to R-RT3, Ph3.
11. **A contract map that scopes existing linters.** oxlint and ESLint overrides aimed at generated files
    and user-owned handlers. R-BL1, R-BL4, Ph4.
12. **Owners' engines under one envelope.** `buf breaking` and graphql-inspector verdicts with SARIF, MCP
    and `fix:` lines beside OpenAPI. R9b, Ph5.

Nearly empty, not empty: a maintained openapi-typescript drop-in on TypeScript 7 and OAS 3.2 (the
`openapi-typesafe` fork and kubb compete; R6, Ph2), and MCP tool-schema diff in CI (mcpdiff and mcp-lint
exist with near-zero users; Ph3).

## Where we are behind

| Incumbent strength | Who has it | Our position | Intentional or risk |
| :-- | :-- | :-- | :-- |
| SDKs in many languages | openapi-generator, Fern, Speakeasy, hey-api, orval, kubb | Not built | Intentional (cut): their market, and it keeps us sponsorable |
| Client hooks and plugin ecosystems (TanStack, SWR, Faker) | hey-api, orval, kubb | Not built | Intentional: complement, not compete |
| MCP-server generation from a spec | orval, kubb, Speakeasy, Stainless (closed) | Not built | Intentional (cut) |
| Hosted docs, changelog pages, portals | Redocly, Bump.sh, Scalar, Fern | Not built | Intentional (out of scope: no hosted service, no UI) |
| Mocking and stubs | Prism, MSW generators, Specmatic, Pact | Not built | Intentional (cut) |
| Consumer-driven contracts and `can-i-deploy` | Pact / PactFlow | Not built | Intentional (cut); a gap for multi-repo orgs |
| Fuzzing and live conformance | Schemathesis, Specmatic, Dredd | In-process validators only (Ph3) | Intentional: complement |
| Traffic capture into a spec | Optic (archived) | Not planned | Risk: Optic users who relied on `capture` have no path from us |
| OpenAPI rule precision built over years | oasdiff | oasdiff rule ids and corpus from Ph1 | Risk: matching its rules alone is not a reason to switch |
| Paid PR approval gate and audit trail | oasdiff Pro | Not planned | Risk, small: CI exit codes and SARIF only |
| Speed of a Go linter with daily releases | vacuum | Ph7 lint, on request | Intentional: lint is table stakes, not the pitch |
| Spectral ruleset ecosystem | Spectral, vacuum, IBM, Redocly | Read in `check` (Ph4); full `lint` Ph7 | Risk, medium: parity is only promised after an outside request |
| Usage-aware GraphQL breaking changes | graphql-inspector + Hive | Wrapped verdicts (Ph5) | Intentional; Hive usage data stays hosted |
| Per-client MCP compatibility matrix | mcp-lint | Phase 3 floor in the roadmap | Risk: the two reviews disagree on whether it is planned |
| MCP security scanning (tool poisoning) | Snyk agent-scan | Not planned | Unplanned: neither cut nor scheduled |
| Arazzo workflows and Respect contract tests | Redocly, Spectral, vacuum, Bump.sh | Not planned | Unplanned: Arazzo is not in the protocol list |
| Interactive MCP debugging | MCP Inspector | Not planned | Intentional: complement |
| Non-JS stacks (FastAPI, Spring, Go) | openapi-generator, Schemathesis | `detect` only by spawning owners' tools (W4, on demand) | Intentional |
| Install base and trust | every incumbent | Zero until Ph1 ships | Risk: the openapi-typescript window closes as the fork and hey-api absorb users |
