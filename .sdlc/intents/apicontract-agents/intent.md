# Intent — any contract becomes agent tools, and agents read one operation, not the whole spec

> Opened from the 2026-11-18 program ([`../contractdiff/program.md`](../contractdiff/program.md)).
> Vision § agents rows 1, 2 and 4. `gen mcp` was reopened by
> [`D-20261113-apicontract-mocks-and-mcp-generation`](../../decisions/D-20261113-apicontract-mocks-and-mcp-generation.md);
> `explain` is Phase 5 in the roadmap and is pulled forward here because it needs only the model,
> which exists.

**Status:** approved · **Opened:** `2026-11-18` · **Owner:** `@ofri-peretz` · **Lane:** `ac-agents` ·
**Accepted by:** [`D-20261118-contracts-program-go-ahead`](../../decisions/D-20261118-contracts-program-go-ahead.md)

---

## What is wanted

- **`gen mcp`** — an MCP server from an OpenAPI or AsyncAPI contract: one tool per operation (opt-in
  list or tag filter), `inputSchema` from the operation's input in the MCP dialect (`ac-validate`
  R4 table), `outputSchema` from its success response, `annotations.readOnlyHint` from the HTTP
  method, and a user-owned `handlers.ts` whose default implementation calls the API through the
  `fetch` client. The server uses `@modelcontextprotocol/sdk` as the user's dependency.
- **`explain <operation>`** — one operation fully resolved (every `$ref` inlined, cycles cut with a
  marker), size-capped by burgee's `--max-bytes`, as text or `--json`; `--list` prints ids only.
- **`gen markdown`** — the `explain` output for every operation written to `docs/api/<id>.md` plus
  an `index.md` and an `llms.txt`, so agents without our CLI read the same thing.

The generated tools hand the MCP SDK our validator, not a JSON Schema for it to compile. Read
2026-11-18: MCP TypeScript SDK v2 (`@modelcontextprotocol/server` 2.4.0, 2026-10-23) takes tool
schemas as Standard Schema plus Standard JSON Schema and validates through a swappable validator (ajv
on Node, `@cfworker/json-schema` on Workers). The `validator` target implements both interfaces, so a
generated server validates with precompiled code and no runtime compile, on Node and on Workers.
MCP 2026-07-28 allows any JSON Schema 2020-12 keyword in tool schemas and forbids network `$ref`
fetching; elicitation forms stay a flat object of primitives, which the `mcp-elicitation` dialect
(`ac-validate` R4) enforces.

## Why now

@modelcontextprotocol/sdk 87.5M weekly and no generator leads it (vision). `explain` is the cheapest
agent claim to measure (A1, A5–A7) and needs nothing that is not on `main`.

## Affected users and systems

`packages/contractdiff/src/plugin-mcp*.ts, src/plugin-markdown*.ts`, `src/command-explain*.ts`.

## Constraints

- No MCP SDK dependency in apicontract; generated code imports it.
- `explain` output is deterministic and never exceeds `--max-bytes`; past the cap it truncates the
  deepest schema first and says so in a `truncated` field (R-A5).
- Tools are generated only for operations the user selects when the spec has more than 40 operations
  (a finding names the cap and the flag), because large tool lists degrade agents.

## Success criteria

- `gen mcp` on the corpus lane's three bench specs: the server boots in the consumer harness, and
  `tools/list` validates against the MCP schema; every `inputSchema` passes the `mcp` dialect check.
- A1: `explain --json` bytes for the median bench operation ≤ the resolved raw slice, read and
  published in `benchmarks/apicontract/explain-baseline.ts`.
- A2 = 100% for `explain --json`; A3 = 100% (`fix:` on every non-zero exit).
- The agent eval (A5–A7) runs with and without `explain`, and the reading is published either way.

## Defaults taken

- Tool names are `operationId` in snake_case, truncated to 64 characters with a stable hash suffix.
- Transport: stdio by default, `--transport http` emits the Streamable HTTP setup.

## Evidence sweep 2026-11-22

Read on `main` at `daee10f` (2026-11-22) against the merged Wave 6 PRs (#1617–#1653) and the committed readings under `benchmarks/apicontract/results/`; `vitest run` in `packages/contractdiff` (2,545 tests) and `packages/truefit` (1,153) is green there. 1 of 4 criteria met (A2/A3 through tests). The boot, A1 and the agent eval are unread.

| # | criterion | held by | state |
| --: | :-- | :-- | :-- |
| 1 | `gen mcp` on the three bench specs: the server boots, `tools/list` validates, every `inputSchema` passes the `mcp` dialect | `consumers.ts` has an MCP boot contract; no reading committed. Output pinned by golden tests (#1627) | **open** |
| 2 | A1: `explain --json` bytes for the median bench operation ≤ the raw slice, published | `benchmarks/apicontract/explain-baseline.ts` exists; no reading in `benchmarks/apicontract/results/` | **open** |
| 3 | A2 = 100% for `explain --json`; A3 = 100% | the explain test parses `explain --json` with `runBurgee` (PLAN 6.8 done-when); refusals carry `fix:` | met |
| 4 | The agent eval (A5–A7) with and without `explain`, published | no `evals/cases/apicontract-explain-*` | **open** |

Status stays `approved`: `apicontract` is `private` and unpublished, and [`D-20261119-apicontract-stays-private`](../../decisions/D-20261119-apicontract-stays-private.md) reserves `shipped` for published work; a lane that meets every criterion is recorded as "criteria met, unpublished".
