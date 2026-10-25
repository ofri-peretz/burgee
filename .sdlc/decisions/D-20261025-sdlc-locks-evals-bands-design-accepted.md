---
id: D-20261025-sdlc-locks-evals-bands-design-accepted
subject: 'sdlc-locks-evals-bands: is the re-grounded design — .sdlc/intents in the free link layer, run on every PR without the paid task evals, and the starved duration band made loud — accepted for Build?'
taken: 'Accepted — by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-25'
date: '2026-10-25'
superseded_by: —
---

**Accepted. [`sdlc-locks-evals-bands/spec.md`](../intents/sdlc-locks-evals-bands/spec.md) § Design
gate 2026-10-25 is the design Build implements, and the intent moves `review → approved`.**

**What re-grounding found, on `main` at `c92e4173f4`.** S1, S4, R1, R4, R5 and R6 hold (R6
since 2026-10-19). Two items are open:

- **S2/R2/R3: `.sdlc/intents/` is outside the link checker.** `scripts/run-evals.ts` still
  sets `CONFIG_DIRS = ['docs', '.github', '.sdlc/bands', …]`. `PLANNED_DOCS` still points at
  `^docs\/intents\/`, a path from before intents moved. `evals.yml`'s `paths:` has no
  `.sdlc/intents/**`.
- **S3: `test-duration-ms` is starved silently.** `collectCommandDuration` returns no
  observation when `npm test` exits non-zero or runs past its timeout, and logs nothing. The band
  has had 7 points since 2026-09-28, under `minPoints: 8`.

**The design accepted, and the one choice in it.** The 2026-10-19 note found that adding
`.sdlc/intents/**` to `evals.yml` would run the **paid** task evals on every intent edit. That
spends the Claude quota, and the quota has already stalled this repo's CI for five days once.
So R3 is restated:

- the free layer runs on every PR. `npm run evals:config` (layer 1: links, scripts, floor ids, no
  credential) becomes a step in `quality.yml`.
- `CONFIG_DIRS` gains `.sdlc/intents`, and `PLANNED_DOCS` moves to `^\.sdlc\/intents\/`.
- `evals.yml`'s `paths:` stays as it is.

That gives S2's guarantee (a broken link in `.sdlc/intents/README.md` fails a PR check) at no
quota cost. For S3, `collectCommandDuration` writes the reason it dropped an observation (exit
code, or the timeout) to stderr and into the run summary, and a test drives both causes. Whether
the cause is a red suite or the 900,000 ms ceiling is then a reading, not a guess.

**Alternatives rejected.** *Widen `evals.yml`'s `paths:`*: correct, and it spends the quota on
every docs PR. *Lower `minPoints` for the duration band*: it would compute a band from too few
points and hide the starvation.

**Build scope, one batch:** the `CONFIG_DIRS`/`PLANNED_DOCS` change with a red-first case in
`scripts/run-evals.test.ts`, the `quality.yml` step, and the logged-drop test for the duration
collector.
