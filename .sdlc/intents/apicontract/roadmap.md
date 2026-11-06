# Roadmap — `apicontract`

Intent: [`intent.md`](./intent.md) · Design: [`spec.md`](./spec.md) · Metrics:
[`metrics.md`](./metrics.md) · **Status:** draft, 2026-11-06.

Depth before breadth: one family proves every command, then each new family is one adapter folder
(SC5). Each phase ends on a measured exit, not a date.

| Phase | Scope | Exit (measured) |
| :-- | :-- | :-- |
| **0 · Validate** | Upstream offer on openapi-typescript#2841 (owner approves the wording); baseline eval without the tool; Phase 0 readings of every `TBM` in [`metrics.md`](./metrics.md); check json-schema-to-typescript, quicktype and hey-api; reserve the npm names | Baselines in `bench/history/`; an upstream answer or 14 days of silence |
| **1 · `gen`** | `/core` model and `$ref` resolver, `/openapi`, `/jsonschema`, string emitter, `--compat openapi-typescript`; `adapter.qnt` | G1 = 100%, G5 ✓, G3 and G4 met; Q1 floor set |
| **2 · `explain` + `diff` (v1 launch)** | Direction-aware diff engine, oasdiff rule ids, SARIF, `--changeset`; `compat.qnt` as oxmutate spec oracle | D1, D2, D7 met; A1–A4 met; A5–A7 beat baseline; launch post leads with A5 |
| **3 · MCP + AsyncAPI/WebSocket** | `/mcp` (live and snapshot) and `/asyncapi`; `snapshot.qnt` | SC4 (D6 ≥ 1), SC5 holds for both adapters |
| **4 · `check`** | `apicontract-check`: oxc scan of HTTP, socket and MCP call sites | C1, C2, C3 met; A5 drops again on the eval |
| **5 · More inputs** | Standard JSON Schema bridge, OpenRPC, CloudEvents/Avro, protobuf/GraphQL via their JSON Schema output, burgee CLI contracts; `apicontract-guard` and `guard.qnt` on request | Each lands with zero core lines changed; R1–R3 met if guard ships |
| **6 · `lint`** | Reads `.spectral.yaml`, adds `fix:` lines, one ruleset for OpenAPI and MCP | Only after an outside request; parity with Spectral on its rulesets |

## Kill and pivot rules

- Upstream ships the TS 7 fix, or hey-api absorbs openapi-typescript before Phase 1 exits: lead with
  Phase 2, keep `--compat` as a migration path only.
- A5–A7 show no gain at the Phase 2 exit: `apicontract` is a code generator. Stop after Phase 1
  scope and maintain it.
- One MCP diff tool clearly leads before Phase 3: adopt its snapshot format.
- An adapter needs a core change: stop adding families and fix the model first.

## Standing work every phase

- Quint models land before their code (R-Q); `models.yml` `paths:` updated in the same PR.
- oxmutate floors set at first measurement and ratcheted (R-M); the PR lane runs `--since`.
- Every leading metric is a control band from the PR that introduces it.
