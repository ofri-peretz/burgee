---
id: D-20261118-oxmutate-tarball-dry-reuse
subject: 'oxmutate''s published tarball grew past the 10% allowance: trim, or raise the recorded figure?'
taken: 'Taken — by the session building oxmutate-fastest, on the owner''s delegation of 2026-11-11 ("You can make all calls")'
date: '2026-11-18'
superseded_by: —
---

**Raised: 61,139 -> 67,910 B gzipped and 211,196 -> 236,222 B unpacked (+11.1%, +11.8%), measured
without the native cores, as the check measures it (CI run 44451344950).**

**What the bytes are.** Code that ships and runs, added since the figure was last set on
2026-11-13: `static.readers`, report and on (#1582, #1585), idle workers released (#1591), server
process groups, contained temp files, the watchdog grace and the load governor (#1608), and in this
change roadmap 3.3, each test file's dry run kept under `incremental` (`dry-reuse.ts`).

**Why not trim.** Comments are already stripped and unreachable declarations pruned. Nothing in
the growth is dead: each piece is a measured speed or robustness change (`dry-reuse.md`,
`sc8-profile.md`). oxmutate is a development tool installed once per repository; its native core
is 1.3 MB beside these 236 kB.

**Reversible.** One figure in `.sdlc/bands/artifact-size-baseline.json`. The 10% allowance now
runs from the new figure.
