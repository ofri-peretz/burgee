# Roadmap — `apicontract`

Intent: [`intent.md`](./intent.md) · Design: [`spec.md`](./spec.md) · Metrics:
[`metrics.md`](./metrics.md) · **Status:** draft, 2026-11-06; reordered around the generators 2026-11-12.

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
| **1 · `gen`, the plugin API and TypeScript types (first public release)** | `/core` model and `$ref` resolver (`adapter.qnt`), `/openapi` input; the generator plugin API (R-EX), with our TypeScript types generator as its first plugin, written only against that API; string emitter, `--compat openapi-typescript`, output openapi-fetch keeps working on, a migration codemod; published with npm provenance. First since 2026-11-11 ([`D-20261111-apicontract-gen-first`](../../decisions/D-20261111-apicontract-gen-first.md)): users are asking, and the fork `openapi-typesafe` is already at `1.0.0-rc.5` | G1 = 100%, G5 ✓, G2–G4 met; X1 and X2 met; Q1 floor set |
| **2 · Validators from a spec** | `/jsonschema` input; two generator plugins: `gen validator` (our own validator, [`validator/intent.md`](../validator/intent.md), R-SC) and `gen json-schema` (plain JSON Schema for the ajv a team already runs, R-JS). The user picks the target. **Code → spec starts here:** the extract core (`apicontract-extract`) and the round trip (R-RT), reading our validator's schemas, JSON Schema and existing Zod schemas back into a spec | B1–B3 met on these sources; J1–J3 met; R1–R3 met against Zod and ajv; the validator's own leading rows hold for its contract-first side |
| **3 · NestJS modules, and the plugin kit** | `/asyncapi` input; the NestJS generator plugin (R-NE): abstract base controllers, WebSocket gateways and microservice handlers, a contract test per operation; and the other way, a spec from existing NestJS code (R-TE2); `apicontract plugin new`, the conformance suite in `apicontract/testing` and `plugin list` (R-EX8, R-EX9), so anyone can ship a generator or an extractor | N1–N4 met; B1–B4 met against @nestjs/swagger; X3 met (an agent given the schema and one example writes a passing plugin in one turn) |
| **4 · More generators** | Hono, Express and Fastify servers; typed clients for fetch / openapi-fetch, axios, ky and TanStack Query; a spec from Hono, Express, Fastify and tRPC/oRPC code. Each is a plugin and none changes the core | Each plugin passes the conformance suite and its regeneration test and the round trip; B5 = 5; X4 counted |
| **5 · `explain` + `diff`** | Diff engine with a chosen mode (backward/forward/full) and side (caller/server), oasdiff rule ids, SARIF, `--changeset`, flags accepted from Atlassian `openapi-diff`; `compat.qnt` as oxmutate spec oracle | D1, D2, D7 met; A1–A4 met; A5–A7 beat baseline; launch post leads with what Redocly and oasdiff cannot do (mode choice, MCP/JSON Schema, code-first next) |
| **6 · MCP, AsyncAPI/WebSocket, and `diff` with no spec file** | The detect side of the technology extensions (R-TE3); `/mcp` (live through bellpull, and snapshot), send/receive-aware payload diff for `/asyncapi`, and `diff` over the specs extracted in phases 2 to 4 (Zod, TypeBox, NestJS, tRPC/oRPC, Hono) so `diff` works across git refs with no spec file; `snapshot.qnt`; match mcpdiff's and mcp-lint's rule sets as the floor | SC10 (D6 ≥ 1); SC7 holds for all three adapters; `diff` on a Zod-defined API across two refs matches the hand-written verdict on the fixture set |
| **7 · `check`** | `apicontract-check`: oxc compiled into our own native core (as oxmutate ships), scanning HTTP, socket and MCP call sites | C1, C2, C3 met; A5 drops again on the eval |
| **8 · Every remaining protocol** | OpenRPC, CloudEvents/Avro (registry modes), burgee CLI contracts; protobuf/gRPC/Connect and GraphQL **through their owners' engines** (`buf breaking`, graphql-inspector), spawned from the user's install via bellpull, never a dependency, with our `explain`, `check` and agent surface on top | Each lands with zero core lines changed; owners' verdicts pass through unchanged |
| **9 · `lint`** | Reads `.spectral.yaml`, adds `fix:` lines, one ruleset for OpenAPI and MCP. Table stakes, not a selling point | Only after an outside request; parity with Spectral on its rulesets |

## Technology extensions roadmap

