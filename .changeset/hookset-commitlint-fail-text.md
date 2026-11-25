---
"hookset": patch
---

The commit-msg preset's commitlint failure no longer claims the scope is wrong. It points at commitlint's own ✖ lines, which name the rule that failed: a footer line over 100 characters used to read as a scope error.
