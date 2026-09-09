# Design — Eight façades, and what a snapshot suite may be graded on

Intent: [`intent.md`](./intent.md). **Status:** draft — awaiting the Design→Build gate.

> Written 2026-09-08 to settle the decision that has held boxen, cli-table3, clack and
> inquirer at `planned` since the intent was opened. The short version: **build all four,
> and grade them.** The objection that blocked them does not survive being written down.

---

## The decision

**A drawing is a contract, and matching it is the compatibility claim — not a way of
dodging one.** All four blocked hosts are built and gated against their own suites.

The objection on record is that "a façade that matched boxen frame for frame would *be*
boxen", and that this contradicts U3. Both halves are wrong, and the intent already says so
in a different paragraph:

- **Being the incumbent to the byte is the design, not a failure of it.** Constraint 2:
  "What a façade does not do is reinterpret its host: `flagstaff/ora` is ora's behaviour to
  the byte and does not sit on `hoist()`." A façade that reproduces boxen exactly is a
  façade doing its job. The static projection is the reason to migrate *off* the façade
  eventually; it was never a constraint on the façade.
- **U3 is not in tension for a pure function.** `box()` and `table()` take a state and
  return a string. That *is* `static(state)`. There is no frame to project, nothing to
  decide about a pipe, and no guarantee to lower. The tension U3 describes is between an
  animation and a non-TTY caller, and neither of these two animates.

And for boxen and cli-table3 specifically, the drawing is not an incidental detail of the
suite — it is the **entire public contract**. A user migrating off boxen cares about exactly
one thing: does my box still look the same. A suite that asserts the drawing is asking the
only question that matters, and matching it is a *harder* and more valuable claim than
matching a behavioural suite, not a weaker one.

So the four rows are reachable, and the intent's "eight rows" stands.

## What was stale, and is now corrected

The intent's host table (line 29) says boxen is "**Blocked on the oracle:** … ava's own
`.snap` binary format, which the ava shim does not read." That was true when written and is
not true now. `packages/compat-oracle/src/hosts.ts` records the correction, dated the same
day: *"Runnable — the oracle drives real ava, which reads its own `.snap` files — … Blocked
on the same decision as clack and inquirer, **not on machinery**."*

The oracle drives **real ava**, not a shim of it (`Host.shims` was removed in review), so
ava reads its own snapshots itself. The same is true of vitest for clack, inquirer and
cli-table3: `toMatchSnapshot` reads `__snapshots__/` and `toMatchInlineSnapshot` reads the
test source, both natively. **No snapshot format has to be taught to anything.** The intent's
line 29 should be corrected when this design is accepted.

That reordering matters: inquirer's 604 inline-snapshot cases are the *cheapest* of the four
to run, not the most expensive, because an inline snapshot needs no external file at all.

## Requirements

- **R1 — Every case is classified mechanically**, from the case's own source, never from
  whether we pass it. Three buckets:

  | Bucket | Test | Gated? |
  | :-- | :-- | :-- |
  | `public` | imports only the host's published entry | **yes** — this is the ratchet |
  | `internal` | imports the host's `src/` modules (C4) | no — informational |
  | `drawing` | asserts a snapshot of rendered output | **yes**, per R2 |

- **R2 — A drawing case is gated when the host's contract is its output.** For a pure
  string function — boxen, cli-table3's public cases — it always is. For a host that
  animates, the ora/log-update procedure decides it, per host: establish whether the
  guarantee and the suite actually meet, and allow-list with the reason only if they do.
- **R3 — Internal-module cases are never gated** and are never counted in the published
  rate. C4 already says this; this design only makes the count visible.
- **R4 — Three numbers per scoreboard row**, always: gated, internal, drawing. A row may
  never publish one number that a reader could mistake for the whole suite.
- **R5 — The classifier is locked.** The bucket a case lands in is asserted by a test over
  the vendored sources, so the split cannot be quietly retuned to flatter a score.

## Design

### The classifier

One function over a case's source text, in `compat-oracle`. It runs on the vendored file
before the specifier rewrite, so it classifies the upstream suite rather than our copy of it:

- `internal` — the file imports or `require`s a path under the host's own source directory
  (`../src/…`, `../lib/…`). `upstream.ts` already records `internalFiles` and `internals`
  per host, so this bucket is read from the compatibility record rather than re-derived.
- `drawing` — the case body calls `t.snapshot(`, `toMatchSnapshot(`, or
  `toMatchInlineSnapshot(`. Matched on the case, not the file: a file may hold both kinds.
- `public` — everything else.

`internal` wins over `drawing` when both apply: a snapshot of an internal module's output is
still a test of a file layout we refuse to copy.

### What each host becomes

