---
id: D-20261119-oxmutate-tarball-container
subject: 'oxmutate''s published tarball grew past the 10% allowance: trim, or raise the recorded figure?'
taken: 'Taken — by the session building oxmutate''s container mode, on the owner''s delegation of 2026-11-11 ("You can make all calls")'
date: '2026-11-19'
superseded_by: —
---

**Raised: 67,910 -> 78,423 B gzipped and 236,222 -> 271,416 B unpacked (+15.5%, +14.9%), measured
without the native cores, as the check measures it.**

**What the bytes are.** Container mode, which the owner asked for on 2026-11-18 and 2026-11-19:
`container.js` and its declarations in 2.9.0 (#1658), and in this change `container-sync.js` (the
delta sync), the machine-wide default, the shared package cache, `--since` and `--frozen-oracle`
inside, gVisor detection and `oxmutate prune`.

**Why not trim.** Comments are already stripped and unreachable declarations pruned. A program
that never sets `container` loads none of it except the setting's parser. Measured on one Mac: the
host run held the endpoint scanner at 384–445% CPU and the container run left it at idle.

**Reversible.** One figure in `.sdlc/bands/artifact-size-baseline.json`. The 10% allowance now runs
from the new figure.

**Rebased 2026-11-20.** #1667 moved main's figure to 74,763 / 258,454 while this branch was open.
78,423 / 271,416 stays, since it also covers what the branch added later: the volume lock and the
daemon message.
