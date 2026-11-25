---
'oxmutate': patch
---

A static mutant whose module a test imports under a stand-in `process` (one that emulates another
platform with its own `env`) is now run armed and in that test. The runtime header read both the
armed mutant and whether reads are tracked from `process.env` the first time instrumented code
ran, so the stub hid them: the test was never counted as a reader and the mutant ran unarmed,
which reported survivors that no test could kill. The test worker now sets both from the
environment it started with.
