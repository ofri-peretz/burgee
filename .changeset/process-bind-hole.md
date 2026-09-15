---
'burgee': patch
---

The process-reference lock now catches the **binding**, not only the member read.

The seams built for PLAN 4.3 showed the hole up. `flagstaff/src/runtime.ts` reads the world
through `import process from 'node:process'`, and `roundel/src/runtime.ts` through a guarded
`(globalThis as { process?: … }).process` bound to a local — and both files passed the existing
pattern **untouched**. Their being on the allow-list was a statement of intent rather than
something the lock enforced.

Which means any file in any package could have done the same and stayed green: bind the global
once, then read `proc.env` forever, because the member read is now on a local whose name a
textual pattern cannot tell from any other. The same hole the `globalThis.` lookbehind closed
in September, reopened through a different door.

Proven against a real file in `linegauge/src` — a package with no allow-list entry — in both
spellings, each green before the change and caught after. And the new pattern's own first catch
was a **comment** in `chalk.ts` saying where a cast had moved to, which is the defect this file
already carries a paragraph about: a checker that reads printed source and not shape. Comments
are stripped before it sees them, and that case is now one of its row-by-row tests.
