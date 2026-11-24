---
id: D-20261124-hookset-triggerlist-1-0
subject: "Do hookset and triggerlist meet the 1.0 bar D-170 set, and on what evidence"
taken: 'Taken — the owner, 2026-11-24: "we need to get to a point all our packages are in major version 1.0.0", with releases delegated to Claude'
date: "2026-11-24"
superseded_by: —
---

**Yes, both meet every written 1.0 criterion.** This record, with the two major changesets
beside it, cuts hookset 1.0.0 and triggerlist 1.0.0. It follows
[`D-20261124-verification-family-1-0`](./D-20261124-verification-family-1-0.md) and
[`D-20261124-replz-1-0`](./D-20261124-replz-1-0.md); with it, every verification package in
burgee is at 1.0.

Both are released and dogfooded. hookset's presets and Claude pack run in all eight Interlace
repositories. triggerlist runs on every burgee pull request: `claude-code-review.yml` takes its
brief through `.github/actions/triggerlist-review`.

Measured on linux (4 cores) with Node 24.13.0, at main `0ad24f0e55`, after #1801 (generated-file
edits) and #1805 (the provedone station, triggerlist's bootstrap and `brief --replies`).

## Criterion 1: the spec is fully built

`.sdlc/intents/hookset/spec.md` and `.sdlc/intents/triggerlist/spec.md` now carry a Status table:
R1 to R6 built in each, with the test that holds each row. **Not built: 0** in both.

## Criterion 2: every claimed drop-in is level with its incumbent

Neither claims a drop-in; both READMEs say "Not graded" under Compatibility.

## Criterion 3: the coverage gate

`npx vitest run --coverage.enabled`, 2026-11-24:

| package     | tests | statements |  branches | functions |     lines |
| :---------- | ----: | ---------: | --------: | --------: | --------: |
| hookset     |    70 |  243 / 243 | 179 / 179 |   59 / 59 | 179 / 179 |
| triggerlist |    94 |  220 / 220 | 100 / 100 |   59 / 59 | 180 / 180 |

hookset's Claude pack (`claude/*.mjs`) runs as child processes in `claude.test.ts`, so its lines
are tested but not counted by v8.

## Beyond the bar: mutation

`scripts/mutation.ts full`, oxmutate 2.18.4, two mutants at a time; each score is now the
package's first floor in `.sdlc/bands/mutation-ratchets.json`.

| package     | killed | timeout | survived | no coverage | score | minutes |
| :---------- | -----: | ------: | -------: | ----------: | ----: | ------: |
| hookset     |    609 |      11 |        0 |           0 |  100% |    1.43 |
| triggerlist |    576 |       6 |        0 |           0 |  100% |    1.64 |

## What 1.0 promises

- **hookset**: `.`, the `hookset` bin with `init` and `check`, their `--json` shape and exit codes,
  the three lefthook presets and their steps, the Claude pack and the `.claude/hookset.json`
  fields it reads.
- **triggerlist**: `.`, the `triggerlist` bin with `match`, `brief`, `protect`, `compile` and
  `seed`, their options, `--json` shapes and exit codes, the checklist format and the compiled
  `REVIEW.md` layout.

## Out of scope

- burgee#1802 (guard-bash closes three bypasses) is still open; it denies more, never less, so it
  ships as a 1.x minor.
- hookset 0.3.0 cannot be published (npm keeps the number of a removed version); the major
  changeset moves past it.
