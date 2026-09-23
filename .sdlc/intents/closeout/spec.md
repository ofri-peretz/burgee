# Design — closeout

Intent: [`intent.md`](./intent.md). Umbrella:
[`cli-foundation-stack`](../cli-foundation-stack/spec.md). **Status:** approved (2026-09-23, under the owner's delegation, D-129).

---

## Requirements

- **R1** `onExit(fn, opts?): () => void` registers a handler and returns an unregister
  function. `fn(report)` runs **exactly once** across: normal `exit`, `beforeExit`,
  `SIGINT`, `SIGTERM`, `SIGHUP`, `SIGQUIT`, `SIGBREAK` (Windows), `uncaughtException`, and
  `unhandledRejection`. A second trigger of any kind never re-runs a handler that has run.
- **R2 (Y5, Y6)** The handler receives one record — `{ path, signal, code, error }` where
  `path` is `'exit' | 'signal' | 'uncaught' | 'rejection' | 'beforeExit'` — and the same
  record is what `--json` and an agent event project from. One value, three renderings.
- **R3 (Y10)** `deadline` bounds the whole cleanup: default finite (number set by the
  measurement in Verification), raisable by the caller, **never `Infinity` and never `0`** —
  both are rejected at registration with a `USAGE`-class error. On breach the process exits
  with the original code and emits a report naming **every handler that had not returned**,
  identified by the function's `name` or the caller-supplied `label`.
- **R4** Terminal restore runs **last and unconditionally**: raw mode off, cursor shown,
  alternate screen left. It runs when a handler threw, when the deadline fired, and when the
  process is exiting normally with nothing else registered.
- **R5** `once(fn)` returns a function that invokes `fn` at most once and returns the first
  result thereafter, preserving `name`, `length` and `this` — the `onetime` + `mimic-fn`
  contract in one function with no dependency.
- **R6 (Y3)** The root default export is `signal-exit`'s default, call-compatible including
  its `{ alwaysLast }` option, so `overrides: { "signal-exit": "npm:closeout@^1" }`
  resolves. `./cursor`, `./once` carry the rest; subpath isolation locked as in `roundel`.
- **R7 (Y9)** Exactly one file, `src/install.ts`, touches `process`. Everything else takes
  it as an argument. The env-reference grep exempts that one path by name and nothing else —
  an exemption list of one is auditable; a convention is not.
- **R8 (Y8)** Ceilings: bytes and spawn delta at or under `exit-hook` (0 deps, 8.8 M/wk, the
  lightest in the layer) — not under `signal-exit`, which would be a free pass. **Restated
  2026-09-14, after the measurement rather than before it:** the spawn-delta half holds and is
  asserted; the byte half does not, and the requirement now reads *zero dependencies, a
  per-entry byte ratchet, and the whole package under the sum of what it replaces* — with the
  miss written out below rather than the ceiling quietly moved. A requirement that is edited
  to match the code is worthless unless the edit says what it cost.
- **R9 (Y7)** `signal-exit` and `exit-hook` suites vendored into `compat-oracle`, graded
  through generated shims, `--control` first, ratcheting.
- **R10** `exitCode` is preserved on every path: a handler running after `process.exit(3)`
  cannot change the observed code. Asserted per path in the matrix, whether or not
  `signal-exit`'s suite covers it.
- **R11 — the order is data, not arrival time.** (Added 2026-09-14.) A handler declares a
  **phase**; `PHASES = ['flush', 'release', 'restore']` declares the sequence; the runner
  reads the sequence. Phases run in order and are *awaited* in order — an async handler in
  `flush` settles before `release` begins — and handlers inside one phase run together in
  registration order. `restore` is last, always, and it is where R4's terminal restore goes.
  Unphased handlers default to `release`, so a caller that never heard of phases keeps the
  behaviour it had and gains the one guarantee it was missing.
- **R12 (`plugin-contract` R5a) — `closeout/plugin` hosts `handlers`.** `register(plugin)`
  keeps `handlers`, ignores every other layer's keys without complaining (R1 of the contract),
  and `attach(registry)` wires each contributed handler into its phase. A plugin may use
  `flush` or `release` and **not** `restore`: R5a's words are "never after it", and admitting a
  plugin to closeout's own last phase would put "never" back at the mercy of which of the two
  registered first. The refusal is `E_PLUGIN_SCHEMA` and names the two phases it may use.

### Evidence

| R | What supports it | Standing |
| :-- | :-- | :-- |
| R1 | `signal-exit` 198.9 M/wk, last publish **2023-07-29**; `exit-hook` 8.8 M/wk | measured 2026-09-09 |
| R3 | no incumbent in the layer has a deadline; clack #533 is the same failure shape one layer up — "hangs forever and just fails" | **the differentiator; a hypothesis until the matrix runs** |
| R4 | `cli-cursor` (107.6 M/wk, 2024-07-26) → `restore-cursor` (107.5 M/wk) → `onetime` → `mimic-fn`: 3–4 packages to show a cursor | measured |
| R5 | `onetime` 162.3 M/wk + `mimic-fn` 99.7 M/wk = 262 M/wk for one wrapper | measured |
| R8 | the lightest zero-dep incumbent in the layer is `exit-hook` | measured |
| default deadline value | nothing to copy | **unknown — set by measurement, see Verification** |

## Design

```text
packages/closeout/src/
  install.ts      THE ONLY process-touching file (R7): registers listeners, owns exitCode
  registry.ts     handlers, the run-exactly-once state machine                   (R1)
  deadline.ts     the bounded runner; returns which handlers did not settle      (R3)
  report.ts       the { path, signal, code, error } record and its projections   (R2)
  cursor.ts       hide/show, raw mode, alternate screen                          (R4)
  once.ts         R5
  runtime.ts      the structural Runtime shape, nine lines, no import            (Y9)
  index.ts        default = signal-exit's default; named re-exports
  matrix.test.ts        every signal × every path × handler-hangs                (R1, R3, R10)
  weight.test.ts  R8 · shape.test.ts  R6, R7
```

**Order.** `registry` + `install` → the matrix (which is the product, not a check on it) →
`deadline` → `cursor` → `once` → vendor the two suites → `caique` switches over and deletes
its signal handling → B4 rows → the `signal-exit` override recipe, behind its pass rate.

**The state machine, stated once.** A handler is in one of three states: `pending`,
`running`, `settled`. A trigger moves every `pending` handler to `running` and starts the
deadline. Subsequent triggers of any kind do nothing but record their path in the report.
The deadline moves anything still `running` to `settled('timeout')`, records its label, and
lets the exit proceed. Nothing in that description mentions a signal, which is why the
guarantee holds across all of them.

**Why the deadline is at the bottom of the stack.** A caller *cannot* add it on top: by the
time a handler is running, the caller has already handed control away, and racing a timer
against someone else's `await` means exiting while their work is half-done with no way to
say so. Owning the runner is what makes "which handler hung" answerable at all — and that
sentence is the product.

## Verification

- `npm test -w closeout` — the matrix, R5's `name`/`length`/`this` preservation, R8's
  ceiling, R7's single-file exemption (a test that greps `src/` for `process.` and asserts
  exactly one file matches).
