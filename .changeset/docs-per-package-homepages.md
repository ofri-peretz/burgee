---
"roundel": patch
"flagstaff": patch
"caique": patch
"linegauge": patch
"seniority": patch
"bellpull": patch
"closeout": patch
"paratext": patch
---

Each package's `homepage` and README docs link now point at its own documentation site, `https://<package>.interlace.tools`, instead of a page on burgee's site. The old `burgee.interlace.tools/docs/packages/<package>` URLs answer with a 301 to the new host, so nothing already linked breaks. closeout's README override example also resolves to the current release again (`npm:closeout@^0.4`; the 0.4.0 release left it at `^0.3`).
