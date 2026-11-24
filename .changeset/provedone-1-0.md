---
"provedone": major
---

provedone is 1.0. Its `.` entry, the `provedone` bin and its commands (`stamp`, `gate`, `done`, `intent new`, `intent check`), the `Verified-by:` and `Checked:` trailer formats, the `off`/`observe`/`enforce` modes and its exit codes are now a semver contract: a trailer a 1.x wrote is read by every later 1.x. Nothing changed in the code; the evidence is D-20261124-verification-family-1-0: 100% coverage, every spec row built, and a first full mutation run with no surviving mutant.
