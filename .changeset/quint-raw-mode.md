---
"closeout": patch
---

`rawMode` keeps the terminal raw until the last caller that turned it on through `rawMode` lets go, in any order. A second caller — a prompt opened while a spinner discards stdin — used to get a no-op, so the spinner stopping first turned raw mode off under the prompt. A mode turned on by anyone else is still left alone.
