---
'burgee': patch
---

`import 'burgee'` loads less at startup. Three things now load only when they are needed:

- What a failed run prints (the exit-code classification, the `--json` failure envelope and the stderr message) loads only when a run fails.
- The checks between options (`exactlyOneOf`, `conflicts`, `implies`, `dependsOn`, `exclusive`) load only for a command that declares one.
- Everything answered without running a command (help, `--version`, `help [command]`, `completion`, `config explain`, `--schema`, `--mcp`) loads only when it is asked for.

Output and exit codes are unchanged.
