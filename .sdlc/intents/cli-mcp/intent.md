# Intent — `cli-mcp`: every CLI on the floor is already an MCP server

**Status:** review · **Opened:** `2026-09-06` · **Owner:** `@ofri-peretz`

---

## What is wanted

`mytool --mcp` serves the CLI as an MCP server over stdio, with every command exposed as
a typed tool, generated entirely from the manifest. The author writes nothing: no tool
definitions, no JSON Schema, no second interface to keep in sync.

## Why now

The manifest already exists for other reasons — F1 emits it as `--schema`, F2 renders
help from it, D2 generates completions from it, and §2 of the architecture review makes
plugins declare into it. An MCP tool definition is the same data in a different shape:
name, description, typed parameters, required set.

That makes this the cheapest high-value feature in the plan, and the one that changes the
pitch. Today the claim is "agents drive your CLI more efficiently" — a 40% improvement on
an existing workflow. With `--mcp` the claim becomes **"your CLI is an agent tool"**,
which is a different category and does not require the agent to shell out at all.

It also closes a gap the research names directly: citty #187 wants to call a command
programmatically and "get the output (to feedback to LLM)"; yargs #1605 and #1838 want
programmatic invocation and command lookup; yargs #2121 and #1005 want introspection.
M6 already makes `resolveCommand` and `runCommand` public. MCP is those primitives with a
protocol in front.

## Affected users and systems

- `commander-agent` and `yargs-agent` gain `--mcp`; the implementation is host-neutral
  and lives in `cli-core`.
- A new dependency question: MCP needs a transport. Resolved under constraints below.
- `cli-benchmarks` B1 gains a task set run through MCP rather than Bash, which measures
  the claim directly.
- The docs site gains a page a user can paste into an agent's configuration.

## Constraints

1. **K1 holds: zero runtime dependencies.** MCP over stdio is JSON-RPC over stdin/stdout.
   That is implementable in a few hundred lines against `node:readline`; pulling an SDK
   for it would break the headline property of every package we ship.
2. **The manifest is the only source.** No hand-written tool definitions anywhere. If a
   tool definition needs something the manifest lacks, the manifest gains a field and
   `--schema` gains it too.
3. **Destructive commands are not exposed by default.** A command must opt in
   (`mcp: true`) or declare itself read-only. An agent gaining shell-equivalent power
   over a CLI it did not write is a security posture, not a convenience.
4. **`--mcp` implies non-TTY**: no prompts, no spinners, no colour (O2), and every error
   is an E3 envelope.

## Success criteria

1. `mytool --mcp` passes an MCP client handshake and lists every opted-in command as a
   tool with typed parameters derived from the schema.
2. Zero runtime dependencies added, asserted by the K1 lock.
3. A destructive command is absent from the tool list until it opts in, asserted by a test.
4. `cli-benchmarks` B1 reports the same task set over MCP and over Bash, so the
   difference is a measured number rather than a claim.
5. The docs page contains a copy-pasteable client configuration that works unmodified.

## Verified against `main` — 2026-09-09

Checked criterion by criterion on `61bd11b9`. **Three of five met.** The status stays `review`.

- **`--mcp` passes a client handshake and lists every opted-in command as a typed tool** —
  **met, and driven live.** Piping `initialize` then `tools/list` into
  `node examples/demo-cli-burgee/dist/bin.js --mcp` returns `protocolVersion 2025-06-18`,
  `serverInfo {name: "demo"}` and three tools, each with a full `inputSchema` and `annotations`.
  It works on commander-syntax programs too (`adoption-ladder.test.ts`). Note the incumbent
  demos, which run real commander and yargs, do not get `--mcp` — only burgee-hosted programs do.
- **Zero runtime dependencies added, asserted by K1** — **met.** `packages/burgee/package.json`
  declares `"dependencies": {}`, and `shape.test.ts` proves it against an installed tarball. The
  server is hand-rolled JSON-RPC over `node:readline`.
- **A destructive command absent from the tool list until it opts in** — **met.**
  `src/mcp.test.ts:33` declares a `wipe` command with no `effects` and asserts its absence. The
  opt-in spelling is `effects:` rather than the `mcp: true` this intent's constraints name — a
  wording drift, same semantics.
- **B1 reports the same task set over MCP and over Bash** — **not met.** No benchmark exists;
  the two bands that would hold this sit at 0 of 8 points.
- **A copy-pasteable client configuration on the docs page that works unmodified** — **not met as
  written.** `/docs/agent-surfaces` is live and carries an `mcpServers` block, but it is a
  template naming `mytool`, so it does not work unmodified, and no test in `apps/docs/tests/`
  checks it.

## Open questions

None open. Decided at finalisation (2026-09-06): stdio transport only, because HTTP
transport implies a server lifecycle, auth and a network surface that a CLI has no
business owning; opt-in rather than opt-out for exposure, because the failure mode of the
other default is an agent running a destructive command nobody intended to publish.
