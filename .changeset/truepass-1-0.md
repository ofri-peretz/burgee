---
"truepass": major
---

truepass is 1.0. Its entries `.` and `./eslint`, its four rules (`no-focused-test`, `no-unexplained-skip`, `no-fixed-sleep`, `no-test-retry`), the `truepass diff` command, its `--json` finding shape and its exit codes are now a semver contract: a rule is renamed or removed, or reports something new by default, only in a 2.0. Nothing changed in the code; the evidence is D-20261124-verification-family-1-0: 100% coverage, every spec row built, and a first full mutation run with no surviving mutant.
