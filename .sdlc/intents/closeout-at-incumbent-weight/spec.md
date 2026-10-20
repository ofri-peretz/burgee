# Design — closeout's drop-ins bundle at or under the packages they replace

Intent: [`intent.md`](./intent.md). **Status:** shipped 2026-10-20 in closeout 1.1.7 (Version PR #1199) — accepted 2026-10-20 under the owner's delegation,
[`D-20261020-closeout-weight-design-accepted`](../../decisions/D-20261020-closeout-weight-design-accepted.md), as re-grounded below; built the same day.

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

## Re-grounded on `main` at `a7d8fb7386`, 2026-10-20

The design above was written on 2026-10-12. Measured again before the Design→Build accept, the
two rows read what they read then (`npm run bench -- --axis weight`): 4,819 B against 1,645 B and
3,634 B against 2,856 B. Four things changed in the design, each recorded in
D-20261020-closeout-weight-design-accepted.

### R1 — attribution, measured once

esbuild with B4's flags and `--metafile`, over a fixture importing the same name B4 imports:

| bundle | module | bytes in output |
| :-- | :-- | --: |
| `closeout/exit-hook` (4,803) | `exit-hook.js` | 1,746 |
| | `registry.js` | 1,718 |
| | `deadline.js` | 876 |
| | `report.js` | 339 |
| | `ambient.js` | 108 |
| `closeout/signal-exit` (3,597) | `signal-exit.cjs` | 2,349 |
| | `signal-exit-signals.cjs` | 301 |
| | `ambient.js` | 173 |
| | CommonJS interop (`__commonJS`, `__toESM`, `__toCommonJS`) | 774 |
| `exit-hook` 5.1.0 (1,631) | `index.js` | 1,615 |
| `signal-exit` 4.1.0 (2,851) | `dist/mjs/index.js` + `signals.js` | 2,835 |

The fixture's own import line is the remainder. R1's check is restated: the table is a
measurement that directed the cut, not a standing test, since the B4 gates and closeout's
`weight.test.ts` already fail on any regrowth (D-20261020-closeout-weight-design-accepted, 3).

### What was built instead of one lean core

- **`closeout/exit-hook`** stops importing the registry and runs exit-hook's own machine:
  `called`, sync hooks, a `max(wait)` timer, the async hooks on the awaiting paths only, the
  drain, `exit`. It reaches `ambient.js` alone. 1,579 B against 1,645 B (**0.960**).
- **`closeout/signal-exit`** keeps its machine, moved to `signal-exit-core.ts`, with two doors:
  `require` → `signal-exit.cjs`, which the suite re-evaluates under a changed `process`, and
  `import` → `signal-exit.js`, an ES file over the same core, the same emitter and the same list
  (`signal-list.ts`). signal-exit ships the same pair. Its suite grades its CommonJS build and B4
  bundles its ES build, so ours is measured the same way on both sides. 2,657 B against 2,856 B
  (**0.930**).
- The registry, deadline and report stay on `closeout`'s own entry. The drop-in no longer prints
  the deadline report at `max(wait)`, orders its hooks before closeout's `restore` phase, or
  catches a throwing hook. exit-hook does none of the three, and the 21 / 21 grade is measured
  against exit-hook.

### R4, restated

A shared hook list is not built, because nothing needs it. Each door has its own once-guard,
and a handler is registered through exactly one door. *Check:* `process-wide.test.ts` › "every
door at once, on one process" registers through `closeout`, `closeout/exit-hook` and
`closeout/signal-exit` on one process and counts each handler once over two exits. The two
signal-exit doors share signal-exit's emitter: `signal-exit-doors.test.ts` spawns children that
register through both and end by `exitCode` and by SIGHUP. Each handler runs once, in
registration order, and the child still dies of the signal.

**`lean.qnt`** models the door whose exactly-once used to come from the registry,
`closeout/exit-hook`. `safety` is `onceEach`, `noLostHook`, `noAsyncOnSync`, `noLateHook` and
`waitIsBounded`. It holds over 20,000 traces of 30 steps. The four rejected designs each
violate it, run as steps in `models.yml`: `stepNoGuard`, `stepAsyncOnSync`, `stepNoTimer` and
`stepClearFirst` (the spec's "clearing the set before the run"). The witness `asyncNeverRuns` is
violated too, so `safety` is not vacuous. `registry.qnt` is unchanged and still checked.

### Verification, as built

| R | Check | Red on `main` |
| :-- | :-- | :-- |
| R1 | the table above (esbuild metafile) | — (a measurement) |
| R2 | `RATIO_CEILING['closeout/signal-exit']` 1, `BUNDLED_CEILING` 2,800 | 1.272, 3,634 B |
| R2 | `signal-exit-doors.test.ts` (an ES door, both doors' names and list, one emitter) | no ES door: `signal-list.js` and `dist/signal-exit.js` do not exist |
| R2 | `weight.test.ts`: the `import` door reaches no `.cjs`; the `require` door is weighed | `./signal-exit has no require condition` |
| R3 | `RATIO_CEILING['closeout/exit-hook']` 1, `BUNDLED_CEILING` 1,700 | 2.929, 4,819 B |
| R3 | `weight.test.ts`: `./exit-hook` denies `registry.js`, `deadline.js`, `report.js`, `install.js`, budget 3,800 | reaches `registry.js`, 11,841 B |
| R3 | `exit-hook.test.ts` › "waits max(wait) … then leaves anyway": nothing printed | the registry's deadline report is printed |
| R4 | `process-wide.test.ts` mixed doors; `lean.qnt` in `models.yml` | no ES door to import |
| R5 | `npm run compat -- exit-hook signal-exit` | — (held: 21 / 21; signal-exit level with its control) |
