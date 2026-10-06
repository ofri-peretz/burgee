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
  **Built 2026-10-05** as caique/keys (PR #799).
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
  **Built 2026-10-05** as `src/plugin.ts` (`controlroom/plugin`), `src/check.ts` and
  `controlroom check`: keymaps and panes as data, in the family schema. A tab bar is a pane over
  flagstaff's `tab-bar`, so it has no key of its own. The built-in `default` keymap registers
  through `register()` on first use rather than at load, so the root keeps `sideEffects: false`.
  The eval case is `evals/cases/controlroom-plugin-from-schema.json`.

**The Ink drop-in.**

- **R11 · `controlroom/ink`.** A `react-reconciler` host config that renders onto R4–R6.
  `react` and `react-reconciler` are **optional peers** (`peerDependenciesMeta`), and
  nothing else in the package imports them. If a peer is missing on first import, the error
  carries a `fix` naming the install line.
  **Built 2026-10-05** as `src/ink/` (D-20261005-controlroom-ink-drop-in): ink 6.8's whole
  runtime surface — `render` (`rerender`, `unmount`, `waitUntilExit`, `clear`, `cleanup`),
  `renderToString`, `Box`, `Text` (wrap and the three truncations), `Static`, `Transform`,
  `Newline`, `Spacer`, `useInput`, `useApp`, `useStdin`, `useStdout`, `useStderr`, `useFocus`,
  `useFocusManager`, `useIsScreenReaderEnabled`, `useCursor`, `measureElement`, `kittyFlags`,
  `kittyModifiers` — on one host config for both reconciler lines (React 18 and 19). The peers
  load with `import()`, so a missing one is `E_PEER_MISSING` with the install line as its
  `fix`. ink's write protocol is reproduced in one file, `ink/terminal.ts`, from the family's
  sequences; R15's lock names it as the drop-in's one boundary. Graded **ink 576 / 584**
  (control 584 / 584; 593 vendored, 9 colour cases excluded with reasons) — the 8 failing were
  kitty keyboard negotiation. **584 / 584 from 2026-10-05**: the protocol's push, pop and query
  joined `paratext/csi` (`kittyKeyboardPush`, `kittyKeyboardPop`, `kittyKeyboardQuery`), the
  drop-in's key parser reads the answer (`kittyReply` in `ink/keypress.ts`), and the drop-in negotiates as ink does — pushed at once in `enabled` mode, and
  in `auto` mode only once a known terminal answers, handing every other byte back to stdin.
  **Follows ink 8.0.0 from 2026-10-06** (D-20261006-controlroom-ink-8): every module ported
  again from ink 8's source, adding `usePaste`, `useAnimation`, `useBoxMetrics`,
  `useWindowSize`, `suspendTerminal`, `waitUntilRenderFlush` and the alternate screen; the
  kitty answer is read off the input stream (`isKittyQueryReply`). Graded **ink 1304 / 1304**
  (control 1303 / 1304).
- **R12 · Ink's layout.** A TypeScript flexbox subset that covers the `Box` props Ink's
  suite exercises. It lives under `controlroom/ink` only. Every uncovered case is a
  conditional case with its reason.
  **Built 2026-10-05** as `src/ink/flex.ts`: yoga 3's `CalculateLayout` for the props ink
  sets — sizes and minimums in cells or percent, all four directions, grow, shrink, basis,
  wrap and wrap-reverse, the six justifications, `alignItems`/`alignSelf`, gap, padding,
  margins (negative too), borders, `display: none`, absolute children, and yoga's rounding,
  including the quirk ink marks `test.failing`. No layout case of either suite is excluded;
  what yoga has and ink never sets (`aspectRatio`, max sizes, insets, auto margins, baseline,
  RTL) is not reproduced.
  **Extended 2026-10-06** for ink 8, which sets more of yoga: max sizes, `aspectRatio`,
  insets with `position: relative | absolute | static`, `alignContent`, baseline alignment.
- **R13 · grading.** Ink's suite is vendored into `compat-oracle` at a pinned release. It
  runs on the ava runner, with a `--control` run against real Ink, and with a baseline that
  only ratchets.

  **Vendored 2026-10-05**: ink@6.8.0 (39 files: 32 gated and 7 internals-only; 593 gated
  cases, one `test.todo`, 148 on the internals line; 78 cases need a PTY and run through
  `node-pty`'s prebuilds, none excluded; control 593 / 593 on darwin, Ubuntu's reference is
  CI's), @inkjs/ui@2.0.0 (13 files, 103 cases, control 103 / 103, graded through the `'ink'`
  alias as R17 asks). Both target the root `controlroom` at 0 until R11 builds
  `controlroom/ink` (D-006, D-007). PR #PR_NUMBER, D-20261005-controlroom-ink-suite.
  **Both rows moved to `controlroom/ink` on 2026-10-05** with R11, graded with the target's
  peers resolved from the suite's tree (`Host.peers`) and ink's two internal imports served by
  the drop-in's own modules (`Host.targetInternals`).
  **Re-vendored at ink@8.0.0 on 2026-10-06** (D-20261006-controlroom-ink-8): `node:test`
  through `tsx`, one file at a time; 95 files, 1,309 counted cases, 5 excluded with reasons,
  reference 1304, one control failure allowed. ink 6.8.0 stays graded as `ink-6` in
  `PREVIOUS_MAJORS` (540 / 584, control 584 / 584), not claimed. @inkjs/ui is 102 / 102 with
  one case excluded that real ink 8 fails too.
- **R14 · weight.** The W1–W4 fixtures from the intent are added to
  `benchmarks/fixtures/entry-points.ts`, and each is gated at ≤ 1.0×. The root entry is
  `denied` both peers in the weight lock.
  **The lock half built 2026-10-05** as `src/weight.test.ts`: the root may import only family
  subpaths and is denied `react`, `react-reconciler` and every `ink/` module (12,672 B);
  `controlroom/ink` is 130,443 B of `dist/` before its peers, against ink 6.8's own 169,374 B
  before yoga. The walker reads `import()` as well as static imports, so a peer cannot hide.
  **W1, W2, W4 and W3's root half built 2026-10-05** (D-20261005-controlroom-ink-alias), as B4
  pairs in `benchmarks/fixtures/entry-points.ts` and B2 variants in `benchmarks/axes/perf.ts`,
  against ink 6.8.0 on React 19.3.0 (benchmarks devDependencies, the versions the oracle grades),
  each gated at ≤ 1.0× with a claim in `benchmarks/claims.ts`. Measured on darwin (a laptop,
  `npm run bench -- --axis weight` and `--axis perf`, 52 rounds):

  | Gate | Ours | Against | Ratio |
  | :-- | --: | --: | --: |
  | W1 · bundled: `controlroom/ink` + `react` + `react-reconciler` against `ink` + `react` | 473,361 B | 635,541 B | **0.745** |
  | W2 · installed bytes, the same two programs | 3,053,223 B | 8,067,173 B | **0.378** |
  | W2 · installed packages | 10 | 42 | **0.238** |
  | W3 · bundled: the `controlroom` root (`open`) against `ink` alone, React external | 28,848 B | 604,713 B | **0.048** |
  | W4 · cold start: importing `controlroom/ink` against importing `ink` + `react` | 94.06 ms | 338.52 ms | **0.289** |
  | W4 · cold start: importing `controlroom` against importing `ink` + `react` | 43.26 ms | 338.52 ms | **0.144** |

  All six meet the bar. The intent's figures (674,652 B and 644,976 B) were esbuild 0.28.2 over
  React 19.2.4 in a scratch install; the axis's are the ones that publish. W1's side counts every
  chunk (`eager`): the drop-in loads its peers with `import()` under top-level await, so the
  axis's "initial load" would leave three stubs out in our favour. W2's package count is the
  axis's own walk (`installedTree`, the one mechanism added), and ink + react is 42 where the
  intent's 45 included `@inkjs/ui`, which both sides would install. **W3's demo half is not an
  axis record yet**: `examples/dashboard` is not on this base (it is on `feat/controlroom-input`).
  Measured out of tree with the same flags, the dashboard bundled from that branch's sources is
  44,809 B against 695,034 B for the Ink screen fixture (0.064); its pair is one row in
  `PAIRS` once the example lands, with the screen fixture committed beside it.

**Compatibility and migration** (D-168). The owner's rule, 2026-09-27: _"controlroom should
be compatible and allow easy migration to it from the leading competitors."_

- **R15 · one render engine.** controlroom never paints on its own. Every frame goes
  through flagstaff's repaint loop, and each widget through its static projection;
  controlroom only lays out regions and routes keys. A lock fails if anything under
  `packages/controlroom/src` writes to stdout or stderr outside the flagstaff path.
  **Amended 2026-10-05** (D-20261005-controlroom-ink-drop-in): the lock walks `src/ink/` too,
  and names one boundary there — `ink/terminal.ts`, which writes ink's byte protocol because
  ink's suite grades it write by write, with every sequence taken from `paratext/csi` and
  `closeout`. The native API still paints only through flagstaff.
- **R16 · the widget contract.** The flagstaff surface controlroom consumes (the widget and
  region interface, and R3's frame-writing seam) is pinned by a lock on both sides, in
  flagstaff and in controlroom, so neither changes it silently.
- **R17 · the Ink ecosystem runs unchanged.** `@inkjs/ui`, `ink-spinner`, `ink-text-input`
  and `ink-select-input` import from `'ink'`. Resolving `'ink'` to `controlroom/ink`, through
  a documented `package.json` alias or `overrides`, runs them unmodified. `@inkjs/ui`'s own
  suite is graded through the drop-in in `compat-oracle`, with a `--control` run, as in
  R13. There is no separate `@inkjs/ui` façade.
  **Graded 2026-10-05: `@inkjs/ui` 103 / 103** on `controlroom/ink` through the alias, on
  `@inkjs/ui`'s own React 18 and `react-reconciler` 0.29 (control 103 / 103; 7 of the 103 are
  cases upstream marks `failing` against ink 5, which the drop-in draws as the case expects).
  **The fixture built 2026-10-05** as `examples/ink-ecosystem` (D-20261005-controlroom-ink-alias):
  `ink-spinner` 5.0.0, `ink-text-input` 6.0.0 and `ink-select-input` 6.2.0 from npm, run
  unmodified, **7 / 7** — each component's own `'ink'` lands on the drop-in, the spinner draws
  and animates the `dots` frames, the text input shows its placeholder, takes typed text and
  submits it, and the select input moves its mark with ↓ and selects on Enter. Against real ink
  (the line pointed back at `ink@6.8.0`) the three behaviour cases pass and the four resolution
  cases fail, which is what proves the resolution cases can. The alias is
  `"ink": "file:./ink"`, a two-file package that re-exports `controlroom/ink` at version 6.8.0:
  a bare `npm:` alias names a package, not a subpath, so it would hand the components the native
  API. Neither example is a workspace — a package named `ink` that is not ink took the root
  `node_modules/ink` from the benchmarks' real one when it was — so
  `scripts/ink-alias-lock.test.ts` packs `controlroom` and its family from the tree, installs
  each example alone and runs its `node --test`, and the line is in the README's Migrating
  section.
- **R18 · migrating off blessed, neo-blessed and terminal-kit.** No drop-in: their API
  surfaces are too large to reproduce honestly. Instead, a coming-from guide for each, and
  `burgee migrate` codemod rules for the common screen, box, list and key patterns, as the
  existing coming-from guides have. The docs gain a **"Which one do I need?"** section:
  flagstaff for inline output in a scrolling terminal, controlroom for a full screen.

  **Built 2026-10-05** (PR #PR_NUMBER): guides `coming-from/blessed`, `coming-from/neo-blessed`
  and `coming-from/terminal-kit` under `apps/docs/content/docs/`, on the front door until
  controlroom has a docs host (`familyRedirects()` moves them with a 301 when it does); the
  **"Which one do I need?"** section on the package map, written by
  `scripts/sync-package-docs.ts`; and `burgee migrate`'s guided rules in
  `packages/burgee/src/migrate-guided.ts`, for the `import`, `screen`, `alternate-screen`,
  `box`, `list`, `key`, `render`, `mouse` and `text-input` patterns. Every rule **reports and
  none rewrites**: each site goes under the report's `guided` key with its file, line and
  guide section, the file is left as it was, and the exit code does not change. A site is
  reported only when its receiver was bound from one of the three packages in the same file.
  `scripts/migrate-guides-lock.test.ts` holds the rules, the guides' headings, their example
  reports and the Migrate page's table to each other, and fails on a controlroom snippet that
  imports a name `src/index.ts` does not export unless the snippet is marked "Planned, not
  built". **Waits on R4 and R19:** no rule can rewrite until `open()` exists, and pane
  registration (R5, R10) is designed, so the screen, render and alternate-screen snippets are
  marked and no rewrite ships. The layout and keymap snippets are marked too, because R8 and
  R9 are not on main; when they land, those markers drop their "not on main" clause. The
  lock checks only the unsafe direction, so it will not say so.

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
  **controlroom's half built 2026-10-05** as `open(rt, { input })`: keys go to caique's editor
  while its pane has focus, and a key the editor leaves unchanged falls through to the keymap,
  so Esc and the program's own bindings still arrive. Bracketed paste is on while the screen is
  open, through a new `bracketedPaste()` in `closeout/cursor`. A static session reads piped
  stdin a line an entry, and never reads a terminal's stdin: its input ends at once instead.
  **Built 2026-10-05** (caique's half) as caique/editor (PR #801); hosting it in the live
  region is controlroom's, in phase 2.
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

  **`examples/chat-cli` built 2026-10-05**: piped, a prompt a line, in order (entries that
  arrive mid-reply queue), a clean transcript, and exit when stdin ends; under `--json`, one
  commit event per entry; on a terminal, driven in-process and by hand under a real PTY: the
  reply streams under a status line, Esc interrupts, Tab completes, Ctrl+C quits. Under
  `--json`, closing a screen no longer repeats its last commit.
  **`examples/dashboard` built 2026-10-05**: under a pipe and `--json` its test applies R6's
  clean-transcript check and runs with stdin closed; on a terminal it is driven in-process
  (keys, collapse, quit, leaving the alternate screen), and by hand under a real PTY. Panes it
  shows only on a terminal (the tab bar, the hint line) are `liveOnly`, which R6 needed.

  The docs gain **"Start from a boilerplate"**, with the copy command for each. There is no
  `create-*` package: it would be an eleventh package against D-158's cap of ten. It is
  reopened if copying a directory is measured to be the friction.

  **`examples/chat-cli-ink` built 2026-10-05** (D-20261005-controlroom-ink-alias): `chat.mjs`
  is the chat as an Ink program — `ink`, `react`, `ink-text-input` and `ink-spinner`, with
  `React.createElement` and no build step — `<Static>` for the transcript and a live region for
  the streamed reply, the status line (spinner, elapsed time, token count) and the input line;
  Esc interrupts, Tab completes, ↑ and ↓ walk the history, Ctrl+C quits. Its package.json has
  `"ink": "file:./ink"`. `chat.test.mjs` mirrors `chat-cli`'s on `node:test`, **12 / 12** on the
  drop-in: every `'ink'` the app reaches (its own, `ink-text-input`'s, `ink-spinner`'s) is the
  drop-in; piped, a clean transcript in order, each entry once, exit on end of stdin; on a
  terminal stand-in in-process, the stream under a status line, Esc, Tab, ↑ and Ctrl+C. The same
  file on real ink passes all eight behaviour cases and fails the four resolution cases. **Ink has
  no `--json` equivalent** — it has no structured output to project — so `--json` exits 2 with a
  pointer to `chat-cli`, and the README and the test say so. A pipe gets Ink's own linear
  screen-reader output (`isScreenReaderEnabled` off a terminal), which writes each committed line
  once and no escape sequence. The README says what to change first. `boilerplates.mdx` is not on
  this base (it is on `feat/controlroom-input`), so the row for this boilerplate is added with it.

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
