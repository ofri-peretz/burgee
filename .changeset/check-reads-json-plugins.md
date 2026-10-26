---
'bellpull': patch
'caique': patch
'closeout': patch
'controlroom': patch
'flagstaff': patch
'linegauge': patch
'paratext': patch
'roundel': patch
'seniority': patch
---

`check` reads a `.json` plugin file as data. It handed every file to `import()`, and Node refuses a `.json` module without an import attribute (ERR_IMPORT_ATTRIBUTE_MISSING), so a plugin written as JSON got Node's message and no verdict, from the host's own `check` and through `burgee check`, which runs it.
