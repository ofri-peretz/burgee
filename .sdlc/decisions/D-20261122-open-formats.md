---
id: D-20261122-open-formats
subject: 'Which contract formats does the CLI follow, and how do we keep up with them?'
taken: Taken
date: '2026-11-22'
superseded_by: —
---

**Open formats only, every one of them watched.** The owner, 2026-11-22: "we want to have all of
them. it is important we will follow open formats". The CLI (working name `apicontract`, to be
`contractdiff`) reads and writes only open, published, versioned specifications. A format is
supported when it is on the watch list ([`spec-release-watch`](../intents/spec-release-watch/),
accepted by this decision) and an adapter reads it; a format that is not watched is not supported.

**Governance applies to every one of them.** The owner, the same day: "we want to apply governance
for open contract formats that are industry standard". `lint`, `diff` and decision markers
([`apicontract-lint`](../intents/apicontract-lint/), [`apicontract-diff-decisions`](../intents/apicontract-diff-decisions/))
run on the one model every adapter reads into, so a format gains governance the day an adapter reads
it; no format gets a governance path of its own. The scope is industry-standard open formats:
published by a standards body or an open project, versioned, with a public spec. A vendor's private
format is read only through an open one it exports.

**The formats, and where each stands.**

| Format | Read today | Next |
|---|---|---|
| OpenAPI 3.0–3.2, Swagger 2.0, Overlay | yes | Arazzo |
| JSON Schema (+ Test Suite) | yes | — |
| AsyncAPI 2.6 / 3.0 (+ bindings) | yes | bindings per protocol |
| MCP | yes | A2A |
| Standard Schema | yes (extract) | — |
| OpenRPC, GraphQL SDL, protobuf (OTLP), Avro, CloudEvents | no | one intent each |
| OpenTelemetry semantic conventions | no | one intent; incumbent: OpenTelemetry Weaver |

Each "no" becomes its own intent before it is built: each is a design question (which
constructs map to the model, which defaults), not a mechanical addition. The watch files an issue
the day any of them releases, so the roadmap and the watch stay one list.

Nothing is published by this decision.
