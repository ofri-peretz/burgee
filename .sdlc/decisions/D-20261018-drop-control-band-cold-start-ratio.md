---
id: D-20261018-drop-control-band-cold-start-ratio
subject: 'control-band-cold-start-ratio: the ratio came back under its old mean, so the breach intent is dropped'
taken: 'Taken — on the owner''s delegation of 2026-10-12 over budgets and trade-offs, applied by the roadmap-to-shipped program of 2026-10-18'
date: '2026-10-18'
superseded_by: —
---

**Dropped. The excursion ended, and it is now below where it started.**

The watcher opened this intent on 2026-09-30 at **1.183**, four of five readings above a 1.161
mean. D-20261005-cold-start-band-questions moved both standing questions to a bisect over
`benchmarks/results/`. D-20261009-cold-start-bundled-entries rejected the one structural lever
proposed, bundling the published entries, because it reaches neither band.

**Evidence, 2026-10-18.** The last 20 CI readings in `benchmarks/results/cli-benchmarks/` have a mean of **1.10** and run
1.061–1.103 since `2026-10-13-264a413-ci`. The latest, `2026-10-18-56b9262-ci`, is 1.084.
`detect()` over the stored history plus those results reports no breach. The step down came with
commander-front-end-diet (2026-10-12/13), which cut the bytes `burgee/commander` loads at start.
That is the most likely cause. It was **never bisected**, and this decision does not claim it was.

**What covers it instead.** The band, still running, and the B2 cold-start ratchet in
`benchmarks/ratchet.test.ts`.

**How to reopen.** If the ratio rises past its band again, delete
`.sdlc/intents/control-band-cold-start-ratio/` so the watcher writes a fresh intent, or set this one
back to `draft`. Run the bisect D-20261005 describes before attributing anything. While the
directory exists, a new breach writes nothing (gap A-20261018-dropped-band-intent-masks-breach).