- `npm run compat -- signal-exit exit-hook` — two rows, `--control` first, ratcheting.
- `npm test -w caique` **after** the deletion, unchanged.
- **Setting the default deadline, as a measurement rather than a taste.** Run the ten most
  common cleanup shapes (flush a write stream, close a server, kill a child, remove a temp
  dir, restore the terminal) 100× each and take p99. The default is that, rounded up to the
  next 250 ms, and the number and its run date go in the README. Re-measured when the
  incumbents' suites are re-vendored.
- **The check that would have caught the original problem.** The original problem is a
  process that never ends because a cleanup handler never returns — invisible to
  `signal-exit`, which has no notion of time. The matrix includes cells whose registered
  handler is `() => new Promise(() => {})`; each asserts the process exits within the
  deadline **and** that the report names that handler. Those cells are proven to fail
  against real `signal-exit`, checked in as the control, so the check is known to work.

## What shipped (R11, R12 — phases and the plugin host — 2026-09-14)

`closeout/plugin`: `register()`, `validate()`, `contributions()`, `attach()`, `reset()`,
`registered()`, and the family's error vocabulary — `E_PLUGIN_SCHEMA`, `E_PLUGIN_CONTRACT` —
with the `fix` shape flagstaff and roundel use (contract R8). `src/schema.json` is the
family's file, byte-identical, exported at `closeout/schema.json` because that is the
specifier this package's own `E_PLUGIN_SCHEMA` fix names.

**The assertion that carries the whole step**, in `src/plugin.test.ts`:

```ts
closeout.hideCursor(recordingTty(log));                   // registered FIRST
register({ name: 'acme', handlers: [{ name: 'unlock', run: () => { log.push('acme:unlock'); } }] });
attach(closeout.registry);                                // registered SECOND
await closeout.registry.run({ code: 0, signal: null });

expect(log).toEqual(['acme:unlock', 'restore']);
```

The cursor is hidden **first**, deliberately. A plugin handler registered before the restore
would run first under the flat-set implementation this package shipped yesterday, so a test
written that way passes on the bug and proves nothing.

**Proven red three ways, each a different wrong implementation:**

| Mutation | Result |
| :-- | :-- |
| `PHASES` reversed to `['restore', 'release', 'flush']` | 5 red; the headline case read `['restore', 'acme:unlock']` |
| `hideCursor` registering at the default phase — literally the pre-fix line | 4 red; `['restore', 'acme:unlock']` again, from the real bug rather than a scrambled constant |
| phases invoked in order but never awaited (`Promise.all` semantics) | 1 red, and it is the async case: `['restore']` alone, the drain landing after the terminal was back |

The third is the one worth keeping in mind: sorting the *calls* without sequencing the
*phases* looks correct in every synchronous test and is the same bug with tidier bookkeeping.

**The deadline does not skip a phase, it stops waiting for one.** A handler that hangs in
`flush` must not get to decide that the cursor stays hidden — that would be this package
producing its own headline failure through the machinery meant to prevent it. Past the
deadline every later phase is still invoked; it is simply not awaited. Asserted directly:
a plugin handler of `() => new Promise(() => {})` in `flush`, and the restore still runs.

