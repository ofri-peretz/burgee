---
"burgee": patch
---

`cliui`'s `toString()` is now linear in the cell it renders. `rowToString` ended each line
with `str.replace(/ +$/, "")`, whose unanchored start makes the engine retry at every
position in a run of trailing spaces; a row built from a 50,000-space cell cost 1,223 ms,
and doubling the cell quadrupled it. The trim now scans, and the same call takes 69 ms —
the second half of the fix that `measurePadding` got in #278. Output is unchanged: only
U+0020 is removed, so a trailing tab still survives under `wrap: false` as it did before.
