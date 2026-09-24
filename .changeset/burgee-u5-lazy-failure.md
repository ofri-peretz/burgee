---
'burgee': patch
---

`import 'burgee'` loads less at startup. Two things now load only when they are needed. What a failed run prints (the exit-code classification, the `--json` failure envelope and the stderr message) loads only when a run fails. The checks between options (`exactlyOneOf`, `conflicts`, `implies`, `dependsOn`, `exclusive`) load only for a command that declares one. Output and exit codes are unchanged.
