---
"burgee": patch
---

`burgee/commander` is 4.8 KB lighter in a bundle: 61,207 → 56,353 B on `/docs/weight`. An executable subcommand spawns through commander's own `child_process.spawn` on every path commander 15 takes. `bellpull/cross-spawn` now loads only for the one path commander can't run, a Windows executable that isn't launched through node (a `.cmd`, a `.bat`, a non-node shebang), and that spawn happens once the import settles. Nothing else changes: commander's suite still grades 1360 / 1360.
