---
'triggerlist': patch
---

`protect` and `brief` now fail on a base checklist that is there and does not parse, as `match`
already did. Only a missing checklist file is let through as a bootstrap, so a broken base
checklist can no longer turn `protect --enforce` into a pass.
