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
  **Amended 2026-10-12** ([D-20261012-mcp-version-negotiation](../../decisions/D-20261012-mcp-version-negotiation.md)):
  the newest published revision, `2026-07-28`, has no `initialize`, so the list is the newest
  revision *with a handshake*: `2025-06-18` and `2025-11-25`. Serving `2026-07-28` is
  [B-20261012-mcp-2026-07-28-stateless](../../gaps/B-20261012-mcp-2026-07-28-stateless.md).
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
| R3 | `mcp.test.ts`: the specification's rule, a supported revision is answered with itself and anything else with the latest supported. Asking `2025-06-18` gets it; asking `2025-11-25` gets it; asking `2026-07-28`, an unknown string, a non-string or nothing gets `2025-11-25`. `scripts/mcp-messages.test.ts`: every message of each session validates against the schema of the revision it was answered | today: every client gets `2025-06-18` |
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
| R3 | **Built** 2026-10-12 | `mcp.ts` (`SUPPORTED_REVISIONS`, `2025-06-18` and `2025-11-25`; `initialize` answers the client's `protocolVersion` when it is listed, and `MCP_PROTOCOL_VERSION`, now `2025-11-25`, otherwise), `__fixtures__/mcp/2025-11-25/schema.json` (copied unmodified from the specification repository at `1f520964b2`, the commit `NOTICE.md` already names). **One departure, decided** ([D-20261012-mcp-version-negotiation](../../decisions/D-20261012-mcp-version-negotiation.md)): the newest published revision, `2026-07-28`, has no `initialize`, so asking for it gets `2025-11-25`; serving it is the gap [B-20261012-mcp-2026-07-28-stateless](../../gaps/B-20261012-mcp-2026-07-28-stateless.md). For a tools-only stdio server, `2025-11-25` changes no message shape against `2025-06-18`: its additions are optional and for features this server does not offer, so the answer is the only code. `./mcp` 27,991 → 28,177 B, budget 28,200 ([D-20261012-mcp-current-budget](../../decisions/D-20261012-mcp-current-budget.md)); `.` unchanged at 35,538 | `mcp.test.ts` › `negotiates the protocol revision (R3)` (`2025-06-18` and `2025-11-25` each get themselves; `2026-07-28`, `1999-01-01`, a number and no version get `2025-11-25`; `SUPPORTED_REVISIONS` is the two). `mcp-messages.test.ts` › `on a native program, asking %s, against %s…` (all four asks, each session against the schema of the revision answered), and the rest of the suite once per revision. Red on main: `expected '2025-06-18' to be '2025-11-25'`, for `2025-11-25` and for `2026-07-28`, and `expected undefined to deeply equal [ '2025-06-18', '2025-11-25' ]` |
| R4 | **Built** 2026-10-12 | `mcp.ts` (`serve` keeps calls in flight by id and dispatches without awaiting; `holdStdout` and `printedBy` capture per call through `AsyncLocalStorage`, since a per-call global swap cannot survive two calls overlapping), `ctx.ts` (`ctx.signal` is `AbortSignal.any` of the `--timeout` signal and the call's, read through `Symbol.for('burgee.mcp')`, so `ctx.js` never imports the server). The abort reason is the string `cancelled`. Replies now go out in the order calls settle, which JSON-RPC allows; `json-failure.test.ts` looked replies up by position and now looks them up by id. `./mcp` 26,695 → 27,991 B with R5, budget 28,000 ([D-20261012-mcp-current-budget](../../decisions/D-20261012-mcp-current-budget.md)); `.` unchanged | `mcp-transport.test.ts` › `aborts ctx.signal on notifications/cancelled, runs the exit handler once, sends no reply for it, and answers a call beside it` (and ignores a cancellation for an unknown id or with no params). Red on main: `Test timed out in 2000ms`, because the cancellation was read only after the call it named had ended |
| R5 | **Built** 2026-10-12 | `manifest.ts` (`RunContext.progress`), `ctx.ts` (the call's sender, or a no-op), `mcp.ts` (`callTool` builds the sender from `_meta.progressToken`; it sends nothing once the call is cancelled, and drops a value that does not rise, since the protocol requires progress to increase). `flagstaff/src/progress.ts`, the `flagstaff/progress` subpath: the bar reads the call through `Symbol.for('burgee.mcp')` on every render and, when the call has a sender, sends `done`, `total` and its static line and draws nothing. **One departure.** Built inside the bar it put flagstaff's `.` entry at 29,529 B against its 29,300 budget, for a feature only an MCP-served program uses. So the bar moved to `progress-bar.ts`, which `.` re-exports without the bridge: `import { progress } from 'flagstaff'` always draws, and `flagstaff/progress` reports. `.` 29,266 -> 29,270 B (the longer file name), `./progress` 971 -> 1,575 B against 2,000; no budget moved | `mcp-transport.test.ts` › `sends one notifications/progress per ctx.progress, carrying the token…` (three notifications, a fourth that did not rise dropped, none without a token) and `is a no-op outside a call…`; `mcp-messages.test.ts` › `on a call that asked for progress: every notifications/progress validates` and `…a flagstaff/progress bar reports through it instead of drawing` (three notifications carrying the static line, an empty result; the same call without a token draws); `flagstaff/src/progress.test.ts`. Red on main: `expected [] to deeply equal [ { jsonrpc: '2.0', …(2) }, …(2) ]`, `TS2339: Property 'progress' does not exist on type 'CommandContext<…>'`, and for the flagstaff half `expected [] to deeply equal [ { progressToken: 'cp', …(3) }, …(2) ]` |
| R6 | **Built** 2026-10-12 | `mcp-config.ts` (new, its own chunk: `surfaces.ts` imports it only when `--print-config` follows `--mcp`, so `./mcp` and the start-up path do not grow), `scripts/mcp-config-block.ts` (the writer, with `--check`), `agent-surfaces.mdx` (the block between `mcp-config:start` and `mcp-config:end`). A program started as one of its package's bins, through npm's symlink or by its own path, is started by that bin's name, through `cmd /c` on Windows (npm's `.cmd` shim cannot be started without a shell, and a client starts `command` with none); anything else is `node` and the script's real path. The page carries the POSIX form, and the Windows lane checks its own `cmd /c` form against what it prints and starts that. The key is the program's name, the one `initialize` reports. **Two departures.** The page check is a root lock, `scripts/mcp-config-block.test.ts`, not `apps/docs/tests/`: root locks run after the build in CI, which the check needs, and it puts the demo's bin on `PATH` through its own symlink, because `npm ci` links no workspace bin that is not built yet. And `--print-config` is native only: the commander and yargs façades route `--mcp` themselves, and `./yargs` has 21 B under its budget | `mcp-config.test.ts` › `--mcp --print-config (R6)` (the bin's name through a symlink; a string `bin` as the unscoped package name; `node <script>` when not started as a bin, with no `bin`, with a bin not built, and with no package.json; not read after `--`); `mcp-config-block.test.ts` › `is what the demo prints…` and `starts the server it names, as pasted, and completes initialize, tools/list and a tools/call`. Red on main: `expected '' to be '{\n  "mcpServers": …'` and `Unexpected end of JSON input`: `--print-config` was not read, and the run served `--mcp` on a closed stdin |
| R7 | **Built** 2026-10-12 | `scripts/mcp-messages.test.ts`, `packages/burgee/src/__fixtures__/mcp/2025-06-18/schema.json` (with the specification repository's `LICENSE` and a `NOTICE.md` naming the commit), `flagstaff/src/conforms.ts` (`anyOf`, `enum`, a `type` list, and `$ref` into draft-07 `definitions`: the 2025-06-18 schema uses all four). **Two departures.** The recorder is a root `scripts/` test, not `mcp.test.ts`: burgee's `tsconfig.json` roots at `src`, so no test inside the package can import flagstaff's walker, the reason `program-schema.test.ts` sits there too. And one frame is excused one key: the error for a line that is not a request (not JSON, or no `method`) carries `id: null`, which JSON-RPC 2.0 §5 requires and 2025-06-18's `RequestId` (a string or an integer) refuses, so no frame the server could write for that line validates. It is checked against `JSONRPCError` without `id`, and nothing else is excused. Each reply is checked against the result type of the method it answers, because `Result` admits any key. Only 2025-06-18 is vendored: R3 owns the second revision | `mcp-messages.test.ts` › `on a native program…` (12 frames: 7 results, 4 errors, `tools/list_changed`), `on a commander program…`, `fails a mutation that renames protocolVersion…` (`frame 0.result.protocolVersion: required`). Red on the walker as it was: `frame 1.result: unknown $ref #/definitions/InitializeResult`, on every frame |
