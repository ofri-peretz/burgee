---
id: D-20261113-oxmutate-tarball-static-group
subject: 'oxmutate''s published tarball grew past the 10% allowance: trim, or raise the recorded figure?'
taken: 'Taken — by the session building oxmutate-fastest, on the owner''s delegation of 2026-11-11 ("You can make all calls")'
date: '2026-11-13'
superseded_by: —
---

**Raised: 54,863 -> 61,139 B gzipped and 187,429 -> 211,196 B unpacked (+11.4%, +12.7%), measured
without the native cores, as the check measures it.**

**What the bytes are.** Code that ships and runs, added since the figure was last set on
2026-11-02: phase counters and progress files kept open (#1532), a slow test no longer a kill
(#1547), `--ignore-static` and the static summary line (#1561), and in #1566 `static.group` with
its audit, a work directory whose removal cannot lose a finished run, and the disk guard naming
the paths it put back.

**Why not trim.** Comments are already stripped and unreachable declarations pruned. Nothing in
the growth is dead: each piece has a measurement in `sc8-profile.md` (§5 to §9). oxmutate is a
development tool installed once per repository; its native core is 1.3 MB beside these 211 kB.

**Reversible.** One figure in `.sdlc/bands/artifact-size-baseline.json`. The 10% allowance now
runs from the new figure.
