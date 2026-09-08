---
"burgee": patch
---

`burgee/commander`: `parse()` is synchronous again and `parseAsync()` starts synchronously, exactly as commander's do. Since the `--schema`/`--mcp` surface landed, both went through an `async` surface check, so a synchronous action ran a microtask after `parse()` returned and a `preAction` hook after `parseAsync()` handed back its promise — commander's own suite asserts on both after every parse. 638 of its 1,331 tests had been failing on `main` while the Compatibility job reported success, because a `| tee` pipe hid the grader's exit code; every workflow step that pipes into `tee` now runs with `pipefail`.
