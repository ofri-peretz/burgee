---
"caique": patch
---

`caique/clack`: Ctrl-C or escape while an async validator is still out now cancels the prompt (it answers `CANCEL_SYMBOL`), where it used to be dropped. In raw mode Ctrl-C reaches the prompt as a byte, not a signal, so a validator that never answered left no way out. `@clack/core` drops the key too, but its readline interface then leaves raw mode, so a second Ctrl-C kills the process. Other keys still wait for the verdict.
