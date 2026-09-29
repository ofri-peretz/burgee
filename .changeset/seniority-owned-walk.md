---
"burgee": patch
---

`burgee/meow` finds the caller's `package.json` with `seniority/find-up` instead of a directory walk of its own. The answer is unchanged — the nearest `package.json` above the module that parses — and the walk is now bounded and ends on a symlink cycle.
