---
'validator': patch
---

A shape that names a key `Object.prototype` has (`__proto__`, `toString`, `constructor` and the rest) reads it only as the value's own key, in `check`, `issues`, `parse` and an emitted check. Before, `{}` held each of them through its prototype, so a required `__proto__` passed on any object, and an optional `toString` refused `{}`. A getter a class puts on its prototype still counts, and `check` runs at the same speed on every other shape.
