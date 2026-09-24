---
"burgee": patch
---

`--mcp` holds stdout for the whole session, not only during a tool call. A timer or stream a handler left behind that printed after its reply went out still landed on the JSON-RPC transport, and a strict client stopped parsing there. Between calls, anything written to stdout now goes to stderr; replies are the only thing on the transport.