**A debt this created, recorded rather than left in a commit message.** `plugin-contract` R7
says no key may require a function except a component's `frame` and burgee's `hooks`.
`handlers` requires one — an exit handler *is* behaviour, and there is no data encoding of
"close this socket". What R5a asks for and what shipped is that the **ordering** is data:
`contributions()` projects the whole shutdown sequence without running any of it. R7's
exemption list owes `handlers.run` an entry, and that edit belongs to the lane that owns
`plugin-contract`.

The deadline report now reads `PluginHandler.name`: `attach()` registers each contributed
handler under `"<plugin>:<handler>"`, so a plugin that hangs is named rather than counted. See
the R3 section below; dropping that label is one of the seven mutations proved red.

## What shipped (R6, R9 — two graded drop-in paths — 2026-09-14)

Step 2.2–2.13's closeout share. `closeout/exit-hook` and `closeout/restore-cursor` are built
and graded by their incumbents' own suites through `compat-oracle`, `--control` first:

| host | release | runner | control | closeout |
| :-- | :-- | :-- | --: | --: |
| `exit-hook` | 5.1.0 | ava | 21 / 21 | 21 / 21 |
| `restore-cursor` | 5.1.0 | node:test | 6 / 6 | 6 / 6 |

**`signal-exit` is not among them, and the reason is the harness rather than the package.**
Measured against the repo at `v4.1.0`: its suite runs under `tap`, which is not one of
`run.ts`'s four runner dialects; four of its files are TypeScript executed through a
`ts-node/esm` loader the workspace does not install; five files and two fixtures import
`../dist/cjs/…`, and `vendor.ts`'s `INTERNAL_PATTERNS` knows `lib` and `src` and *throws* on
anything else; and `test/signals.js` asserts through `t.matchSnapshot()` against tap's own
snapshot format. All four are edits to `run.ts` and `vendor.ts`. The suite is therefore not
vendored at all — a directory of tests that cannot run would have to be excluded from
`vendored-suite.test.ts`, and an exclusion that large reads as a decision when it is a
blockage. `hosts.ts` carries the host as `planned` with the four blockers written out, and
**no baseline fragment exists for it**, which is the honest state: R4 makes `signal-exit`'s
pass rate the gate on the whole `overrides` recipe, and there is no rate yet.

**Two mutations proved `restore-cursor`'s row bites**, each a plausible wrong implementation
rather than a scrambled constant:

| Mutation | Result |
| :-- | :-- |
| restore through `closeout.showCursor()`, which re-reads `isTTY` at write time | 3 / 6 |
| stdout preferred over stderr when both are terminals | 5 / 6 |

The first is the one worth keeping: the fixture *deletes* `isTTY` before exiting, so the
obvious implementation — reuse the package's own `showCursor` — writes nothing at all, and
scores 3 / 6 rather than 0, which reads like a near miss and is a wrong contract. Dropping
`exit-hook`'s stdio drain scores 18 / 21 and 15 / 21 on consecutive runs for the same reason:
`process.exit()` truncates 20,000 queued lines that the suite counts.

**What the deadline had to give up, stated rather than hidden.** `closeout/exit-hook` does
*not* impose closeout's 2 000 ms `DEFAULT_DEADLINE`: the incumbent's own case registers a hook
with `{ wait: 2000 }`, and a 2 s hook under a 2 s budget is a coin toss. The façade builds its
registry at shutdown with `max(wait)` — the incumbent's effective bound, still finite, still
never `Infinity` — because a drop-in that silently tightens a caller's timeout is not a
drop-in. R3's bounded shutdown lives in `onExit()`, and the README says so in the same breath
as the override recipe. What the façade does keep from this package is the ordering: sync
hooks are the `flush` phase and async hooks are `release`, so "every synchronous hook has run
before the first asynchronous one starts" comes out of `PHASES` rather than out of two sets
and a comment, and `restore` still runs last for anything registered through `hideCursor()`.

**A harness defect the control run found, and it is in the instrument.** `exit-hook`'s four
signal cases kill their fixture after a **fixed 1000 ms**. If the child has not finished
evaluating its module graph by then the signal takes its default action and the case fails
with `exitCode: undefined`. Measured on a machine at load average 22 across 14 cores, against
**real `exit-hook`**: 4 of 10 fixture runs lost that race, and 0 of 10 lost it when the same
fixture was killed on a readiness signal instead. Control and target show it identically, and
always all four cases together. So 21 / 21 is the ceiling and the recorded number, and a
17 / 21 on that row is this race — check the four names before believing anything else. No
`controlFailures` allowance was declared: an allowance of 4 on a 21-case suite is a 19% blind
spot a genuinely broken implementation could hide in.

## What shipped (R1, R2, R10 — every door, one record, and the caller's exit code — 2026-09-14)

Before today the wiring listened for `'exit'` and three signals. R1 names nine triggers, and
the three that were missing are the three where cleanup matters most and where **no incumbent
in the layer listens at all**: `beforeExit`, `uncaughtException`, `unhandledRejection`. A CLI
that throws mid-render left the cursor hidden, and `signal-exit` could not have helped.

