# Intent — `--mcp` speaks the current protocol: typed results, cancellation, progress

> Stage 1 artifact. Opened from the next-wave ranking
> ([`next-wave-2026-10.md`](../../research/next-wave-2026-10.md)), from reading
> `packages/burgee/src/mcp.ts` against the protocol revision `agent-requirements.md` researched.

**Status:** approved · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz

---

## What is wanted

A program on burgee that serves `--mcp` gives an MCP client:

- **The result as data.** `structuredContent` beside the text, and an `outputSchema` in
  `tools/list` when the command declares its output.
- **A way to stop a call.** `notifications/cancelled` aborts the running command, which cleans
  up as a timeout does.
- **Progress** for a long command when the client asks for it.
- **A configuration that works when pasted**, generated for the actual program rather than a
  template.

The server negotiates the protocol revision instead of always answering one.

Every CLI that adds `--mcp` gets this with no new code. That is the family's whole argument: the
layer does it once.

## Why now

Read on `3a05dc8aad`:

- **`MCP_PROTOCOL_VERSION = '2025-06-18'`** (`packages/burgee/src/mcp.ts:26`), returned to every
  `initialize` whatever the client asks. `agent-requirements.md` was researched against the
  revision dated `2026-07-28` and quotes its `Tool` interface, including `outputSchema`.
- **The result is text only.** `callTool` returns `{ content: [{ type: 'text', text }], isError }`.
  The `--json` envelope is serialised into a string, and a client that wants the data parses
  it back. No `structuredContent`, no `outputSchema`. `agent-requirements.md` §4 records "output
  schema: absent" as the row every CLI framework leaves empty (Cobra #2362), and §5 quotes
  `outputSchema` as "the shape of `CallToolResult.structuredContent`".
- **No cancellation and no progress.** `handle()` answers `initialize`, `ping`, `tools/list` and
  `tools/call`, and nothing else. A client that gives up on a call cannot stop it, and the
  command runs to completion while nobody waits. `agent-requirements.md` §2 measures what silent,
  unbounded work costs an agent: observable failure lags the decisive error by a median of about
  10 steps.
- **Two of `cli-mcp`'s five success criteria are unmet since 2026-09-06**
  (`.sdlc/intents/cli-mcp/intent.md`). The second is "a copy-pasteable client configuration that
  works unmodified": the docs page's block names `mytool`, and no test runs it. The first, B1
  over MCP, is [`b1-mcp-arm`](../b1-mcp-arm/intent.md).

## Affected users and systems

- **Every program on burgee that serves `--mcp`**, including commander- and yargs-syntax programs
  on the façades, which reach the same `serveMcp`.
- `packages/burgee`: `mcp.ts`, `mcp-entry.ts`, `surfaces.ts`, `ctx.ts`, `execute.ts`.
- `apps/docs/content/docs/agent-surfaces.mdx` (the client configuration).
- **Depends on** [`clispec-conformance`](../clispec-conformance/intent.md) R5 for the `output`
  declaration behind `outputSchema`, and on
  [`agent-lint-conformance`](../agent-lint-conformance/intent.md) R3 for `ctx.signal`.

## Constraints

- **stdio only, opt-in exposure, no authentication**: `cli-mcp`'s decisions stand.
- **Zero dependencies.** The server stays hand-rolled JSON-RPC over `node:readline`. The MCP
  schema files used in tests are fixtures, never a package dependency.
- **Backwards compatible.** A client on `2025-06-18` gets exactly what it gets today plus fields
  it may ignore. The text content stays beside `structuredContent`, as the protocol recommends.
- **Annotations stay hints** (`agent-requirements.md` §5): cancellation and progress are protocol
  features, never a security boundary.
- **The core byte budget holds.** `--mcp` loads through `surfaces.ts`, and none of this reaches a
  run without the flag.

## Success criteria

1. `tools/call` on a command with a JSON result returns `structuredContent` equal to the
   envelope's `data`, and `tools/list` carries `outputSchema` for every command that declares
   one. Held by `packages/burgee/src/mcp.test.ts`, proven red on `3a05dc8aad`.
2. `notifications/cancelled` for an in-flight call aborts its `ctx.signal`, its exit handlers run
   once, and no response is sent for it. Held by `mcp-transport.test.ts`.
3. Every message the server sends in the test suite validates against the vendored JSON schema
   of the revision it negotiated.
4. `cli-mcp`'s copy-pasteable-configuration criterion is met: the docs block is generated from
   the demo, and a test starts the server from it and completes a `tools/call`.

## Open questions

- Which revisions to support. **Answered 2026-10-12 in `spec.md`**: `2025-06-18` and the newest
  published revision on the day R3 is built, read from the specification repository's schema
  files, never from memory.
- Whether progress needs a new API. **Answered 2026-10-12 in `spec.md`**: one method,
  `ctx.progress(done, total?, message?)`, a no-op outside an MCP call that asked for progress.
