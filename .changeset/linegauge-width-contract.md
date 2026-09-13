---
'linegauge': patch
---

`width` keeps the contract `string-width` has always kept. A non-string measures `0` instead
of throwing — a width function is usually reached with whatever a template produced, which is
why the incumbent answers rather than making every caller guard — and a new
`countAnsiEscapeCodes` option counts escape sequences as the characters they are made of.
Graded: `string-width` 194 / 229 → **198 / 229**.
