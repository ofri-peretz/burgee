# Design — `kleur`, `colorette` and `yoctocolors`, graded drop-ins over roundel's tokens

Intent: [`intent.md`](./intent.md). **Status:** approved — accepted by the coordinator under the
owner's delegation, [`D-20261019-colour-facades-design-accepted`](../../decisions/D-20261019-colour-facades-design-accepted.md),
as re-grounded on `main` at `326907ec` (see *Re-grounded* below).

---

## Requirements

- **R1 — kleur.** `roundel/kleur`: kleur 4.x's chainable API (`kleur.red().bold('x')`, `enabled`)
  over `roundel/tokens`; the suite vendored; a `GRADED` row. *Check:*
  `npm run compat -- kleur` level with control; red on main, no host.
- **R2 — colorette.** `roundel/colorette`: functions, `isColorSupported`, `createColors`.
  *Check:* `npm run compat -- colorette`; red on main.
- **R3 — yoctocolors.** `roundel/yoctocolors`: the function set. *Check:*
  `npm run compat -- yoctocolors`; red on main.
- **R4 — Weight.** A B4 pair each, ratio gate 1. *Check:* `benchmarks/axes/weight.ts` rows; red
  on main, no rows (the bench lists missing pairs as failures once declared).
- **R5 — Migrate and page.** `DROP_INS` rows; `npm run compat:page` regenerated. *Check:*
  `packages/burgee/src/migrate.test.ts` fixture per host; `npm run compat:page -- --check`.

## Design

Each subpath is its own module in `packages/roundel/src/`, carrying its incumbent's formatter and
its incumbent's colour rule, as `roundel/picocolors` does: the policy (`NO_COLOR`, `FORCE_COLOR`,
TTY) is each incumbent's own as its suite pins it, kept apart from `roundel/policy`'s safer
precedence, the same split `supports-color-drop-in` makes. Each reads the process through
`runtime.ts` alone and is allow-listed by file in `scripts/output-env-lock.test.ts`
(D-20261019-output-env-lock-scope). kleur and colorette ship CommonJS, so each drop-in exports
`'module.exports'` where its incumbent's `require()` returns one object, and
`scripts/drop-in-require-shape-lock.test.ts` checks the built package.

Order: R3 (yoctocolors, the one with no new runner), then R1 and R2, each one PR in the
compat-oracle lane, each with its R4 row and R5 rows.

## Verification

| R | Check | Red on main |
| :-- | :-- | :-- |
| R1–R3 | `npm run compat -- <host>` | no host |
| R4 | B4 weight axis | no row |
| R5 | `migrate.test.ts`; `compat:page -- --check` | no `DROP_INS` row |

