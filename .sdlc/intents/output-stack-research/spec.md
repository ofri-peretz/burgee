# Design — the output stack's research pass

Intent: [`intent.md`](./intent.md). **Status:** review — corrected from `shipped` 2026-09-09; see the intent's verification section.

**Restated:** 2026-10-18 — see [§ Restated 2026-10-18](#restated-2026-10-18)

---

## Restated 2026-10-18

**R1–R7 are all held by documents on `main`; the one open item is the intent's S3 for caique, which this design's out-of-scope line handed to a revision that never came — REMAINING: S3.**

The table with the document behind each row is in the intent's
[§ Restated 2026-10-18](./intent.md#restated-2026-10-18). This is a documents-only design, and
no row is held by a test. In short:

- **R1, R2** held by `scripts/fetch-competitor-issues.sh stack` and its snapshots in
  `.sdlc/research/issues/output-stack/`.
- **R3** held by D-071, and by the discussion (`D#`) citations in the research doc.
- **R4, R5, R7** held by `.sdlc/research/output-stack-open-issues.md`: 21 clusters with an
  owner each, the U-floor citations table, and § "What could not be determined".
- **R6** held by `.sdlc/research/competitor-landscape.md` § "7. The output stack".

The [Out of scope](#out-of-scope) line "Re-issuing the layer intents with citations — done in
each layer's next design revision" landed for roundel and flagstaff, as an `### Evidence`
table in each `spec.md`. It never landed for caique, and no intent took it over, so the
intent keeps that piece as remaining rather than treating the out-of-scope line as a
completed move.

## Requirements

- **R1** Every open issue in the ten trackers is read in full via the GitHub REST API,
  paginated; pull requests are dropped.
- **R2** For chalk, ora, log-update and listr2, issues closed in the last three years are
  also read, with their closing comments, so declined requests can be cited as "declined".
- **R3** Discussions are read as summaries where a repo uses them.
- **R4** Every cluster names an owner: a U row, a layer intent, an existing intent, or a
  recorded "not planned, on purpose" with the reason. An orphan cluster fails the pass.
- **R5** A citations table for U1–U13; a row without a citation reads "hypothesis —
  measure before lock".
- **R6** A measured table of the ten incumbents in `competitor-landscape.md` with the
  commands and date; cells not measured say so.
- **R7** What could not be determined is recorded at the end, including corrections to the
  intent's own premises.

## Design

`scripts/fetch-competitor-issues.sh engine|stack|all` snapshots raw JSON into
`.sdlc/research/issues/output-stack/`; the clustering is done by reading, not by script,
and written to `.sdlc/research/output-stack-open-issues.md` in the same shape as
`competitor-open-issues.md`. The layer intents are re-cited from the citations table in a
later pass; this one does not edit intents.

## Verification

- `npm run -s lint:md` and `npx vitest run --config vitest.root.config.ts` green.
- The pass is complete when the cluster table has no orphan and the U table has a verdict
  for every row. Result: 21 clusters, 230 issues, U9 and U12 marked hypothesis.

## Rejected alternatives

- **Sampling the trackers.** The engine's credibility came from reading everything; a
  sampled floor is an opinion with footnotes.
- **Reading ordinary closures as evidence.** Only declined or not-planned closures say what
  a maintainer will not do; fixed issues say the opposite.
- **Trusting the intent's premise.** "Closes by policy" was checked and corrected: chalk's
  zero was a release sweep, listr2 closes fixes.

## Out of scope

- Re-issuing the layer intents with citations — done in each layer's next design revision.
  **2026-10-18:** done for roundel and flagstaff (`spec.md` § "Evidence"); not done for
  caique, and kept as remaining under the intent's S3.
- Measuring installed closure and spawn delta for the ten — `cli-benchmarks` B4.
