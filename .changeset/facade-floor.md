---
"burgee": minor
---

`.burgee({ floor: true })` on the commander and yargs façades turns on the behavioural floor in one call (J3, D-121): a usage error exits 2 rather than the host's 1, and a handler that throws or rejects prints one line and exits with its E1 code rather than a stack trace (and, on yargs, the help screen). Off by default, so the hosts' own suites still pass, and it changes nothing else — a returned value is not printed, `--json` keeps its envelope, and a commander program that called `exitOverride()` keeps its exits. `--schema` from a façade program now names the reserved surfaces the program shadows, as `shadows` (J4), and `burgee/program-schema.json` describes it — and the option `negatable` flag the commander façade already printed, which the file had left out.
