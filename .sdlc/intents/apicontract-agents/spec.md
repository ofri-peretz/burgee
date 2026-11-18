# Design — `gen mcp`, `explain`, `gen markdown`

Intent: [`intent.md`](./intent.md). **Status:** approved, 2026-11-18.

---

## Requirements

- **R1** `src/command-explain.ts` exports `command`, a burgee declaration with
  `effects: 'read_only'`, positional `operation`, flags `--input`, `--list`, `--max-bytes`.
- **R2** `explainInline(document, schema)` in `src/command-explain-inline.ts` wraps `core/resolve.ts`'s
  `inline(document, node)` (which keeps a cycle as `$ref`) and turns each cycle into
  `{ "$comment": "cycle: <pointer>" }`. Pure and exhaustively tested on the resolver's fixtures.
- **R3** `cap(value, bytes)` cuts the deepest subtree first, records each cut pointer, and is
  idempotent.
- **R4** `src/plugin-mcp*.ts` exports `generators.mcp`: `server.ts` (generated), `tools.ts`
  (generated: names, schemas, annotations), `handlers.ts` (user).
- **R5** `src/plugin-markdown*.ts` exports `generators.markdown`; it calls R2 and R3, never its own
  resolver.
- **R6** Options: `include` (operation ids or `tag:<name>`), `transport` (`stdio` | `http`).

## Design

`explain`'s pure functions (R2, R3) live in `src/command-explain-*.ts` and `markdown` imports them
from there (same lane, same folder). Order: R2, R3, R1 (explain), R5, R4.

## Verification

`npm test -w apicontract -- src/command-explain src/plugin-mcp src/plugin-markdown`;
`benchmarks/apicontract/explain-baseline.ts` for A1.

## Rejected alternatives

- **A hosted "spec to MCP" service.** PRINCIPLES rule 1: packages, never services.
- **One tool that takes an operation id** (a generic "call the API" tool). Agents need schemas per
  tool to call correctly; one generic tool moves the spec back into the prompt.

## Out of scope

An MCP client generator (roadmap Phase 6 row, its own intent later). Auth flows in generated servers
beyond passing a header from the environment.
