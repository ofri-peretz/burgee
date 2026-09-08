---
"flagstaff": patch
---

`flagstaff/log-update` restores the cursor when the process is signalled, not only when it exits normally. It shipped with `process.once('exit', …)` and nothing else — which node does not run when a signal with no listener terminates the process — so Ctrl+C mid-frame left the terminal with no cursor. That is the same defect `flagstaff/ora` fixed before it shipped, so the fix is now one module, `src/cursor.ts`, that both façades import: `signal-exit`'s 22.0 KB in 1.4 KB, with the re-raise and its `listenerCount` guard, so a program that installed its own `SIGINT` handler is still delivered exactly one signal and is never overruled. Graded per façade against the built `dist/` in a child process that is really signalled.
