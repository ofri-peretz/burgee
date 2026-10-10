---
id: D-20261009-controlroom-1-0
subject: 'controlroom ends its 1.0 hold: re-measured at 0.3.3, and every criterion still holds'
taken: Taken
date: '2026-10-09'
superseded_by: —
---

**controlroom goes to 1.0.0.** D-20261007-caique-controlroom-1-0-evidence found it met the 1.0
bar, and the owner held the cut for "a release or two of real use" because `controlroom/ink`
had been rewritten from ink 8 on 2026-10-06. Three releases have shipped since (0.3.1, 0.3.2,
0.3.3), and this record re-measures each criterion on current main and ends the hold.

Measured on darwin with Node 24.13.0, at main `3ff3b8e224`, on 2026-10-09.

## No regressions since 2026-10-07

- **Open issues.** `gh issue list --search controlroom` and `--search ink` return none.
- **CHANGELOG since 0.3.0.** 0.3.1 tightened the family `schema.json`, 0.3.2 fixed the root
  entry's doc comment and the README's Plugins example, and 0.3.3 moved the docs links to
  https://controlroom.interlace.tools. None touches `controlroom/ink`'s behavior.
- **The incumbents have not moved.** `npm view ink version` is 8.0.0 and
  `npm view @inkjs/ui version` is 2.0.0, the versions this repository vendors.

## Criterion 1: the spec is fully built

`grep -c 'Not built' .sdlc/intents/controlroom/spec.md` is 0.

## Criterion 2: every drop-in is level with its control at the latest release

| drop-in | incumbent (latest) | ours | control |
| :-- | :-- | --: | --: |
| `controlroom/ink` | ink 8.0.0 | 1304 / 1304 | 1304 / 1304 |
| `controlroom/ink` | @inkjs/ui 2.0.0 | 102 / 102 | 102 / 102 |

The machine was not quiet: load average was 41 to 45 during both runs. The ink control read
1304 / 1304 anyway, so the declared timing case ("calculate layout while rendering is
throttled") passed this time. The drop-in is level with its control either way, and above the
1303 recorded on 2026-10-07.

## Criterion 3: the coverage gate

`npx vitest run --coverage.enabled` in `packages/controlroom`: 131 tests in 14 files, 100% of
statements (389 / 389), branches (248 / 248), functions (98 / 98) and lines (310 / 310).
`src/ink/*.ts` is graded by the ink suite above, as `vitest-coverage.config.ts`'s
`TESTED_IN_ANOTHER_PROCESS` records.

## What 1.0 promises

The surface D-20261007-caique-controlroom-1-0-evidence listed, now a semver contract: `.`,
`./ink` (at ink 8 and @inkjs/ui 2), `./plugin`, `./schema.json`, and the `controlroom` bin.
`react` and `react-reconciler` stay optional peers used only by `./ink`, and the package keeps
zero external production dependencies.

## What is still not claimed

The out-of-scope list of D-20261007-caique-controlroom-1-0-evidence stands: ink 6 is not
claimed, and `burgee migrate` leaves ink 6 projects alone. "Real use" here means three
published releases with no bug filed against `controlroom/ink`; it does not mean an outside
adopter, which none of the three releases brought.

**Still true at the cut (2026-10-10).** Between the measurement at `3ff3b8e` and this PR,
controlroom shipped 0.3.4 and 0.3.5. Both changed only the npm description and READMEs
(#938, #942). The one commit under `packages/{controlroom,flagstaff,caique,roundel,linegauge}/src`
was #937, which touched each package's `weight.test.ts` and no shipped code. So the
measurement still describes the code this major publishes.
