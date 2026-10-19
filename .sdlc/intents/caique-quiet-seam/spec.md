# Design — `--quiet` reaches caique's decoration

Intent: [`intent.md`](./intent.md). **Status:** approved.

**Accepted by the owner, 2026-10-12, by instruction: create and execute.** The instruction and the
evidence are recorded in [`next-wave-3-2026-10.md`](../../research/next-wave-3-2026-10.md).
**The decision `B-20261011-caique-quiet` asks for is taken here, as that gap recommends.** The PR
that lands R2 closes the gap file.

---

## Requirements

- **R1 — The seam.** `CommonOptions` in the clack port gains `runtime?: Runtime` (roundel's
  type). Where a function reads `processRuntime()` today, it reads `opts.runtime ??
  processRuntime()`.
- **R2 — Quiet draws nothing.** With `runtime.quiet === true`, every decorating writer the
  clack port exports — `spinner`, `tasks`, `intro`, `outro`, `note` and
  `log.{info,step,success,message,warn}` — writes nothing. Their lifecycle methods (`start`,
  `stop`, `message`) still run and resolve. `log.error` writes. *(Restated 2026-10-18 to what
  shipped: the first text also named `progress` and `taskLog`, which the port does not export,
  per D-152. When either is ported it falls under this row, and `clack-quiet.test.ts` gains it.)*
- **R3 — Prompts are unchanged.** `text`, `select`, `confirm` and the rest ignore `quiet`. A
  non-TTY prompt is still the usage error naming the flag.
- **R4 — burgee's docs show the call.** The `--quiet` section of the burgee README shows
  `spinner({ runtime: ctx.runtime })`. The README sync and the weight band are re-run in the same
  PR (`npm run weight:converge`).

## Design

One helper, `quietOf(opts)`, in `clack-output.ts`, used at each draw site. The spinner keeps its
timer off entirely under quiet, as flagstaff's `hoist` never arms its clock, so a quiet run
schedules no interval and cannot hold the event loop open.

Order: R1 and R2 in one PR, then R3's test, then R4.

## Verification

| R | Check | Shown failing first by |
| :-- | :-- | :-- |
| R1, R2 | `packages/caique/src/clack-quiet.test.ts` (new): each decorating function with a quiet runtime writes 0 bytes to an injected stream; `spinner.stop()` resolves | written first: today the spinner writes frames whatever the runtime |
| R2 | the same file: `log.error` writes under quiet | a mutation that silences every `log` method fails it |
| R3 | the same file: `text()` under quiet in a non-TTY is the same usage error | a mutation that lets `quietOf` reach the prompt path resolves `text()` with no answer and fails it |
| R4 | `scripts/sync-package-docs.ts --check`; the weight lock | the README edit fails both until re-run |
| grade | `npm run compat -- clack` | unchanged |

## Status

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | **Built** 2026-10-12 | `clack-core.ts` (`CommonOptions.runtime`, typed as `roundel/policy`'s `Runtime`, a type-only import; `isCI` takes an optional runtime and the spinner reads `CI` from the caller's). roundel's runtime carries no streams, so `input` and `output` still default to the process's: `run()` and `limitOptions` read `processRuntime()` for a stream only, and are unchanged | `clack-quiet.test.ts` › `R1, R2 — a quiet runtime draws nothing`. Red on main: 14 of 31 cases, e.g. `expected '│\n◒  working...\n▲  failed\n' to be ''` |
| R2 | **Built** 2026-10-12 | `clack-output.ts` (`quietOf`, `outputOf` returning a sink that keeps nothing and is no terminal, so the spinner never arms its interval; `log.error` and `cancel` write to `loudOf`). `progress` and `taskLog` are not built in the port (D-152), so the row covers the eight writers that exist | the same file: 12 writers write 0 bytes to their output and to `process.stdout`/`stderr`; `vi.getTimerCount()` is 0 on a quiet terminal spinner; `tasks` resolves; `log.error` and `cancel` write. Mutation: `log.error` through `outputOf` fails `log.error writes under quiet` |
| R3 | **Built** 2026-10-12 | nothing in `run()`: prompts never read `quiet`. The port's prompts are clack's, which draw and wait on any stream; the usage error naming the flag is native `ask`'s (`decide.ts`), which this intent leaves out of scope, so the check is that a prompt is byte-identical with and without a quiet runtime | `clack-quiet.test.ts` › `R3 — a prompt ignores quiet` (a non-TTY `text()` under quiet draws the frames it draws without a runtime and answers `hi`). Mutation: `quiet` reaching `run()`'s output fails it with `expected '' to be '│\n◆  Name?…'` |
| R4 | **Built** 2026-10-12 | `packages/burgee/README.md` › For agents, a `-q`/`--quiet` bullet with `spinner({ runtime: ctx.runtime })`; `npm run weight:converge` re-measured caique 245,166 → 246,099 (the new `.d.ts` doc comments) | `scripts/sync-package-docs.ts --check`. Red before the re-run: `Out of date: apps/docs/content/docs/packages/burgee.md` |

**Built: 4. Not built: 0.**

## Rejected alternatives

- **Read `--quiet` from `process.argv` inside caique.** The port would parse argv, which is
  burgee's job and `U2`'s rule against detection in a leaf package.
- **A process-wide `setQuiet(true)` that burgee calls.** It is global mutable state, and two
  programs in one process (tests) would leak it into each other.
- **Silence prompts too.** A prompt that does not ask under `--quiet` is a hang or a wrong
  default, the opposite of what an agent wants.

## Out of scope

- caique's native `ask` surface, which already takes the caller's runtime.
- A `--verbose` level. One switch, as `agent-lint-conformance` decided.
