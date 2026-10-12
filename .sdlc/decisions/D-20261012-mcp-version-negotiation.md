---
id: D-20261012-mcp-version-negotiation
subject: 'Which MCP revisions `initialize` negotiates, and what it answers a client asking for one it does not support'
taken: Taken — owner's default, owner-reversible
date: '2026-10-12'
superseded_by: —
---

**`initialize` follows the specification's own negotiation rule: when the client asks for a
revision the server supports, the server answers with that revision; otherwise it answers with
the latest revision it supports. The supported revisions are the two handshake revisions,
`2025-06-18` and `2025-11-25` (`SUPPORTED_REVISIONS` in `packages/burgee/src/mcp.ts`), and the
latest is `2025-11-25` (`MCP_PROTOCOL_VERSION`). A client asking for `2026-07-28`, or for any
string the server does not know, or for nothing, gets `2025-11-25`.** It closes
[mcp-current](../intents/mcp-current/spec.md) R3, whose wording ("asking the newest gets it")
could not be met as written.

**Why not "the newest published revision", as R3 said.** On the day R3 was built, the newest
revision in the specification repository (commit `1f520964b2`, 2026-10-10) is `2026-07-28`, and
it has no `initialize`: it removes the handshake, carries the protocol version and client
capabilities in every request's `_meta`, adds `server/discover`, and requires a `resultType` on
every result (`docs/specification/2026-07-28/changelog.mdx`, items 2, 3 and 8). A client on that
revision never sends `initialize`, so no answer to `initialize` can give it `2026-07-28`, and a
server that named `2026-07-28` in an `initialize` reply would be claiming a protocol whose
messages it does not send. The rule in force for the handshake era is
`docs/specification/2025-11-25/basic/lifecycle.mdx` § Version Negotiation: "If the server supports
the requested protocol version, it MUST respond with the same version. Otherwise, the server MUST
respond with another protocol version it supports. This SHOULD be the latest version supported
by the server."

**Why these two.** `2025-06-18` is what the server answered before, so every client that works
today keeps exactly what it gets (the intent's backward-compatibility constraint). `2025-11-25` is
the latest revision with a handshake. Against `2025-06-18`, for a tools-only stdio server, its
schema adds only optional fields for features this server does not offer (`icons`, `execution`,
`tasks`, `websiteUrl`, a `task` on `tools/call`), renames `JSONRPCError` to
`JSONRPCErrorResponse` and makes its `id` optional, and moves request and notification `params`
into named types; no message the server writes changes shape. The two prose changes that touch a
tool server already hold: an input-validation failure is a tool result with `isError: true`, not
a protocol error (SEP-1303), and the server writes no `$schema`, so its `inputSchema` reads as
JSON Schema 2020-12, the new default dialect (SEP-1613), using only keywords that mean the same
in draft-07. Both schemas are vendored under `packages/burgee/src/__fixtures__/mcp/`, and every
message the server writes in the suite is validated against the schema of the revision it
answered (`scripts/mcp-messages.test.ts`).

**Why `2026-07-28` is a separate intent.** It is not a version string but a different server:
no handshake, per-request `_meta` validation with `UnsupportedProtocolVersionError`,
`server/discover`, `resultType` on every result, `ttlMs` and `cacheScope` on `tools/list`, and no
`ping`. A dual-era client already reaches this server: on stdio it probes with `server/discover`,
gets `method not found`, and falls back to `initialize`
(`docs/specification/2026-07-28/basic/transports/stdio.mdx` § Backward Compatibility). Serving
`2026-07-28` itself is recorded as the gap
[B-20261012-mcp-2026-07-28-stateless](../gaps/B-20261012-mcp-2026-07-28-stateless.md).

The owner may reverse this; the cost to `./mcp` is 186 B
([D-20261012-mcp-current-budget](./D-20261012-mcp-current-budget.md)).
