---
'oxmutate': minor
---

`static.readers: 'report'` (`oxmutate run --report-static-readers`): one more dry run, in which every module-level object or array literal that holds mutants reports which tests read each of its properties, and a summary line of how many tests the static phase would run if each static mutant ran only in the test files that read its value, against every file that loads its module. It is a report: no verdict changes, and runs without it are unchanged. On a slice of a data-heavy file (79 static mutants) it reported 21,291 tests against 63,674, 3.0x fewer.
