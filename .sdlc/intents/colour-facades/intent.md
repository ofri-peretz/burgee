# Intent — `kleur`, `colorette` and `yoctocolors`, graded drop-ins over roundel's tokens

> Stage 1 artifact. Opened from the wave-4 ranking
> ([`next-wave-4-2026-10.md`](../../research/next-wave-4-2026-10.md)). Wave 3 scored each host at
> 6.7 and left all three for the compat-oracle lane.

**Status:** shipped (2026-10-26, every criterion re-read against `roundel@1.2.1` and `burgee@1.7.2` as installed from npm, [`D-20261026-shipped-on-published-patch`](../../decisions/D-20261026-shipped-on-published-patch.md); approved 2026-10-19 under the owner's delegation, [`D-20261019-colour-facades-design-accepted`](../../decisions/D-20261019-colour-facades-design-accepted.md)) · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz · **Design:** [`spec.md`](./spec.md)

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

## Shipped — 2026-10-26

**All three criteria hold on the published packages, for all three hosts.** Version PR #1253
published `roundel@1.2.1` and `burgee@1.7.2` on 2026-10-26 from `main` at `c4230e33` (the `gitHead`
`npm view` reports), which carries #1218, #1233 and #1255. `roundel@1.2.1` exports `./yoctocolors`,
`./colorette`, `./kleur` and `./kleur/colors`. The release went out as a patch, because the release
window holds a minor's version number and not its code. Why that is enough to stamp, and the
release-cadence breach it records:
[`D-20261026-shipped-on-published-patch`](../../decisions/D-20261026-shipped-on-published-patch.md).

Every row below was run on 2026-10-26 in an empty `mktemp -d` directory after
`npm i roundel@1.2.1 burgee@1.7.2 kleur@4.1.5 colorette@2.0.20 yoctocolors@2.2.0 esbuild`. None
of it read the workspace.

| Criterion | Command, against the published tarball | Output |
| :-- | :-- | :-- |
| 1. `npm run compat -- kleur colorette yoctocolors` level with each control | `packages/roundel/dist` replaced by the tarball's `dist` (35 files, copied from `node_modules/roundel/dist`), then `npm run compat -- kleur colorette yoctocolors`, then `--control` | target: colorette **67 / 67**, kleur **15 / 15**, yoctocolors **78 / 78**, ▲ 0 each; control: 67 / 67, 15 / 15, 78 / 78. The run reads the swapped `dist`: with the tarball's `kleur.js` removed, kleur fell to 7 / 15 |
| 2. A B4 row at ratio ≤ 1, per host | `esbuild <fixture> --bundle --minify --format=esm --platform=node --splitting`, the B4 command and fixture shape from `benchmarks/axes/weight.ts`, over each published subpath and its incumbent | `roundel/yoctocolors` 2,247 B against 2,363 (**0.951**); `roundel/colorette` 1,794 against 1,973 (**0.909**); `roundel/kleur` 1,036 against 1,847 (**0.561**); `roundel/kleur/colors` 621 against 688 (**0.903**). Byte for byte the figures recorded at build time |
| 3. `burgee migrate` rewrites each import in a fixture program that then passes its own tests | a fixture project declaring `kleur`, `colorette` and `yoctocolors`, with an ESM test (default, named and namespace imports, `kleur/colors` included) and a CJS test (`require()`). `npm test` passes on the incumbents, then `burgee migrate` from `burgee@1.7.2`, then `npm test` again | `complete: 2 files rewritten`: colorette → `roundel/colorette` (3 imports), kleur → `roundel/kleur` (2), kleur/colors → `roundel/kleur/colors` (2), yoctocolors → `roundel/yoctocolors` (2). It reports `graded by the incumbent’s own suite: colorette 67 / 67, kleur 15 / 15, yoctocolors 78 / 78`. `npm test` after the rewrite prints `esm ok` and `cjs ok`, with `roundel/kleur` resolving to the installed `roundel/dist/kleur.js` |

The minor changeset still bumps roundel's version when the window opens. That bump is
bookkeeping, and nothing here waits on it.

## Status — 2026-10-25

All three are built: yoctocolors (#1218), colorette (#1233) and kleur, on `feat/roundel-kleur`
against `main` at `26bb166d`, which closes
[`A-20261019-colour-facades-hosts-not-built`](../../gaps/A-20261019-colour-facades-hosts-not-built.md).
The design asks for one host per pull request, so each carried one
([`D-20261020-colour-facades-yoctocolors-first`](../../decisions/D-20261020-colour-facades-yoctocolors-first.md),
[`D-20261020-colour-facades-colorette-twist`](../../decisions/D-20261020-colour-facades-colorette-twist.md),
[`D-20261025-colour-facades-kleur-uvu`](../../decisions/D-20261025-colour-facades-kleur-uvu.md)).
The intent stayed `approved` until roundel's release carrying them was on npm: it shipped as
`roundel@1.2.1`, above.

| Criterion | yoctocolors 2.2.0 | colorette 2.0.20 | kleur 4.1.5 |
| :-- | :-- | :-- | :-- |
| 1. `npm run compat -- <host>` level with each control | **Met.** `roundel/yoctocolors` 78 / 78 against a control of 78 / 78 (`baseline/yoctocolors.json`); the target read 0 / 0, `target not built yet`, before the subpath existed. `GRADED.yoctocolors` is `{ reference: 78, passed: 78, rate: 1, control: 78 }`; the compatibility page lists it, major 2 claimed. | **Met.** `roundel/colorette` 67 / 67 against a control of 67 / 67 (`baseline/colorette.json`), graded by the new `twist` runner, which reads twist's printed counts because twist exits 0 on failure (red first: `twist.test.ts`), in upstream CI's environment; the target read 0 / 0, `target not built yet`, before the subpath existed. `GRADED.colorette` is `{ reference: 67, passed: 67, rate: 1, control: 67 }`; the compatibility page lists it, major 2 claimed. | **Met.** `roundel/kleur` and `roundel/kleur/colors` 15 / 15 against a control of 15 / 15 (`baseline/kleur.json`), both of the files kleur's `npm test` runs, graded by the new `uvu` runner, which reads uvu's printed summary once per file, with tsx where `-r esm` stood (red first: `uvu.test.ts`); the target read 0 / 0, `target not built yet`, before the subpaths existed. `GRADED.kleur` is `{ reference: 15, passed: 15, rate: 1, control: 15 }`; the compatibility page lists it, major 4 claimed. |
| 2. A B4 row at ratio ≤ 1 | **Met locally.** 2,247 B against yoctocolors' 2,363 B, **0.951**, under `BUNDLED_CEILING` 2,350 (red at a ceiling of 0 first) and the U5 ratio gate of 1; the whole surface is 3,275 B against 3,395 on `/docs/weight` (`DROP_IN_CEILINGS`). The CI reading is in the pull request's `bench` job. | **Met locally.** 1,794 B against colorette's 1,973 B for a program importing `red`, **0.909**, under `BUNDLED_CEILING` 1,900 (red at a ceiling of 0 first) and the U5 ratio gate of 1; the whole surface is 2,425 B against 2,602 on `/docs/weight` (`DROP_IN_CEILINGS`). The CI reading is in the pull request's `bench` job. | **Met locally.** 1,036 B against kleur's 1,847 B for a program importing the default, **0.561**, under `BUNDLED_CEILING` 1,150, and 621 B against kleur/colors' 688 B for one importing `red`, **0.903**, under 750 (each red at a ceiling of 0 first), both under the U5 ratio gate of 1; the whole surfaces are 1,049 B against 1,839 and 930 against 997 on `/docs/weight` (`DROP_IN_CEILINGS`). The CI reading is in the pull request's `bench` job. |
| 3. `burgee migrate` rewrites the import in a fixture program that then passes its own tests | **Met.** `migrate.test.ts` › "moves a program on yoctocolors 2 to roundel/yoctocolors, and leaves 1 alone naming 2.2.0" (`import` and `require()`), and › "rewrites a yoctocolors default, named and namespace import", both red on `main`. The fixture program that passes its own tests is yoctocolors' `fixture.js`, which the graded suite spawns against the target. | **Met.** `migrate.test.ts` › "moves a program on colorette 2 to roundel/colorette, and leaves 1 alone naming 2.0.20" (`import` and `require()`), and › "rewrites a colorette named and namespace import, types included", both red on `main`. The fixture program that passes its own tests is colorette's `tests/scripts/bin.js`, which the graded suite spawns four times against the target. | **Met.** `migrate.test.ts` › "moves a program on kleur 4 to roundel/kleur, both entries, and leaves 3 alone naming 4.1.5" (`import` and `require()`), and › "rewrites a kleur default import and a kleur/colors named and namespace import, each to its own entry", both red on `main`. The fixture programs that pass their own tests are kleur's `test/index.js` and `test/colors.js`, which the graded suite runs against the target. |
