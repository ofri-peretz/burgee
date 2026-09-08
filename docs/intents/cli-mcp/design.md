# Design — `cli-mcp`

Intent: [`intent.md`](./intent.md). **Status:** review.

---

## Requirements

| id | Requirement |
| :-- | :-- |
| N1 | `--mcp` serves the CLI over MCP stdio; tool definitions are generated from the manifest, never hand-written |
| N2 | A command appears as a tool only if it opts in; destructive commands default to absent |
| N3 | Zero runtime dependencies (K1); JSON-RPC over stdio is implemented against `node:readline` |
| N4 | Tool results are the O1 envelope, so an MCP client and a `--json` caller see identical payloads |
| N5 | `--mcp` implies non-TTY behaviour: no prompts, no colour, E3 errors, exit-code contract preserved in the envelope |

## Design

```
cli-core/src/mcp/
  serve.ts        # JSON-RPC 2.0 over stdio via node:readline
  tools.ts        # manifest node -> MCP tool definition
  invoke.ts       # tool call -> runCommand() (M6) -> O1 envelope
```

The translation is mechanical, which is the point:

| Manifest field | MCP tool field |
| :--- | :--- |
| command path (`config get`) | `name` (`config_get`) |
| description | `description` |
| option schema (S1, Standard Schema) | `inputSchema` (JSON Schema) |
| required options and positionals | `required` |
| examples (F3) | appended to `description` — a model uses them the way a human does |

Invocation reuses `runCommand` (M6) with a `Runtime` whose streams are captured — the
same seam the test harness uses (T1). An MCP tool call and an in-process test are the
same operation with different callers, which is why this costs so little to build.

**Why no SDK.** MCP over stdio is newline-delimited JSON-RPC 2.0. The protocol surface we
need is `initialize`, `tools/list` and `tools/call`. Implementing that is a few hundred
lines; depending on an SDK would break K1, which is the property we lead with against
`@oclif/core`'s eighteen dependencies. If the protocol grows past what is reasonable to
maintain by hand, that is a decision to revisit with a written reason.

**Opt-in exposure (N2).** `mcp: true` on a command, or `readOnly: true` which implies it.
The lint plugin gains a rule: a command whose name matches a destructive verb
(`delete`, `remove`, `destroy`, `reset`, `publish`, `deploy`) and sets `mcp: true`
without `confirm` is an error. That is a lint rule rather than a runtime block, because
the author may genuinely want it — they should just have to say so once, visibly.

**Order of work.** `tools/list` from the manifest first, because it is pure data
transformation and immediately demonstrable against any CLI on the floor. Then
`tools/call` through `runCommand`. Then the opt-in gating and its lint rule. Then the
benchmark variant.

## Status (2026-09-08)

| Req | State | Where |
| :-- | :-- | :-- |
| N1 | `--mcp` on every program: `initialize`, `ping`, `tools/list`, `tools/call` over stdio, tool definitions from the manifest | `packages/burgee/src/mcp.ts`, `mcp.test.ts` "handshake", "lists exactly" |
| N2 | a command is a tool only when it declares `effects`; the test that would list an undeclared command was written first and seen red | "lists exactly the commands that declared effects" |
| N3 | zero dependencies: `node:readline`, ~150 lines; the K1 lock holds | `weight.test.ts` |
| N4 | a tool call runs the command through `execute` with `--json`; the result text is that envelope, byte for byte, `isError` from the exit code | "returns the --json envelope … byte for byte" |
| N5 | a tool call injects its own streams: nothing reaches the terminal, errors are E3 envelopes | "reports a failing command as an error result" |
| N6 | `effects: read_only \| idempotent \| non_idempotent` on the manifest, generating `readOnlyHint` / `idempotentHint` / `destructiveHint`; `destructiveHint` is true only by declaration | "maps effects to the hints" |
| N8 | `--schema` reads the manifest and nothing else — no config, no network, no handler | `schema.test.ts` "no config, no network" |
| N9 | `choices`, defaults and requiredness are data in the JSON Schema per command | "carries choices, defaults and requiredness" |
| commander syntax | `.effects()` on the façade; `--schema` and `--mcp` from the projected manifest unless the program declares either flag itself | `adoption-ladder.test.ts` |
| lint rule (destructive verb + `mcp` without `confirm`) | not yet — with `eslint-plugin-cli-floor` | — |
| benchmark over MCP (B1) | not yet — `cli-benchmarks`, wave 4 | — |
| N7 | an idempotent command must return `changed: true \| false`; it rides as `meta.changed` in the envelope; silence is a RUNTIME failure naming the command | `agent.test.ts` "a no-op announces itself" |
| N11 | `ctx.actionRequired({ reason, message, next[], hint })` stops the command with exit CANCELLED (4); the envelope carries `status: action_required` and `next[]` rewritten as runnable commands — the program in front, the caller's `--json` carried | "the action-required envelope" |
| N12 | `detectAgent(env, tty)`: `AI_AGENT` (generic, or naming the agent) and the vendor variables the research verified (`CLAUDECODE`, `CURSOR_AGENT`, `CODEX_THREAD_ID`, `GEMINI_CLI`; the list is data); non-interactive by default under an agent, `FORCE_TTY=1` overrides; `ctx.interactive` and `ctx.agent` reach the handler | "agent detection, not just isTTY" |
| N13 | `--schema` prints the whole program when it fits `schemaBudget` (48,000 characters by default), a summary naming every command above it, and one command in full when a command is named — the drilling | "--schema under a budget" |

The `effects` field is optional in the type and required for exposure: a program without it
keeps working exactly as before and simply has no tools, which is N2's default.

## Verification

`packages/cli-core/src/mcp/serve.test.ts` drives a full handshake over a fake stdio pair
and asserts the tool list matches the manifest exactly — generated from it in the test as
well, so a manifest field added without an MCP mapping fails.

Proven-red, per rule 4: the N2 test marks a command destructive, asserts it is absent from
`tools/list`, and is written first against an implementation that exposes everything, so
the gate is seen to fail before it passes.

The conformance suite gains an MCP case on both hosts: same command, same envelope, over
Bash and over MCP, asserted byte-identical (N4).

## Rejected alternatives

- **An MCP SDK dependency.** Breaks K1, which is a headline property and a genuine
  differentiator. The needed surface is three methods.
- **HTTP transport.** Implies a server lifecycle, authentication and a network surface. A
  CLI has no business owning any of those, and stdio is what every client supports.
- **Opt-out exposure.** The failure mode is an agent running a destructive command the
  author never intended to publish. Opt-in costs one field.
- **A separate `mcp-<host>` package.** The manifest is host-neutral and lives in
  `cli-core`; a separate package would need the manifest anyway and would duplicate the
  envelope.
- **Hand-written tool definitions with a generator as a convenience.** Two sources of
  truth diverge; the manifest is already the source for help, schema and completions.

## Out of scope

- Resources and prompts (the other MCP primitives). Commands map to tools; nothing in the
  manifest maps cleanly to the others yet.
- Serving *other people's* CLIs that are not on the floor. That is a different product and
  it needs a manifest we did not generate.
- Agent authentication or permissioning. The client owns that; we expose what the author
  opted in to and nothing else.
