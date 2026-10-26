# Intent — closeout: handlers that run exactly once on every exit path, with a deadline, so a process always ends and a terminal is never left broken

> Stage 1 artifact. Child of [`cli-foundation-stack`](../cli-foundation-stack/intent.md),
> requirements Y3, Y5, Y6, Y7, Y8, Y10, Y12. **A standalone product**: its competitors are
> `signal-exit` and `exit-hook`, and it is useful with nothing else installed.

**Status:** approved (2026-09-23, under the owner's delegation, D-129) · **Opened:** 2026-09-09 · **Owner:** @ofri-peretz · **Name published:** `closeout@0.0.1`, 2026-09-09

> **Umbrella sweep 2026-10-26: four of five criteria held on `main` and in `closeout@1.1.8`;
> criterion 3 is half open.** Its bytes half is held by the shipped child
> `closeout-at-incumbent-weight`, but the public benchmarks page still prints the reading from
> before that child. Its spawn half has no row. See
> [§ Umbrella sweep 2026-10-26](#umbrella-sweep-2026-10-26).

---

## Umbrella sweep 2026-10-26

Read on `main` at `3d079b15` and against the published tarball `closeout@1.1.8` (`npm view
closeout version` reads 1.1.8, the same as the manifest). Its one child intent is
[`closeout-at-incumbent-weight`](../closeout-at-incumbent-weight/intent.md), shipped in closeout
1.1.7 (Version PR #1199).

| # | criterion | held by | state |
| :-- | :-- | :-- | :-- |
| 1 | `signal-exit` and `exit-hook` suites graded, two rates published and ratcheting, `--control` first | `packages/compat-oracle/baseline/signal-exit.json` 134 / 135 (the one failure is signal-exit 4.1.0's own, and its control fails it too) and `exit-hook.json` 21 / 21. Both rows are on `/docs/compatibility`. compat.yml's "Grade burgee (fails below baseline)", its `--control` step and the page check hold the ratchet | held |
| 2 | the shutdown matrix green, no cell hangs, including a handler that never returns | `packages/closeout/src/matrix.test.ts` › "every signal runs the handlers exactly once and is re-raised at the process" and the describe "a handler that never returns" (signal, uncaught exception, unhandled rejection, `beforeExit`, exit path) | held |
| 3 | benchmark rows at or under `exit-hook` on bytes and spawn delta | **bytes:** held by the child. B4 `closeout/exit-hook ÷ exit-hook` reads **0.96** and `closeout/signal-exit ÷ signal-exit` **0.93**, each gated at 1 (CI, `benchmarks/results/cli-benchmarks/2026-10-26-f6919e9-ci.json`). The code is in `closeout@1.1.8`. **But `/docs/benchmarks` is generated from the published measurement of 2026-10-19 (`66e4611`), before #1198, and still prints 2.929 and 1.272 "not met".** **Spawn delta:** one hand reading on 2026-09-14 (4.5 ms against 4.6 ms) and no row. D-20261026-library-spawn-delta-rows | bytes held on `main`, stale on the page · **spawn delta OPEN** |
| 4 | `caique`'s own signal handling deleted, its suite unchanged | `packages/caique/src/keys.test.ts` › "registers on closeout’s exit hook when no registry is given"; `packages/burgee/src/process-reference-lock.test.ts` › "no layer source reads process.* outside the three files that own it" (also `cli-foundation-stack` S4) | held |
| 5 | a published `overrides` recipe for `signal-exit`, behind its pass rate, CI refusing the page if it drops | **restated by D-133** (2026-09-23): an override can aim only at a package root, so the drop-in is the subpath `closeout/signal-exit`, swapped by import. `burgee migrate` rewrites `signal-exit` to it (`packages/burgee/src/migrate.test.ts`; the map is in `burgee@1.7.2`'s `dist/migrate.js`). The closeout README says "The swap is an import change, not an `overrides` entry", beside the 134 / 135 row. compat.yml refuses a drop | held as restated |

**What closes it.** Two things, neither of which needs a release:

1. a `perf`-axis variant pair, `closeout/exit-hook` against `exit-hook` 5.1.0, gated as a paired
   start-up difference (D-20261026-library-spawn-delta-rows);
2. a new published measurement, `benchmarks/results/cli-benchmarks/<date>.json` written by a
   person per `benchmarks/published.ts`, then `npm run bench:page`, so that `/docs/benchmarks`
   prints the 0.96 / 0.93 that CI reads.

closeout is stamped `shipped` when both are on `main`.

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

- **What is the default deadline?** **Decided 2026-09-20 → D-017.** It must be long enough that an honest flush completes
  and short enough that an agent is not stuck. There is no incumbent to copy, so the number
  has to be argued from measurement of real cleanup work.
- **Can `exitCode` be preserved on every path?** **Decided 2026-09-20 → D-018.** A handler that runs after `process.exit(3)`
  must not silently change the code to 0. `signal-exit`'s suite may or may not assert this;
  if it does not, it becomes one of our own conformance cases.
- **Does `once`/`onetime` belong here at all?** **Decided 2026-09-20 → D-019.** 162 M/wk and it is genuinely used outside
  lifecycle. Keeping it makes the override recipe richer; it also widens the layer past its
  name. Deferred to `spec.md`.
- **Worker threads and `beforeExit`.** **Decided 2026-09-20 → D-020.** Whether the exactly-once guarantee extends across
  worker boundaries, or is documented as per-thread. Being wrong here is worse than being
  narrow.
- **What does `add()` mean while a shutdown is running?** **Decided 2026-10-11 → D-20261011-closeout-late-add** (owner; default stands). Found by
  the Quint model (`registry.qnt`, `lateAddRuns`). Today a handler added mid-run runs if its
  phase has not been reached and is silently dropped if it has: counted in `size`, never
  invoked, absent from the report. Throwing, invoking it at once, or naming it in
  `unfinished` are the three honest answers; silence is the one that is not. `models.yml`
  pins the current behaviour as an expected violation until this is decided.
