# Intent — bellpull: run another program and get back a result you can read, not a string and a thrown error

> Stage 1 artifact. Child of [`cli-foundation-stack`](../cli-foundation-stack/intent.md),
> requirements Y3, Y5, Y6, Y7, Y8, Y10, Y12. **The weakest of the four, on purpose**: a
> zero-dependency rival already holds the weight pitch, so this intent carries a kill gate
> rather than a launch date.

**Status:** shipped · **Opened:** 2026-09-09 · **Owner:** @ofri-peretz · **Name published:** `bellpull@0.0.1`, 2026-09-09 · **Shipped:** 2026-10-27 on the merge of `feat/bellpull-dogfood-spawn`, verified against `main` at `4c336da3` and the published `bellpull@1.0.10` — all five criteria held; criterion 4 moved internal tooling only, nothing to publish — see [§ Shipped 2026-10-27](#shipped-2026-10-27). Approved 2026-09-23 under the owner's delegation (D-129)

> **Shipped 2026-10-27. All five criteria hold.** The umbrella sweep of 2026-10-26 left one open:
> the repo's own tools spawning through bellpull. `compat-oracle` and `benchmarks/` now do, and
> `scripts/dogfood-spawn-lock.test.ts` keeps them there
> ([D-20261027-bellpull-dogfood-spawn](../../decisions/D-20261027-bellpull-dogfood-spawn.md)). The
> kill gate was read on 2026-10-26 and the verdict was build
> ([D-20261026-bellpull-kill-gate-reading](../../decisions/D-20261026-bellpull-kill-gate-reading.md)).

---

## Shipped 2026-10-27

Read on `main` at `4c336da3` plus this branch, and against the published tarball `bellpull@1.0.10`
(`npm view bellpull version` reads 1.0.10, the same as the manifest). bellpull's own source did
not change, so nothing is released: criterion 4 is about internal tooling, and both consumers are
private.

| # | criterion | held by | proven red by |
| :-- | :-- | :-- | :-- |
| 1 | the kill gate cleared, numbers recorded on the day | [D-20261026-bellpull-kill-gate-reading](../../decisions/D-20261026-bellpull-kill-gate-reading.md): tinyexec 1.3.1, 106,919,562 downloads in the week to 2026-10-22, zero dependencies, no exported resolver or outcome. Verdict: build | the sweep's reading itself: before it, D-048 had the verdict and no numbers |
| 2 | `execa`, `cross-spawn` and `which` suites graded, three rates published and ratcheting, `--control` first | `packages/compat-oracle/baseline/`: `cross-spawn.json` 68 / 68, `which.json` 5 / 5, `execa.json` 0 / 1,360 with `"ceiling": true` (D-160). `/docs/compatibility` carries all three rows and their controls, and `compat.yml` ratchets them | the oracle's own ratchet, which fails a row that falls |
| 3 | benchmark rows at or under `tinyexec` on bytes and spawn delta | B4 `bellpull ÷ tinyexec` 0.986 (claim `lighter-than-tinyexec`) and B5 0.986 spawn time, each gated at 1 (`benchmarks/results/cli-benchmarks/2026-10-26-f6919e9-ci.json`). Both rows are on `/docs/benchmarks` | `runtime.test.ts` › "bellpull R8: spawn time at or under tinyexec" (1.01 exits non-zero) |
| 4 | `compat-oracle` and `cli-benchmarks` spawning through it, their suites unchanged | every spawn in `packages/compat-oracle/src` and `benchmarks/` goes through `bellpull/cross-spawn`, by way of `compat-oracle/src/spawn.ts` and `benchmarks/spawn.ts`. `scripts/dogfood-spawn-lock.test.ts` › "no module imports node:child_process". `inline-implementation-lock`'s `KNOWN` loses `run.ts`, `vendor.ts` and `upstream.ts`, and its ceiling falls from 18 to 15. Both suites pass unchanged: compat-oracle 862 tests at 100 % coverage, benchmarks 437, and `node packages/compat-oracle/dist/bin.js` on darwin reads ▲ 0 against the baseline on every host but the two whose suites register fewer cases there (cosmiconfig and signal-exit, the platform's own count). Every suite's pins installed through bellpull's `npm`. `upstream.ts`'s hand-written `npm.cmd` + `shell: true` (#1180) is gone. The three `suiteDeps` end-to-end suites (tsd, twist, uvu), skipped on Windows because a bare `npm` could not start there, now run on the `windows-latest` cell | the lock on `origin/main`: 15 files listed (`run.ts`, `vendor.ts`, `upstream.ts`, `__fixtures__/scratch-dir.ts`, and eleven under `benchmarks/`) |
| 5 | one published example of the result's three projections from one value (Y5) | `bellpull.interlace.tools/docs/recipes/agent-output` (HTTP 200 on 2026-10-27), run byte for byte by `apps/docs-bellpull/tests/examples.test.ts`; `packages/bellpull/src/matrix.test.ts` › "one result, three renderings (R5, Y5)" | the examples test, which runs the page's code and compares its output |

