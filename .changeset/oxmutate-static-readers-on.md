---
'oxmutate': minor
---

`static.readers: 'on'` (`oxmutate run --static-readers`): each static mutant runs only in the test files that read its value, as the tracking dry run of `static.readers: 'report'` found them. A value it cannot follow keeps every file that loads its module. It is a heuristic, off by default: one survivor in twenty runs again in every loading file, and one that fails there is reported Killed and the run exits 1. On a slice of a data-heavy file it took a run from 4,185 s to 1,169 s with every stable verdict unchanged.
