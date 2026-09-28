---
"closeout": patch
---

Fixed: a process whose shutdown was waiting on a handler that holds nothing in the event loop exited 0 instead of leaving the way its trigger decided. SIGTERM through `install()` now dies of SIGTERM, an uncaught throw exits 1 and prints the error, and `closeout/exit-hook` exits 143 on SIGTERM, as `exit-hook` does. The deadline now keeps the event loop alive until the shutdown finishes or times out, on every trigger except `'beforeExit'`. When it times out, the breach report names the handler that hung.
