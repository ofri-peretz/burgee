# Roadmap — `apicontract`

Intent: [`intent.md`](./intent.md) · Design: [`spec.md`](./spec.md) · Metrics:
[`metrics.md`](./metrics.md) · **Status:** draft, 2026-11-06.

Depth before breadth: one family proves every command, then each new family is one adapter folder
(SC5). The goal is every protocol where `apicontract` adds value; the per-protocol plan is in
[`landscape.md`](./landscape.md) § Every protocol. Each phase ends on a measured exit, not a date.

| Phase | Scope | Exit (measured) |
| :-- | :-- | :-- |
| **0 · Validate** | Baseline eval without the tool; Phase 0 readings of every `TBM` in [`metrics.md`](./metrics.md); competitor review (done 2026-11-06, [`landscape.md`](./landscape.md)); naming pass; reserve the npm names (owner approves). The upstream offer is moot: openapi-typescript went into maintenance mode on 2026-09-19 ([#2874](https://github.com/openapi-ts/openapi-typescript/issues/2874)) | Baselines in `bench/history/`; a name the owner approved |
| **1 · `explain` + `diff` (v1 launch)** | `/core` model and `$ref` resolver (`adapter.qnt`), `/openapi`, `/jsonschema`; diff engine with a chosen mode (backward/forward/full) and side (caller/server), oasdiff rule ids, SARIF, `--changeset`, flags accepted from Atlassian `openapi-diff`; `compat.qnt` as oxmutate spec oracle | D1, D2, D7 met; A1–A4 met; A5–A7 beat baseline; launch post leads with what Redocly and oasdiff cannot do (mode choice, MCP/JSON Schema, code-first next) |
| **2 · `gen` — the migration path** | String emitter, `--compat openapi-typescript`, output openapi-fetch keeps working on, a migration codemod. Lands as soon after v1 as possible: the window closes as the fork and hey-api absorb the users | G1 = 100%, G5 ✓, G3 and G4 met; Q1 floor set |
| **3 · MCP, AsyncAPI/WebSocket and code-first** | `apicontract-extract` (code → spec, round trip R-RT), `apicontract-schema` (R-SC), the `apicontract-nest` technology extension (R-NE, R-TE); `/mcp` (live through bellpull, and snapshot), `/asyncapi` with send/receive-aware payload diff, and the code-first input (Standard JSON Schema: Zod, TypeBox; NestJS, tRPC/oRPC, Hono) so `diff` works across git refs with no spec file; `snapshot.qnt`; match mcpdiff's and mcp-lint's rule sets as the floor | SC4 (D6 ≥ 1); SC5 holds for all three adapters; `diff` on a Zod-defined API across two refs matches the hand-written verdict on the fixture set |
| **4 · `check`** | `apicontract-check`: oxc compiled into our own native core (as oxmutate ships), scanning HTTP, socket and MCP call sites | C1, C2, C3 met; A5 drops again on the eval |
| **5 · Every remaining protocol** | OpenRPC, CloudEvents/Avro (registry modes), burgee CLI contracts; protobuf/gRPC/Connect and GraphQL **through their owners' engines** (`buf breaking`, graphql-inspector), spawned from the user's install via bellpull, never a dependency, with our `explain`, `check` and agent surface on top | Each lands with zero core lines changed; owners' verdicts pass through unchanged |
| **6 · (folded)** | `guard` is absorbed by `apicontract-schema` in Phase 3 ([`spec.md` § R-SC](./spec.md#packages--one-per-purpose-r-p)) | — |
| **7 · `lint`** | Reads `.spectral.yaml`, adds `fix:` lines, one ruleset for OpenAPI and MCP. Table stakes, not a selling point | Only after an outside request; parity with Spectral on its rulesets |

## Technology extensions roadmap

The vision: a spec becomes executable code in every stack a team uses, and the same extension that
generates the code is the one that catches the code drifting from the spec in CI. `G` = generate
(R-TE1), `E` = extract (R-TE2), `D` = detect violations (R-TE3).

| Wave | Lands with | Extension | G | E | D | Why this order |
| :-- | :-- | :-- | :-: | :-: | :-: | :-- |
| 1 | Phase 2 | `apicontract-gen-ts` (TypeScript types, `--compat openapi-typescript`) | ✓ | | | The migration path while openapi-typescript is in maintenance mode |
| 1 | Phase 2 | `apicontract-zod` | ✓ | ✓ | ✓ | 455M downloads a week; Zod users get a spec without a rewrite |
| 1 | Phase 3 | `apicontract-nest` (HTTP, WebSocket gateways, microservices) | ✓ | ✓ | ✓ | No stable, regeneration-safe NestJS generator exists; nothing for AsyncAPI |
| 1 | Phase 3 | `apicontract-mcp` (MCP SDK servers) | ✓ | ✓ | ✓ | Tool schemas drift silently and agents break; no incumbent detects it |
| 2 | Phase 4 | `apicontract-hono`, `apicontract-express`, `apicontract-fastify` | ✓ | ✓ | ✓ | The next-largest server stacks; fastify-openapi-glue is the only regeneration-safe incumbent |
| 2 | Phase 4 | `apicontract-trpc` (tRPC, oRPC) | | ✓ | ✓ | Code-first stacks: extraction and drift, not generation |
| 2 | Phase 4 | Client call sites: fetch / openapi-fetch, axios, ky, TanStack Query | ✓ | | ✓ | The other side of the contract (`call-site-mismatch`) |
| 3 | Phase 5 | `apicontract-valibot`, `apicontract-typebox`, `apicontract-arktype` | ✓ | ✓ | ✓ | Through Standard Schema, mostly shared code with `apicontract-zod` |
| 3 | Phase 5 | socket.io, ws, Kafka/NATS consumers (AsyncAPI) | ✓ | ✓ | ✓ | Event contracts, send/receive-aware |
| 4 | On demand | Other languages (FastAPI, Spring, Go) | | | ✓ | Only by spawning their owners' tools through bellpull; never a dependency |

Exit for each extension: its capabilities graded by the competitor's own fixtures where one exists
(R-C2), a regeneration test that changes zero user lines, the round trip (R-RT) on its fixtures, and a
CI run on a real open-source app using that stack that finds every seeded violation.

## Kill and pivot rules

- Upstream ships the TS 7 fix, or hey-api absorbs openapi-typescript before Phase 1 exits: lead with
  Phase 2, keep `--compat` as a migration path only.
- A5–A7 show no gain at the Phase 2 exit: `apicontract` is a code generator. Stop after Phase 1
  scope and maintain it.
- One MCP diff tool clearly leads before Phase 3: adopt its snapshot format.
- An adapter needs a core change: stop adding families and fix the model first.
- Experiment X-1 ([`spec.md`](./spec.md#experiment-one-cli-for-all-protocols-vs-one-cli-per-protocol-x-1)) at 90 days: deprecate any per-protocol CLI under ~5% of the all-protocol CLI's net installs; keep the ones that out-draw it.

## Standing work every phase

- Quint models land before their code (R-Q); `models.yml` `paths:` updated in the same PR.
- oxmutate floors set at first measurement and ratcheted (R-M); the PR lane runs `--since`.
- Every leading metric is a control band from the PR that introduces it.
