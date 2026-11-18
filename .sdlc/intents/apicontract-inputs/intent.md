# Intent — every contract a team already has reads into the one model

> Opened from the 2026-11-18 program ([`../apicontract/program.md`](../apicontract/program.md)).
> On `main` only OpenAPI 3.x reads into the model. The vision's first promise is "in the format it
> already uses", and three of the roadmap's generator families (validators from JSON Schema,
> AsyncAPI servers, MCP tools) cannot start until their format reads.

**Status:** approved · **Opened:** `2026-11-18` · **Owner:** `@ofri-peretz` · **Lane:** `ac-inputs` ·
**Accepted by:** [`D-20261118-contracts-program-go-ahead`](../../decisions/D-20261118-contracts-program-go-ahead.md)

---

## What is wanted

Five adapters, each `{ description, detect, read }` on the public host API, each in its own folder
under `src/inputs/`:

| Adapter | Reads | Payload directions |
| :-- | :-- | :-- |
| `jsonschema` | A JSON Schema document (2020-12, 2019-09, draft-07, draft-04), or a folder of them; each top-level schema or `$defs` entry is one operation with one payload | `request` (the value being validated) |
| `asyncapi` | AsyncAPI 2.6 and 3.0: channels, operations, messages | `publish`, `subscribe` |
| `mcp` | An MCP `tools/list` result (snapshot JSON), and `prompts/list`, `resources/templates/list` | `tool-call`, `tool-result` |
| `swagger2` | Swagger 2.0, normalised into the OpenAPI 3.1 shape, with a finding per construct it had to translate | `request`, `response` |
| `openapi` (existing) | Gains OpenAPI 3.2: `query` method (already listed), `itemSchema` streaming, `additionalOperations`, tags as objects | as today |

Plus **Overlay 1.2** (2026-09-22): `--overlay <file>` (repeatable) applies OpenAPI Overlays to the
document before any adapter reads it, so a team keeps its generator tweaks (renamed operations,
hidden internal routes, added `x-` hints) in a file instead of a forked spec. Read 2026-11-18: OpenAPI
3.2 (2025-09-19, 3.2.1 on 2026-09-10) is fully supported only by Kubb among TypeScript generators
(merged 2026-11-05); orval has `QUERY` only; openapi-typescript and openapi-generator have open
requests. Overlay and Arazzo are unclaimed. 3.2 and Overlay are cheap to read and a clear lead.

## Why now

Read 2026-11-13 ([`../apicontract/vision.md`](../apicontract/vision.md)): json-schema-to-typescript
6.4M weekly, @asyncapi/modelina 0.2M, @modelcontextprotocol/sdk 87.5M. The JSON Schema adapter is
on the critical path of `gen validator` (Phase 2); the MCP adapter of `gen mcp` and MCP drift.

## Affected users and systems

`packages/apicontract/src/inputs/**` and `src/openapi.ts`. The corpus lane grades each adapter on
real documents.

## Constraints

- Each adapter imports only `apicontract/core` and the host types; the core never imports an adapter.
- No adapter needs a core change. If one does, stop and write a decision first (roadmap kill rule).
- Schemas are passed through as written, `$ref`s intact; resolution stays in `core/resolve.ts`.
- Operation ids are stable across runs and readable: the spec's own id where it has one.

## Success criteria

- Each adapter has a `sample` and a test folder of at least 20 real documents (from the corpus lane's
  list, or the format's own example repository), each reading with zero thrown errors.
- `jsonschema`: the JSON-Schema-Test-Suite's `$ref` and `$defs` cases resolve through `core/resolve.ts`.
- `asyncapi`: every example in `asyncapi/spec/examples` for 2.6 and 3.0 reads; 3.0 `send`/`receive`
  map to `publish`/`subscribe` from the document owner's side, documented in the adapter.
- `mcp`: the `tools/list` snapshots of the ten servers SC10 names read; `inputSchema` and
  `outputSchema` become `tool-call` and `tool-result` payloads.
- `swagger2`: the Swagger 2.0 Petstore and 50 corpus documents read; every translated construct
  (`formData`, `collectionFormat`, `x-nullable`) produces a finding, never a silent change.
- Coverage 100% of `src/inputs/**`; mutation floor set at first reading.

## Defaults taken

- Swagger 2.0 is read and normalised, not generated back. `convert` (2.0/3.0 → 3.1 as a file) is
  this adapter's output written by `gen`, so it needs no command of its own.
- TypeSpec, RAML, API Blueprint, GraphQL SDL and protobuf are not adapters here; they arrive through
  their owners' compilers (TypeSpec emits OpenAPI) or the Phase 8 owners'-engine route.
