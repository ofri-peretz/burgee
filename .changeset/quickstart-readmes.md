---
"flagstaff": patch
"linegauge": patch
"paratext": patch
"controlroom": patch
---

The README quick start runs as written. On npm it was broken for flagstaff (`rt` undefined) and linegauge (`styled` undefined), controlroom's imported flagstaff without installing it, and paratext's printed nothing. No code changed; `readme-quick-start-lock` now runs every package's quick start.
