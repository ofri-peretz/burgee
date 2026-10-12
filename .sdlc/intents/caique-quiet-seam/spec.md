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
- **R2 — Quiet draws nothing.** With `runtime.quiet === true`, `spinner`, `progress`, `tasks`,
  `taskLog`, `intro`, `outro`, `note` and `log.{info,step,success,message,warn}` write nothing.
  Their lifecycle methods (`start`, `stop`, `advance`, `message`) still run and resolve.
  `log.error` writes.
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
