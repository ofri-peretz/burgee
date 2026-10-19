---
id: D-20261018-drop-control-band-core-bundled-bytes
subject: 'control-band-core-bundled-bytes: the band is back inside, so the breach intent is dropped'
taken: 'Taken — on the owner''s delegation of 2026-10-12 over budgets and trade-offs, applied by the roadmap-to-shipped program of 2026-10-18'
date: '2026-10-18'
superseded_by: —
---

**Dropped. The breach it was opened for is over, and the cause was attributed when it happened.**

The watcher opened this intent on 2026-09-14, when `core-bundled-bytes` sat at **37,540 B**,
eight readings above a 37,481 B mean. D-064 attributed it as a real regression: the
`core-under-52kb-bundled` overrun of D-005, mostly `completions.js` inlined into the core
entry. D-065 put the bisect in `benchmarks/results/`, not in the intent.

**Evidence, 2026-10-18.** The last 20 CI readings in `benchmarks/results/cli-benchmarks/` all read **24,281 B**, from
`2026-10-13-c736740-ci` to `2026-10-18-56b9262-ci` (window mean 24,281.8, σ 1.6). That is
13,259 B, 35%, under the reading that opened the intent. `detect()` in
`scripts/control-bands.ts`, run over the stored history plus those results, reports no breach.

**What covers it instead.** The band itself, which keeps running in `control-bands.yml`, and
the B4 byte gate in `npm run bench -- --check`, which fails the PR that grows the entry.

**How to reopen.** Not by editing this intent. The watcher writes a breach intent with
`flag: 'wx'` and treats an existing file as "already open", so while this directory exists a
new breach of this band writes nothing (gap A-20261018-dropped-band-intent-masks-breach).
Until that gap closes, a new breach is reopened by deleting `.sdlc/intents/control-band-core-bundled-bytes/`
so the watcher writes a fresh intent, or by setting this one back to `draft` with the new reading.
