---
'burgee': patch
---

`ctx.exit(code)` with a code outside the exit contract (a child's 137) now leaves RUNTIME silently, as any exit does, instead of printing the command's usage under the program's own last line.
