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

No state machine; no model.

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

## Rejected alternatives

- **Three intents.** The same design written three times (the decision).
- **One pull request for all three.** Three oracle runner changes in one lane, which is the
  collision the one-lane rule exists to stop.
- **Map them to `roundel/picocolors` in `migrate` only.** Different APIs; a rewrite that compiles
  is not a drop-in, and no suite would grade it.

## Out of scope

- `ansi-colors` and `cli-color`, with no demand number in `replacement-map.md` above these.
