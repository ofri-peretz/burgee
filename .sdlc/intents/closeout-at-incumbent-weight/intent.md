# Intent — closeout's drop-ins bundle at or under the packages they replace

> Stage 1 artifact. Opened from the wave-4 ranking
> ([`next-wave-4-2026-10.md`](../../research/next-wave-4-2026-10.md)), rank 1. The two B4 rows
> `foundation-claims-watched` R6 measured on 2026-10-12 are the first closeout pairs ever
> bundled, and both lose.

**Status:** review · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz

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
  the model R4 names must show it before code merges.
