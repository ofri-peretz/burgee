# Design — closeout's drop-ins bundle at or under the packages they replace

Intent: [`intent.md`](./intent.md). **Status:** review.

---

## Requirements

- **R1 — Attribution first.** A test-only script lists, per module, the bytes each drop-in's
  bundle carries (esbuild `metafile`, B4's flags), and the spec's table below is filled from it
  before any cut. *Check:* `packages/closeout/src/weight-attribution.test.ts` (new) asserts the
  sum of the table equals the measured bundle; it fails on main because the table is empty.
- **R2 — `closeout/signal-exit` ≤ 2,856 B.** The path imports the lean core (R4), not
  `registry.ts`. *Check:* `RATIO_CEILING['closeout/signal-exit']` set to 1.0 in
  `benchmarks/axes/weight.ts`; on main it reads 1.272 and fails.
- **R3 — `closeout/exit-hook` ≤ 1,645 B.** Same, with exit-hook's `gracefulExit` and async-hook
  wait carried by the lean core. *Check:* `RATIO_CEILING['closeout/exit-hook']` 1.0; 2.929 on main.
- **R4 — One hook list per process.** The lean core keeps its handlers on `ambient.ts`'s
  instance, and the registry reads the same list, so mixing doors runs each handler once.
  *Check:* `packages/closeout/src/process-wide.test.ts` gains a case registering through
  `closeout`, `closeout/signal-exit` and `closeout/exit-hook` in one process and counting calls on
  exit; and the model below.
- **R5 — Grades level.** *Check:* `npm run compat -- closeout` (signal-exit and exit-hook rows)
  unchanged.

## Design

The registry today is one machine for every door: phases, deadlines, the report. The drop-ins
need a subset: install on first add, run each handler once on the first exit signal, uninstall
when empty, and (exit-hook only) wait for async hooks up to a fixed time. That subset becomes
`lean.ts`, holding its hooks in a `Set` on the ambient instance. `registry.ts` registers its own
phase runner as one entry in that set, so the registry still owns ordering for its callers and
the lean core owns the process listeners for everyone.

Order: R1 (numbers), then R4 with its model, then R2, then R3.

## Verification

| R | Check | Red on main |
| :-- | :-- | :-- |
| R1 | `weight-attribution.test.ts` | the table is empty |
| R2 | `RATIO_CEILING` 1.0 in `weight.ts` | 1.272 |
| R3 | `RATIO_CEILING` 1.0 in `weight.ts` | 2.929 |
| R4 | `process-wide.test.ts` mixed-door case; `lean.qnt` | no lean core to import |
| R5 | `npm run compat -- closeout` | — (holds today; must still hold) |

**Quint.** Jev's `needs_model` is `yes?`: exit is ordering and exactly-once across two entry
points. `lean.qnt` beside this file models the shared hook set with actions `add(door)`,
`remove`, `signal`, `exitCalled`, `asyncSettle`, one per JavaScript turn, and `val safety` as
the conjunction of `onceEach` (R4: every handler at most once) and `noLostHook` (a hook added
before the first signal runs). It is written first against today's code, where it must hold
for the registry alone, then extended with the lean door. Mutations to confirm it can fail: a
second listener install, clearing the set before the run, running hooks on `remove`. The
existing `registry.qnt` keeps running in `models.yml` unchanged.

## Rejected alternatives

- **Accept the ratio as product.** Offered by both gaps; refused by
  D-20261012-closeout-drop-ins-held-to-u5.
- **Minify harder or change B4's flags.** The method is shared by every row; changing it for
  one package games the claim.
- **Drop exit-hook's async wait.** It is graded behaviour of the incumbent.

## Out of scope

- The registry's own size on `closeout`'s root entry, which has no incumbent.
- `closeout/once` and `closeout/cursor` weights, already under their incumbents.
