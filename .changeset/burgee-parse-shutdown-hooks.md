---
'burgee': minor
'bellpull': patch
'caique': patch
'closeout': patch
'flagstaff': patch
'linegauge': patch
'paratext': patch
'roundel': patch
'seniority': patch
---

burgee plugins can hook two more stages. `parse` runs before the command is resolved: it receives argv and may return a replacement, which is how an alias plugin maps `d` to `deploy`. `shutdown` runs once as the program exits, whether the command succeeded or failed. The family `schema.json` shipped in every package now describes both stages.