No state machine; no model. Each facade's colour decision is a pure function of the environment,
read once at import (yoctocolors: Node's `tty.WriteStream.prototype.hasColors()`), and every style
is a pure function of its input, so there is no state for Quint to explore; the differential tests
against each incumbent's own source are the check.

## Re-grounded on `main` at `326907ec`, 2026-10-19

The spec was written 2026-10-12. Each change below is against what `main` and the upstream
release tags held on 2026-10-19:

1. **"A thin mapping over `roundel/tokens`" is dropped.** `roundel/tokens` is nine semantic tokens
   over `util.styleText` that close and re-open around every line break and take their level from
   `roundel/policy`; the three suites assert exact bytes and their own colour rules. `roundel/picocolors`,
   which the design cited as the model, is in fact a standalone formatter, and so is each of these.
2. **yoctocolors is 2.2.0**, 61 functions (the `4:x` underline styles, `overline`, the `58;5;n`
   underline colours) and 78 cases. One case spawns `node fixture.js` from the repository root,
   which the vendor step does not copy when `testDir` is `.`.
3. **kleur's runner does not start on Node 24.** `uvu -r esm` fails with
   `Cannot use import statement outside a module`; R1 needs a `uvu` runner and a loader
   substitution in compat-oracle before its suite can grade anything.
4. **colorette's runner exits 0 on failure.** `twist` reported 58 of 67 failing against colorette
   itself off a terminal and exited 0; R2 needs a runner that reads twist's counts, and the host
   needs upstream CI's environment.
5. **Order.** R3 first, because it needs no new runner.

The kill criterion is unchanged: a host whose drop-in cannot bundle at or under its incumbent does
not ship.

## Build status — 2026-10-20

yoctocolors built on `feat/roundel-colour-facades` against `main` at `8681efca` (#1218), and
colorette on `feat/roundel-colorette` against `main` at `6213a30b`, each alone, because the design is
one host per pull request (D-20261020-colour-facades-yoctocolors-first,
D-20261020-colour-facades-colorette-twist). Every check below was red first.

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R3 | Built | `roundel/src/yoctocolors.ts`, `./yoctocolors` in `exports` and `typesVersions`; the `yoctocolors` host in `compat-oracle` (`vendor/yoctocolors/` at `a02a16ec`, `depsBefore` recorded, `fixture.js` through `extraDirs`, its `index.js` through `entries`); `baseline/yoctocolors.json`; `GRADED`, `DROP_INS`, `GRADED_VERSIONS`, `SUPPORTED_MAJORS` | `npm run compat -- yoctocolors` 78 / 78, control 78 / 78, target 0 / 0 before the subpath; `yoctocolors.test.ts` (differential against yoctocolors' own `base.js`: every style, every pair nested, colour on and off, every missing link of the `hasColors` chain); `drop-in-type-surface-lock`, `drop-in-require-shape-lock` |
| R4 (yoctocolors) | Built | `benchmarks/fixtures/entry-points.ts`, `BUNDLED_CEILING` 2,350; `DROP_IN_CEILINGS` 3,395; `competitors.json` `./yoctocolors` | `npm run bench -- --axis weight --check` (red at a ceiling of 0, then 0.951 against ≤ 1); `subpath-weight-lock` |
| R5 (yoctocolors) | Built | `migrate.ts` `FACADE_EXPORTS` and `REQUIRE_NAMESPACE`; the Migrate and compatibility pages | `migrate.test.ts` › rewrites a yoctocolors import; › moves a program on yoctocolors 2; `migrate-drop-ins-lock` |
| R1 | Not built | kleur 4.1.5 | needs the `uvu` runner and loader substitution |
| R2 | Built | `roundel/src/colorette.ts`, `./colorette` in `exports` and `typesVersions`; the `twist` runner (`compat-oracle/src/twist.ts`, `runTwistFiles` in `run.ts`); the `colorette` host (`vendor/colorette/` at `811fd2f2`, tag `2.0.20`, `depsBefore` recorded, `suiteDeps` colorette 2.0.20 and twist 0.0.5, `env` upstream CI's); `baseline/colorette.json`; `GRADED`, `DROP_INS`, `GRADED_VERSIONS`, `SUPPORTED_MAJORS` | `npm run compat -- colorette` 67 / 67, control 67 / 67, target 0 / 0 before the subpath; `twist.test.ts` (twist's own CLI exits 0 on a run with a failure, and the arm grades it as that failure; red with the arm's dispatch removed); `colorette.test.ts` (differential against colorette's own `index.js`: every style, every pair nested, every close code at every search offset, colour on and off, twenty rows of colorette's decision); `drop-in-type-surface-lock`, `drop-in-require-shape-lock`, `output-env-lock` |
| R4 (colorette) | Built | `benchmarks/fixtures/entry-points.ts`, `BUNDLED_CEILING` 1,900; `DROP_IN_CEILINGS` 2,602; `competitors.json` `./colorette` | `npm run bench -- --axis weight --check` (red at a ceiling of 0, then 0.901 against ≤ 1); `subpath-weight-lock`; `competitors-lock` (colorette now in its `KNOWN`) |
| R5 (colorette) | Built | `migrate.ts` `FACADE_EXPORTS` (not `REQUIRE_NAMESPACE`: colorette's `require()` is its CommonJS build, an object of names, and ours is a namespace of the same names with no `default`); the Migrate and compatibility pages | `migrate.test.ts` › rewrites a colorette named and namespace import; › moves a program on colorette 2; `migrate-drop-ins-lock` |

Two things the design did not say, found building R3:

- **The decision is Node's, not `runtime.ts`'s.** yoctocolors asks
  `tty.WriteStream.prototype.hasColors()`, which reads `FORCE_COLOR`, `NO_COLOR`, `TERM` and `CI`
  inside Node. The drop-in asks the same function, so it reads no output variable itself, never
  reaches `runtime.ts`, and is not on `output-env-lock`'s allow-list (that lock's second case
  would refuse an entry that reads nothing).
- **The default export is the module's own namespace**, `export * as default from
  './yoctocolors.js'`, as yoctocolors' `index.js` is `export * as default from './base.js'`.
  `subpath-isolation.test.ts` allows the one self-edge, and `scripts/api-reference.ts` learned to
  document a namespace re-export, which it had dropped (the checker resolves it to a source file).

Three more, found building R2:

- **twist exits 0 for a run of failures, and 1 for a file it cannot load.** So the runner reads
  the counts on twist's last `Tests:` line, one file per spawn, and a non-zero exit is one failure
  of that file (D-20261020-colour-facades-colorette-twist). twist's own view also throws on a
  failing file of fewer than five lines, which is the same non-zero exit and the same one failure.
- **`tests/scripts/bin.js` needed no `entries`.** Its `../../index.js` reaches the library, so the
  vendor step rewrites it to the shim like a test's import.
- **colorette's decision reads presence, not value.** A `NO_COLOR` or `FORCE_COLOR` set to anything,
  empty included, counts, which is why upstream CI's `FORCE_COLOR=` forces colour. The drop-in
  reads it through `runtime.ts` and `node:tty`'s `isatty(1)` and is allow-listed in
  `output-env-lock` by file, as picocolors' is.

**Built: R2, R3, and R4 and R5 for yoctocolors and colorette. Not built: R1, and R4 and R5 for kleur.**

## Rejected alternatives

- **Three intents.** The same design written three times (the decision).
- **One pull request for all three.** Three oracle runner changes in one lane, which is the
  collision the one-lane rule exists to stop.
- **Map them to `roundel/picocolors` in `migrate` only.** Different APIs; a rewrite that compiles
  is not a drop-in, and no suite would grade it.

## Out of scope

- `ansi-colors` and `cli-color`, with no demand number in `replacement-map.md` above these.
