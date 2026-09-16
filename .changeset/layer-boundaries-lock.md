---
'burgee': patch
---

A lock for PRINCIPLES rule 14: no package does a job another package in the family exists to
do.

The family splits nine ways precisely so a program can adopt one layer without the other
eight. The moment `burgee` measures a string's width itself, or reaches for `chalk` instead of
`roundel`, that split stops being real and the layers become a directory layout. Until now
that was intent — every other invariant here has a lock and this one did not.

The concern table is not restated. `compat-oracle/src/demand.ts` already declares which
incumbents each layer replaces, and that list *is* the definition of each layer's job, so the
rule is derived from it: a package may not depend on an incumbent another layer replaces, nor
on the one it replaces itself. Needing that job is the same thing as needing the sibling.

It does not forbid a drop-in façade reproducing its own incumbent — `burgee/commander` spawns
child processes and forwards five signals because commander's `executableSubcommand` does, and
commander's own 1360-case suite grades exactly that. Reproducing the incumbent is the
compatibility claim.

Family state today: no package depends on any incumbent, its own or a sibling's, and no
package carries a runtime dependency outside the family.
