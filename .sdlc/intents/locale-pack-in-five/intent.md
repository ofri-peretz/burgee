# Intent — a locale pack is written in five turns

> Stage 1 artifact. Opened from the wave-4 ranking
> ([`next-wave-4-2026-10.md`](../../research/next-wave-4-2026-10.md)). D-20261012-agent-eval-turn-budget
> brought paratext's eval under its target and left the locale pack at a median of 7.

**Status:** review · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz

---

## What is wanted

`locale-pack-from-schema`'s median over five runs is under 6 turns (`num_turns`), with no run near
the 12-turn cap, measured by the PR's own `Agent Evals` run. The eval's prompt, cap and checks do
not change: the product changes.

## Why now

- **The measurement.** After #1082, five local runs: 6, 6, 7, 9, 18 (median 7, max 18), model
  turns median 5, max 11 (D-20261012-agent-eval-turn-budget). The avoidable refusal went from 5
  of 5 to 0 of 5. The remaining turns went to **verifying what the schema says**: one run ran
  `Intl.PluralRules` itself and read `check --help`, and one spent 11 model turns searching the
  source for how to write a pack as a module.
- **The claim.** PRINCIPLES 7: the published schema plus one example are enough to write the
  artifact in about one turn.
- **The minimum.** Read the schema, read the example, write, run `check`: four tool calls, five
  `num_turns`. The target leaves one turn of slack.

## Affected users and systems

- `burgee check` (`packages/burgee/src/check.ts`) and `locale-pack-schema.json`.
- Every author of a locale pack, person or agent.

## Constraints

- **The eval is not edited** (D-20261012-agent-eval-turn-budget).
- **Budgets.** `check` loads lazily; `.` must not move.
- **Paid runs.** Five local runs per case before and after, the budget the owner set there.

## Success criteria

1. `burgee check <pack> --json` on success says, per locale, which catalog ids are translated,
   which are missing, and the plural forms present for each plural id against the forms the
   locale needs, so the check is the verification.
2. The schema's top-level description holds a complete three-form module, so no run searches the
   source.
3. The eval's median over five runs is under 6, max under 12.

## Jev triage

| user_impact | incumbent_gap | risk_reduced | composite | ready_for_spec | needs_model |
| --: | --: | --: | --: | :-- | :-- |
| 1 | 1? | 1? | 7 | yes | no |

## Open questions

- Whether to change the eval instead. **Decided 2026-10-12** by D-20261012-agent-eval-turn-budget:
  the eval stays.
