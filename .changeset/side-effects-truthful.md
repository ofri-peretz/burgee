---
'bellpull': patch
'caique': patch
'closeout': patch
'flagstaff': patch
'linegauge': patch
'paratext': patch
'roundel': patch
'seniority': patch
---

Every package now declares `sideEffects` truthfully, so bundlers can drop what you don't import.

Six packages declared nothing, so no bundler could drop any of their modules. A named import from the root now bundles to the same bytes as the same import from its subpath:

| import | before | after |
| :--- | ---: | ---: |
| `import { explain } from 'seniority'` | 2,939 B | 1,067 B |
| `import { decide } from 'caique'` | 1,235 B | 734 B |
| `import { strip } from 'linegauge'` | 1,102 B | 940 B |
| `import { once } from 'closeout'` | 353 B | 235 B |

flagstaff and roundel used to declare `false`, but each ships a `check` command whose file runs when loaded. Each now lists that file, which is the true statement. paratext also lists the two modules that register its built-in capabilities when they load.
