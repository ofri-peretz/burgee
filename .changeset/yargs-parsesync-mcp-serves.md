---
"burgee": patch
---

`--mcp` now serves a `burgee/yargs` program that ends in `.parseSync()`, including one that goes
on to call `process.exit()` after `parseSync()` returns, as concurrently does on an empty argv.
In 1.8.0 that exit ended the server before it read a line. The program printed help and exited 0,
and the client got no reply. Under `parseSync()` the server now reads and answers synchronously,
one request at a time, and the process exits when the input ends, before `parseSync()` returns.
A tool call runs as the program's own `.parseSync()`. Concurrent calls, cancellation and
asynchronous handlers still need `.parseAsync()`.
