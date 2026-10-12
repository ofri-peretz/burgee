---
"paratext": patch
---

`paratext check` and `register()` refuse a plugin with every capability problem at once, each with its own code and `fix:`, where they used to stop at the first. A missing `osc`, `when`, `encode` or `name` now gets a fix that shows the field written (``add `when: { tty: true }` ``), not "compare against the schema". The README has a "Writing a plugin" section: a whole plugin module and what `paratext check` prints for it.
