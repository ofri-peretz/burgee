# Design — controlroom

Intent: [`intent.md`](./intent.md). **Status:** approved (2026-09-27, by the owner, D-158;
amended the same day by D-168: R15–R18, compatibility and migration from the leading
competitors; and by D-167: R19–R22, Claude-Code-class apps and boilerplates). **Skeleton:** `packages/controlroom` exists at `0.0.1`, with no API yet.
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

- **R4 · screen lifecycle.** `open(runtime, { screen: 'alternate' })` enters the alternate
  screen, and raw mode, only when `roundel/policy` says `tty` and stdin is raw-capable
  (R19 adds `screen: 'inline'`, the default). In every other mode it opens a
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
  **Built 2026-10-05** as `src/layout.ts`: `layout(tree, area, contents)` and `distribute()`.
  Sizes are cells, `{ fr, min }` or `'fit'` (widest line in a row, wrapped line count in a
  column, both measured by `linegauge`). A terminal too small for the minimums clips the later
  parts and never the first; rounding leftovers go to the earliest fractional parts.
- **R9 · tabs, focus, collapse.** Tab state, focus order across panes, collapsible sections,
  and a hint line **generated from the active keymap**, so that a hint cannot name an
  unbound key.
  **State and hint built 2026-10-05** as `src/tabs.ts`: `initial()`, `reduce()` and
  `hints(keymap, labels)`. Key routing waits on R2 and the screen on R4.
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

**Compatibility and migration** (D-168). The owner's rule, 2026-09-27: _"controlroom should
be compatible and allow easy migration to it from the leading competitors."_

- **R15 · one render engine.** controlroom never paints on its own. Every frame goes
  through flagstaff's repaint loop, and each widget through its static projection;
  controlroom only lays out regions and routes keys. A lock fails if anything under
  `packages/controlroom/src` writes to stdout or stderr outside the flagstaff path.
- **R16 · the widget contract.** The flagstaff surface controlroom consumes (the widget and
  region interface, and R3's frame-writing seam) is pinned by a lock on both sides, in
  flagstaff and in controlroom, so neither changes it silently.
- **R17 · the Ink ecosystem runs unchanged.** `@inkjs/ui`, `ink-spinner`, `ink-text-input`
  and `ink-select-input` import from `'ink'`. Resolving `'ink'` to `controlroom/ink`, through
  a documented `package.json` alias or `overrides`, runs them unmodified. `@inkjs/ui`'s own
  suite is graded through the drop-in in `compat-oracle`, with a `--control` run, as in
  R13. There is no separate `@inkjs/ui` façade.
- **R18 · migrating off blessed, neo-blessed and terminal-kit.** No drop-in: their API
  surfaces are too large to reproduce honestly. Instead, a coming-from guide for each, and
  `burgee migrate` codemod rules for the common screen, box, list and key patterns, as the
  existing coming-from guides have. The docs gain a **"Which one do I need?"** section:
  flagstaff for inline output in a scrolling terminal, controlroom for a full screen.

**Claude-Code-class apps and boilerplates** (D-167). The owner, 2026-09-27: _"we should also
be able to build things such as the Claude CLI, we can even have a demo CLI boilerplates."_
Claude Code is written for Ink and runs **inline**: in the main screen, with its transcript
in the terminal's own scrollback and a live region under it. Nothing above R19 covers that
shape, and it is the most common one.

- **R19 · inline screens.** `open(runtime, { screen: 'inline' })` keeps the main screen. A
  **live region** at the bottom is repainted through R3's seam, and a **committed region**
  above it is written once and flows into scrollback, never repainted (Ink's `<Static>`).
  Inline is the default, as it is Ink's; `'alternate'` is R4's full screen. A resize reflows
  only the live region. The static projection is R6's: committed lines print as they commit,
  and the live region prints its final state once.
- **R20 · an input line inside a screen.** caique exposes its line editor as a component,
  and controlroom hosts it in the live region: multi-line entry, history, bracketed paste,
  and a completion menu the program feeds (for `/commands` and `@files`). The editor stays
  caique's; controlroom places it and routes keys to it while it has focus. Outside `tty`,
  input comes from stdin lines or the flag the program declares, never a wait (R7).
- **R21 · the chat widgets.** flagstaff gains `markdown`, streamed as tokens arrive and
  committed a block at a time (headings, lists, emphasis, inline code and fenced code), and
  `diff`, a unified diff with added and removed lines and line numbers. Each has a static
  projection: the markdown's own source, and the diff unchanged. Styling goes through
  roundel. Syntax highlighting inside a code fence is out of scope (the intent's list).
- **R22 · boilerplates.** Reference apps under `examples/` that double as starting points,
  each with a README that says what to change first:
  - `examples/chat-cli`, a Claude-Code-class app on the native API: a reply streamed from a
    scripted model, slash commands with completion, a permission prompt before a tool runs,
    a status line with a spinner, elapsed time and a token count, Esc to interrupt and
    Ctrl+C through closeout, and `--json`;
  - `examples/chat-cli-ink`, the same app written for Ink and run on `controlroom/ink`
    through the alias: R17's proof for a whole app, not just its components;
  - `examples/dashboard`, the reference demo from the intent (the PostHog wizard's layout):
    tabs, a task list with progress, a log tail and collapse, in the alternate screen.

  The docs gain **"Start from a boilerplate"**, with the copy command for each. There is no
  `create-*` package: it would be an eleventh package against D-158's cap of ten. It is
  reopened if copying a directory is measured to be the friction.

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
(R8–R10, the reference demo, the Gallery, and W3). R15 and R16 bind from phase 2, R17's
grading lands with phase 3, and R18's guides and codemods with phase 4. R19 lands with the
core in phase 2, R20 after R2, R21 with R3 in phase 0, and R22's apps in phase 4 (the Ink
one after phase 3). v1 publishes when phase 3's rows (Ink and `@inkjs/ui`) and phase 4's
three boilerplates all exist.

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
- **R15** — a controlroom lock that greps `src/` for a write to `process.stdout`, `process.stderr`
  or a runtime stream that does not go through flagstaff, and fails on the first.
- **R16** — a contract lock in each of flagstaff and controlroom over the same exported
  types; changing one side alone turns the other red.
- **R17** — `npm run compat -- --control` grades `@inkjs/ui`'s suite through the alias, and
  a fixture installs `ink-spinner`, `ink-text-input` and `ink-select-input` with `'ink'`
  resolved to `controlroom/ink` and runs each unmodified.
- **R18** — `scripts/migrate-drop-ins-lock.test.ts`-style fixtures for each codemod rule, and
  the coming-from pages built by the docs app.

- **R19** — the conformance test above, inline: after a scripted run, the terminal's
  scrollback (read from the PTY) holds every committed line exactly once, and only the live
  region was rewritten.
- **R20** — caique's editor suite, and the same cases driven through a controlroom screen in
  a PTY; with stdin a pipe, the app reads its lines and exits.
- **R21** — flagstaff's widget suites; a markdown stream split at every byte offset renders
  the same committed blocks as the whole document.
- **R22** — a CI job per boilerplate: under a PTY from a keystroke script, with its frames
  snapshotted, and under `pipe` and `--json`, where R6's clean-transcript check applies.

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

The intent's list applies: mouse, text editing in panes, the wizard's application tabs,
legacy Windows consoles, the burgee plugin until phase 4, and a drop-in for blessed,
neo-blessed or terminal-kit (R18 migrates them instead). `@inkjs/ui` is no longer out of
scope: R17 puts it in v1 through the `'ink'` alias, with no façade of its own (D-168).
