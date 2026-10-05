---
'burgee': patch
---

`burgee migrate` now reports blessed, neo-blessed and terminal-kit programs. They have no drop-in, so nothing is rewritten: each screen, box, list, key, render, alternate-screen, mouse and text-input site goes under a new `guided` key in the report, with its file, line and a link to the section of that incumbent's coming-from guide. A site is reported only when its receiver came from one of the three packages in the same file, so a `screen.key(` or `.render(` on anything else is left out. The exit code is unchanged: nothing was refused.
