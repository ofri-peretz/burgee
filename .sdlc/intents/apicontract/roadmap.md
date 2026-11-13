# Roadmap — `apicontract`

Intent: [`intent.md`](./intent.md) · Design: [`spec.md`](./spec.md) · Metrics:
[`metrics.md`](./metrics.md) · **Status:** draft, 2026-11-06; reordered around the generators 2026-11-12;
full catalogue proposed 2026-11-13 with [`vision.md`](./vision.md), rows marked **new** not accepted.

`apicontract` is a CLI that turns a team's specs into generated code and their code back into specs,
through plugins (owner,
2026-11-11, [`D-20261112-apicontract-is-a-generator`](../../decisions/D-20261112-apicontract-is-a-generator.md)). So the generators, the extractors and the plugin API come
first, phases 1 to 4: a plugin for a technology goes both ways wherever that technology can. The commands that read a contract without generating from it (`explain`,
`diff`, `check`, `lint`) follow, phases 5 to 9; they are kept, not dropped, until the owner says
otherwise. Each phase ends on a measured exit, not a date. People use it with the spec formats they
already have: an input format lands with the first generator that needs it (OpenAPI in Phase 1, JSON
Schema in 2, AsyncAPI in 3); the per-protocol plan is in [`landscape.md`](./landscape.md) § Every
protocol.

