# Intent — closeout's drop-ins bundle at or under the packages they replace

> Stage 1 artifact. Opened from the wave-4 ranking
> ([`next-wave-4-2026-10.md`](../../research/next-wave-4-2026-10.md)), rank 1. The two B4 rows
> `foundation-claims-watched` R6 measured on 2026-10-12 are the first closeout pairs ever
> bundled, and both lose.

**Status:** shipped · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz · **Shipped:** 2026-10-20 on
[`86b97b35bf`](https://github.com/ofri-peretz/burgee/commit/86b97b35bf) (#1198), released in closeout 1.1.7 (npm, 2026-10-20T15:30Z, Version PR #1199), verified against `main` at
[`e6627ba3`](https://github.com/ofri-peretz/burgee/commit/e6627ba311) — criterion 1 read 0.960 and 0.930 on CI at the release commit, criteria 2 and 3 unchanged since #1198 (below) · design accepted 2026-10-20 under the owner's delegation, [`D-20261020-closeout-weight-design-accepted`](../../decisions/D-20261020-closeout-weight-design-accepted.md) · **Design:** [`spec.md`](./spec.md)

---

## What is wanted

`closeout/signal-exit` bundles at or under `signal-exit@4.1.0`, and `closeout/exit-hook` at or
under `exit-hook@5.1.0`, by B4's method, with both drop-ins still graded level with their
incumbents' own suites. `lighter-than-signal-exit` and `lighter-than-exit-hook` read *met* on the
claim table, and the two `RATIO_CEILING` rows in `benchmarks/axes/weight.ts` are 1.

## Why now

- **The measurement.** `npm run bench -- --axis weight` on 2026-10-12: `closeout/exit-hook`
  4,819 B against 1,645 B (**2.929**), `closeout/signal-exit` 3,634 B against 2,856 B
  (**1.272**). Gaps `B-20261012-closeout-bundles-heavier-than-exit-hook` and
  `B-20261012-closeout-heavier-than-signal-exit` hold both as ratchets (2.98 and 1.31).
- **Demand.** `signal-exit` is 198,913,643 /wk and `exit-hook` 8,757,946 /wk
  (`replacement-map.md`, 2026-09-09). Over 100 M at stake: demand 5.
- **The decision is taken.** D-20261012-closeout-drop-ins-held-to-u5: each drop-in is held to U5
  on its own, and stops importing the phased registry.

## Affected users and systems

- `packages/closeout/src/exit-hook.ts`, `signal-exit.cts`, `ambient.ts`, and a new lean core.
- `benchmarks/axes/weight.ts` (two `BUNDLED_CEILING` and two `RATIO_CEILING` rows), the claim
  table, closeout's README `## Weight`, and `.sdlc/bands/foundation-ceilings.json` if the README
  changes.
- Anyone who swaps either package out through an `overrides` line.

## Constraints

- **Grades do not fall.** Both drop-ins stay level with the control in `npm run compat`.
- **Exactly-once across doors.** A program that mixes `closeout` and a drop-in still runs every
  handler once (`ambient.ts`'s one instance per process, D-20261011-closeout-late-add's model).
- **No ratchet is raised.** The two rows move only down.

## Success criteria

1. Both B4 rows read a ratio ≤ 1.0 in `npm run bench -- --axis weight`.
2. `npm run compat -- closeout` is unchanged.
3. `registry.qnt` and the new model both hold their `safety` in `models.yml`.

## Jev triage

Author-scored, no `TYPESAFE_API_KEY` (skipped, never failed). `?` is confidence below 0.7.

| user_impact | incumbent_gap | risk_reduced | composite | ready_for_spec | needs_model |
| --: | --: | --: | --: | :-- | :-- |
| 2? | 3 | 0 | 12 | yes | yes? |

## Open questions

- Whether the drop-ins are held to U5 or carry the runner as product. **Decided 2026-10-12**,
  D-20261012-closeout-drop-ins-held-to-u5: held to U5.
- Whether a lean core can keep exactly-once with the registry without importing it.
  **Answered 2026-10-12 in `spec.md`**: yes by one shared hook list on the ambient instance, and
  the model R4 names must show it before code merges. **Restated 2026-10-20** (spec.md §
  Re-grounded): no shared list. Each door keeps its own once-guard, and a handler is registered
  through one door. `lean.qnt` models the exit-hook door that lost the registry's guard.

## Status — 2026-10-20

Built on `feat/closeout-at-incumbent-weight` against `main` at `a7d8fb7386`. The constraints
hold: grades did not fall, exactly-once across doors is checked, and no ratchet was raised on
either B4 row. The one budget raise, `./signal-exit/signals` +50 B unminified, is recorded in
D-20261020-closeout-drop-in-budgets. `scripts/mutation.ts changed` on
the changed lines: **119 of 119 mutants killed**, 0 survivors. The signal-exit doors are graded in
child processes and listed in `TESTED_IN_ANOTHER_PROCESS`, as the CommonJS file always was.

| Criterion | Evidence |
| :-- | :-- |
| 1. Both B4 rows read a ratio ≤ 1.0 in `npm run bench -- --axis weight` | **Met.** `closeout/exit-hook` 1,579 B against exit-hook 5.1.0's 1,645 B, **0.960**. `closeout/signal-exit` 2,657 B against signal-exit 4.1.0's 2,856 B, **0.930**. Both `RATIO_CEILING` rows are 1, and on `main` they read 2.929 and 1.272. `lighter-than-exit-hook` and `lighter-than-signal-exit` read *met* once CI records the branch's bench run. |
| 2. `npm run compat -- closeout` is unchanged | **Met.** exit-hook **21 / 21**. signal-exit 126 of the 127 cases the suite registers on darwin, the miss being the control's own (`controlFailures`); the reference 135 counts 8 Linux-only cases. restore-cursor 6 / 6, cli-cursor 8 / 8, onetime 6 / 6. The suite still grades the CommonJS door through `require()`, as it grades signal-exit's own CommonJS build. |
| 3. `registry.qnt` and the new model both hold their `safety` in `models.yml` | **Met.** `lean.qnt` `safety` holds over 20,000 traces × 30 steps. Its four rejected designs and its witness are violated, and `models.yml` checks all of them. `registry.qnt` is unchanged. |

## Shipped — 2026-10-20

`closeout@1.1.7` is on npm (`npm view closeout time`, `"1.1.7":`
`2026-10-20T15:30:09.978Z`), and npm matches `main` for all ten packages (checked 15:40 UTC). Its
`exports` carry both signal-exit doors (`./signal-exit` → `import` `dist/signal-exit.js`,
`require` the CommonJS file). Every criterion was re-read against the released code or `main` at
`e6627ba3`:

| Criterion | Evidence on release |
| :-- | :-- |
| 1. Both B4 rows read a ratio ≤ 1.0 | `benchmarks/results/cli-benchmarks/2026-10-20-e6627ba-ci.json` (the CI run on the release commit): `closeout/exit-hook` **1,579 / 1,645 = 0.96**, `closeout/signal-exit` **2,657 / 2,856 = 0.93**, each against a `RATIO_CEILING` of 1. The claim table in the same file reads `lighter-than-exit-hook` and `lighter-than-signal-exit` **met**. |
| 2. `npm run compat -- closeout` is unchanged | Graded on #1198 and untouched since: exit-hook **21 / 21**; signal-exit level with the control (126 of the 127 cases registered on darwin, the one miss the control's own); restore-cursor 6 / 6, cli-cursor 8 / 8, onetime 6 / 6. |
| 3. `registry.qnt` and `lean.qnt` hold `safety` in `models.yml` | `lean.qnt` `safety` holds over 20,000 traces × 30 steps, its four rejected designs and its witness are violated, and `models.yml` checks all of them. `registry.qnt` is unchanged. Changed-line mutation on #1198: **119 / 119** killed. |

The spawn-delta benchmark that `closeout`'s own S3 still lacks is not a criterion of this intent;
it stays open on [`closeout`](../closeout/intent.md).
