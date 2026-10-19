---
id: D-20261018-drop-band-commander-front-end-bytes
subject: 'control-band-commander-front-end-bundled-bytes: the band is back inside, so the breach intent is dropped'
taken: 'Taken — on the owner''s delegation of 2026-10-12 over budgets and trade-offs, applied by the roadmap-to-shipped program of 2026-10-18'
date: '2026-10-18'
superseded_by: —
---

**Dropped. The bytes it was opened for came off, and the band reads inside.**

The watcher opened this intent on 2026-09-14 at **58,923 B**. D-064 attributed it to the same
`completions.js` inlining as the core band, and D-161 added #582's +276 B in September. The
series then rose to 60,905 B and stayed there until 2026-10-12.

**Evidence, 2026-10-18.** commander-front-end-diet took it down over three CI readings:
60,970 B at `2026-10-12-4a62884-ci`, 56,116 B at `2026-10-12-91a67e9-ci`, and 55,359 B at
`2026-10-13-264a413-ci`. Every reading since `2026-10-13-ba91416-ci`, 13 of them, is
**55,346 B**. That is 3,577 B (6%) under the reading that opened the intent. `detect()` over the
stored history plus `benchmarks/results/cli-benchmarks/` reports no breach: window mean 55,387.5, σ 167.2, latest 55,346.

**What covers it instead.** The band, still running. The per-entry byte budgets in
`packages/burgee/src/weight.test.ts` and the B4 gate in `npm run bench -- --check` fail the PR that
grows it. commander-front-end-diet R4 owns the claim ratchet that still reads 1.565.

**How to reopen.** As in D-20261018-drop-control-band-core-bundled-bytes. While this directory
exists, the watcher writes nothing for a new breach (gap A-20261018-dropped-band-intent-masks-breach).
To reopen, delete the directory, or set it back to `draft` with the new reading.
