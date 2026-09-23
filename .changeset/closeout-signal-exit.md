---
'closeout': minor
---

`closeout/signal-exit` and `closeout/signal-exit/signals` — the drop-in path for `signal-exit` 4 (198.9 M/wk), graded 126 / 127 by signal-exit's own test suite, the same case its own package fails. `onExit`, `load`, `unload` and `signals`, at 4,797 B against the incumbent's 10,995 B. CommonJS on purpose — the suite re-evaluates the module under a changed `process` — and importable by name from ESM.
