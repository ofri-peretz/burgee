# Intent — closeout: handlers that run exactly once on every exit path, with a deadline, so a process always ends and a terminal is never left broken

> Stage 1 artifact. Child of [`cli-foundation-stack`](../cli-foundation-stack/intent.md),
> requirements Y3, Y5, Y6, Y7, Y8, Y10, Y12. **A standalone product**: its competitors are
> `signal-exit` and `exit-hook`, and it is useful with nothing else installed.

**Status:** draft · **Opened:** 2026-09-09 · **Owner:** @ofri-peretz · **Name published:** `closeout@0.0.1`, 2026-09-09

---

## What is wanted

To *close out* is to settle and finish — an account, a position, a shift — with nothing left
open. That is the guarantee: whatever ends the process, the cleanup runs, once, within a
bounded time, and the terminal is handed back the way it was found.

| Export | Gives you | Replaces |
| :-- | :-- | :-- |
| `onExit(fn, opts)` | a handler that runs **exactly once** on normal exit, on any signal, and on an uncaught throw | `signal-exit`, `exit-hook` |
| `once(fn)` | a function that runs once and returns its first result thereafter | `onetime`, `mimic-fn` |
| `hideCursor()` / `showCursor()` / `restore()` | terminal state put back — cursor, raw mode, alternate screen | `cli-cursor`, `restore-cursor` |
| the deadline | cleanup bounded by a timeout; on breach the process exits anyway and **says which handler hung** | *nothing in the ecosystem* |

Six incumbents, **685 M weekly downloads**, and none of them can promise the last row.

## Why now

- **`signal-exit` is the staleness record of everything measured in this research:
  198.9 M downloads a week, last published 2023-07-29** — and it sits inside npm's own
  dependency tree. Three years untouched at two hundred million installs a week.
- **`cli-cursor`, `restore-cursor` and `mimic-fn` are all over a year stale** (2024-07-26,
  2024-07-26, 2023-11-05). `restore-cursor` depends on `onetime` which depends on `mimic-fn`:
  three packages, 370 M/wk between them, to show a cursor again.
- **A hung cleanup handler is the agent-native failure mode.** `caique/intent.md` already
  quotes clack #533 — *"The CLI usually hangs forever and just fails"* — about prompts. The
  same shape kills a shutdown: an agent with no human on deck waits on a process that will
  never end. `signal-exit` has no deadline and cannot grow one without changing its
  contract; a bounded shutdown is a **design decision at the bottom of the stack**, not an
  option a caller can add on top.
- **`caique` promises this today and has nowhere to put it.** Its design already says
  *"SIGINT during a prompt runs the layer's E5 handler, which restores the terminal (raw
  mode off, cursor shown) first"*. That guarantee **is** this package. Building it as a
  named product rather than as prompt internals follows rule 8, and it is written either way.
- **This is the smallest of the four layers and the one with the sharpest single claim.**
  686 M/wk and one sentence no incumbent can say.

## Affected users and systems

- `packages/closeout` gains a real implementation, its own README, docs section and
  benchmark page against `signal-exit` and `exit-hook` (Y12).
- `caique` deletes its own signal handling and takes `closeout` as a same-repo dependency;
  its cancellation and terminal-restore tests must pass unchanged.
- `flagstaff` uses it for the frame loop's teardown, so a spinner cannot leave a hidden
  cursor behind when the process dies mid-frame.
- `burgee` gains nothing and imports nothing (Y1). The engine's E5 exit contract keeps its
  own implementation; the two share a test-vector file.
- `compat-oracle` vendors `signal-exit` and `exit-hook`. Two new scoreboard rows.
- `cli-benchmarks` gains a **non-hanging shutdown matrix** — every signal × every exit path
  × handler-that-hangs — which is a correctness table, not a speed row.

## Constraints

1. **Exactly once is the contract, and it is testable.** Not "usually once": the same
   handler must not run twice when a signal arrives during a normal exit, when two signals
   arrive, or when a handler itself throws. Every path in the matrix, asserted.
2. **The deadline is finite by default (Y10).** A caller may raise it; a caller may not make
   it infinite. On breach the process exits with the original code and the report names the
   handler that did not return — a hang becomes a diagnosable event instead of silence.
3. **Terminal restore is unconditional and last.** Raw mode off, cursor shown, alternate
   screen left, even when a handler threw, even on the deadline path.
4. **Default export matches `signal-exit`'s exactly** (Y3), because
   `overrides: { "signal-exit": "npm:closeout@^1" }` is the distribution mechanism, and
   `signal-exit` sits inside npm's own tree — the highest-value and highest-risk override in
   the family. Its pass rate gates the recipe absolutely (Y7).
5. Zero external dependencies, ESM with a `default` condition, Node ≥ 24 (U6, K2).
6. **Nothing reads `process.*` directly** except the single, documented, injected seam that
   installs the handlers — the one place in the family where a `Runtime` argument is a
   process reference by necessity. It is named, isolated in one file, and the env grep
   exempts that file and nothing else (Y9).

## Success criteria

- `signal-exit` and `exit-hook` suites vendored and graded; two pass rates published and
  ratcheting; `--control` proving each gate against the real package first.
- The shutdown matrix green: **no cell hangs**, including the cells where a registered
  handler deliberately never returns.
- Benchmark rows at or under `exit-hook` (0 deps, the lightest in the layer) on bytes and
  spawn delta.
- `caique`'s own signal handling deleted, its suite unchanged.
- A published `overrides` recipe for `signal-exit`, behind its pass rate, with CI refusing
  the page if the rate drops.

## Open questions

- **What is the default deadline?** It must be long enough that an honest flush completes
  and short enough that an agent is not stuck. There is no incumbent to copy, so the number
  has to be argued from measurement of real cleanup work.
- **Can `exitCode` be preserved on every path?** A handler that runs after `process.exit(3)`
  must not silently change the code to 0. `signal-exit`'s suite may or may not assert this;
  if it does not, it becomes one of our own conformance cases.
- **Does `once`/`onetime` belong here at all?** 162 M/wk and it is genuinely used outside
  lifecycle. Keeping it makes the override recipe richer; it also widens the layer past its
  name. Deferred to `design.md`.
- **Worker threads and `beforeExit`.** Whether the exactly-once guarantee extends across
  worker boundaries, or is documented as per-thread. Being wrong here is worse than being
  narrow.
