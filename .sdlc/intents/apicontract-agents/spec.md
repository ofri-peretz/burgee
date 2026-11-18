# Design — `gen mcp`, `explain`, `gen markdown`

Intent: [`intent.md`](./intent.md). **Status:** approved, 2026-11-18.

---

## Requirements

- **R1** `src/commands/explain/index.ts` exports `command`, a burgee declaration with
  `effects: 'read_only'`, positional `operation`, flags `--input`, `--list`, `--max-bytes`.
- **R2** `inline(schema, document)` resolves every `$ref` through `core/resolve.ts`; a cycle becomes
  `{ "$comment": "cycle: <pointer>" }`. Pure and exhaustively tested on the resolver's fixtures.
- **R3** `cap(value, bytes)` cuts the deepest subtree first, records each cut pointer, and is
  idempotent.
- **R4** `src/plugins/mcp/` exports `generators.mcp`: `server.ts` (generated), `tools.ts`
  (generated: names, schemas, annotations), `handlers.ts` (user).
- **R5** `src/plugins/markdown/` exports `generators.markdown`; it calls R2 and R3, never its own
  resolver.
- **R6** Options: `include` (operation ids or `tag:<name>`), `transport` (`stdio` | `http`).

## Design

`explain`'s pure functions (R2, R3) live in `src/commands/explain/` and are imported by `markdown`
through a relative path inside the lane. Order: R2, R3, R1 (explain), R5, R4.

## Verification

`npm test -w apicontract -- src/commands/explain src/plugins/mcp src/plugins/markdown`;
`benchmarks/apicontract/explain-baseline.ts` for A1.

## Rejected alternatives

- **A hosted "spec to MCP" service.** PRINCIPLES rule 1: packages, never services.
- **One tool that takes an operation id** (a generic "call the API" tool). Agents need schemas per
  tool to call correctly; one generic tool moves the spec back into the prompt.

## Out of scope

An MCP client generator (roadmap Phase 6 row, its own intent later). Auth flows in generated servers
beyond passing a header from the environment.
