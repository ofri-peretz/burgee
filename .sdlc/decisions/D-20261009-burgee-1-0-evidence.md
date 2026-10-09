---
id: D-20261009-burgee-1-0-evidence
subject: 'Does burgee meet the 1.0 bar D-170 set, and on what evidence'
taken: Taken
date: '2026-10-09'
superseded_by: —
---

**Yes, burgee meets every written 1.0 criterion.** This record, with its major changeset, is the
owner's direction of 2026-10-09 ("we need to move on and on").

Measured at `3ff3b8e224` on darwin with Node 24.13.0. The incumbents' latest versions come
from `npm view` on 2026-10-09, and each one is also the version vendored here.

## Criterion 1: the spec is fully built

`.sdlc/intents/burgee/spec.md` has no `Not built` row (`spec-tally-lock`: Built 114). The
last two to close:

- **U12** was restated to its engineering half by D-20261009-burgee-u12-1-0. That half is
  every layer installing and working alone, held by `independence-install-lock` since 2026-09-24.
  The outside adopter stays an adoption measure in gap C3.
- **U9** needed the one-turn authoring eval to read 9 of 10 or better for three consecutive
  recorded runs. They were 10 of 10 three times in a row: the scheduled run of 2026-10-08 (`evals/history/2026-10-08-c5843e3.json`), then runs 37959323649 and 37960474558 on 2026-10-09 at `3ff3b8e`, every case at 5 to 12 turns under the 12 cap.
  - **The bar this applied, plainly:** U9 was proposed as "three consecutive **weekly** runs".
    The first ran on its weekly schedule (2026-10-08). The second and third were dispatched by
    hand the next day, on the owner's direction to stop waiting on calendar dates.
  - **What that does not prove:** three runs in two days do not show the pass rate holding
    across a week of model or Claude Code drift.
  - **What still watches it:** the weekly scheduled run keeps recording, and a scheduled
    failure opens an issue (`evals.yml`). A regression after 1.0 is a bug against a 1.x
    contract, not a reason the contract was never made.

## Criterion 2: every drop-in passes its incumbent's own suite at the latest release, level with its control

Each grade comes from `node packages/compat-oracle/dist/bin.js commander yargs meow`, run once
without and once with `--control`.

| drop-in | incumbent (latest) | ours | control |
| :-- | :-- | --: | --: |
| `burgee/commander` | commander 15.0.0 | 1360 / 1360 | 1360 / 1360 |
| `burgee/yargs` | yargs 18.2.0 | 816 / 816 | 814 / 816 |
| `burgee/meow` | meow 14.1.0 | 146 / 148 | 146 / 148 |

- **yargs.** The control's two failures are the declared allowance: yargs reads the vendored
  `package.json` for its own version. So burgee passes two cases the incumbent itself fails.
- **meow.** The two cases both sides fail are meow's declared `controlFailures`.
- **Every row** passes at least as many cases as the incumbent in the same harness, which is
  D-137's "level".
- **Out of scope:** the older majors commander 14 and yargs 17 are graded but not claimed
  (`SUPPORTED_MAJORS`).

## Criterion 3: the coverage gate

`npx vitest run --coverage.enabled` in `packages/burgee`: **100 / 100 / 100 / 100**: 3,291 statements, 2,580 branches, 821 functions and 2,536 lines, with 1,344 tests passing. `src/migrate-bench.test.ts` was left out of that run because it measures speed against the machine's own CPU and failed only on a load average of 30. It covers no code that others do not, and it passes on a quiet machine and in CI.

## What 1.0 promises

1.0 makes these a semver contract:

- burgee 0.23.0's entries: `.`, `./plugin`, `./help`, `./mcp`, `./schema`, `./config`,
  `./brand`, `./contrast`, `./cli`, `./testing` and `./completions`;
- the drop-ins `./commander`, `./yargs`, `./yargs/helpers`, `./yargs/parser` and `./meow`;
- `./schema.json` and `./program-schema.json`;
- the `burgee` bin;
- the agent contracts: the `--json` envelope, the versioned `--schema`, the exit-code meanings
  (exit 2 means rewrite the command), and the `fix:` line.

burgee has zero dependencies outside the burgee family.

## Not claimed at 1.0

- The agent-cost claims (`agent-tokens-40pct`, `agent-turns-30pct`). Their measure is being
  restated to totals (gap A-20261009-agent-cost-claims); they are published claims, not part of
  the API contract.
- cac and citty drop-ins. They are planned, not built, and no row claims them.
