---
"oxmutate": minor
---

Survivor confirmation runs in a live worker. Each survivor with two or more covering tests is still
re-run armed across its covering tests in each file, as Stryker runs it, but on the static path's
machinery: the mutant armed from the file's collection, the modules re-evaluated under it, only its
covering tests' bodies run (every test's hooks still run), with the same guards. Whatever the guards
cannot vouch for, every timeout and every kill only by a test's own timeout goes to a fresh worker as
before; `OXMUTATE_ISOLATE_CONFIRM=1` sends every confirmation there. The live runner now also hands a
file to a fresh worker when it uses what it does not run the way Vitest does (retry, repeats,
`test.fails`, concurrent tests, `aroundEach`/`aroundAll`, `onTestFinished`/`onTestFailed`,
`context.skip()`), for static mutants too. New stat: `confirmLive`.
