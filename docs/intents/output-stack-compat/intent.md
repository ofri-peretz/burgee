# Intent — Full backwards compatibility with every incumbent the stack replaces

> Stage 1 artifact. Child of [`cli-output-stack`](../cli-output-stack/intent.md),
> requirement U11. The commander move, repeated seven times: a façade over our engine,
> graded by the incumbent's own suite, with a published, ratcheting pass rate.

**Status:** draft · **Opened:** 2026-09-08 · **Owner:** @ofri-peretz

---

## What is wanted

A user of any of these changes one import and their tests still pass:

| Incumbent | Façade | Layer | Suite runner | Notes |
| :-- | :-- | :-- | :-- | :-- |
| chalk 6 | `roundel/chalk` | roundel | ava | mutable `level`, `chalkStderr`, `Chalk` class |
| picocolors | `roundel/tokens` | roundel | node:test | API is a subset; graded for completeness, not compat |
| ora 9 | `flagstaff/ora` | flagstaff | ava | `ora().start()` chain; `isSpinning`, `succeed`, `fail` |
| log-update 8 | `flagstaff/log-update` | flagstaff | ava | `logUpdate()`, `.clear()`, `.done()`, stderr variant |
| boxen 8 | `flagstaff/boxen` | flagstaff | ava | border styles, padding, title, `fullscreen` |
| cli-table3 | `flagstaff/table` | flagstaff | mocha | `new Table({ head })`, `push`, `toString()` |
| inquirer 14 | `caique/inquirer` | caique | vitest | `inquirer.prompt([...])`, `@inquirer/*` prompt kinds |
| clack 1 | `caique/clack` | caique | vitest | `text`, `confirm`, `select`, `group`, `isCancel`, `spinner` |

Each row is a scoreboard line, each suite is vendored and pinned to the npm release the way
commander's and yargs' are, and `--control` proves the gate against the real package before
it grades ours (C1–C6).

## Why now

- Drop-in is the only migration story that has ever moved a parser's users, and the stack
  has eight incumbents with a combined ~850M downloads a week (research intent's table).
- The oracle already exists. Adding a host is vendoring a suite and writing a shim; the
  engine's two hosts took one week each and the render façades are smaller surfaces.
- "ora-compatible" in a README is a sentence. A pass rate is a number. Nobody else in the
  space publishes the number.

## Affected users and systems

- `packages/compat-oracle`: eight new vendored suites, shims, pins, and rows on the
  scoreboard; the daily release watch and weekly re-vendor PR extend to all of them.
- `apps/docs` compatibility page: one table, eleven hosts.
- Each layer package: one subpath per façade, isolated (U5), with its own weight rule.

## Constraints

1. Façades are implemented over our engine, never wrapped around the real package (J9).
   The real packages exist only inside `compat-oracle`, private.
2. A façade cannot lower the layer's guarantees: `flagstaff/ora` still has a static
   projection and still emits nothing under `--json`. Where ora's suite asserts the
   opposite (a `\r` in a pipe), the case is allow-listed with the reason, as X7 does.
3. Order follows downloads × layer readiness: chalk, ora, inquirer, clack, then the rest.
4. A suite killed mid-run is an error, never a score (the oracle's existing rule).

## Success criteria

- Eight rows on the scoreboard, each with a `--control` run recorded.
- chalk and ora at parity with the real package in the same run before their façades
  publish.
- The release watch opens an issue within a day of any incumbent's release, with the diff.

## Open questions

- Whether picocolors deserves a row at all; its API is nine functions. Proposed: one row,
  graded once, never re-vendored unless it changes.
