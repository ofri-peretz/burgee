---
"oxmutate": minor
---

A mutant whose only effect is an unhandled rejection or an uncaught error is now Killed, as a failing `vitest run` scores it; it was Survived. A suite that raises one with no mutant active is refused at the dry run, as a failing test is.
