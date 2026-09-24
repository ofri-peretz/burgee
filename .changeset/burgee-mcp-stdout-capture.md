---
"burgee": patch
---

`--mcp` keeps stdout for JSON-RPC frames only. A tool call whose handler printed — `console.log` in a `burgee/commander` action, the common case, or a direct `process.stdout.write` — wrote onto the stream the frames go out on, so the client read `hello` between two replies as a malformed message and the tool result itself said `data: null`. During a call, stdout and the stdout-printing `console` methods are now captured and returned as a second text item after the envelope, so printed output becomes the tool result; stderr is left on stderr. Both are restored when the call settles, including when it throws, and a runner that rejects is answered as an `isError` result instead of ending the server.
