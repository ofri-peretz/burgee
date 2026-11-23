---
"oxmutate": patch
---

A mutant that takes its worker down is a RuntimeError whose reason now says how the process ended:
`the worker crashed while this mutant ran (signal SIGKILL)` for a kill from outside or the kernel's
out-of-memory kill, `(exit code 134)` for a process that exited itself. A crash the mutant did not
cause (a neighbour's memory pressure on a busy machine) can now be told from one it did. A crash in the
isolated phase carries its reason too; before, only a warm crash did.