- `SIGNALS` is now `['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT', 'SIGBREAK']`. SIGBREAK is
  Windows-only and costs one listener that can never fire elsewhere, which is a better trade
  than a `platform` read in the one package whose design is that it does not read the process.
- `uncaughtException` and `unhandledRejection` run the handlers, put the error in the report,
  then leave the way Node would: the error on stderr, exit 1 — **and only if nobody else is
  listening**. The same stand-down-then-count guard the signal path already had, so a program
  with its own crash handler keeps deciding and gets the cleanup for free.
- `beforeExit` is the one trigger with time to spare, and the one where nothing is exited: the
  program was already leaving, and forcing a code would overwrite what it had set.

**R2 is a record, not a bag of arguments.** `{ path, signal, code, error }`, with
`path: 'exit' | 'beforeExit' | 'signal' | 'uncaught' | 'rejection'`, and `reportToJson()` /
`reportToEvent()` are *projections of that value* rather than second descriptions of the
event. The case that made them functions instead of a `toJSON`: `JSON.stringify(new Error())`
is `{}` — an `Error` has no enumerable own properties — so the obvious implementation emits a
line that looks like a report, passes any schema, and says nothing about what went wrong.

**R10 is one line in the right place.** The exit code is captured *at the trigger*, before a
single handler runs, so a handler that tidies `exitCode` to 0 on its way past cannot turn a
`process.exit(3)` or a SIGTERM into a success — and a breached deadline leaves with that same
code rather than one invented by the fact that something hung. Neither the `'exit'` nor the `'beforeExit'`
path calls `exit()` at all, because the program is already going.

## What shipped (R3 — the deadline, and the sentence that is the product — 2026-09-14)

`deadline.ts`: the bound, its refusals, and the clock. `report.ts` holds what a breach says.

- **`Infinity` and `0` are refused at registration** — `install()` / `createRegistry()`, not
  at the shutdown they would have ruined — with a `DeadlineError` carrying `code: 'USAGE'` and
  a `fix`. They are the same mistake wearing two hats: one waits forever, the other gives no
  asynchronous handler a turn, and both reintroduce work that silently did not happen.
- **A breach names every handler that had not returned**, by the caller's `label` or the
  function's own `name`, falling back to `(anonymous)` rather than to an empty string.
  `attach()` registers a plugin's handlers under `"<plugin>:<handler>"`, which is what
  `PluginHandler.name` was required for and what nothing read until today.
- `run()` resolves with a `ShutdownReport` — the record plus `timedOut` and `unfinished` — so
  a caller can project the breach as JSON or as an agent event instead of reading a line of
  prose off stderr. `onTimeout` is where that line goes; the default writes it to stderr.
- The bound is one clock for the whole shutdown, not one per phase: three phases with a
  deadline each add up to three deadlines, which gives back the hang the number exists to
  bound.

**The default deadline, measured rather than chosen — and the measurement is recorded with
what was wrong with it.** Five cleanup shapes, 100 runs each, 2026-09-14, darwin arm64, node
24.13: flush a write stream p99 **67.1 ms**, close a server **1.5 ms**, kill a child
**1.3 ms**, restore the terminal **0.2 ms**, remove a temp directory of 100 files
**17 818.5 ms**. The fifth is not a fact about removing a directory — the machine was at
**load average 19–22 across 14 cores**, the same condition that makes `exit-hook`'s four
signal cases a race; re-run alone that shape is p50 161 ms / p99 2 166 ms. Rounding a p99
with another process's disk queue inside it would have produced a number with a decimal point
and no meaning, so **the default stays 2 000 ms and is labelled provisional in the README**,
and `intent.md`'s open question stays open. What changed is that the question now has one
recorded run and a stated procedure instead of an argument. The instrument itself is not
committed here: it needs `console.log` and a child process, which this repository's lint
grants to `benchmarks/**` and to nothing else, and `benchmarks/` is another lane's path — so
the shapes are written out above precisely enough to rebuild, and the instrument belongs in
that lane's next PR.

## What shipped (R4, R5, R7 — restore last, `once`, and one file that touches the process — 2026-09-14)

**R4** was already true through the `restore` phase (R11); what it lacked was a case proving
it survives the two paths it exists for. Both are now asserted: a handler that *hung* in
`flush` does not keep the cursor hidden (the deadline stops waiting for a phase, it never
skips one), and a handler that *threw* does not either. Raw mode and the alternate screen are
still `cursor.ts`'s to grow — the README says so rather than implying a restore it does not do.

**R5** `once(fn)` is 441 B and reaches nothing: `onetime` (162.3 M/wk) plus `mimic-fn`
(99.7 M/wk) in one function with no dependency. `name`, `length` and `this` are all asserted,
and the arrow-function version of the same wrapper — the one everybody hand-rolls — is one of
the mutations below, red on four cases. `name` is load-bearing here rather than cosmetic: this
package's own breach report names handlers by `fn.name`, so wrapping a handler in `once()`
must not be the reason a hang becomes unattributable.

