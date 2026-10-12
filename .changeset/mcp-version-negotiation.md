---
"burgee": minor
---

`--mcp` negotiates the protocol revision. `initialize` answers the client's `protocolVersion` when it is one the server supports, `2025-06-18` or `2025-11-25`, and the latest it supports, `2025-11-25`, otherwise, as the specification's negotiation rule asks. A client on `2025-06-18` gets exactly what it got before. `MCP_PROTOCOL_VERSION` (from `burgee/mcp`) is now `2025-11-25`, the latest revision served. `2026-07-28`, which has no `initialize`, is not served: a client asking for it in an `initialize` gets `2025-11-25`, and a dual-era client that probes `server/discover` first gets `method not found` and falls back to `initialize`.
