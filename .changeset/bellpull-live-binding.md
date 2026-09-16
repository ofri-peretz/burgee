---
'bellpull': patch
---

`bellpull/cross-spawn` reads `spawn` off the default import instead of a captured named
binding, so a consumer under `commander`'s own mocks sees the mock.

This is a compatibility requirement, not a style. `commander`'s suite does
`t.mock.method(childProcess, 'spawn', …)` in roughly 23 `executableSubcommand` cases. A named
ESM binding is captured at import and never re-syncs without `syncBuiltinESMExports()`, so a
consumer calls the real thing instead: measured, wiring `burgee/commander` to this package took
it from **1360 / 1360 to ungradeable** — an un-mocked spawn ran a real subcommand whose exit
killed the test runner.

A property read off the default import sees it. `cross-spawn` stays **68 / 68** either way, so
the change costs this package nothing and is the whole blocker between bellpull and its first
consumer.

`ChildProcess` and `SpawnSyncReturns` are re-exported because a consumer that declared them
itself would trip `inline-implementation-lock`, which matches a type-only `node:child_process`
import too.
