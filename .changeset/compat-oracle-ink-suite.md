---
'burgee': patch
'compat-oracle': patch
---

compat-oracle grades two new incumbents: Ink's own suite at 6.8.0 (593 cases, plus 148 on the internals line) and `@inkjs/ui`'s at 2.0.0 (103 cases), each with a control run against the real package. Both target the `controlroom` root and read 0 until `controlroom/ink` exists. `@inkjs/ui` is graded the way `controlroom` will ask users to run it: unmodified, with `'ink'` resolved to the target.

`burgee migrate` now reports `ink` as a graded drop-in path that is not level yet (`controlroom`, 0 / 593), and never rewrites it.
