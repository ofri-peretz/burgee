# Intent — Full backwards compatibility with every incumbent the stack replaces

> Stage 1 artifact. Child of [`cli-output-stack`](../cli-output-stack/intent.md),
> requirement U11. The commander move, repeated seven times: a façade over our engine,
> graded by the incumbent's own suite, with a published, ratcheting pass rate.

**Status:** review · **Design:** [`design.md`](./design.md) (2026-09-08) · **Opened:** 2026-09-08 · **Owner:** @ofri-peretz

---

## Where it stands (2026-09-08)

**Corrected 2026-09-09.** Four of eight rows graded, each with its control in the same run:
chalk 58 / 58, ora 99 / 99, log-update 99 / 99, boxen 84 / 84. The status above is `review`,
not `draft` — this intent does have a `design.md`, and under the SDLC it is not `approved`
until a human has accepted that design; the rows shipped so far did so under `roundel`'s and
`flagstaff`'s own designs, which is where their façade requirements (R6) actually live.

## What is wanted

A user of any of these changes one import and their tests still pass:

| Incumbent | Façade | Layer | Suite runner | Notes |
| :-- | :-- | :-- | :-- | :-- |
| chalk 6 | `roundel/chalk` | roundel | ava | **shipped 2026-09-08 — 58 / 58.** mutable `level`, `chalkStderr`, `Chalk` class |
| picocolors | `roundel/tokens` | roundel | node:test | API is a subset; graded for completeness, not compat |
| ora 9 | `flagstaff/ora` | flagstaff | node:test | **shipped 2026-09-08 — 99 / 99.** `ora().start()` chain; `isSpinning`, `succeed`, `fail`; the `spinners` corpus; the stream hooks |
| log-update 8 | `flagstaff/log-update` | flagstaff | node:test | **shipped 2026-09-08 — 99 / 99.** `logUpdate()`, `.clear()`, `.done()`, `.persist()`, `createLogUpdate`, stderr variant. Its cases render every frame through a real terminal emulator and assert the screen. The one façade so far that lowers a layer guarantee (R5), allow-listed with its reason under constraint 2 below |
| boxen 8 | `flagstaff/boxen` | flagstaff | ava | border styles, padding, title, `fullscreen`. **Unblocked 2026-09-08 — see [`design.md`](./design.md).** The oracle drives real ava, which reads its own `.snap` files, so there was never a format to teach; every case is `t.snapshot(box)`, and since `box()` is a pure function that drawing *is* the contract, so every case gates |
| cli-table3 | `flagstaff/table` | flagstaff | vitest | **Blocked on a decision — see below.** The runner exists as of 2026-09-08; what is unsettled is that 221 of its 234 cases test its own `src/` modules |
| inquirer 14 | `caique/inquirer` | caique | vitest | `inquirer.prompt([...])`, `@inquirer/*` prompt kinds |
| clack 1 | `caique/clack` | caique | vitest | `text`, `confirm`, `select`, `group`, `isCancel`, `spinner` |

Each row is a scoreboard line, each suite is vendored and pinned to the npm release the way
commander's and yargs' are, and `--control` proves the gate against the real package before
it grades ours (C1–C6).

## All four remaining hosts are graded by their own drawing

Measured 2026-09-08 by reading the four suites. This is the finding that matters most for
this intent, and it was not visible from the download counts the table above was built on.

The five rows already graded — commander, yargs, chalk, ora, log-update — are graded by
**behaviour**: what the API returns, what the exit code is, what the stream received. A
port can satisfy those without copying an implementation, which is why they reached 100%.

The four that remain are graded by **pixels** — the incumbent's exact rendering, captured:

| host | how it is graded | share |
| :-- | :-- | --: |
| boxen 8 | every case is `t.snapshot(box)` against ava's `.snap` | ~all |
| cli-table3 0.6.5 | 221 of 234 cases `require('../src/…')` — its own modules | 94% |
| clack 1.8.0 | 289 of 444 assertions are `toMatchSnapshot()`, in 17 of 19 files | 65% |
| inquirer | 604 of 1,028 assertions are `toMatchInlineSnapshot()`, in 25 files | 59% |

