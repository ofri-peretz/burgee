---
"compat-oracle": patch
---

A suite run by `twist` is graded by the counts twist prints, never by its exit code, which is 0 for a run of failures: colorette 2.0.20's suite exited 0 with 58 of its 67 cases failing against colorette itself. Each file runs on its own, a file twist cannot load is one failure, and a run that ends with no summary is an error. colorette is graded this way, 67 / 67 against a control of 67 / 67, in upstream CI's environment.
