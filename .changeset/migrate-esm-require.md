---
'burgee': patch
---

`burgee migrate` now rewrites `require()` of the incumbents that ship ESM only: ansi-escapes, chalk 6, ora 9, log-update, boxen 8, string-width, strip-ansi, wrap-ansi, slice-ansi, restore-cursor, exit-hook and terminal-link. Their own `require()` already returns a namespace, as their replacements' does, so the rewrite is exact; before, it was refused as `require-of-default`. `require('burgee/yargs/parser')` now returns the parser function, as `require('yargs-parser')` does.
