# Design — `--mcp` speaks the current protocol

Intent: [`intent.md`](./intent.md). **Status:** approved.

**Accepted by the owner, 2026-10-12, by instruction: create and execute.** The instruction and the
evidence are recorded in [`next-wave-2026-10.md`](../../research/next-wave-2026-10.md).

> Requirement ids are `R1`… so they cannot collide with the floor ids `scripts/run-evals.ts`
> reads from `burgee/spec.md`.

---

## Requirements

- **R1 — Results carry `structuredContent`.** When a call's stdout is the `--json` envelope with
  `ok: true`, the result carries `structuredContent: data`. `data` is used as-is when it is an
  object, and wrapped as `{ "result": data }` otherwise, because the protocol requires an
  object. On `ok: false`, `structuredContent` is the envelope's `error` object, with
  `isError: true`. The text content stays first, unchanged, for clients that read only text.
- **R2 — `outputSchema` from the declaration.** A command whose `output.schema` is declared
  (`clispec-conformance` R5) lists `outputSchema` in `tools/list`, wrapped the same way as R1
  when the schema is not an object type. A command without one lists none: an absent schema is
  honest, and an invented one is not.
- **R3 — The revision is negotiated.** `SUPPORTED_REVISIONS` lists `2025-06-18` and the newest
  revision published in the specification repository on the day this is built. `initialize`
  answers the client's requested revision when it is in the list, and otherwise the newest.
  `MCP_PROTOCOL_VERSION` stays exported as the newest. Each revision's schema JSON is vendored
  under `packages/burgee/src/__fixtures__/mcp/<revision>/schema.json`, with its licence.
- **R4 — Cancellation stops the command.**
  - Requests are dispatched without waiting for the previous one to finish, so a cancellation
    can be read while a call runs.
  - `notifications/cancelled { requestId }` aborts that call's `ctx.signal` (built by
    `agent-lint-conformance` R3), with the reason `cancelled`.
  - closeout's handlers run once, and no response is sent for the cancelled request, as the
    protocol requires.
  - A cancellation for an unknown or finished request is ignored.
- **R5 — Progress, when asked for.** A `tools/call` whose `_meta.progressToken` is set makes
  `ctx.progress(done, total?, message?)` send `notifications/progress` with that token.
  Everywhere else `ctx.progress` is a no-op, so a handler calls it unconditionally.
  `flagstaff/progress`, when it runs inside such a call, reports through it rather than drawing.
- **R6 — A client configuration that works unmodified.** `--mcp --print-config` prints an
  `mcpServers` block for this program, with its name and the command and arguments that start
  it, read from `process.argv` and the owning `package.json`'s `bin`. The block on
  `/docs/agent-surfaces` is generated from the demo's output. A test starts the server from that
  exact block and completes `initialize`, `tools/list` and one `tools/call`.
- **R7 — Every message validates.** The MCP tests record each message the server writes and
  validate it against the vendored schema of the negotiated revision, using the family's
  hand-written JSON Schema walker (D-123). A message that does not validate fails the suite.

## Design

**Order:** R3 and R7 first, so every later change is checked against the schema it claims. Then
R1, then R4 (it needs `ctx.signal`, which `agent-lint-conformance` R3 builds), then R5, then R2
(it needs `clispec-conformance` R5), then R6.

**Concurrency in the reader.** `serveMcp` reads lines with `node:readline` and today awaits each
`handle()` before reading on. It changes to a map of in-flight calls keyed by request id: each
call starts and is stored, and its reply is written when it settles. `notifications/cancelled`
looks up the map. Replies stay one JSON object per line, written whole, so concurrent replies
cannot interleave inside a line.

**Where the data comes from.** `callTool` already reads the envelope off stdout as text. R1
parses it once. If it does not parse (a commander action that printed prose, for example), there
is no `structuredContent`, which is the protocol's own fallback, and the text is unchanged.

**`ctx.progress` is one method on the run context.** It is set per call by the MCP invoke path,
and is a shared no-op otherwise, so it costs the core nothing.

## Verification

| R | Check | Proven red by |
| :-- | :-- | :-- |
| R1 | `packages/burgee/src/mcp.test.ts`: `structuredContent` deep-equals the envelope's `data`; a scalar result is wrapped; a failure carries the error object | today: the result has `content` and `isError` only |
| R2 | `mcp.test.ts`: a command with `output.schema` lists `outputSchema`; `structuredContent` validates against it; a command without one lists none | today: no `outputSchema` key exists |
| R3 | `mcp.test.ts`: a client asking `2025-06-18` gets it; asking the newest gets it; asking an unknown one gets the newest | today: every client gets `2025-06-18` |
| R4 | `packages/burgee/src/mcp-transport.test.ts`: a handler awaiting `ctx.signal` is cancelled mid-call; its exit handler ran once; no reply for its id; a second call in flight still answers | today: the cancel is read only after the call ends, and nothing aborts |
| R5 | `mcp-transport.test.ts`: with a `progressToken`, three `ctx.progress` calls produce three notifications carrying the token; without one, none | today: no `ctx.progress` |
| R6 | `apps/docs/tests/` plus a new `packages/burgee/src/mcp-config.test.ts`: the generated block starts the demo's server and completes a call; the docs block equals the generated one | today's docs block names `mytool` |
| R7 | the recorder in `mcp.test.ts`: every written message validates; a mutation renaming `protocolVersion` in `initialize` fails | the vendored schema rejects the mutated message |

