# Design — `kleur`, `colorette` and `yoctocolors`, graded drop-ins over roundel's tokens

Intent: [`intent.md`](./intent.md). **Status:** review.

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

Each subpath is a thin mapping over `roundel/tokens`, as `roundel/picocolors` is: the policy
(`NO_COLOR`, `FORCE_COLOR`, TTY) is each incumbent's own as its suite pins it, kept apart from
`roundel/policy`'s safer precedence, the same split `supports-color-drop-in` makes.

Order: R1, R2, R3, each one PR in the compat-oracle lane, each with its R4 row and R5 rows.

## Verification

| R | Check | Red on main |
| :-- | :-- | :-- |
| R1–R3 | `npm run compat -- <host>` | no host |
| R4 | B4 weight axis | no row |
| R5 | `migrate.test.ts`; `compat:page -- --check` | no `DROP_INS` row |

No state machine; no model.

## Rejected alternatives

- **Three intents.** The same design written three times (the decision).
- **Map them to `roundel/picocolors` in `migrate` only.** Different APIs; a rewrite that compiles
  is not a drop-in, and no suite would grade it.

## Out of scope

- `ansi-colors` and `cli-color`, with no demand number in `replacement-map.md` above these.