| Phase | Scope | Exit (measured) |
| :-- | :-- | :-- |
| **0 · Validate** | Baseline eval without the tool; Phase 0 readings of every `TBM` in [`metrics.md`](./metrics.md); competitor review (done 2026-11-06, [`landscape.md`](./landscape.md)); The upstream offer is moot: openapi-typescript went into maintenance mode on 2026-09-19 ([#2874](https://github.com/openapi-ts/openapi-typescript/issues/2874)) | Baselines in `bench/history/`. Naming is not a Phase 0 item: names are chosen after the capabilities are implemented ([`D-20261111-layer-bar`](../../decisions/D-20261111-layer-bar.md)) |
| **1 · `gen`, the plugin API and TypeScript types (first public release)** | `/core` model and `$ref` resolver (`adapter.qnt`), `/openapi` input; the generator plugin API (R-EX), with our TypeScript types generator as its first plugin, written only against that API; string emitter, `--compat openapi-typescript`, output openapi-fetch keeps working on, a migration codemod; `gen --check` (R-PL3); published with npm provenance. First since 2026-11-11 ([`D-20261111-apicontract-gen-first`](../../decisions/D-20261111-apicontract-gen-first.md)): users are asking, and the fork `openapi-typesafe` is already at `1.0.0-rc.5` | G1 = 100%, G5 ✓, G2–G4 met; X1 and X2 met; Q1 floor set |
| **2 · Validators from a spec** | `/jsonschema` input; two generator plugins: `gen validator` (our own validator, [`validator/intent.md`](../validator/intent.md), R-SC) and `gen json-schema` (plain JSON Schema for the ajv a team already runs, R-JS). The user picks the target. **New, 2026-11-13:** `--dialect` for model providers' tool-call schemas. **Code → spec starts here:** the extract core (`apicontract-extract`) and the round trip (R-RT), reading our validator's schemas, JSON Schema and existing Zod schemas back into a spec | B1–B3 met on these sources; J1–J3 met; R1–R3 met against Zod and ajv; the validator's own leading rows hold for its contract-first side |
| **3 · NestJS modules, and the plugin kit** | `/asyncapi` input; the NestJS generator plugin (R-NE): abstract base controllers, WebSocket gateways and microservice handlers, a contract test per operation; and the other way, a spec from existing NestJS code (R-TE2); `apicontract plugin new`, the conformance suite in `apicontract/testing` and `plugin list` (R-EX8, R-EX9), so anyone can ship a generator or an extractor | N1–N4 met; B1–B4 met against @nestjs/swagger; X3 met (an agent given the schema and one example writes a passing plugin in one turn) |
| **4 · More generators** | Hono, Express and Fastify servers; typed clients for fetch / openapi-fetch, axios, ky and TanStack Query; a spec from Hono, Express, Fastify and tRPC/oRPC code. **Added 2026-11-13** ([`D-20261113-apicontract-mocks-and-mcp-generation`](../../decisions/D-20261113-apicontract-mocks-and-mcp-generation.md)): MSW handlers and fixtures, and `gen mcp`, moved here from Phase 6. Each is a plugin and none changes the core | Each plugin passes the conformance suite and its regeneration test and the round trip; B5 = 5; X4 counted |
| **5 · `explain` + `diff`** | Diff engine with a chosen mode (backward/forward/full) and side (caller/server), oasdiff rule ids, SARIF, `--changeset`, flags accepted from Atlassian `openapi-diff`; `compat.qnt` as oxmutate spec oracle | D1, D2, D7 met; A1–A4 met; A5–A7 beat baseline; launch post leads with what Redocly and oasdiff cannot do (mode choice, MCP/JSON Schema, code-first next) |
| **6 · MCP, AsyncAPI/WebSocket, and `diff` with no spec file** | The detect side of the technology extensions (R-TE3); `/mcp` (live through bellpull, and snapshot), send/receive-aware payload diff for `/asyncapi`, and `diff` over the specs extracted in phases 2 to 4 (Zod, TypeBox, NestJS, tRPC/oRPC, Hono) so `diff` works across git refs with no spec file; `snapshot.qnt`; match mcpdiff's and mcp-lint's rule sets as the floor | SC10 (D6 ≥ 1); SC7 holds for all three adapters; `diff` on a Zod-defined API across two refs matches the hand-written verdict on the fixture set |
| **7 · `check`** | `apicontract-check`: oxc compiled into our own native core (as oxmutate ships), scanning HTTP, socket and MCP call sites | C1, C2, C3 met; A5 drops again on the eval |
| **8 · Every remaining protocol** | OpenRPC, CloudEvents/Avro (registry modes), burgee CLI contracts; protobuf/gRPC/Connect and GraphQL **through their owners' engines** (`buf breaking`, graphql-inspector), spawned from the user's install via bellpull, never a dependency, with our `explain`, `check` and agent surface on top | Each lands with zero core lines changed; owners' verdicts pass through unchanged |
| **9 · `lint`** | Reads `.spectral.yaml`, adds `fix:` lines, one ruleset for OpenAPI and MCP. Table stakes, not a selling point | Only after an outside request; parity with Spectral on its rulesets |

## The full catalogue

Proposed 2026-11-13 with [`vision.md`](./vision.md); the rows marked **new** were not in the
2026-11-12 order and wait for the owner. `G` = generate (spec → code, R-TE1), `E` = extract
(code → spec, R-TE2), `D` = detect drift in CI (R-TE3). Weekly downloads are the incumbent's, read
2026-11-13 from `api.npmjs.org/downloads/point/last-week/<pkg>`; they size the demand, they are not
a claim about us.

### Types and models

| Plugin | G | E | D | Phase | Incumbent (weekly) | Status |
| :-- | :-: | :-: | :-: | :-: | :-- | :-- |
| TypeScript types from OpenAPI, `--compat openapi-typescript` | ✓ | | | 1 | openapi-typescript 16.7M (maintenance mode), @hey-api/openapi-ts 7.3M | accepted |
| TypeScript types from JSON Schema | ✓ | | | 2 | json-schema-to-typescript 6.4M | accepted |
| TypeScript types from AsyncAPI messages | ✓ | | | 3 | @asyncapi/modelina 0.2M | accepted |

### Validators and schemas

| Plugin | G | E | D | Phase | Incumbent (weekly) | Status |
| :-- | :-: | :-: | :-: | :-: | :-- | :-- |
| `gen validator` (our own, compiled ahead of time) | ✓ | ✓ | ✓ | 2 | zod 451.0M, ajv 515.9M | accepted |
| `gen json-schema` (draft 2020-12 or draft-07, runs in the team's own ajv) | ✓ | | | 2 | the OpenAPI → JSON Schema converters, named in Phase 0 | accepted |
| `gen json-schema --dialect <provider>`: the subset a model provider's tool-call or structured-output mode accepts, with a finding per dropped keyword | ✓ | | ✓ | 2 | zod-to-json-schema 94.5M | **new** |
| `apicontract-zod`: a spec from existing Zod schemas | | ✓ | ✓ | 2 | @asteasolutions/zod-to-openapi 7.6M, zod-to-json-schema 94.5M | accepted; whether any plugin may *emit* Zod is an open owner question, default no |
| Valibot, TypeBox, ArkType through Standard Schema | ✓ | ✓ | ✓ | 8 | valibot 32.0M | accepted |

### Servers

| Plugin | G | E | D | Phase | Incumbent (weekly) | Status |
| :-- | :-: | :-: | :-: | :-: | :-- | :-- |
| NestJS: controllers, WebSocket gateways, microservice handlers, a contract test per operation | ✓ | ✓ | ✓ | 3 | @nestjs/swagger 11.6M (extract only); openapi-generator's NestJS server (beta) | accepted |
| Hono, Express, Fastify | ✓ | ✓ | ✓ | 4 | @hono/zod-openapi 4.3M, tsoa 0.6M, fastify-openapi-glue | accepted |
| tRPC, oRPC, ts-rest (code-first: a spec and drift, no generation) | | ✓ | ✓ | 4 | @trpc/server 7.8M, @ts-rest/core 1.0M | accepted (ts-rest **new**) |

### Clients

| Plugin | G | E | D | Phase | Incumbent (weekly) | Status |
| :-- | :-: | :-: | :-: | :-: | :-- | :-- |
| Typed clients for fetch / openapi-fetch, axios, ky, TanStack Query | ✓ | | ✓ | 4 | openapi-fetch 16.5M, orval 3.7M, @openapitools/openapi-generator-cli 2.1M | accepted |
| A publishable SDK package (versioning, docs site, release pipeline) | | | | never | Stainless, Speakeasy, Fern | rejected 2026-11-06 ([`spec.md` § Rejected alternatives](./spec.md#rejected-alternatives)); stands |

### Agents

| Plugin or command | G | E | D | Phase | Incumbent (weekly) | Status |
| :-- | :-: | :-: | :-: | :-: | :-- | :-- |
| Every command as an MCP tool (`--mcp`), `--json`, `--schema` | | | | 1 | none; it comes from burgee | accepted |
| `explain`: one operation, resolved and size-capped | | | | 5 | reading the raw spec | accepted |
| Markdown reference per operation (the `explain` output written to files) | ✓ | | | 5 | none read yet | **new** |
| `gen mcp`: an MCP server from a spec, handlers user-owned | ✓ | | | 4 | none leading; @modelcontextprotocol/sdk 87.5M is the runtime | accepted 2026-11-13 (was Phase 6, was rejected); see below |
| MCP `tools/list`, live or snapshot: extract, `diff`, drift | | ✓ | ✓ | 6 | mcpdiff, mcp-lint | accepted |
| A typed client for an MCP server's tools | ✓ | | ✓ | 6 | none read yet | **new** |

### Tests and mocks

| Plugin | G | E | D | Phase | Incumbent (weekly) | Status |
| :-- | :-: | :-: | :-: | :-: | :-- | :-- |
| A contract test per generated operation (inside each server plugin) | ✓ | | | 3 | none for NestJS | accepted (R-NE) |
| MSW handlers and fixtures from the spec's examples and schemas | ✓ | | ✓ | 4 | msw 33.2M is the runtime; orval generates handlers | accepted 2026-11-13 (was rejected); see below |
| Synthetic checks: `gen checkly`, `gen playwright`, `gen k6`, `probe` | ✓ | | ✓ | 8 | none generates a full, synced suite | accepted (R-SY) |

### Events, other protocols, data layer, other languages

| Plugin | G | E | D | Phase | Incumbent (weekly) | Status |
| :-- | :-: | :-: | :-: | :-: | :-- | :-- |
| socket.io, ws, Kafka and NATS consumers (AsyncAPI) | ✓ | ✓ | ✓ | 8 | @asyncapi/modelina 0.2M | accepted |
| OpenRPC, CloudEvents/Avro, burgee CLI contracts | ✓ | ✓ | ✓ | 8 | — | accepted |
| protobuf/gRPC/Connect and GraphQL, through their owners' engines | | | ✓ | 8 | @bufbuild/protoc-gen-es 3.9M, @graphql-codegen/cli 10.1M | accepted; own diff rules decided at Phase 8 |
| Drizzle and Prisma models → JSON Schema and validators | | ✓ | ✓ | on pull | drizzle-zod 4.6M | **new** |
| FastAPI, Spring, Go | | | ✓ | on pull | their owners' tools, spawned through bellpull | accepted |

### Spec utilities

| Command | Phase | Incumbent (weekly) | Status |
| :-- | :-: | :-- | :-- |
| `gen --check`, dry run and the diff of what would change | 1 | — | accepted (R-PL3) |
| `bundle`: one file with every `$ref` resolved. Ships only if it is the Phase 1 resolver's output with no new model code | 1 | @redocly/cli 4.2M | **new** |
| `convert`: Swagger 2.0 and OpenAPI 3.0 → 3.1 | on pull | — | **new** |
| TypeSpec as an input format | on pull | @typespec/compiler 0.4M | **new** |
| `lint` | 9 | @stoplight/spectral-cli 2.3M | accepted, only on request |

Exit for every plugin, unchanged: its capabilities graded by the competitor's own fixtures where one
exists (R-C2), a regeneration test that changes zero user lines, the round trip (R-RT) on its
fixtures, and a CI run on a real open-source app using that stack that finds every seeded violation.
A **new** row gets its metric rows in [`metrics.md`](./metrics.md) when its phase's design is written,
not before.

### Two rows that reverse a recorded rejection

[`spec.md` § Rejected alternatives](./spec.md#rejected-alternatives) (2026-11-06) rejected "building
mocking, Pact-style consumer tests, or SDK/MCP-server generation". The owner reopened two parts of it
on 2026-11-13 ([`D-20261113-apicontract-mocks-and-mcp-generation`](../../decisions/D-20261113-apicontract-mocks-and-mcp-generation.md)):

- **MSW handlers.** MSW stays the runtime and we feed it a contract. We do not build a mock server.
- **`gen mcp`.** An MCP server from a spec, handlers user-owned. The cost is accepted: this overlaps
  with what Speakeasy and Stainless sell, so sponsorship from them is less likely.

Publishable SDK generation, Pact-style consumer tests and a mock server of our own stay rejected.
Phase 4 for both is the proposal's placement; the ruling was on whether, not when.

## The validator's track

The validator is its own product ([`../validator/intent.md`](../validator/intent.md)) and runs
beside the phases above. It has no design file yet; this is the order proposed for one.

| Stage | Scope | Exit (measured) | Rides with |
| :-- | :-- | :-- | :-- |
| **a · Baselines** | Zod, ajv, Valibot, ArkType, TypeBox read on throughput, construction, bundle and type-check cost under TypeScript 5.9, 6.0, 7.0 (done 2026-11-12 on a loaded machine) | Timings re-read on a quiet machine; JSON Schema conformance and the `new Function` question read | Phase 0 |
| **b · The engine, contract-first** | Validators compiled ahead of time from the model; no runtime compile, no `new Function`; errors with a path, what was expected and a `fix:` line | The latency rows won against ajv and Zod on generated validators; bundle carries only the schemas used | Phase 2 (`gen validator`) |
| **c · The authoring API** | Schemas written in TypeScript, the type inferred; Standard Schema and Standard JSON Schema, so tRPC, Hono, NestJS 12 and form libraries accept it with no adapter | The type-check rows won under all three TypeScript versions; the value rows (bundle, install size) won | After Phase 2 |
| **d · The feature gaps** | The nine groups of open Zod requests and the ajv gaps recorded in [`D-20261112-validator-gaps`](../../decisions/D-20261112-validator-gaps.md) | Every features row won or published as lost | After c |
| **e · The way in** | A codemod from Zod schemas, graded on the Zod test cases it claims to cover (**new**); `apicontract-zod` already extracts a spec from Zod, so a team can also arrive through `gen validator` | A real open-source app migrates with zero hand edits on the covered cases | After d |
| **f · Name and release** | The name is chosen now, not earlier ([`D-20261111-layer-bar`](../../decisions/D-20261111-layer-bar.md)) | Every row in the intent won, or the losing rows published beside the release | Last |

Stage b is the one the generator needs. Stages c to f are what make it "a better alternative to
Zod", and they do not block any `apicontract` phase.

## Why this order

1. **Phase 1 is the open window.** 16.7M weekly installs sit on a generator in maintenance mode that
   crashes on TypeScript 7. Byte-identical output is the only switch that costs a user one line.
2. **Phase 2 makes it more than a replacement.** Two targets from one spec and the first extract
   prove the model and the round trip; without them it is another types generator.
3. **Phase 3 proves the plugin API on the hardest case** (NestJS, three transports, user-owned
   code) and opens it to authors, with the agent-writes-a-plugin test as the gate.
4. **Phase 4 is breadth, and it is cheap only if 1 to 3 were right.** Each plugin is one folder
   with zero core lines; if one is not, the model is fixed before more are added.
5. **Phases 5 to 7 are where one model pays off twice**: `diff`, `explain` and `check` read what
   the generators already parse, including specs that only exist because `extract` wrote them.
6. **Phases 8 and 9 are on pull.** Nothing there is built ahead of a request.

## Kill and pivot rules

- Upstream ships the TS 7 fix, hey-api absorbs openapi-typescript, or `openapi-typesafe` reaches
  1.0 and clearly leads, before Phase 1 exits: keep `--compat` as a migration path only and lead the
  first release with Phase 2.
- A5–A7 show no gain at the Phase 5 exit: drop the agent claim for `explain` and publish the reading.
  The generators do not depend on it.
- X3 fails at the Phase 3 exit (an agent cannot write a passing plugin in one turn): the plugin API
  is not ready to be public; fix its shape before Phase 4 adds plugins on top of it.
- One MCP diff tool clearly leads before Phase 6: adopt its snapshot format.
- The agent eval shows no gain from calling `gen` as a tool over writing the code by hand: drop the
  agent claim for `gen` and publish the reading; the case for teams does not depend on it.
- The validator loses a latency or type-check row at the end of its stage c: it ships as the
  generated target only, the losing rows are published, and the Zod question goes back to the owner.
- An adapter needs a core change: stop adding families and fix the model first.
- Experiment X-1 ([`spec.md`](./spec.md#experiment-one-cli-for-all-protocols-vs-one-cli-per-protocol-x-1)) at 90 days: deprecate any per-protocol CLI under ~5% of the all-protocol CLI's net installs; keep the ones that out-draw it.

## Standing work every phase

- Quint models land before their code (R-Q); `models.yml` `paths:` updated in the same PR.
- oxmutate floors set at first measurement and ratcheted (R-M); the PR lane runs `--since`.
- Every leading metric is a control band from the PR that introduces it.
