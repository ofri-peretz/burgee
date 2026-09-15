---
'burgee': minor
---

E5 and O5, which the design has marked `R` since it was written and which nothing implemented.

`exit-code.ts` has declared `SIGINT: 130` with the comment *"SIGINT after the terminal was restored (E5)"* from the first day of the contract, and `exit-code-lock.test.ts` grades that no other literal reaches an exit. Neither could see what was actually missing: **no code path produced 130 and nothing restored anything.** `grep -rn SIGINT packages/burgee/src` returned the declaration and nothing else. O5 — *"stdout is flushed before any exit path"*, yargs #1519 and #2118, *"No truncated JSON"* — was the same shape one line down, against `host.exit(code)`, which is `process.exit` and truncates a pipe by definition.

Both are now `closeout`'s, which is burgee's first dependency on it and the reason it exists: bound every exit path, run the handlers exactly once, hand the terminal back last. Writing the listener in burgee instead would have been the fourth copy of one in this repository.

- **`ctx.onExit(handler, label?)`** — cleanup that runs on every path out of a run: a normal return, `ctx.exit`, Ctrl-C, SIGTERM, a terminal closing out from under you, an uncaught throw. It runs after stdout has drained and before the terminal is handed back, and exactly once however many of those arrive together. `label` is what a breached shutdown deadline calls it; an unlabelled arrow is reported as `(anonymous)`, and the anonymous arrow is the shape that hangs.
- **A run that owns the process** gets closeout's full wiring — `exit`, `beforeExit`, five signals, `uncaughtException`, `unhandledRejection`. A run that injects its own `exit` — the harness, the MCP loop, every façade test — gets the same registry **detached**, with no listeners on anybody's process.
- **Every exit now goes through one place.** `ctx.exit(code)` used to call the injected exit and then throw; on the real path the first half was `process.exit`, so cleanup registered a line earlier could never run. It now throws only, and the failure path drains, runs the cleanup and leaves — which makes the file's own sentence, *"exactly one code path from argv to exit"*, true of the exit as well as of the parse.

Measured: commander 1360 / 1360 and yargs 804 / 804 before and after, unchanged — the two front-ends do not reach `execute.ts`. The core entry is 51,293 → 52,683 bytes against an unchanged 53,300 budget, so nothing was ratcheted for it; `shutdown.ts` is 1,001 of those and the engine's routing is the other 389. `npm i burgee` gains closeout's 81,360 bytes unpacked, and closeout depends on nothing.
