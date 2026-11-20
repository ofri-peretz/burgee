---
"oxmutate": minor
---

A polluted context is recovered inside the worker. When the unmutated test fails after mutants ran
(a cache, a registry or a counter left behind), the worker used to be replaced and the rest of the
unit split in two, each half a new Vitest worker. It now resets the module registry, collects the
file again and runs the mutants no clean canary had vouched for once more from clean state, as a new
worker would. The guards are two: `globalThis`, `process.env` and the built-in prototypes must still
equal what they were when the file was collected, and the unmutated test must pass on the new
collection; otherwise the worker is replaced as before. Files with a `beforeAll` or whose tests run
once per collection keep the restart. `OXMUTATE_ISOLATE_POLLUTION=1` always restarts. New stat:
`pollutionRecovered`.

Every warm survivor is now confirmed from cold modules, not only those with two covering tests: a memo
an earlier run filled (a glob cache) hid a mutant in the code that computed the value, so its verdict
depended on its place in its unit. New stat `staleSurvivors`; `OXMUTATE_TRUST_WARM_SURVIVORS=1` keeps
the old rule. `OXMUTATE_ISOLATE_ALL=1` runs every covered mutant armed from process start in a fresh
worker, the reference a verdict is checked against.
