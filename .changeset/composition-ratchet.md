---
'burgee': patch
---

A ratchet on whether the family actually composes: every package except `burgee` must be used
by another package in it.

`layer-boundaries-lock` is the negative half of PRINCIPLES rule 14 — no package does a job a
sibling exists to do. This is the positive half, and it is the one that was failing. Measured:
**five dependency edges in a nine-package family**, with `caique`, `paratext`, `closeout`,
`bellpull` and `flagstaff` used by nothing at all — and one job, putting the cursor back
however the process dies, implemented **three times**, by three files each of which argues in
its own comments that a second copy is the danger.

A layer nothing else uses has never been proven to fit the stack. The split into nine packages
is only real if the packages compose; otherwise it is a directory layout and the fit is an
assumption.

`edges` may only go up and `awaiting` may only shrink, each entry carrying the reason it is
still there. A package must leave `awaiting` the moment it gains a consumer — otherwise the
list becomes a place to park the problem, and the ratchet never notices the work was done.
