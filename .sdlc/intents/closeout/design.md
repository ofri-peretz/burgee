# Design — closeout

Intent: [`intent.md`](./intent.md). Umbrella:
[`cli-foundation-stack`](../cli-foundation-stack/design.md). **Status:** draft.

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
  lightest in the layer) — not under `signal-exit`, which would be a free pass.
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

Not yet: the `signal-exit` and `exit-hook` suites (step 2.2–2.13), and the deadline report
naming the handler that hung (R3) — `PluginHandler.name` exists for it and nothing reads it.

## Rejected alternatives

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
