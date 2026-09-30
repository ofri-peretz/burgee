---
"paratext": patch
---

A capability now renders its fallback when the runtime says the output mode is not `tty` (`Runtime.mode`, the value of roundel's `outputMode`). A host that has decided this run is `accessible`, `ci`, `pipe` or `json` gets the text form even on a terminal that supports the sequence, as flagstaff's components do. Without `mode`, nothing changes.
