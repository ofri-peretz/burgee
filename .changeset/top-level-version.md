---
'burgee': patch
---

`--version` and `-V` answer on a program that is a pure command group. `dispatch` had always handled them, but only once a command resolved, so a program whose root runs nothing fell through to `unknown command "--version"` and exit 2 — which under E1 means *rewrite the command*. Real commander and real yargs both print the version and exit 0 for the identical program.