**R7's file is `ambient.ts`, not `install.ts`**, and the design's own file map is wrong about
it — corrected here rather than in a commit message. The split happened when the drop-in
façades landed: `restore-cursor`'s contract is "write to whichever of stderr and stdout is a
terminal", which is a property of the process and not of a stream a caller passed in, so two
files needed the same guarded global read and the read moved to one place. `shape.test.ts`
asserts the list is exactly `['ambient.ts']` **and** asserts that its own pattern finds the
read in that file — a lock whose pattern matches nothing passes on a package that reads the
process everywhere, and this repository has shipped that defect before.

## What shipped (R8 — the ceiling, and the half of it that is not met — 2026-09-14)

`weight.test.ts`, per entry, reading `dist/` so it measures what is published. The build grew
`strip-comments.mjs` on the way in, the way `roundel` and `flagstaff` already had it:
**46,066 B of emitted JavaScript became 20,417 B**, and what went was doc comments that every
editor reads out of the `.d.ts` files anyway.

| entry | replaces | bytes | budget |
| :-- | :-- | --: | --: |
| `.` | — | 11,644 | 13,000 |
| `./once` | `onetime` + `mimic-fn` (262 M/wk) | 441 | 1,000 |
| `./cursor` | `cli-cursor` (107.6 M/wk) | 666 | 1,500 |
| `./plugin` | — | 10,583 | 12,500 |
| `./restore-cursor` | `restore-cursor` (107.5 M/wk) | 11,159 | 12,500 |
| `./exit-hook` | `exit-hook` (8.8 M/wk) | 11,841 | 13,000 |

**The byte ceiling as written is not met, and the number is here rather than rounded away.**
`exit-hook@5.1.0` — the vendored copy `compat-oracle` grades us against — is **4,458 B in one
file**; `closeout/exit-hook` reaches **11,841 B across five**, because the drop-in shares
`registry.ts`, `deadline.ts` and `report.ts` with the rest of the package. Those three *are*
the phase ordering, the bounded runner and the report that names a hung handler. Deleting them
to win a byte comparison against a package that can do none of it would be optimising the
number at the cost of the thing being measured, so the requirement was restated and the miss
recorded.

**The spawn-delta half holds, measured the same day**: p50 over 21 spawns, importing
`closeout/exit-hook` costs **4.5 ms** over a bare `node` and importing `exit-hook` itself costs
**4.6 ms** (bare node p50 23.2 ms). Startup is where a CLI actually pays, and there the
ceiling is met.

Two claims that are asserted rather than stated: **every entry reaches zero packages**, and
**every published entry declares a budget** — so `closeout/signal-exit` cannot ship without
someone saying what it may weigh.

## Proven red before green — seven mutations, each a plausible wrong implementation

Every behaviour above was reverted in turn and the suite re-run. A count alone would prove
nothing, so each row names what broke:

| Mutation | Result |
| :-- | :-- |
| the crash and `beforeExit` paths removed — the package as it stood yesterday | 3 red, all three new paths |
| `await Promise.allSettled(pending)` without racing the clock — the bound deleted | **9 red**, including the plugin case and every hang cell |
| the breach reported as a count rather than as names (`unfinished: []`) | 4 red, and the four are exactly the naming assertions |
| `attach()` registering plugin handlers unlabelled — the pre-fix line | 1 red: `['acme:never']` became `['(anonymous)']` |
| the exit code read from `proc.exitCode` when leaving rather than captured at the trigger | 1 red: SIGTERM left with 0 because a handler had tidied `exitCode` |
| `once()` as an arrow with no `defineProperty` — how everyone hand-rolls it | 4 red: name, arity, `this`, and the documented-call case |
| the deadline accepted however meaningless — `Infinity` documented as discouraged | 4 red, one per refused value |

The second is the one worth keeping in mind: deleting the bound leaves a suite that still
*passes 97 of 106*, because everything except the hang cells behaves identically. The nine
that fail are the nine that were written for it.

## What shipped (R6's other two clauses, and what is still waiting — 2026-09-14)

`./once` and `./cursor` exist, and subpath isolation is locked the way `roundel` locks it:
each entry declares what it may import (nothing), what it may reach (a denied list), and what
it may weigh. `closeout/cursor` reaches no registry; `closeout/once` reaches nothing at all.

**The root default export is still not `signal-exit`'s**, and that is deliberate rather than
outstanding work: it cannot be *graded* until the four harness blockers below are gone, and
shipping an ungraded drop-in for the package with 198.9 M weekly downloads is the claim this
project refuses to make. All four are edits to `compat-oracle`'s `run.ts` and `vendor.ts`,
which belong to that package's lane and not to this one — this lane may write
`vendor/{signal-exit,exit-hook,restore-cursor}/**`, the baselines and `hosts.ts`, and none of
the four lives there. `hosts.ts` still carries `signal-exit` as `planned` with the blockers
written out, and there is still no baseline fragment for it, which is the honest state.

## What shipped (the re-raise — a signalled process dies of the signal — 2026-09-15)

