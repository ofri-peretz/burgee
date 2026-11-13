---
id: D-20261113-apicontract-mocks-and-mcp-generation
subject: 'apicontract: may a plugin generate MSW handlers and MCP servers, which the design rejected on 2026-11-06?'
taken: Taken
date: '2026-11-13'
superseded_by: —
---

**Yes to both. Generating MSW handlers and generating an MCP server from a spec are reopened as
generator plugins.** The owner was shown the question "Should MSW handlers and MCP-server generation
be reopened as generators?" with both sides stated in
[`roadmap.md`](../intents/apicontract/roadmap.md), and answered "Reopen both" on 2026-11-13.

[`spec.md` § Rejected alternatives](../intents/apicontract/spec.md#rejected-alternatives) had
rejected "building mocking, Pact-style consumer tests, or SDK/MCP-server generation" on 2026-11-06,
five days before the owner defined the product as a generator
([`D-20261112-apicontract-is-a-generator`](./D-20261112-apicontract-is-a-generator.md)).

What this changes:

- **MSW handlers and fixtures** from a spec's examples and schemas are a generator plugin. MSW stays
  the runtime; we do not build a mock server.
- **`gen mcp`** generates an MCP server from a spec, handlers user-owned. Its extract and drift
  halves were already accepted for Phase 6.

What it does not change:

- **Publishable SDK generation stays rejected**, and so do Pact-style consumer tests and a mock
  server of our own.
- The cost named in the rejection is accepted, not refuted: generating MCP servers overlaps with what
  Speakeasy and Stainless sell, so sponsorship from them is less likely.

**Assumed until the owner says otherwise:** both land in Phase 4, which is where the proposal put
them. The ruling was on whether to build them, not on when.
