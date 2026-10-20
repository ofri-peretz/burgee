# Intent — `roundel/supports-color`, graded by supports-color's own suite

> Stage 1 artifact. Opened from the wave-3 ranking
> ([`next-wave-3-2026-10.md`](../../research/next-wave-3-2026-10.md)). It has the largest demand
> number of any candidate in that table: 441.6 M weekly downloads for a decision roundel
> already makes, with no subpath and no grade behind it.

**Status:** shipped · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz · **Shipped:** 2026-10-20 on
[`122635dc`](https://github.com/ofri-peretz/burgee/commit/122635dce2) (#1177), released in roundel 1.2.0 (npm, 2026-10-20T05:27Z, Version PR #1184), verified against `main` at
[`a7d8fb73`](https://github.com/ofri-peretz/burgee/commit/a7d8fb7386) — criterion 1 re-graded 55 / 55 on 2026-10-20, criterion 3 read 0.829 on CI at the release commit, criterion 4 published in burgee 1.6.6 (below) · **Design:** [`spec.md`](./spec.md)

---

## What is wanted

A program, or another library, that depends on `supports-color` can point an `overrides` entry
at `roundel/supports-color` and get the same answers: the same `{ level, hasBasic, has256,
has16m }` objects for `stdout` and `stderr`, the same `createSupportsColor(stream, options)`.
supports-color's own test suite grades it level with supports-color itself, so the claim is a
number on the compatibility page. `burgee migrate` rewrites the import.

## Why now

- **Demand.** `supports-color` is **441,630,802** downloads a week
  (`.sdlc/research/replacement-map.md` line 55, measured 2026-09-09 from
  `api.npmjs.org/downloads/point/last-week/supports-color`). That is the largest weekly figure
  in roundel's table, larger than chalk's.
  Re-measurement on 2026-10-12 was attempted and refused by this environment's network policy
  (`api.npmjs.org` answers 403 at the proxy), so the figure carries its September date.
- **The logic is already written and tested case by case.** `packages/roundel/src/policy.ts`
  re-derives supports-color's order. `policy.test.ts` cites it at lines 64, 71, 126, 144, 167
  and 277: the `COLORTERM` catch-all, the CI vendor table, the truecolor flag spellings, and
  `FORCE_COLOR=0` beating `--color=256`.
- **It is ungraded, and that was written down as the only reason for leaving it out.**
  `graded-override-targets/spec.md` line 106 puts `supports-color` out of scope because "no
  subpath claims" it. `GRADED` in `packages/burgee/src/compat.ts` has no row for it, and
  `packages/compat-oracle/vendor/` has no copy.
- **One deliberate divergence exists and must stay out of the drop-in.**
  `policy.test.ts` line 133 records `--no-color` beating `FORCE_COLOR=3` in `roundel/policy`,
  where supports-color answers 3. A drop-in that kept it would fail supports-color's suite on
  that case. The drop-in has to answer the way supports-color does, and the safer rule stays
  on `roundel/policy`.

## Affected users and systems

- `packages/roundel`: a new `./supports-color` subpath over `policy.ts`.
- `packages/compat-oracle`: a host row, the vendored suite, a baseline.
- `packages/burgee/src/compat.ts` (`GRADED`, `DROP_INS`, `GRADED_VERSIONS`,
  `SUPPORTED_MAJORS`), the compatibility page, and `burgee migrate`'s map.
- `packages/roundel/competitors.json`, so the watch follows supports-color's releases.

## Constraints

- **Zero dependencies.** The subpath reaches only roundel's own files and `node:` built-ins.
- **`roundel/policy` does not change.** Its divergence is a published choice and stays. The
  drop-in reaches the shared table and answers in supports-color's order.
- **Lighter than the incumbent in a bundle.** A B4 pair `roundel/supports-color ÷
  supports-color` gates at 1 (U5), like every other drop-in.
- **One compat-oracle lane at a time** (the wave-2 rule), because every graded host edits the
  same three tables in `compat.ts`.

## Success criteria

1. `npm run compat -- supports-color` grades `roundel/supports-color` level with
   the control of supports-color's current major, and `GRADED` carries the row.
2. The compatibility page lists it, generated, with the major claimed in `SUPPORTED_MAJORS`.
3. `benchmarks/fixtures/entry-points.ts` has the pair, and its ratio reads at or below 1 on CI.
4. `burgee migrate` rewrites `import supportsColor from 'supports-color'` to the subpath, and
   `migrate.test.ts` holds it.

## Open questions

- Whether `roundel/policy` adopts supports-color's `FORCE_COLOR` precedence so that one table
  serves both. **Answered 2026-10-12 in `spec.md`**: no. The drop-in answers as supports-color
  does, and `roundel/policy` keeps refusing colour when it is asked to refuse.
- Which major to grade. **Answered 2026-10-12 in `spec.md`**: the current major on
  `dist-tags.latest` when R1 lands, and no older major until its own suite grades level
  (D-145's rule).

## Status — 2026-10-19

Built on `feat/colour-drop-ins` against `main` at `326907ec`; the spec's *Re-grounded* section
records what changed from the design as written.

| Criterion | Evidence |
| :-- | :-- |
| 1. `npm run compat -- supports-color` grades `roundel/supports-color` level with the control of the current major, and `GRADED` carries the row | **Met.** 55 / 55 against a control of 55 / 55 at supports-color 11.0.0 (`baseline/supports-color.json`); 0 before the subpath existed. `GRADED['supports-color']` is `{ reference: 55, passed: 55, rate: 1, control: 55 }`. |
| 2. The compatibility page lists it, generated, with the major claimed in `SUPPORTED_MAJORS` | **Met.** `apps/docs/content/docs/compatibility.mdx` rows `supports-color · roundel · 55 / 55` and `supports-color · 11 · 11.0.0`, from `npm run compat:page`; `SUPPORTED_MAJORS['supports-color']` is `[11]`. |
| 3. `benchmarks/fixtures/entry-points.ts` has the pair, and its ratio reads at or below 1 on CI | **Met locally**, 1,764 B against 2,128 B, 0.829, under `BUNDLED_CEILING` 1,850 and the U5 ratio gate of 1; the CI reading is in the PR's `bench` job. |
| 4. `burgee migrate` rewrites `import supportsColor from 'supports-color'` to the subpath, and `migrate.test.ts` holds it | **Met.** `migrate.test.ts` › "rewrites a supports-color default import and its `createSupportsColor` to `roundel/supports-color`", red on `main`. |

## Shipped — 2026-10-20

`roundel@1.2.0` is on npm (`npm view roundel time.1.2.0`: `2026-10-20T05:27:55.567Z`) and its
`exports` carry `./supports-color`. Every criterion was re-read against released code or `main`
at `a7d8fb73`:

| Criterion | Evidence on release |
| :-- | :-- |
| 1. graded level with the control, `GRADED` carries the row | `npm run compat -- supports-color` on `main` at `a7d8fb73`: **55 / 55**, 100.0%, ▲ 0. The published `burgee@1.6.6` `dist/compat.js` carries `'supports-color': { reference: 55, passed: 55, rate: 1, control: 55 }`. |
| 2. the compatibility page lists it, major in `SUPPORTED_MAJORS` | Unchanged since #1177; `burgee@1.6.6` `dist/compat.js` has `'supports-color': [11]` and `'supports-color': '11.0.0'`. |
| 3. the B4 pair reads at or below 1 on CI | `benchmarks/results/cli-benchmarks/2026-10-20-f0421b7-ci.json` (the CI run on the release commit): `roundel/supports-color` 1,764 B against supports-color's 2,128 B, **0.829**, gate 1. |
| 4. `burgee migrate` rewrites the import | `burgee@1.6.6` on npm already ships it: its `dist/migrate.js` maps `roundel/supports-color` and its `DROP_INS` row is in `dist/compat.js`. The changeset that announces it, `.changeset/burgee-migrate-supports-color.md` (a `burgee` minor), is still pending, so the changelog names it with the next burgee minor. |
