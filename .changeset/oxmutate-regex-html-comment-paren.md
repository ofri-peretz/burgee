---
'oxmutate': patch
---

A file with a regex literal that opens with `<!--` (`/<!--\s*x\s*-->/u`) now runs its mutants. Each Regex mutant was switched in as `(/<!--…/u)`, which the oxc in Vite 8's transform rejects as an HTML comment in a module, so the file failed to load during the dry run. Such a mutant is now emitted as `(0, /<!--…/u)`, with the same value.
