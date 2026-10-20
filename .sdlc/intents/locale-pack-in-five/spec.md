# Design — a locale pack is written in five turns

Intent: [`intent.md`](./intent.md). **Status:** review.

---

## Requirements

- **R1 — `check` reports coverage.** On a pack that passes, `data.locales[].coverage` is
  `{ translated: string[], missing: string[], plural: { [id]: { have: string[], need: string[] } } }`,
  `need` read from `Intl.PluralRules`. Text output prints one line per locale: `fr: <n> of <m>
  translated, plural forms complete`. *Check:* `packages/burgee/src/check.test.ts` gains a case;
  red on main, `coverage` is absent.
- **R2 — The schema shows a whole module.** `locale-pack-schema.json`'s top-level `description`
  holds a complete French pack module with a three-form plural, under 600 B, and says `check`
  prints coverage. *Check:* `packages/burgee/src/locale-pack-schema.test.ts` imports the module
  from the description and runs `check` on it, exit 0; red on main, the description holds no
  module.
- **R3 — Measured.** Five local runs of the case with the CI runner's pinned `claude`, before and
  after, recorded in a decision file with each run's turns and cost; then the PR's `Agent Evals`
  run. *Check:* the eval history (`evals/history/`) median under 6; on main it is 7. The median is
  `median(caseSeries(readHistory(root), 'locale-pack-from-schema').map((c) => c.turns))` from
  `scripts/eval-history.ts`, so a week no agent ran (2026-10-01, 2026-10-15: `not-run`, one
  recorded turn each before the correction) is never in it (restated 2026-10-18,
  `evals-record-not-run` R4).

## Design

R1 reuses `checkLocales`' plural selection (it already names the forms a locale selects for a
missing-form fix) and returns it on success too. R2 is data. Both live on `check`'s lazy path.

## Verification

| R | Check | Red on main |
| :-- | :-- | :-- |
| R1 | `check.test.ts` coverage case | no `coverage` |
| R2 | `locale-pack-schema.test.ts` module case | no module in the description |
| R3 | eval history median | 7 |

No state machine; no model.

## Rejected alternatives

- **A `burgee locale init fr` scaffolder.** The eval's prompt never mentions it, so it saves turns
  only for an agent that already knows it exists; coverage on `check` reaches every agent that
  follows the prompt.
- **Raise the target to 7.** The target is the PRINCIPLES 7 bar, not a measured convenience.

## Out of scope

- Other plugin evals, at or under target since #1082.