**Not a criterion, and still open.** The roadmap's Quint column marks the deadline's kill ladder
(SIGTERM, then SIGKILL) as behaviour that needs a model, and none exists. It is queued in batch 15
of `.sdlc/research/roadmap-to-shipped-2026-10.md`, as `mcp-current`'s in-flight model was queued
after that intent shipped. The ladder is held today by `packages/bellpull/src/matrix.test.ts` ›
"ignores SIGTERM: the parent still settles, timedOut is true, and the partial output survives".

## Umbrella sweep 2026-10-26

Read on `main` at `3d079b15` and against the published tarball `bellpull@1.0.10` (`npm view
bellpull version` reads 1.0.10, the same as the manifest). bellpull has no child intents. Its
criteria are held by its own requirements (`spec.md` § Status, 12 of 12 built).

| # | criterion | held by | state |
| :-- | :-- | :-- | :-- |
| 1 | the kill gate cleared, numbers recorded on the day | D-20261026-bellpull-kill-gate-reading: tinyexec 1.3.1 (2026-09-03), 106,919,562 downloads in the week to 2026-10-22, zero dependencies. It resolves a bare name and augments `PATH` inside its own spawn, but exports no resolver and no outcome, and replaces neither `cross-spawn` nor `which`. Verdict: build. The intent's "neither does executable resolution" is restated there. D-048 (2026-09-20) had the verdict without the numbers | held |
| 2 | `execa`, `cross-spawn` and `which` suites graded, three rates published and ratcheting, `--control` first | `packages/compat-oracle/baseline/`: `cross-spawn.json` 68 / 68, `which.json` 5 / 5, `execa.json` 0 / 1,360 with `"ceiling": true` (a published partial number, not a drop-in, D-160). All three rows are on `/docs/compatibility` with their control columns (1,360 / 1,360 for execa). compat.yml ratchets them | held |
| 3 | benchmark rows at or under `tinyexec` on bytes and spawn delta | B4 `bellpull ÷ tinyexec` 0.986 (claim `lighter-than-tinyexec`), B5 `bellpull ÷ tinyexec` 0.986 spawn time (D-20260930-bellpull-spawn-vs-tinyexec reads "spawn delta" as spawning, the thing this package does), each gated at 1 (CI `2026-10-26-f6919e9-ci.json`). Both rows are on `/docs/benchmarks` (0.986 and 0.987) | held |
| 4 | `compat-oracle` and `cli-benchmarks` spawning through it, their suites unchanged | **not met.** `packages/compat-oracle/src/run.ts`, `vendor.ts` and `upstream.ts` import `node:child_process`. In `benchmarks/`, only `axes/weight.ts` spawns through `bellpull/cross-spawn`. `floor-tools.ts`, `machine.ts`, `axes/scale.ts` and the agent axis use `node:child_process` directly | **OPEN** |
| 5 | one published example of the result's three projections from one value (Y5) | `bellpull.interlace.tools/docs/recipes/agent-output` (live, HTTP 200 on 2026-10-26), run byte for byte by `apps/docs-bellpull/tests/examples.test.ts` › "`%s` prints what the page shows"; `packages/bellpull/src/matrix.test.ts` › "one result, three renderings (R5, Y5)" | held |

**What closes it.** One internal build PR moves the spawn sites of `compat-oracle` (`run.ts`,
`vendor.ts`, `upstream.ts`) and `benchmarks/` onto `bellpull` (`run`) or `bellpull/cross-spawn`,
with both suites passing unchanged. Neither package publishes, so no release is needed, and
bellpull is stamped `shipped` in that PR.

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

- **What is still open is resolution and shape.** *(Restated 2026-10-26 by
  [D-20261026-bellpull-kill-gate-reading](../../decisions/D-20261026-bellpull-kill-gate-reading.md):
  tinyexec 1.3.1 resolves a bare name and augments `PATH` inside its own spawn. It returns
  neither as an answer and ships no `which`. The sentence below is kept as written.)* Neither `tinyexec` nor `nano-spawn` does
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

- **Streaming.** **Decided 2026-09-20 → D-013.** `execa`'s suite covers streams heavily; a result-shaped API and a streaming
  API are different products. Whether streaming is a subpath, a callback on `run`, or out of
  scope decides how much of that suite can pass at all.
- **How much of `execa`'s surface is worth reproducing?** **Decided 2026-09-20 → D-014.** It is by far the largest
  compatibility surface in the family, and its template-literal API (`` $`cmd` ``) is a
  different shape from `run`.
- **Does `open` (130 M/wk, 6 deps) fold in here?** **Decided 2026-09-20 → D-015.** It spawns `xdg-open` / `start` / `open` —
  structurally this layer wearing a different hat. It would add a platform-detection surface
  this package otherwise does not have.
- **Is `duration` measurable honestly?** **Decided 2026-09-20 → D-016.** Wall-clock from spawn to close includes Node's own
  scheduling; claiming it as the child's cost would be a number we cannot defend.
