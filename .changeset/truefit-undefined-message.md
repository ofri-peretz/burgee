---
"truefit": patch
---

A missing value now reads `got undefined` in an issue's message, not `got undefined undefined`: the message printed the type and then the value, and for `undefined` both are the word "undefined". Seen from `issues()`, `parse()` and `standard().validate()` on a missing required key.
