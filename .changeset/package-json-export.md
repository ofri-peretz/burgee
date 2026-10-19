---
'bellpull': patch
'burgee': patch
'caique': patch
'closeout': patch
'controlroom': patch
'flagstaff': patch
'linegauge': patch
'paratext': patch
'roundel': patch
'seniority': patch
---

Export `./package.json`. `require('<package>/package.json')` threw `ERR_PACKAGE_PATH_NOT_EXPORTED`, which broke tools that read a dependency's manifest that way: bundlers, license scanners and version checks.