`leaveAfter` used to end a signal with `proc.exit(128 + n)`, and this document's own comment
defended it: *"Re-raising the signal would be more faithful to POSIX, but it re-enters this
listener; exiting explicitly is what a caller who owns `main` actually wants."* Both clauses
were wrong, and the deciding evidence was the incumbent's source rather than an argument.

**How it surfaced.** Not here. `flagstaff` tried to drop its 124-line copy of
cursor-restore-on-death in favour of `closeout` and could not, because closeout suppressed
the termination flagstaff's own suite asserts. Two defects came out of that attempt and
**neither was visible from inside this package**: `exit-hook` graded 21 / 21 and
`restore-cursor` 6 / 6 throughout, because neither incumbent suite ever kills a process —
`exit-hook`'s two signal cases read the child's *exit code*, and `restore-cursor`'s six let
the child fall off the end of `main`. A suite that only ever reads `$?` cannot tell
`process.exit(130)` from a real SIGINT.

- **The re-entrancy was already solved.** `signal-exit`'s signal path is `this.unload()` —
  remove the handlers — and then `process.kill(process.pid, sig)`. closeout already removed
  its own listener before counting; it had the hard half and stopped one line early. That
  removal is now `standDown()`, named because two callers depend on it meaning one thing.
- **The preference was the incumbent's to state.** `signal-exit` is closeout's declared
  incumbent for this surface (`compat-oracle/src/demand.ts`). "What a caller who owns `main`
  wants" is a claim about a caller, and the caller closeout has — flagstaff — wanted the
  opposite loudly enough to keep its own copy.
- **The guard is what the re-raise must not cost**, and it is a different assertion from the
  three obvious ones. Delete the listener count and the child is still not killed and still
  exits 7, because an unconditional re-raise is caught by the program's *own* handler; what
  changes is that one Ctrl-C is delivered **twice**. `ownHandlerRuns` grades that and nothing
  else does.
- **`SIGNAL_EXIT_CODE` is now the fallback, not the answer.** A runtime that refuses to raise
  a signal at itself (SIGHUP is `ENOSYS` on Windows) leaves with POSIX's number. `signal-exit`
  handles the same case by branching on `process.platform` and substituting SIGINT; R7 says
  this package does not read the process, so it tries the honest thing and takes the refusal
  as the answer.
- **One raise per signal, not one per arrival.** Two Ctrl-Cs in a tick enter the listener
  twice before either has removed it. `registry.run` already made the second shutdown a
  no-op and had nothing to say about the leaving — which did not matter while `exit()` was
  terminal and does now. The `leaving` flag is what the old code got for free.

**`ProcessLike` gained `kill` and `pid`, required.** Optional members would compile, and a
double that omitted them would silently take the exit path — a seam that lets a fake opt out
of the behaviour under test is precisely how this survived two incumbent suites. The three
fakes in this package were updated, and two of them now *assert* the raise rather than
tolerating it.

**SIGHUP: measured, and not a defect here.** `closeout/exit-hook` registers nothing for
SIGHUP, which is faithful: `exit-hook@5.1.0`'s `addHook` registers exactly `beforeExit`,
`SIGINT`, `SIGTERM`, `exit` and `message` (vendored source, lines 121-138), and its suite
grades only SIGINT and SIGTERM. closeout's **own** `onExit` has carried SIGHUP since
`SIGNALS` was widened, and `signal.test.ts` confirms on a real SIGHUP that the cursor comes
back — the `show` count was already 1 on the unfixed code, so the reported consequence
("a cursor hidden by a spinner is not restored when the terminal closes") holds only for the
drop-in, where it is the incumbent's behaviour. Both halves are now pinned by test, so
closing the gap in the façade would fail a case that says why it is open.

**Proven red before green.** `signal.test.ts` spawns real children, kills them, and reads
`error.signal` — `WIFSIGNALED` as the parent sees it. On the unfixed code four cases fail
(`expected null to be 'SIGINT'`, and the same for SIGTERM, SIGHUP, SIGQUIT) while the three
fidelity cases pass. Reverting `install.ts` to its pre-fix state with the new assertions in
place gives **10 red across three files**: those four, the five `matrix.test.ts` signal cells
now asserting `proc.raised`, and the `install.test.ts` re-raise case.

## The surface a consumer gets, derived from the tree (2026-09-15)

R12 and its shipped entry already say everything about the plugin host. What is missing is
the plain list of what the package offers, which today can only be assembled by reading eight
shipped entries in order.

**Derived, not transcribed.** One row per entry in `packages/closeout/package.json`'s
`exports` map; the names are the exported declarations of the source file each subpath's
`dist/` path is built from. Re-derive with `node -p "Object.keys(require('./packages/closeout/package.json').exports)"`
and `grep '^export' packages/closeout/src/<file>.ts`.

