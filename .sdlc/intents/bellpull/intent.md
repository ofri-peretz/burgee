# Intent — bellpull: run another program and get back a result you can read, not a string and a thrown error

> Stage 1 artifact. Child of [`cli-foundation-stack`](../cli-foundation-stack/intent.md),
> requirements Y3, Y5, Y6, Y7, Y8, Y10, Y12. **The weakest of the four, on purpose**: a
> zero-dependency rival already holds the weight pitch, so this intent carries a kill gate
> rather than a launch date.

**Status:** draft · **Opened:** 2026-09-09 · **Owner:** @ofri-peretz · **Name published:** `bellpull@0.0.1`, 2026-09-09

---

## What is wanted

A bellpull is the cord you pull in one room to ring a bell in another, and summon someone to
do something. Request work at a distance; the work happens elsewhere; someone comes back to
you. That last clause is the package.

| Export | Gives you | Replaces |
| :-- | :-- | :-- |
| `run(cmd, args, opts)` | a **result**: `{ ok, code, signal, stdout, stderr, duration, command }` — never a throw for a non-zero exit | `execa`, `tinyexec`, `nano-spawn` |
| `which(cmd, opts)` | the resolved executable **and which `PATH` entry it came from** | `which`, `isexe`, `path-key` |
| `runPath(opts)` | `PATH` augmented with local `node_modules/.bin`, up the tree | `npm-run-path` |
| the projection | that one result rendered as human text, a `--json` envelope, or an agent event | *nothing in the ecosystem* |

Fifteen incumbents, **2.29 B weekly downloads** — the second-largest layer in the family,
and the one where our differentiator is narrowest.

## Why now

**Record this honestly first: the weight pitch in this layer is already taken.**
`tinyexec` has **zero dependencies, 119.5 M downloads a week, and was published
2026-09-03**. `nano-spawn` is the same idea from `execa`'s own author. *"execa pulls 16
packages, we pull none"* is not a differentiator here — it is a claim a competitor already
makes, with traction. Every other reason below is conditional on that.

- **What is still open is resolution and shape.** Neither `tinyexec` nor `nano-spawn` does
  executable resolution (`which`, 290 M/wk) or `PATH` augmentation (`npm-run-path`,
  104 M/wk), and neither returns a **result with a static projection** (rule 6) or a
  per-caller conformance shape (rule 5).
- **The result shape is the agent-native claim.** An agent invoking a subprocess wants
  `{ ok, code, signal, stdout, stderr, duration }` it can branch on — renderable as human
  text, as `--json`, or as an event. `execa` returns strings and **throws on a non-zero
  exit**, which turns an expected outcome into control flow and is why every wrapper around
  it re-implements the same try/catch.
- **`execa` is the thesis in one manifest**: `engines: ">=22"`, **12 direct dependencies,
  16 packages, 1.42 MB**. A modern engine floor carrying a legacy tree.
- **Nine of the fifteen incumbents have not published in a year**, several far longer:
  `path-key` 2021-04-09, `shebang-regex` 2021-08-13, `shebang-command` 2019-09-06,
  `merge-stream` 2019-05-23, `get-stream` 2024-03-16, `is-stream` 2024-02-19,
  `strip-final-newline` 2023-12-13.
- **We have an internal user, and it is honest to name it as dogfooding rather than as
  demand.** `compat-oracle` and `cli-benchmarks` both spawn — B2 takes ≥30 spawns per row.
  That makes this package testable against real use before it is published; it does not make
  it wanted by anyone else.

## Affected users and systems

- `packages/bellpull` gains a real implementation; its README competes against `execa` and
  `tinyexec` on **shape and resolution**, explicitly not on weight (Y12).
- `compat-oracle` and `cli-benchmarks` switch their own spawning to it — the dogfooding
  loop, and the only consumer this package has inside the repo.
- `compat-oracle` vendors `execa`, `cross-spawn` and `which`. Three new scoreboard rows.
- `burgee` gains nothing and imports nothing (Y1).
- If the gate below fires, **`packages/bellpull` is deprecated on npm with a README pointing
  at `tinyexec`**, and this intent moves to `dropped`. That is a real outcome.

## Constraints

1. **A non-zero exit is a result, never a throw.** `ok: false` and a code. Throwing is
   reserved for the cases where no process ran: the executable was not found, spawning
   failed, the deadline fired.
2. **The deadline is finite by default (Y10).** A subprocess that never returns is the same
   agent-stranding failure `closeout` bounds one layer over; on breach the child is killed,
   the result says `timedOut`, and partial output is preserved rather than discarded.
3. **Resolution reports its source (Y6).** `which` returns the path *and* the `PATH` entry
   it matched, because "which binary actually ran" is unanswerable in CI today and is half
   the reason a build differs between two machines.
4. **Windows parity is graded, not claimed.** `cross-spawn`'s suite is the arbiter for
   argument escaping, shebang handling and `.cmd` resolution. If its suite passes, the quirk
   is covered; if it does not, that is a scoreboard row.
5. **Default export matches `execa`'s** for the override recipe (Y3), with `./which` and
   `./run-path` as separately graded subpaths.
6. Zero external dependencies, ESM with a `default` condition, Node ≥ 24 (U6, K2). Nothing
   reads `process.*` — `env` and `cwd` are arguments (Y9).
7. **No shell by default.** `shell: true` is opt-in and documented as the injection surface
   it is.

## Success criteria

- The gate below cleared, with its numbers recorded on the day it was evaluated.
- `execa`, `cross-spawn` and `which` suites vendored and graded; three pass rates published
  and ratcheting; `--control` first.
- Benchmark rows at or under `tinyexec` (0 deps, the lightest in the layer) on bytes and
  spawn delta — **the honest bar is the rival, not `execa`.**
- `compat-oracle` and `cli-benchmarks` spawning through it, their suites unchanged.
- One published example of the result's three projections from one value (Y5).

## The kill gate

Evaluated **before F4 opens**, not at the end. Re-measure `tinyexec`'s weekly downloads and
last publish date, and read its current API.

| Finding | Decision |
| :-- | :-- |
| `tinyexec` still does no executable resolution and returns no structured result | **build**, on resolution + shape, never on weight |
| `tinyexec` has absorbed resolution or a result shape | **drop**: deprecate `bellpull` with a README pointing at it, move this intent to `dropped` |
| `tinyexec` is abandoned (no publish in 12 months) and `execa`'s tree is unchanged | **build**, and the weight pitch is available again — but say so with the date, not as a permanent claim |

Being the third-best answer in a layer is worse than not answering. This table is why this
package is fourth and not first.

## Open questions

- **Streaming.** `execa`'s suite covers streams heavily; a result-shaped API and a streaming
  API are different products. Whether streaming is a subpath, a callback on `run`, or out of
  scope decides how much of that suite can pass at all.
- **How much of `execa`'s surface is worth reproducing?** It is by far the largest
  compatibility surface in the family, and its template-literal API (`` $`cmd` ``) is a
  different shape from `run`.
- **Does `open` (130 M/wk, 6 deps) fold in here?** It spawns `xdg-open` / `start` / `open` —
  structurally this layer wearing a different hat. It would add a platform-detection surface
  this package otherwise does not have.
- **Is `duration` measurable honestly?** Wall-clock from spawn to close includes Node's own
  scheduling; claiming it as the child's cost would be a number we cannot defend.
