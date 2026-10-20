# Intent — `kleur`, `colorette` and `yoctocolors`, graded drop-ins over roundel's tokens

> Stage 1 artifact. Opened from the wave-4 ranking
> ([`next-wave-4-2026-10.md`](../../research/next-wave-4-2026-10.md)). Wave 3 scored each host at
> 6.7 and left all three for the compat-oracle lane.

**Status:** approved (2026-10-19, under the owner's delegation, [`D-20261019-colour-facades-design-accepted`](../../decisions/D-20261019-colour-facades-design-accepted.md)) · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz · **Design:** [`spec.md`](./spec.md)

---

## What is wanted

`roundel/kleur`, `roundel/colorette` and `roundel/yoctocolors`, each graded level with its
incumbent's own suite by compat-oracle, each bundling at or under its incumbent, each written by
`burgee migrate` and listed on the compatibility page. One `overrides` line removes each package
from a user's tree.

## Why now

- **Demand.** kleur 70,902,431 /wk, colorette 52,887,824 /wk, yoctocolors 34,546,493 /wk
  (`replacement-map.md`, 2026-09-09): 158,336,748 together, none graded. kleur was last published
  2022 and colorette 2023 (the same table).
- **The implementation exists.** `roundel/tokens`' ceiling is already picocolors' bytes, and
  `roundel/picocolors` and `roundel/chalk` are graded the same way.
- **Decided.** D-20261012-colour-facades-one-intent: one intent, three hosts in turn.

## Affected users and systems

- `packages/roundel/src/` (three subpaths), `packages/roundel/package.json` `exports`.
- `packages/compat-oracle/` (three vendored suites, `hosts.ts`), `packages/burgee/src/compat.ts`
  (`GRADED`, `DROP_INS`, `GRADED_VERSIONS`), `benchmarks/axes/weight.ts` (three B4 pairs), the
  compatibility page.

## Constraints

- **One compat-oracle lane at a time** (wave 2's rule): after `previous-majors` yargs 17, the last
  wave-3 host, and after `inquirer-prompts-drop-in` (#1037 open).
- **U5 per subpath.** Each bundles at or under its incumbent.
- **Zero external dependencies.** Suites vendored with their licences, as every host is.

## Success criteria

1. `npm run compat -- kleur colorette yoctocolors` level with each control.
2. Three B4 rows at ratio ≤ 1.
3. `burgee migrate` rewrites each import in a fixture program that then passes its own tests.

## Jev triage

| user_impact | incumbent_gap | risk_reduced | composite | ready_for_spec | needs_model |
| --: | --: | --: | --: | :-- | :-- |
| 2 | 3 | 0 | 12 | yes | no |

## Open questions

- One intent or three. **Decided 2026-10-12**, D-20261012-colour-facades-one-intent.

## Status — 2026-10-20

yoctocolors is built, on `feat/roundel-colour-facades` against `main` at `8681efca`; kleur and
colorette are not, and stay open in
[`A-20261019-colour-facades-hosts-not-built`](../../gaps/A-20261019-colour-facades-hosts-not-built.md).
The design asks for one host per pull request, so this one carries yoctocolors alone
([`D-20261020-colour-facades-yoctocolors-first`](../../decisions/D-20261020-colour-facades-yoctocolors-first.md)).
The intent stays `approved`, and is stamped `shipped` once all three are built and roundel's
minors are on npm.

| Criterion | yoctocolors 2.2.0 | colorette 2.0.20 | kleur 4.1.5 |
| :-- | :-- | :-- | :-- |
| 1. `npm run compat -- <host>` level with each control | **Met.** `roundel/yoctocolors` 78 / 78 against a control of 78 / 78 (`baseline/yoctocolors.json`); the target read 0 / 0, `target not built yet`, before the subpath existed. `GRADED.yoctocolors` is `{ reference: 78, passed: 78, rate: 1, control: 78 }`; the compatibility page lists it, major 2 claimed. | **Not met.** Not vendored: needs a runner that reads `twist`'s counts and upstream CI's environment. | **Not met.** Not vendored: needs a `uvu` runner and a loader substitution for `-r esm`. |
| 2. A B4 row at ratio ≤ 1 | **Met locally.** 2,247 B against yoctocolors' 2,363 B, **0.951**, under `BUNDLED_CEILING` 2,350 (red at a ceiling of 0 first) and the U5 ratio gate of 1; the whole surface is 3,275 B against 3,395 on `/docs/weight` (`DROP_IN_CEILINGS`). The CI reading is in the pull request's `bench` job. | **Not met.** No pair. | **Not met.** No pair. |
| 3. `burgee migrate` rewrites the import in a fixture program that then passes its own tests | **Met.** `migrate.test.ts` › "moves a program on yoctocolors 2 to roundel/yoctocolors, and leaves 1 alone naming 2.2.0" (`import` and `require()`), and › "rewrites a yoctocolors default, named and namespace import", both red on `main`. The fixture program that passes its own tests is yoctocolors' `fixture.js`, which the graded suite spawns against the target. | **Not met.** No `DROP_INS` row. | **Not met.** No `DROP_INS` row. |
