---
id: D-20261008-seniority-1-0-evidence
subject: 'Does seniority meet the 1.0 bar D-170 set, and on what evidence'
taken: Taken
date: '2026-10-08'
superseded_by: —
---

**Yes, seniority meets every written 1.0 criterion.** This records the evidence and releases
nothing. Cutting 1.0.0 is the owner's call, as it was for D-170,
D-20261006-foundation-1-0-evidence and D-20261007-caique-controlroom-1-0-evidence.

Measured at `6d3eda268a` on darwin with Node 24.13.0. The incumbents' latest versions come
from `npm view` on 2026-10-08, and each one is also the version this repository has vendored.

## Criterion 1: the spec is fully built

`.sdlc/intents/seniority/spec.md` has no `Not built` row. R11 was recorded Built with #828, and
`scripts/plan-progress.ts` reports `✓ 3.2 seniority at 1.0`.

## Criterion 2: every drop-in passes 100% of its incumbent's own suite at the latest release, level with its control

Each grade comes from `node packages/compat-oracle/dist/bin.js cosmiconfig lilconfig dotenv rc`,
run once without and once with `--control`.

| drop-in | incumbent (latest) | ours | control |
| :-- | :-- | --: | --: |
| `seniority/dotenv` | dotenv 18.0.6 | 181 / 181 | 181 / 181 |
| `seniority/lilconfig` | lilconfig 3.1.3 | 77 / 77 | 77 / 77 |
| `seniority/rc` | rc 1.2.8 | 1 / 1 | 1 / 1 |
| `seniority` (`cosmiconfig`) | cosmiconfig 10.0.1 | 240 / 243 on darwin, 242 / 243 on ubuntu | the same on each OS |

- **cosmiconfig on darwin.** Two of the 243 cases are a Linux-only `XDG_CONFIG_HOME` pair (the
  declared `conditionalCases`), so darwin cannot register them. On ubuntu both pass, and the row
  reads 242 / 243 on both sides (D-20260930-seniority-xdg-config-home).
- **cosmiconfig's remaining case.** It fails against cosmiconfig itself: the declared
  `controlFailures`, an `index.test.ts` case that imports cosmiconfig's own `src/` by path and
  mocks its internals.
- **dotenv.** One case skips itself off Windows on both sides.

On every row the drop-in passes as many cases as its incumbent in the same harness. That is
D-137's "level".

## Criterion 3: the coverage gate

`npx vitest run --coverage.enabled` in `packages/seniority`: **100 / 100 / 100 / 100**. That is
2,055 statements, 1,511 branches, 317 functions and 1,694 lines, with 987 tests passing.

## What 1.0 would promise

seniority 0.8.0's published entries would become a semver contract:

- `.`, `./precedence`, `./explain`, `./plugin`, `./config`, `./find-up` and `./yaml`;
- the drop-ins `./cosmiconfig`, `./lilconfig`, `./rc`, `./dotenv`, `./dotenv/config` and
  `./dotenv/cli`;
- `./schema.json` and the `seniority` bin.

The package has zero external production dependencies.

## Out of scope

- Earlier majors: dotenv 17 is graded at 107 / 141 and not claimed (`SUPPORTED_MAJORS.dotenv`
  is `[18]`).
- dotenv's vault: `.env.vault`, `DOTENV_KEY` and `decrypt`, which dotenv 18 removed.

## Recent behaviour changes the owner should weigh

Two recent changes moved behaviour, each to match dotenv:

- #828 brought the dotenv 18 surface.
- #847 made `populate` read the strings `'false'`, `'0'` and so on as off, where any non-empty
  string used to read as on. dotenv shipped that as a patch.

A 1.0 tag freezes that surface. Both changes match the incumbent, which is the drop-in's whole
contract.
