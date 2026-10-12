# Intent — published declarations carry summaries, not design essays

> Stage 1 artifact. Opened from the wave-4 ranking
> ([`next-wave-4-2026-10.md`](../../research/next-wave-4-2026-10.md)). D-20261012-burgee-tarball-rebaseline
> measured burgee's 240,393 B of `.d.ts` and named a trim it did not take.

**Status:** review · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz

---

## What is wanted

Every published package's declarations keep, for each JSDoc block, its first paragraph and the
tags an editor renders, and drop the rest of the prose. burgee's packed size falls by a measured
amount and the tarball baseline is re-recorded down. Hover text a caller sees for every exported
symbol is unchanged in its first paragraph.

## Why now

- **The measurement.** burgee 1.3.0 packs 246,526 B gzipped, 938,302 B unpacked; declarations are
  240,393 B of that, in 52 files, and keep every doc comment by the `.d.ts` rule in
  `scripts/strip-comments.mjs`. Stripping all comments would cut about 46,300 B gzipped (−18.8%),
  refused there because it deletes hover text
  (D-20261012-burgee-tarball-rebaseline).
- **Against the incumbents.** commander 15.0.0 packs at 52,736 B gzipped and yargs 18.0.0 at
  47,876 B (same file). Every install downloads the tarball once.
- **The rule is decided.** D-20261012-declarations-carry-summaries.

## Affected users and systems

- `scripts/strip-comments.mjs` (the `.d.ts` rule), every package's `build`.
- `.sdlc/bands/artifact-size-baseline.json`, re-recorded down by `check-published-artifacts`.
- The ten packages' tarballs. The foundation weight band does not move: no README changes.

## Constraints

- **The first paragraph and the rendered tags stay.** `@param`, `@returns`, `@throws`,
  `@example`, `@deprecated`, `@default`, `@see`.
- **Types are byte-identical apart from comments.** `drop-in-type-surface-lock` and the tsd
  grades do not move.
- **Source files are untouched.**

## Success criteria

1. A lock reads every packed `.d.ts` and finds no JSDoc block with more than one prose paragraph.
2. burgee's packed size falls; the measured figure is written into the baseline by decision.
3. `npm run compat -- extra-typings` stays 369 / 369.

## Jev triage

| user_impact | incumbent_gap | risk_reduced | composite | ready_for_spec | needs_model |
| --: | --: | --: | --: | :-- | :-- |
| 3? | 2? | 0 | 13 | yes | no |

## Open questions

- Which comments stay. **Decided 2026-10-12**, D-20261012-declarations-carry-summaries.
- Whether the saving is worth a build step. **Answered 2026-10-12 in `spec.md`**: R1 measures it
  first, and the intent stops at R1 if burgee saves under 5% gzipped.
