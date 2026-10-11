---
"compat-oracle": patch
---

The tsd runner's end-to-end cases skip on Windows, where `installSuiteDeps` cannot start `npm` (`npm.cmd` needs a shell). No `suiteDeps` host is graded on Windows — the oracle's ratchet runs on ubuntu — and the grade's arithmetic (`tsdTap`) is still tested on every platform.
