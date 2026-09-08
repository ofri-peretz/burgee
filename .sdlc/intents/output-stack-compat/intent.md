# Intent — Full backwards compatibility with every incumbent the stack replaces

> Stage 1 artifact. Child of [`cli-output-stack`](../cli-output-stack/intent.md),
> requirement U11. The commander move, repeated seven times: a façade over our engine,
> graded by the incumbent's own suite, with a published, ratcheting pass rate.

**Status:** draft · **Opened:** 2026-09-08 · **Owner:** @ofri-peretz

---

## Where it stands (2026-09-08)

Two of eight rows graded, each with its control in the same run — chalk 58 / 58 and ora
99 / 99 — and a third, log-update, vendored with its control proven at 99 / 99 and its
façade pending. The status above stays `draft` because this intent has no `design.md`, and
under the SDLC an intent is not `approved` until a human has accepted a design; the rows
shipped so far did so under `roundel`'s and `flagstaff`'s own designs, which is where their
façade requirements (R6) actually live.

## What is wanted

A user of any of these changes one import and their tests still pass:

| Incumbent | Façade | Layer | Suite runner | Notes |
| :-- | :-- | :-- | :-- | :-- |
| chalk 6 | `roundel/chalk` | roundel | ava | **shipped 2026-09-08 — 58 / 58.** mutable `level`, `chalkStderr`, `Chalk` class |
| picocolors | `roundel/tokens` | roundel | node:test | API is a subset; graded for completeness, not compat |
| ora 9 | `flagstaff/ora` | flagstaff | node:test | **shipped 2026-09-08 — 99 / 99.** `ora().start()` chain; `isSpinning`, `succeed`, `fail`; the `spinners` corpus; the stream hooks |
| log-update 8 | `flagstaff/log-update` | flagstaff | node:test | **suite vendored, control 99 / 99 (2026-09-08); façade next.** `logUpdate()`, `.clear()`, `.done()`, `.persist()`, stderr variant. Its cases render every frame through a real terminal emulator and assert the screen |
| boxen 8 | `flagstaff/boxen` | flagstaff | ava | border styles, padding, title, `fullscreen`. **Blocked on the oracle:** every case is `t.snapshot(box)` against ava's own `.snap` binary format, which the ava shim does not read. Teach the shim that format, or record the control's output as the expectation — a decision, so it is `planned` rather than active |
| cli-table3 | `flagstaff/table` | flagstaff | vitest | `new Table({ head })`, `push`, `toString()`. Its suite is **jest**, not mocha as first recorded here; jest's globals are vitest's and vitest is already in the repo, so the runner to add is `vitest` |
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
2. A façade cannot lower the layer's guarantees. Measured on the first render façade
   (2026-09-08): ora needs no allow-list, because ora's *own default* already honours R5 —
   `isInteractive()` is false for a pipe and for CI, and a disabled spinner writes one
   static line per state with no `\r` and no escape. Every frame test in ora's suite passes
   `isEnabled: true` to force the animation on, so the guarantee and the suite never meet.
   `packages/flagstaff/src/ora.test.ts` asserts it on the default a real program gets, and
   goes red if the enablement path is broken. Where a later façade's suite *does* assert
   the opposite, the case is allow-listed with the reason, as X7 does.

   What a façade does not do is reinterpret its host: `flagstaff/ora` is ora's behaviour to
   the byte and does not sit on `hoist()`. The static projection is the reason to move on
   eventually, not the reason to move; the façade is the door.

   **This rewording of constraint 2 was accepted by the owner on 2026-09-08**, at the
   Design→Build gate, together with the `flagstaff/design.md` edits in the same PR. It is
   recorded because it was drafted in the PR it governs — and because "a façade cannot lower
   the layer's guarantees" is precisely the rule that first façade broke: `flagstaff/ora`
   restored the cursor on a normal exit but not on a signal, which ora itself does. That
   defect was fixed before the merge rather than argued away, so the reworded constraint
   rests on the measured case and not on the sentence it replaced. A later façade whose host
   *does* assert against a guarantee is allow-listed with its reason, never silently exempt.
3. Order follows downloads × layer readiness: chalk, ora, inquirer, clack, then the rest.
4. A suite killed mid-run is an error, never a score (the oracle's existing rule).

## Success criteria

- Eight rows on the scoreboard, each with a `--control` run recorded. Two of eight graded as
  of 2026-09-08 — chalk 58 / 58 and ora 99 / 99, each with its control in the same run — and a
  third (log-update) vendored with its control proven at 99 / 99, its façade pending.
- chalk and ora at parity with the real package in the same run before their façades
  publish. **Met.**
- The release watch opens an issue within a day of any incumbent's release, with the diff.

## Open questions

- Whether picocolors deserves a row at all; its API is nine functions. Proposed: one row,
  graded once, never re-vendored unless it changes.
