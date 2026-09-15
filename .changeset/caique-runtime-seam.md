---
'caique': patch
---

A `Runtime` seam on caique (PLAN 4.3, Y9).

`src/runtime.ts` declares the slice of the world caique reads — `env`, `stdin`, `stdout` and
the two `isTTY` flags — and `processRuntime()`, the one function in the package that names
`process`. It is a function and not a constant, for the reason paratext's is: a runtime built
at import freezes the environment as it was when the module graph loaded, which is before a
test can say what it wants the world to look like.

`createIo()` now takes no argument and builds over the real process, so a program gets the
terminal it was started in without naming `process` itself; `streamsOf(runtime)` is the
mapping for callers that already hold one. `decide()` is unchanged and still takes the
narrower pair it reads, which is what the root export's `Runtime` continues to name.

`runtime.test.ts` asserts the seam rather than documenting it: `runtime.ts` is the only
non-test source in the package that reads the process, and `processRuntime()` returns two
different answers across a change to the environment made after the import.
