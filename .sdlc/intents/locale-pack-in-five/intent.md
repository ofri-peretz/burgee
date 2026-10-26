# Intent — a locale pack is written in five turns

> Stage 1 artifact. Opened from the wave-4 ranking
> ([`next-wave-4-2026-10.md`](../../research/next-wave-4-2026-10.md)). D-20261012-agent-eval-turn-budget
> brought paratext's eval under its target and left the locale pack at a median of 7.

**Status:** shipped · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz · **Shipped:** 2026-10-26, on burgee 1.7.0 and 1.7.1 (#1219, #1232), criterion 3 restated by [D-20261026-locale-criterion-3-median-range](../../decisions/D-20261026-locale-criterion-3-median-range.md) — all 3 criteria met on 16 recorded readings

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
3. Every reading passes and the maximum stays under 12. The median and range are reported over a
   named window of readings, beside the aim of under 6. In the same window, the share of
   transcripts that spend a call on burgee is reported: a read of its source, a run of
   `Intl.PluralRules` or `check --help`, a refused `check`, or a second `check` of a pack the first
   accepted. **Above 1 in 4, the intent reopens.** *(Restated 2026-10-26,
   [D-20261026-locale-criterion-3-median-range](../../decisions/D-20261026-locale-criterion-3-median-range.md):
   "no transcript spends a call", over every reading, is zero tolerance on a stochastic agent, and
   any one transcript reopens it. The two calls observed had one cause each in the schema, and both
   are removed.)* *(Earlier restatement, 2026-10-20,
   [D-20261020-locale-pack-in-five-design-gate](../../decisions/D-20261020-locale-pack-in-five-design-gate.md):
   on `main` the median is 6 over 34 readings, and the whole gap to 5 is one environment probe
   (`ls evals/results/`, `ls dist/cli.js`) that no burgee change reaches and the eval may not be
   edited to remove.)*

## Status — 2026-10-26

**Shipped.** PR #1219 (`80c8eaa52b`) shipped in burgee 1.7.0 (Version PR #1231), and #1232's fix
for checking a `.json` pack in 1.7.1 (Version PR #1237). Criterion 3 was restated and holds on the
recorded window. The schema fix for the two observed calls ships in the next burgee patch.

| Criterion | State on release |
| :-- | :-- |
| 1. `check <pack> --json` reports translated and missing ids and plural forms per locale | **Met** in burgee 1.7.0, and for a `.json` pack in 1.7.1. |
| 2. The schema's top-level description holds a complete three-form module | **Met** in burgee 1.7.0 (`burgee/locale-pack-schema.json`). |
| 3. Every reading passes, max under 12; median, range and the share of burgee calls reported over a named window | **Met.** Window: the 16 `Agent Evals` readings of the case on the released product, 2026-10-24 to 2026-10-25, runs 40086461208 to 40246944698, each a pull request's own run. All passed, max 8, **median 6, range 5–8**. **2 of 16** spend a call on burgee, under the 1-in-4 band: 40086461208 ran `Intl.PluralRules`, and 40217253606 grepped `messages.ts`. Both looked up what the schema already said. The schema now prints no expression to run, and it says each id's English is its `description`. `locale-pack-schema.test.ts` holds that, red on `main`. The per-run table is in the decision. |

## Jev triage

| user_impact | incumbent_gap | risk_reduced | composite | ready_for_spec | needs_model |
| --: | --: | --: | --: | :-- | :-- |
| 1 | 1? | 1? | 7 | yes | no |

## Open questions

- Whether to change the eval instead. **Decided 2026-10-12** by D-20261012-agent-eval-turn-budget:
  the eval stays.
