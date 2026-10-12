---
"burgee": minor
---

`--mcp` serves calls concurrently, honours `notifications/cancelled`, and sends progress. A request no longer waits for the one before it, so a client can cancel a call while it runs: the call's `ctx.signal` aborts with the reason `cancelled`, its `ctx.onExit` handlers run once as they do after a timeout, and no response is sent for it, as the protocol requires. A cancellation for an unknown or finished request is ignored. Replies go out in the order calls settle.

`ctx.progress(done, total?, message?)` is new on every handler's context. Inside an `--mcp` call whose client sent `_meta.progressToken`, each call sends `notifications/progress` with that token, once the value rises above the last one sent. Everywhere else it does nothing, so a handler calls it unconditionally.