| Host | Runner | gated | internal | drawing | Notes |
| :-- | :-- | --: | --: | --: | :-- |
| boxen 8 | ava | all | 0 | all | Every case is `t.snapshot(box)`; `box()` is a pure function, so every one is gated. The row is "we render what boxen renders." |
| cli-table3 | vitest | 13 | 221 | — | C4 already decided the 221. The 13 are the public suite and they gate. |
| clack | vitest | 155 | 0 | 289 | Drawing cases gated or allow-listed per R2, decided when the suite is vendored, not now. |
| inquirer 14 | vitest | 424 | 0 | 604 | The inline snapshots make this the cheapest to *run*; R2 still applies to what it may claim. |

The clack and inquirer figures are the intent's counts, restated; what this design fixes is
that they are no longer a reason to leave the rows unbuilt.

### On the escape hatch, and using it twice more

The owner's note on `flagstaff/log-update` says the R5 allow-list "is meant to stay rare, and
a second use is a signal to re-examine the constraint rather than to widen it." This design
does not spend two more uses. It says the opposite: **for the two prompt hosts, establish
first whether the guarantee and the suite meet at all.**

That is what happened with ora, and the answer was no: every frame test passes
`isEnabled: true`, so ora's suite never exercises the default a real program gets, and no
allow-list was needed. clack's and inquirer's snapshot tests drive a mock TTY stream for the
same reason — a prompt suite has to, or there is nothing to snapshot. If that holds when the
suites are vendored, the count of allow-listed cases is zero and the constraint is untouched.

If it does not hold, that is the signal the owner asked for, and it is a gate — the façade
does not ship until the trade is written down and accepted, as log-update's was.

### Order to do it in

1. **boxen** — no tension, no decision left, pure function, and the machinery already runs
   its suite. It is the row that proves the decision.
2. **cli-table3** — the vitest `tap-flat` dialect already landed; C4 already covers the 221.
3. **The classifier and the three-number scoreboard row** — before clack and inquirer, so
   the two large snapshot suites land against it rather than after it.
4. **clack**, then **inquirer** — in that order, smaller suite first, each with the R2
   determination written into its own test file.

## Verification

The loop: `npm run compat` and the ratchet in `compat.yml`.

| Check | Where | What it catches |
| :-- | :-- | :-- |
| R1/R5 — the classifier | `packages/compat-oracle/src/classify.test.ts` | a case moved between buckets; a `t.snapshot` case counted as public |
| R3 — internal never gated | the existing baseline ratchet | an internal case entering the published rate |
| R4 — three numbers | `scripts/compat-page.ts` + its test | a row rendering one number |
| R2 per host | each façade's own test file, as `ora.test.ts` and `log-update.test.ts` do | a guarantee lowered without the reason written down |
| the gate itself | `--control` | the suite passing against something that is not the façade |

**The check that would have caught the problem this design names** — a row publishing
"13 / 13, 100%" for cli-table3 while 221 cases sit unmentioned — is R4. There is no such
check today, which is why the intent says "quietly shipping 13 / 13, 100% is not defensible"
in prose and nothing enforces it.

## Rejected alternatives

- **Report drawing cases as documented divergence, gate behaviour only.** The option that
  looked right before the objection was written out. It publishes a *lower* number for
  boxen than the truth, and it concedes a claim we can actually make — that our box is
  byte-identical to boxen's. Rejected because it is inaccurate in our own disfavour.
- **Ship the four ungraded.** Contradicts the family's own rule that a claim is measured or
  it is a slogan, and gives a migrating user nothing to check.
- **Drop the four rows.** Loses boxen, cli-table3, clack and inquirer as migration paths —
  which are exactly the adopters the `first-adopter` bet needs — to settle a tension that
  does not exist for two of them.
- **Record the control's output as boxen's expectation.** Was the fallback when the ava
  `.snap` format was thought unreadable. It is not, and this would claim only "we render
  what we render", which is not a compatibility statement.
- **Teaching the oracle a snapshot format.** Unnecessary: both runners are real and read
  their own snapshots.
- **One blanket rule for all four hosts.** The four differ in the one way that matters —
  whether the host animates. A rule that treats `box()` and an inquirer prompt the same is a
  rule that is wrong about one of them.

## Out of scope

- The eight façades' implementations. This design settles what they may claim; each is built
  under `flagstaff` or `caique` with its own weight rule and isolation lock.
- Widening the R5 escape hatch. If clack or inquirer needs it, that is a gate, not a step.
- The scoreboard's visual design (`docs-deploy`); R4 fixes what it must contain, not how it
  looks.
- meow, cac, citty and oclif. They are engine hosts under `commander-compat`'s lineage, not
  output-stack rows.