| Subpath | What a consumer gets | What it is for |
| :-- | :-- | :-- |
| `closeout` | `install`, `onExit`, `createRegistry`, `once`, `hideCursor`, `showCursor`, `HIDE_CURSOR`, `SHOW_CURSOR`, `assertDeadline`, `DEFAULT_DEADLINE`, `DEFAULT_PHASE`, `PHASES`, `SIGNALS`, `EXIT_PATHS`, `DeadlineError`, `DEADLINE_ERROR_CODE`, `timeoutMessage`, `reportToJson`, `reportToEvent`; types `Closeout`, `Registry`, `RegistryOptions`, `ExitHandler`, `HandlerOptions`, `HandlerSpec`, `ExitInfo`, `ExitPath`, `ExitEvent`, `ExitReport`, `ShutdownReport`, `Phase`, `InstallOptions`, `OutputStream`, `ProcessLike` | register cleanup, bound it, and read what happened |
| `closeout/once` | `once` | the `onetime` + `mimic-fn` contract in one function, `name`/`length`/`this` preserved (R5) |
| `closeout/cursor` | `showCursor`, `hideCursor`, `HIDE_CURSOR`, `SHOW_CURSOR`; `OutputStream` | the escape bytes and the two calls, against a stream the caller passes |
| `closeout/plugin` | `register`, `validate`, `reset`, `registered`, `contributions`, `attach`, `CONTRACT`, `PLUGIN_PHASES`, `PluginError`; `Plugin`, `PluginHandler`, `Contribution`, `HandlerHost`, `PluginErrorCode` | the extension point (R12) |
| `closeout/restore-cursor` | a default export, and nothing else | the drop-in path for `restore-cursor` — the stream is chosen from the process, which is why this is its own entry |
| `closeout/exit-hook` | `asyncExitHook`, `gracefulExit`; `ExitHookCallback`, `AsyncExitHookOptions` | the drop-in path for `exit-hook` |
| `closeout/schema.json` | the family plugin schema, as a file | what a plugin author or an agent validates against |

Three things the table settles that the requirements do not:

- **`onExit(fn, spec?)`'s second argument takes a bare phase as well as an options object.**
  `HandlerSpec = Phase | HandlerOptions`, so `onExit(fn, 'restore')` and
  `onExit(fn, { phase: 'flush', label: 'acme:unlock' })` are both spellings of the same
  thing, and the bare phase is the common case. R1 says only `opts?`.
- **`createRegistry` is public**, so a caller can build a registry of its own and drive it,
  which is what makes `attach()` useful to something that is not the process-wide instance.
- **The `signal-exit` drop-in is not a subpath.** R6 describes the root default export as
  `signal-exit`'s; the root is a named re-export block with no default. `restore-cursor` and
  `exit-hook` each got their own entry; `signal-exit` did not.

**The extension summary, in one paragraph.** One key, `handlers` — an array of
`{ name, phase?, run }`. `name` is required because a plugin's cleanup is the handler least
likely to be a named function and most likely to be the one that hangs, and the whole product
is being able to say "acme:unlock did not return" instead of "a handler did not return".
`phase` is `flush` or `release` and **never `restore`**: closeout's own last phase is where
the terminal goes back, and a plugin admitted to it could land after the hand-back depending
on nothing but which registered first. `run` is the one function this key requires, which is
the documented exception — an exit handler *is* behaviour, and what is data here is the
**ordering**. `register()` validates and throws `PluginError` before touching the registry;
`contributions()` is the static projection of the shutdown sequence, readable without
triggering one; `attach(host)` wires each handler into its phase and returns the function
that takes them all back off. **Registering does not run**: a plugin contributing cleanup
must not decide when shutdown happens.

### What closeout does not do, and why

Beyond "Out of scope" below:

- **It does not let a plugin into the `restore` phase.** See above; it is a refusal at the
  door, because a rule enforced anywhere else is not a "never".
- **It does not accept `Infinity` or `0` as a deadline.** Both are rejected at registration.
  An unbounded deadline is the failure this package exists to remove, and a zero one is a
  shutdown that never runs.
- **It does not run handlers twice.** A second trigger of any kind records its path in the
  report and runs nothing.
- **It does not end a process it did not start, and does not supervise children.** That is
  `bellpull`, one layer over, and the edge between them is a structural parameter rather than
  a dependency.

## Where this document and the code disagree (2026-09-15)

Recorded rather than tidied away. This design already reconciles more of its own drift than
any other in the repo — R7's file, R8's ceiling and R1-vs-R2 are all corrected in shipped
entries below rather than edited away above. What remains:

- **R6's root default export does not exist.** `src/index.ts` has no default export, so
  `overrides: { "signal-exit": "npm:closeout@^1" }` does not resolve against this package as
  written. The two drop-ins that did ship, `./restore-cursor` and `./exit-hook`, are
  subpaths — and R6 names neither of them, listing only `./cursor` and `./once` as carrying
  "the rest".
- **R7 still names `install.ts` as the one process-touching file**, in the requirement text.
  The shipped entry below is explicit that the file is `ambient.ts` and that this design's
  own map was wrong about it. The correction is recorded; the requirement is not.
- **The `## Design` file map lists `runtime.ts`, which this package does not have**, and
  omits five files that it does: `ambient.ts`, `exit-hook.ts`, `plugin.ts`,
  `restore-cursor.ts` and `schema.json`.
- **R1's `opts?` understates the argument.** See the table above: a bare `Phase` string is
  accepted and is the common spelling.
