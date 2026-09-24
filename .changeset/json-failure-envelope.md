---
"burgee": patch
---

A handler that fails under `--json` is now one `{ "ok": false, "error": … }` envelope on stdout and the exit code its error names, on every front end. A `burgee/commander` action that threw under a plain `parseAsync(process.argv)` escaped as a stack trace; the native engine wrote the failure envelope to stderr with stdout empty; `burgee/yargs` let a synchronous throw or a thrown non-Error escape `parseAsync()`, filed a thrown string as a usage error, and wrote an async rejection's envelope twice under `--mcp`; and both façades exited 1 for an `AuthError` where E6 promises 5. Without `--json` a façade program run the incumbent's way behaves exactly as before — a throw is still commander's or yargs' to surface; through an injected seam (`--mcp`, `burgee/testing`) an `AuthError` now exits 5 there too.
