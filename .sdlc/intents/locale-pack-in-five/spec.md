# Design — a locale pack is written in five turns

Intent: [`intent.md`](./intent.md). **Status:** approved.

**Accepted 2026-10-20 by the batch-24 agent, under the owner's delegation of design gates**
([D-20261020-locale-pack-in-five-design-gate](../../decisions/D-20261020-locale-pack-in-five-design-gate.md)).
R1 and R2 are accepted as written. R3 is restated below on a measurement taken before building.

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
- **R3 — Measured** *(restated 2026-10-20; the text below the restatement is the original)*.
  **Now:** every reading passes and the max stays under 12. No transcript spends a call on burgee:
  no read of its source, no `Intl.PluralRules` or `check --help` run, no refused `check`, and no
  second `check` of a pack the first accepted. The
  runner prints each call under a passing case (`caseLines`), so the pull request's own log is the
  check. The median is reported beside the aim of under 6. "Before" is the 2026-10-20 CI series (34
  readings, median 6, max 8), not five local paid runs. **Original:** Five local runs of the case with the CI runner's pinned `claude`, before and
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

## Status

**Built: R1, R2. R3 measured, restated.** One pull request with `localised-human-surfaces`'s
re-grounding.

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | **Built** 2026-10-20 | `check.ts` (`Coverage`; `coverageOf` beside `rendered`, in the catalog's order, every form or none on a passing pack), `locale.ts` (`formsOf` exported) | `check.test.ts` › `says what a passing pack covers of the catalog, per locale` (3 cases) and the R4 rendering case, now with `coverage`. Red on `main`: 4 failed, `expected undefined to deeply equal { …(3) }`. Stryker on the changed lines: 26 killed, 0 survived |
| R2 | **Built** 2026-10-20 | `scripts/locale-pack-schema.ts` (`FRENCH_MODULE`, built from the same `FRENCH_COUNT` the plural example uses; the envelope's `ok` named as the exit status), `locale-pack-schema.json` regenerated | `src/locale-pack-schema.test.ts` (4 cases: a module under 600 B; `burgee check` accepts it with `one, many, other`; the description names `coverage`; it says `ok` is the exit status). Red on `main`: the first three failed, `expected undefined to be defined`; the fourth was red against the description before its sentence |
| R3 | **Measured, restated** | `scripts/run-evals.ts` (`caseLines`: a passing case lists its calls) | Before: 34 readings on 2026-10-20, all passed, median 6, max 8 (5 ×7, 6 ×22, 7 ×4, 8 ×1). The dispatch on this branch (39475810887, product as on `main`) puts the sixth call at turn 2's environment probe. After, this pull request's `Agent Evals` runs. Run 39479245102 passed in 5 turns (read, read, write, `check`). Run 39481745234 passed in 7: a `mkdir -p` and a second `check` run only to read the exit code. That second run is the product's, and the schema now says `ok` is the exit status. `locale-pack-schema.test.ts` holds it; it was red without the sentence. See the decision |

**Text output.** R1's "one line per locale" in text is not built. `burgee check` without `--json`
renders its result through the engine's generic renderer, and a line format for one command would
put a printer on the core path for a reader that the eval does not have: the prompt asks for
`--json`. The same data is in the text output, under `locales`.

**Weight.** `check.js` 2,795 → 3,408 B, lazy, reached only by `burgee check`. `locale.js` +7 B,
lazy. `locale-pack-schema.json` +447 B, data. `weight.test.ts`: 64 passed, no entry moved. The core
bundle closure follows `import` statements only, so it cannot reach either module.