- **The shared `schema.json` does not describe `handlers`.** It is flagstaff's file
  byte-identical (PLAN 1.1) and its properties are `name`, `contract`, `tokens`, `glyphs`,
  `spinners`, `borders`, `components`, `capabilities`. `handlers` validates today only
  because the root sets `additionalProperties: true`, so `closeout/schema.json` — which this
  package publishes as the thing a plugin author writes against — says nothing about the one
  key this package hosts, and its `title` announces it as flagstaff's file. The same gap
  exists for `caique`'s `widgets` and `bellpull`'s `resolvers`; one edit to flagstaff's source
  copy closes all three. **Resolved 2026-09-23:** the family schema now describes `resolvers`, `widgets`, `handlers`, `sources`, `commands`, `hooks` and `enforce`. flagstaff, the one host that validated against the whole file, validates against its own slice (`plugin.schema.json`), so no host enforces another's keys; `plugin-schema-lock.test.ts` has no allow-list left, and `plugin-schema-agreement.test.ts` holds each definition to its host's verdict.
- **R12 records that `plugin-contract` R7's exemption list owes `handlers.run` an entry.**
  That edit belongs to the `plugin-contract` lane and, as of this reading, has not been made.
  It is restated here so that it is not lost between two designs.

## Rejected alternatives

- **Adding SIGHUP to `closeout/exit-hook`, to close the gap flagstaff found.** It reads like
  a strict improvement and it is a behaviour change to every program that swapped the
  incumbent out: a closing terminal would start running hooks that never ran before, and the
  program's SIGHUP disposition would change from "die now" to "die after the hooks". A
  drop-in that handles a signal the incumbent leaves alone is not a drop-in. The gap is
  pinned by a test that says why it is open, and closeout's own `onExit` is the answer.
- **Filtering the signal list by `os.constants.signals` before raising, as `flagstaff` does.**
  Correct there and a platform read here, which R7 spends the whole package avoiding. A `try`
  around the raise gets the same answer from the runtime itself, and gets it for signals no
  constants table would have predicted.
- **Letting the raise be the only exit.** It is unreachable-by-design on every healthy path,
  which is exactly why the line after it matters: a signal inherited as `SIG_IGN` or a
  runtime whose `kill` is a no-op would leave a process that has finished its shutdown and
  will not go — the one failure this package is named for, reintroduced by the fix for a
  different one.
- **`process.on('exit')` and trusting it.** It does not fire on signals, cannot await
  anything, and is exactly why six packages exist. It is a component here, not the answer.
- **An infinite deadline, or `deadline: 0` to opt out.** Both reintroduce the failure the
  package exists to remove, so both are rejected at registration rather than documented as
  discouraged. A caller who genuinely wants to wait forever wants a different package.
- **Leaving terminal restore in `caique`.** It is needed by `flagstaff`'s frame loop too,
  and two copies of raw-mode handling is how the incumbents ended up with `cli-cursor` and
  `restore-cursor` as separate packages disagreeing about `onetime`.
- **Dropping `once`/`onetime` to keep the layer narrow.** Considered seriously — it is not
  lifecycle. Kept because `restore-cursor` → `onetime` → `mimic-fn` is *inside* this layer's
  incumbent tree, so the override recipe is incomplete without it, and 262 M/wk of the
  layer's 685 M/wk is that chain.
- **A `SIGKILL` claim.** It cannot be caught. The README says so plainly rather than leaving
  a reader to infer a guarantee we cannot make.
- **Ordering plugin handlers by registration order, as every incumbent does.** It reads as
  the simpler option and it is not an ordering at all: a plugin's registration moment is
  decided by whoever imported it, and the restore's by whichever renderer hid the cursor
  first. Both are import order wearing a lanyard, and the failure they produce — cleanup that
  runs after the terminal is already back — is silent, intermittent, and reproduces only on
  the machine where the imports happen to be arranged badly.
- **A numeric `order` on each handler instead of named phases.** More expressive, and it
  makes every plugin author invent a number relative to numbers they cannot see. Three names
  with stated meanings is a vocabulary two plugin authors can agree on without talking; `-100`
  is a bid in an auction nobody is running.
- **Letting a plugin use the `restore` phase.** The generous reading of R5a, and it spends
  the requirement: within one phase, order is registration order, so a plugin admitted to
  `restore` lands before or after the cursor depending on which registered first — exactly the
  coincidence phases replace. A plugin with terminal state of its own puts its undo in
  `release`, which is where the guarantee holds.
- **One deadline per phase.** Tidier to describe, and three phases then add up to three
  deadlines — which gives back the unbounded shutdown the number exists to bound.

## Out of scope

- Process supervision, restarts, or daemonisation. Ending cleanly is the layer; staying
  alive is not.
- Spawning or killing children — that is `bellpull`, and the two meet only where a
  registered handler kills a child the caller passed in.
- Crash reporting, stack symbolication, or error serialisation beyond the `error` field in
  the report record.
- Cross-thread guarantees, until the open question in the intent is answered. Until then the
  README documents the contract as per-thread rather than implying more.