What is left when the drawings are removed is small and, for two of them, not about
prompting at all: clack has `limit-options` (14) and `guide` (3); inquirer has
`inquirer.test.ts` (57, mostly the legacy façade's plumbing), `prompts` (2) and `type` (3).

### Why this is a decision and not an obstacle

**A façade that matched those snapshots byte for byte would be the incumbent.** It would
draw what clack draws, frame for frame — and that is exactly what this stack exists not to
do. `caique`'s own design rejects wrapping clack on the grounds that *"clack has no static
projection to give (U3)"*; reproducing clack's frames reproduces that absence. The same
argument holds for boxen's borders and cli-table3's grid.

So "eight façades graded by eight vendored suites" is not reachable as written, and the
honest choices are:

1. **Grade the behaviour, publish the coverage.** Vendor each suite, run it, gate on the
   non-snapshot cases and report the snapshot ones as *documented divergence* with the
   reason — the same shape as the existing `internals` line, which already reports what is
   run but never gated. A row would read `clack 17 / 17 behaviour, 289 drawings diverge by
   design`. Honest, small, and says something true.
2. **Ship the façades ungraded, and say so.** An API-compatible import with no scoreboard
   row, described as "compatible in API, not in appearance". Weaker, and it abandons U11's
   rule that a compatibility claim is a number.
3. **Drop the four rows and publish why.** The scoreboard keeps five hosts, all at 100%,
   and this document becomes the reason there are not eight.

Option 1 is the one that fits the rest of the repo, but it changes what a row *means* —
from "the host's suite passes" to "the host's suite passes except where it asserts a
picture" — and that is the owner's call, not a session's. Nothing further should be built
on these four until it is made, which is why none of them has been.

### What was built anyway, because it is not part of the decision

The oracle gained a `vitest` runner and a second TAP dialect (2026-09-08). All four of
these suites need it — cli-table3 is jest, clack and inquirer are vitest — and it is useful
whichever way the decision goes.

## Two hosts blocked on a decision, not on a port

Read at their current releases on 2026-09-08. Both were recorded above as ordinary rows;
neither is.

**boxen 8.** Every one of its cases is `t.snapshot(box)` against ava's own `.snap` binary
format, which the oracle's ava shim does not read. Two ways out, and they claim different
things: teach the shim ava's snapshot format, and the grade is boxen's recorded
expectations; or record the *control's* output as the expectation, and the grade is "we
render what boxen renders today", which is weaker but honest if it says so.

**cli-table3 0.6.5.** Two surprises. Its suite is jest — vitest's `tap-flat` reporter would
run it, but that reporter emits a plan and one line per test with no `# tests / # pass /
# fail` summary, so the oracle needs a second TAP dialect to read it. That part is small.
The real one is the shape of the suite:

| files | reach | cases |
| :-- | :-- | --: |
| `table-test.js`, `test/issues/*` | the package root | **13** |
| `cell-test.js`, `utils-test.js`, `layout-manager-test.js`, `table-layout-test.js`, the two `original-cli-table-*`, `verify-legacy-compatibility-test.js` | `../src/cell`, `../src/utils`, `../src/layout-manager` | **221** |

Under C4 — a file that imports only the host's internals is graded on an informational line
and never gated, because passing it would mean copying the host's file layout — "cli-table3,
graded" is 13 tests. The other 221 are only passable by reproducing its `src/` file for
file, which is exactly what that rule exists to refuse. Three of them also use
`jest.mock` / `jest.requireActual` on those modules, which is the same statement in code.

So the row is worth having, but what it may claim has to be decided before it is built:
13 gated cases with the 221 reported beside them, or the row dropped and the reason
published. Either is defensible; quietly shipping "13 / 13, 100%" is not.

**Decided 2026-09-08 ([`design.md`](./design.md)): the first.** 13 gated, 221 reported
beside them, and every scoreboard row publishes three numbers — gated, internal, drawing —
so no row can show one figure a reader might take for the whole suite. The same decision
unblocks boxen, clack and inquirer: a drawing is a contract, and for a pure string function
it is the *whole* contract, so matching it is the compatibility claim rather than a way of
avoiding one.

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

   **The first such case arrived with the second render façade (2026-09-08).**
   log-update's suite counts `ESC[2K` on plain non-TTY streams, so `flagstaff/log-update`
   writes cursor escapes off a terminal and R5 is genuinely lowered — suppressing them
   would fail the suite that is the whole claim. The allow-list is
   `packages/flagstaff/src/log-update.test.ts`, which says so in prose and then asserts the
   half of R5 that does survive: no `\r` and no absolute cursor-home, ever, so a captured
   transcript stays parseable. That is the difference between a guarantee quietly lost and
   a guarantee knowingly traded, and it is why the rule is "allow-list with the reason"
   rather than "never".

   **The owner accepted this trade on 2026-09-08**, at the Design→Build gate, as written
   above and with the alternative named: suppress the escapes off-TTY, fail the cases that
   count them, and publish a lower score as a deliberate divergence. The reason for taking
   the trade is that a façade's contract is its incumbent's — a log-update user already
   receives these bytes today, so the façade takes nothing away from them — and R5 governs
   what `hoist()` does, which is the reason to migrate off the façade eventually rather
   than the reason to adopt it. This is the first time constraint 2's escape hatch has been
   used; it is meant to stay rare, and a second use is a signal to re-examine the
   constraint rather than to widen it.

   What a façade does not do is reinterpret its host: `flagstaff/ora` is ora's behaviour to
   the byte and does not sit on `hoist()`. The static projection is the reason to move on
   eventually, not the reason to move; the façade is the door.

   **This rewording of constraint 2 was accepted by the owner on 2026-09-08** — PR #62,
   merged by the owner, which is the acceptance — together with the `flagstaff/design.md`
   edits in the same PR. It is recorded because it was drafted in the PR it governs — and because "a façade cannot lower
   the layer's guarantees" is precisely the rule that first façade broke: `flagstaff/ora`
   restored the cursor on a normal exit but not on a signal, which ora itself does. That
   defect was fixed before the merge rather than argued away, so the reworded constraint
   rests on the measured case and not on the sentence it replaced. A later façade whose host
   *does* assert against a guarantee is allow-listed with its reason, never silently exempt.
3. Order follows downloads × layer readiness: chalk, ora, inquirer, clack, then the rest.
4. A suite killed mid-run is an error, never a score (the oracle's existing rule).

## Success criteria

- Eight rows on the scoreboard, each with a `--control` run recorded. Four of eight as of
  2026-09-09: chalk 58 / 58, ora 99 / 99, log-update 99 / 99, boxen 84 / 84, each with its
  control in the same run.
- chalk and ora at parity with the real package in the same run before their façades
  publish. **Half met** — parity holds; neither façade has published (see below).
- The release watch opens an issue within a day of any incumbent's release, with the diff.

## Verified against `main` — 2026-09-09

Checked criterion by criterion on `61bd11b9`. **Zero of three met.** The status stays `review`.

Two corrections to this file's own record first. The "Where it stands" section above says
*"The status above stays `draft`"* while the header reads `review` — the header is the one the
lock parses, and `review` is the honest value. And "Three of eight" is itself now stale: boxen
landed on `main` in [`e927678f45`](https://github.com/ofri-peretz/burgee/commit/e927678f45),
making it **four**.

- **Eight rows, each with a `--control` run recorded** — not met: **four of eight**. Measured
  by `npm run compat` and `npm run compat -- --control` on 2026-09-09: chalk 58 / 58, ora
  99 / 99, log-update 99 / 99, boxen 84 / 84, each identical against the real package. Missing:
  picocolors, cli-table3, inquirer, clack. Of those four, **two are stale as written** — the
  2026-09-08 decision in `design.md` records that clack and inquirer are graded 65% and 59% by
  snapshots of their own drawing, so a façade that matched them would *be* the incumbent. Eight
  rows is no longer the target the design holds; the criterion has not been rewritten to say so.
- **chalk and ora at parity with the real package before their façades publish** — the parity
  half is true and recorded. The publishing half is false, and the line above marking this
  criterion "**Met.**" is premature: `roundel` and `flagstaff` are 0.1.0 in the tree and
  **0.0.1 on npm**, because every `release.yml` run fails `npm publish` with `ENEEDAUTH` (most
  recently run `34309347964`). Nothing graded here has shipped to a consumer.
- **The release watch opens an issue within a day of any incumbent's release, with the diff** —
  not met, and untested rather than failing. `.github/workflows/compat-upstream.yml` runs daily
  (`17 6 * * *`) and has one successful scheduled run; no incumbent has released since the repo
  was created, so `gh issue list --label upstream-release --state all` is empty. The mechanism
  has never had to work.

## Open questions

- Whether picocolors deserves a row at all; its API is nine functions. Proposed: one row,
  graded once, never re-vendored unless it changes.
