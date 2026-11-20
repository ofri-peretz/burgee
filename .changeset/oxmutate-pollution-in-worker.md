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