The vision: a spec becomes executable code in every stack a team uses, and the same extension that
generates the code is the one that catches the code drifting from the spec in CI. Generate and
extract land with the phase shown; detect lands in Phase 6 or 7. `G` = generate
(R-TE1), `E` = extract (R-TE2), `D` = detect violations (R-TE3).

| Wave | Lands with | Extension | G | E | D | Why this order |
| :-- | :-- | :-- | :-: | :-: | :-: | :-- |
| 1 | Phase 1 | `apicontract-gen-ts` (TypeScript types, `--compat openapi-typescript`) | ✓ | | | The migration path while openapi-typescript is in maintenance mode |
| 1 | Phase 2 | `gen validator` (our own validator) and `gen json-schema` (for ajv) | ✓ | | | A team picks the validator it wants from the same spec; JSON Schema output needs nothing of ours at runtime |
| 1 | Phase 2 | `apicontract-zod` | | ✓ | ✓ | 455M downloads a week; Zod users get a spec without a rewrite. No generate: we never emit Zod, generated validators are our own (`apicontract-schema`, [`D-20261111-apicontract-own-validator`](../../decisions/D-20261111-apicontract-own-validator.md)) |
| 1 | Phase 3 | `apicontract-nest` (HTTP, WebSocket gateways, microservices) | ✓ | ✓ | ✓ | No stable, regeneration-safe NestJS generator exists; nothing for AsyncAPI |
| 1 | Phase 6 | `apicontract-mcp` (MCP SDK servers) | ✓ | ✓ | ✓ | Tool schemas drift silently and agents break; no incumbent detects it |
| 2 | Phase 4 | `apicontract-hono`, `apicontract-express`, `apicontract-fastify` | ✓ | ✓ | ✓ | The next-largest server stacks; fastify-openapi-glue is the only regeneration-safe incumbent |
| 2 | Phase 4 | `apicontract-trpc` (tRPC, oRPC) | | ✓ | ✓ | Code-first stacks: extraction and drift, not generation |
| 2 | Phase 4 | Client call sites: fetch / openapi-fetch, axios, ky, TanStack Query | ✓ | | ✓ | The other side of the contract (`call-site-mismatch`) |
| 3 | Phase 8 | `apicontract-valibot`, `apicontract-typebox`, `apicontract-arktype` | ✓ | ✓ | ✓ | Through Standard Schema, mostly shared code with `apicontract-zod` |
| 3 | Phase 8 | socket.io, ws, Kafka/NATS consumers (AsyncAPI) | ✓ | ✓ | ✓ | Event contracts, send/receive-aware |
| 3 | Phase 8 | Synthetic checks: `gen checkly`, `gen playwright`, `gen k6`, `probe` (R-SY) | ✓ | | ✓ | No tool generates a full, synced suite from a contract; `missing-synthetic` gates CI |
| 4 | On demand | Other languages (FastAPI, Spring, Go) | | | ✓ | Only by spawning their owners' tools through bellpull; never a dependency |

Exit for each extension: its capabilities graded by the competitor's own fixtures where one exists
(R-C2), a regeneration test that changes zero user lines, the round trip (R-RT) on its fixtures, and a
CI run on a real open-source app using that stack that finds every seeded violation.

## Kill and pivot rules

- Upstream ships the TS 7 fix, hey-api absorbs openapi-typescript, or `openapi-typesafe` reaches
  1.0 and clearly leads, before Phase 1 exits: keep `--compat` as a migration path only and lead the
  first release with Phase 2.
- A5–A7 show no gain at the Phase 5 exit: drop the agent claim for `explain` and publish the reading.
  The generators do not depend on it.
- X3 fails at the Phase 3 exit (an agent cannot write a passing plugin in one turn): the plugin API
  is not ready to be public; fix its shape before Phase 4 adds plugins on top of it.
- One MCP diff tool clearly leads before Phase 6: adopt its snapshot format.
- An adapter needs a core change: stop adding families and fix the model first.
- Experiment X-1 ([`spec.md`](./spec.md#experiment-one-cli-for-all-protocols-vs-one-cli-per-protocol-x-1)) at 90 days: deprecate any per-protocol CLI under ~5% of the all-protocol CLI's net installs; keep the ones that out-draw it.

## Standing work every phase

- Quint models land before their code (R-Q); `models.yml` `paths:` updated in the same PR.
- oxmutate floors set at first measurement and ratcheted (R-M); the PR lane runs `--since`.
- Every leading metric is a control band from the PR that introduces it.
