---
'oxmutate': minor
---

`static.group` (`oxmutate run --static-group <n>`): arm up to `n` static mutants together in a test file that is not their first. A static survivor runs in every test file that loads its module, and most of those runs pass; a group's run that passes decides all of its members for that file at once, and one that fails is halved until each failing mutant is found alone. On a file of import-time data the static phase was 3.0x shorter with every verdict unchanged.

It is off by default (`1`), because it is a heuristic: two mutants armed together can hide each other. Only mutants that change one value are grouped (strings, numbers, regexes), no two that touch the same source text, and one group survivor in twenty is run again alone on every run. One that fails alone is reported Killed and the run exits 1, naming the cause.