Every PR also runs `runtime-ratchets-lock` (core bytes unchanged, since `--mcp` loads lazily) and
`scripts/front-end-boundary-lock.test.ts`.

## Rejected alternatives

- **Take `@modelcontextprotocol/sdk`.** It is a runtime dependency, which rule 2 forbids, for a
  protocol surface of five methods. The schema files are the part worth borrowing, and they are
  fixtures.
- **Infer `outputSchema` from a sample result.** One run's shape is not a contract. An absent
  schema is correct, and an inferred one is a claim nobody made.
- **Kill the process on cancellation.** The server serves many calls from one process. Aborting
  the signal and letting closeout clean up is the same path a timeout takes, and it leaves the
  server running.
- **Resources and prompts in this intent.** `cli-mcp` scoped them out because nothing in the
  manifest maps to them, and that has not changed.

## Out of scope

- HTTP transport, authentication, and serving programs not built on burgee (`cli-mcp`'s
  decisions).
- Elicitation and sampling. An option-first CLI asks nothing mid-run, and a prompt in a non-TTY
  is already a usage error naming the flag.
- The B1 measurement over MCP, which is [`b1-mcp-arm`](../b1-mcp-arm/intent.md).

## Status

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | **Built** 2026-10-12 | `mcp.ts` (`structuredOf`, called from `callTool`). The envelope is parsed from the text the result already carries, so a run that printed prose has no `structuredContent` and its text is unchanged. `./mcp` 25,850 → 26,215 B, budget 26,250 ([D-20261012-mcp-current-budget](../../decisions/D-20261012-mcp-current-budget.md)); `.` unchanged at 35,105 | `mcp.test.ts` › `carries structuredContent beside the text (R1)` (object data deep-equals the envelope's `data`; a scalar is `{ result }`; a failure carries `error` with `isError`; prose carries none). Red on main: `expected undefined to deeply equal { key: 'user', value: 'ada' }`, and the same `undefined` for the scalar and the error |
| R2 | **Built** 2026-10-12 | `mcp.ts` (`outputSchemaOf`, spread by `toolsOf`; `structuredOf` wraps a declared command's result by its schema's type, not the value, so a result that is an object under an `anyOf` schema still matches the `outputSchema` listed), `agent-surfaces.mdx` (Results). **One departure.** "`structuredContent` validates against it" is checked in `scripts/mcp-messages.test.ts`, for the reason R7's recorder sits there: no test inside the package can import flagstaff's walker. `./mcp` 26,215 → 26,695 B, budget 26,700; JSON without a boolean `ok` carries no `structuredContent`, from review on #1047 ([D-20261012-mcp-current-budget](../../decisions/D-20261012-mcp-current-budget.md)) | `mcp.test.ts` › `lists outputSchema for a command that declares one (R2)` (as declared for an object type; `{ result }`-wrapped otherwise; the result has the advertised shape; none without a declaration); `mcp-messages.test.ts` › `on a program whose commands declare output schemas…` (the list validates against 2025-06-18, and each `structuredContent` against its tool's `outputSchema`). Red on main: `expected undefined to deeply equal { type: 'object', …(2) }`, for the object and the wrapped schema |
| R3 | Not built | `mcp.ts`, `__fixtures__/mcp/` | `mcp.test.ts` |
| R4 | Not built | `mcp.ts` (`serveMcp`), `ctx.ts` | `mcp-transport.test.ts` |
| R5 | Not built | `ctx.ts`, `mcp.ts`, `flagstaff/progress` | `mcp-transport.test.ts` |
| R6 | Not built | `surfaces.ts`, `apps/docs` | `mcp-config.test.ts` |
| R7 | **Built** 2026-10-12 | `scripts/mcp-messages.test.ts`, `packages/burgee/src/__fixtures__/mcp/2025-06-18/schema.json` (with the specification repository's `LICENSE` and a `NOTICE.md` naming the commit), `flagstaff/src/conforms.ts` (`anyOf`, `enum`, a `type` list, and `$ref` into draft-07 `definitions`: the 2025-06-18 schema uses all four). **Two departures.** The recorder is a root `scripts/` test, not `mcp.test.ts`: burgee's `tsconfig.json` roots at `src`, so no test inside the package can import flagstaff's walker, the reason `program-schema.test.ts` sits there too. And one frame is excused one key: the error for a line that is not a request (not JSON, or no `method`) carries `id: null`, which JSON-RPC 2.0 §5 requires and 2025-06-18's `RequestId` (a string or an integer) refuses, so no frame the server could write for that line validates. It is checked against `JSONRPCError` without `id`, and nothing else is excused. Each reply is checked against the result type of the method it answers, because `Result` admits any key. Only 2025-06-18 is vendored: R3 owns the second revision | `mcp-messages.test.ts` › `on a native program…` (12 frames: 7 results, 4 errors, `tools/list_changed`), `on a commander program…`, `fails a mutation that renames protocolVersion…` (`frame 0.result.protocolVersion: required`). Red on the walker as it was: `frame 1.result: unknown $ref #/definitions/InitializeResult`, on every frame |
