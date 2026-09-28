# Design — controlroom

Intent: [`intent.md`](./intent.md). **Status:** approved (2026-09-27, by the owner, D-158).
The package is named `controlroom`, reserved as `controlroom@0.0.1`. The earlier picks were
`chartroom`, which clashes with `chart-room`, and `conning`, which npm refused as too similar
to `config` (see the intent's Naming section).
This design is the first cut. Each phase refines its own requirements before it builds, and
it records every change here.

---

## Requirements

**Prerequisites.** Each lands in its own package, under that package's spec.

- **R1 · closeout R4, finished.** Add `rawMode(stream, onExit)` and
  `alternateScreen(stream, onExit)` beside `hideCursor` in `closeout/cursor`. Each one does
  its change and registers the undo in the `restore` phase, in the same call. Remove the
  "Still to come" line from closeout's README only when both exist. Nothing below ships
  before R1.
- **R2 · `caique/keys`.** Decode key presses through `node:readline`'s keypress events: the
  arrows, tab, enter, escape, letters, and ctrl and meta combinations. A keymap is **data**:
  an object from key to action name. Raw mode is acquired once for a screen's whole life,
  through R1. Rebuild `raw.ts`'s `keyOf` on this decoder, and keep its suite unchanged.
- **R3 · flagstaff components.** Add `logTail` (the last _n_ lines, a current-step marker,
  and a static projection that appends) and `tabBar` (whose static projection is the active
  tab's label). Both register through `register()` and read no keys. Replace the literal
  pending space in `tasks` with a mark that a plugin can replace. Expose the repaint in
  `projection.ts` as a frame-writing seam, so that no other package writes grid sequences.

**The core.**

- **R4 · screen lifecycle.** `open(runtime)` enters the alternate screen and raw mode only
  when `roundel/policy` says `tty` and stdin is raw-capable. In every other mode it opens a
  static session. `close()` and every exit path restore through R1.
- **R5 · compositor.** Several live components share one frame. The compositor writes the
  whole frame through R3's seam, diffed line by line and wrapped in synchronized output. It
  lays out again on the runtime's `resize`.
- **R6 · static projection of a screen.** In `pipe`, `ci` and `accessible` mode, each pane's
  component uses its own static projection, printed in declared pane order with the pane
  label. There is no hint line and no tab hiding. Under `--json`, NDJSON goes to stderr as
  `{ event, pane, state }`.
- **R7 · no hang.** No API waits for a key outside `tty` with a raw-capable stdin. A wait
  that cannot be satisfied resolves at once with the static result, or throws with a `fix`.

**The native API.**

- **R8 · layout.** Rows and columns, with fixed, fractional and minimum sizes, computed as
  arithmetic over `linegauge` widths. There is no flexbox and no solver.
- **R9 · tabs, focus, collapse.** Tab state, focus order across panes, collapsible sections,
  and a hint line **generated from the active keymap**, so that a hint cannot name an
  unbound key.
- **R10 · plugins.** Panes, keymaps and tab bars register through one `register()` against
  the family schema. The built-ins use the same call.

**The Ink drop-in.**

- **R11 · `controlroom/ink`.** A `react-reconciler` host config that renders onto R4–R6.
  `react` and `react-reconciler` are **optional peers** (`peerDependenciesMeta`), and
  nothing else in the package imports them. If a peer is missing on first import, the error
  carries a `fix` naming the install line.
- **R12 · Ink's layout.** A TypeScript flexbox subset that covers the `Box` props Ink's
  suite exercises. It lives under `controlroom/ink` only. Every uncovered case is a
  conditional case with its reason.
- **R13 · grading.** Ink's suite is vendored into `compat-oracle` at a pinned release. It
  runs on the ava runner, with a `--control` run against real Ink, and with a baseline that
  only ratchets.
- **R14 · weight.** The W1–W4 fixtures from the intent are added to
  `benchmarks/fixtures/entry-points.ts`, and each is gated at ≤ 1.0×. The root entry is
  `denied` both peers in the weight lock.

## Design

```text
packages/controlroom/src/
  screen.ts      R4 — lifecycle; the only file that asks roundel for the mode
  compose.ts     R5 — frame composition, resize, writes only through flagstaff's seam
  project.ts     R6 — the static and NDJSON projections of a screen
  layout.ts      R8 — splits and sizes, arithmetic over linegauge
  tabs.ts        R9 — tabs, focus, collapse, hint line from the keymap
  plugin.ts      R10
  ink/           R11–R12 — host config, flexbox subset, Ink's hooks; the only importer of react
  runtime.ts     the structural Runtime; nothing else names process
```

**Order.** The phases are the intent's: 0 (R1–R3), then 1 (R13 vendoring and its control
run, in parallel with 0), then 2 (R4–R7), then 3 (R11–R12, with R14's W1, W2 and W4), then 4
(R8–R10, the reference demo, the Gallery, and W3). v1 publishes when phase 3's row and phase
4's demo both exist.

**Registration in the family** happens when the package directory is created, and not
before:

- a `LAYERS` row with incumbents `ink` and `@inkjs/ui`;
- a `.github/vercel-apps.json` row;
- the mark;
- a trusted publisher;
- the composition band.

## Verification

Each item names the command that exits non-zero when it is wrong:

- **R1** — closeout's `matrix.test.ts`, extended with raw mode and the alternate screen, and
  driven through a real PTY.
- **R6 and R7** — a `controlroom` conformance test that spawns the demo in every mode. It
  greps for `0x1B` and `\r`, parses stderr as NDJSON, and fails on a timeout with stdin at
  `/dev/null` or a pipe.
- **R11–R13** — `npm run compat -- --control`, then `npm run compat`. The ratchet fails CI
  when the pass rate drops.
- **R14** — `npm run bench`, where the B4 axis gates at 1.0×, and the weight lock's `denied`
  entries.
- **Boundaries** — `scripts/layer-boundaries-lock.test.ts` at ten layers, the
  subpath-isolation test, and `scripts/composition-lock.test.ts`.

The check that would have caught the original gap is R1's PTY case. It is red today,
because `cursor.ts` never leaves the alternate screen.

## Rejected alternatives

- **A `flagstaff/screen` subpath.** flagstaff's design puts full-screen use, the alternate
  screen and key input out of scope (`flagstaff/spec.md:892`). Keys would force a
  flagstaff → caique arrow, and every spinner user would install prompts.
- **A caique subpath.** A screen is not a prompt, and it would force a caique → flagstaff
  arrow.
- **Recommending Ink.** Six of its 25 direct dependencies are incumbents this family
  replaces. It is the dependency bill U6 exists to remove.
- **`react-reconciler` in `dependencies`.** It breaks rule 2. The one-import migration is
  not worth a reconciler in every native-API install.
- **Our own React-compatible runtime.** It is a second product larger than the first, and
  grading it would need module aliasing of `react`.
- **Driving React through its private internals.** It breaks on any React minor release.
- **Required peers.** npm 7 and later would install React for native-API users.
- **Yoga for the drop-in's layout.** It is an external dependency (134,274 B unminified in
  the measured bundle), and the incumbent's own weight.
- **The drop-in before the core.** It would give two engines owning one terminal.

## Out of scope

The intent's list applies: mouse, the `@inkjs/ui` drop-in in v1, text editing in panes, the
wizard's application tabs, legacy Windows consoles, and the burgee plugin until phase 4.
