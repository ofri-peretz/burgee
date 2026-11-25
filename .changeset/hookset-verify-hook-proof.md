---
'hookset': patch
---

`verify-before-stop` records a pass only from a run that proves one: a foreground test command that runs last, with no `|`, `||`, `;` or `&` that could hide its failure or edit code after it (`npm test || true`, `npx vitest run | tail` and `npm test && sed -i … a.ts` no longer count). It reads `git status` from the work-tree root, so a hook whose cwd is a package still fingerprints the right files, and a code file renamed to a doc still counts as a code change.
