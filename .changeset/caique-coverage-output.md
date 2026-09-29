---
"caique": patch
---

`caique/clack`'s `spinner` now ends on its `errorMessage` when the process exits with a failing code the program chose (2–127), as clack's does; before this every exit while spinning ended as a cancel, and `errorMessage` was never shown. A signal, and exit codes 0 and 1, still end as a cancel. Unreachable code is removed from the spinner and from `caique check`, whose never-called "replaces" helper is gone; behaviour is otherwise unchanged.
