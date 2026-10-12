---
"burgee": minor
---

`--mcp` tool results carry `structuredContent`. When a call's stdout is the `--json` envelope, the result carries the envelope's `data` as `structuredContent` (wrapped as `{ "result": data }` when it is not an object, since the protocol requires one), or the envelope's `error` with `isError: true` on a failure. The text content stays first and unchanged, so a client that reads only text sees what it saw before. A run that printed prose rather than an envelope carries no `structuredContent`.
