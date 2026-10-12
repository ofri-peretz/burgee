# Intent — `kleur`, `colorette` and `yoctocolors`, graded drop-ins over roundel's tokens

> Stage 1 artifact. Opened from the wave-4 ranking
> ([`next-wave-4-2026-10.md`](../../research/next-wave-4-2026-10.md)). Wave 3 scored each host at
> 6.7 and left all three for the compat-oracle lane.

**Status:** review · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz

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
