---
"compat-oracle": patch
---

`--progress` names each host as its grade starts and ends, with its seconds, so a run that stalls says on which host. A host can declare `notGradedOn` platforms with a reason; it is not graded there and every run there prints it with that reason. ink is declared off `win32`.
