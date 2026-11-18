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

## As built (lane `ac-agents`, 2026-11-18)

Where the build departed from the design above, and why. Each is a correction a reviewer should
accept or reject at Deploy.

- **`gen mcp` writes four files, not three.** `client.ts` (generated) holds `call` and a default
  handler per tool; `handlers.ts` (user, written once) is `{ ...defaults }`. With the defaults in the
  user file, an operation added to the spec after the first run would have no handler, because a
  user file is never rewritten.
- **`explain` declares `--max-bytes` itself.** burgee's global of that name keeps a non-list result
  whole and reports `over`; a command's own option takes the word (`burgee/src/globals.ts`), so the
  explanation is cut inside, schema by schema, and never exceeds the budget.
- **The cap's record names only the outermost cuts.** Recording every pointer made trimming a few
  bytes cost more bytes than it saved: emptying `required: ["id"]` saves 4 bytes and records a
  30-byte pointer. A cut swallowed by a later cut of its parent is dropped, and nothing above
  `/payloads/<n>/schema` is ever cut. A budget no cut can meet is refused (exit 2) with the
  smallest budget that works, instead of being exceeded.
- **Past 40 operations without `include`, no tool is generated** (the files still are, so the
  server boots with an empty list) and `mcp-too-many-tools` says why and how. Webhooks have no
  route an agent can call: `mcp-not-http`. A recursive schema loosens to "anything" where it
  repeats: `mcp-cycle-cut`.
- **`gen mcp` reads OpenAPI and Swagger 2 only.** An AsyncAPI operation has no request an agent
  can make over HTTP; a broker-publishing handler is its own design.

Not done here, and why:

- Validation through the `validator` target (Standard Schema) and the `mcp` dialect check on each
  `inputSchema`: both belong to `ac-validate`, whose plugins are still stubs on `main`.
- The default handlers call `fetch` directly, not the `fetch` target's client: `ac-clients`'
  plugin is still a stub.
- Type-checking the generated server against `@modelcontextprotocol/sdk`, booting it, and
  validating `tools/list` against the MCP schema: the corpus lane's consumer harness. Here the
  emitted text is pinned by golden tests and parses as TypeScript.
- A1 (`benchmarks/apicontract/explain-baseline.ts`) and the A5–A7 agent eval: outside this lane's
  paths.
