# Intent — controlroom: full-screen, keyboard-driven terminal screens with a static projection for every caller, and a drop-in for Ink graded by Ink's own suite

> Stage 1 artifact. Child of [`cli-output-stack`](../cli-output-stack/intent.md), floor
> rows U1, U2, U3, U5, U6, U8, U11, U12, U13. Opened on 2026-09-27 from the owner's remark
> after seeing PostHog's setup wizard: _"I like their CLI's UI, we need to ensure our
> packages offer the same thing."_ The owner answered its four open questions the same day,
> and D-158 records the answers: a new package, named `controlroom`, with an Ink drop-in in
> v1, and the nine-package ceiling restated. The design is [`spec.md`](./spec.md).

**Status:** approved · **Opened:** 2026-09-27 · **Owner:** @ofri-peretz · **Approved:** 2026-09-27 by the owner, in session (D-158: a new package named `controlroom`, `controlroom/ink` in v1, the ceiling restated)

---

## What is wanted

A CLI built on this family can draw the kind of screen the owner saw, with no dependency
outside this repository:

- **Panes.** A two-column body, with a left text panel ("Learn") and a right checklist
  ("Tasks"), above a bottom log-tail pane.
- **A checklist with states.** `◼` done, `▶` running (with a spinner) and `◻` pending, plus a
  summary line such as `Progress: 1/9 completed`.
- **A log tail.** The last lines of a stream, prefixed with `┊`, with `◆` marking the current
  step.
- **Tabs with key hints.** Tabs such as `Status · Tail logs · Visualizer · HN`, a hint line
  such as `←→ switch tab  s toggle status`, and keys that do what the hints say.
- **Collapse and expand.** A status section that a key toggles.
- **Full screen.** The screen uses the alternate screen and redraws in place. It lays itself
  out again when the terminal is resized. On every exit path it hands the terminal back
  exactly as it found it.

The same program prints **stable lines** in `pipe`, `ci` and `accessible` mode, and
**NDJSON events** under `--json`. It never shows an interactive screen to a caller that
cannot use one. It never waits for a key that nobody can press.

**And an Ink program moves by changing its import.** `controlroom/ink` is a drop-in for `ink`.
It is graded by Ink's own vendored suite, with a control run against real Ink, through
`compat-oracle`, in the same way as every other drop-in in the family (rule 3, U11). Its
pass rate is published and ratchets.

### What was decided (D-158, 2026-09-27)

1. **A new package that replaces `ink` and `@inkjs/ui`.** It owns layout (columns, rows,
   splits, fixed and fractional sizes), tabs, focus and keymaps, collapse and expand, the
   alternate screen with resize, and the compositor that puts several live components on
   one screen. It **composes its siblings**:
   - flagstaff components are pane content;
   - caique supplies the key reader;
   - closeout does the terminal restore;
   - linegauge does the measuring;
   - roundel decides the mode.
2. **The name is `controlroom`**, the room a system is watched and run from.
   `controlroom@0.0.1` is published as a reservation. It was the third pick: `chartroom`
   clashed with `chart-room`, and npm refused `conning`. The history is under
   [Naming](#naming).
3. **`controlroom/ink` ships in v1**, graded by Ink's own suite. How React is supported, the
   size gates and the phase order are set out in [The Ink drop-in](#the-ink-drop-in).
4. **The cap is restated.** `.sdlc/intents/README.md`'s nine-package ceiling becomes ten,
   and `cli-output-stack`'s "Not planned: Ink" becomes planned. Both are restated in the same
   change that approves this intent, with the reason.

Two supporting pieces live in the packages that already own their concern:

- **Two flagstaff components, output only:** a log-tail pane and a tab bar. They ship as
  built-ins through flagstaff's own `register()`, each with a static projection. That makes
  them work **inline**, in an ordinary scrolling terminal, in programs that never open a
  screen. They draw and read no keys, which is consistent with
  `.sdlc/intents/flagstaff/spec.md:892`.
- **Later, an optional burgee plugin** lets a burgee command open a screen. burgee reaches
  controlroom only through U13's presence-guarded dynamic `import()`, and falls back to the
  static projection when controlroom is absent.

**Why a new package**, as recorded when the owner chose it:

- **The layer rule.** flagstaff is output. A screen needs keys, and keys belong to caique.
  If the screen lived in flagstaff, flagstaff would have to depend on caique, and every
  program that only wanted a spinner would install the prompt library.
- **Each package is an independent product** (rule 8, U12).
- **One package per incumbent.** The family is split along the same lines as the incumbents
  it replaces (`LAYERS` in `packages/compat-oracle/src/demand.ts`). Ink and `@inkjs/ui` are
  one incumbent pair, and neither maps to an existing layer.

The alternatives that were weighed and rejected are listed in `spec.md` under **Rejected
alternatives**: a flagstaff subpath, a caique subpath, and recommending Ink.

## Why now

**The ask.** The owner named the target on 2026-09-27. The UI described above is what the
owner observed. It was not read from PostHog's source.

**What the incumbent is.** On 2026-09-27, `npm view @posthog/wizard@2.78.0 dependencies`
listed `ink ^6.8.0`, `react ^19.2.4`, `@inkjs/ui ^2.0.0`, `yargs ^16.2.0` and
`inquirer ^6.2.0`. It also listed `@earendil-works/pi-tui ~0.79.8`, so **which library draws
which screen has not been verified from source**.

`ink@6.8.0` declares 25 direct dependencies, among them `react-reconciler`, `yoga-layout`,
`ws` and `es-toolkit`, and it peers on `react >=19.0.0`. Six of the 25 are incumbents that
the family's `LAYERS` table already names as replaced:

- `chalk` (roundel);
- `string-width`, `wrap-ansi` and `slice-ansi` (linegauge);
- `ansi-escapes` (paratext);
- `signal-exit` (closeout).

Ink's own test tooling, from `npm view ink@6.8.0 devDependencies`, includes `ava`,
`node-pty`, `sinon` and `@sinonjs/fake-timers`. Ink's suite runs on ava, which is one of the
runners `compat-oracle` already reads. That some cases drive a real PTY is inferred from
`node-pty` being in the list. It is not counted, and **the suite's size is recorded when it
is vendored** (rule 4).

**What it weighs.** These figures were measured on 2026-09-27 with the weight axis's own
flags (`benchmarks/axes/weight.ts:221`:
`esbuild --bundle --minify --format=esm --platform=node --splitting`):

- Node 24.21.0 and esbuild 0.28.2;
- a scratch project installed with `npm i --ignore-scripts ink@6.8.0 react@19.2.4 @inkjs/ui@2.0.0`;
- `react-devtools-core` marked external, because it is Ink's optional peer.

They are **not axis records yet**. The axis re-measures them when these fixtures are added
to `benchmarks/fixtures/entry-points.ts`, and the axis's figure is the one that publishes.

| Fixture | Bundled bytes |
| :-- | --: |
| `import { render } from 'ink'`, with `react` external | 644,976 |
| the same, with `react` bundled: **ink + react**, the baseline for the drop-in | **674,652** |
| **an equivalent screen**: `Box`, `Text` and `useInput` from ink, plus `Spinner` from `@inkjs/ui`, drawing two columns, a tab line, a log pane and arrow keys | **727,056** |

The largest inputs to the screen fixture are listed below. They are unminified bytes, with
`react` external:

| Input | Bytes |
| :-- | --: |
| `react-reconciler` | 1,159,551 |
| `es-toolkit` | 524,514 |
| `ink` | 169,374 |
| `yoga-layout` | 134,274 |
| `ws` | 132,120 |

Installed, the three packages bring **45 packages and about 8.26 MB** to disk. That count
comes from `npm query '*'` plus a file-size sum, with esbuild excluded. The published figure
is whatever the weight axis's `installedBytes` measures.

**Cold start is unmeasured.** A local 30-spawn attempt produced samples too noisy to cite:
the two Ink variants disagreed with each other in a direction that cannot be right. The B2
axis measures cold start as a same-run ratio (`benchmarks/axes/perf.ts`).

**The gap, capability by capability.** The "Has" column cites the file that does the job
today. The "Missing" column is what the wizard's screen needs that nothing in the family
provides.

| Capability | The family has it today | Missing |
| :-- | :-- | :-- |
| Two-column body, panes, splits | `flagstaff/box` draws one bordered block as a string (`packages/flagstaff/src/box.ts:91`). `flagstaff/table` draws a grid of cells (`table.ts:117`) | Any split of the screen into regions, and any sizing. `box.ts:6` rules a layout engine out of flagstaff |
| Several live components on one screen | `hoist()` raises one component (`packages/flagstaff/src/loop.ts:33`). Each TTY projection erases only the lines it last painted (`projection.ts:37`, `:95`) | A compositor. Two hoisted components on one stream are not composed |
| Checklist `◼ ▶ ◻` with a spinner | `flagstaff/tasks`, whose states are pending, running (animated), ok, fail, warn and info (`packages/flagstaff/src/tasks.ts`) | The pending mark is a literal space that no plugin may replace (`tasks.ts:35`), so `◻` cannot be themed |
| `Progress: 1/9 completed` | `flagstaff/progress`, whose static projection is a count and a percentage (`progress.ts:55`) | Nothing new. It only needs composing |
| Log tail with `┊` and `◆` | The static projection appends only lines the reader has not seen (`projection.ts`, `staticProjection`). `flagstaff/log-update` repaints a block | A height-bounded tail component and a scrollable pane |
| Tabs with key hints | Nothing | A tab bar (output), tab state (the screen), and a hint line generated from the active keymap |
| Keyboard navigation, focus, keymaps | caique decodes six keys for list prompts (`packages/caique/src/raw.ts:42`, `:49`). `askList` turns raw mode on and off around a single prompt (`raw.ts:151`, `:185`). `inquirer-keys.ts:17` types `node:readline`'s `KeypressEvent` | A general key decoder, keymaps as data, focus that moves between panes, and one owner of raw mode for the whole life of a screen |
| Collapse and expand | Nothing | Section state, a toggle key, and a projection. The static projection ignores collapse |
| Full screen: alternate screen, redraw, resize | `paratext/csi.ts:80` exports alternate-screen constants for its `ansi-escapes` drop-in, and synchronized output at `:83` and `:85`. `flagstaff/src/runtime.ts:12` reads `columns` at call time, but nothing re-renders on `resize` | Entering the alternate screen together with its restore, repainting the full frame, and laying out again on `resize` |
| Terminal restored on every exit path | closeout's `restore` phase runs last (`packages/closeout/src/registry.ts:37`, `:45`). `hideCursor` pairs the hide with the show (`cursor.ts:59`) | **Two of R4's three restores.** closeout's R4 requires raw mode off, cursor shown and the alternate screen left (`.sdlc/intents/closeout/spec.md:22`). `cursor.ts` only hides and shows the cursor, and closeout's README says: "Still to come: raw mode and alternate-screen restore" (`packages/closeout/README.md:320`). **A prerequisite** |
| Ink's API: React components, and `Box` laid out by flexbox | Nothing. `caique/src/inquirer-hooks.ts` shows that the family can run an incumbent's own hook loop, but Ink's hooks are React's | A React host (the reconciler's host config), the flexbox subset that Ink's `Box` exposes, and Ink's hooks, all rendering onto controlroom's core |
| Width, wrap, slice, truncate | `linegauge` (`packages/linegauge/src/index.ts:31`) | Nothing |
| Output mode decided once | `roundel/policy` (`packages/roundel/src/policy.ts:18`) | Nothing |
| A static projection for a whole screen | Every component must have `static` (`packages/flagstaff/src/plugin.ts:34`) | A screen-level projection: panes in order, pane labels, and a pane id on every NDJSON event |
| Mouse | Nothing | **Out of scope** |

## The Ink drop-in

### How React components are supported

Ink's public API is React. Programs import `react` themselves and write components and
hooks. A drop-in therefore has to run real React components.

| Option | What it is | Verdict |
| :-- | :-- | :-- |
| **A · the user's own `react`, plus `react-reconciler`, both as optional peers of `controlroom/ink`** | This is the reconciler Ink itself uses. controlroom supplies only the host config, which renders onto controlroom's core | **Recommended.** React behaves exactly as it does in Ink, because it is React's own reconciler, so hooks, effects and context need no reimplementation. `dependencies` stays empty. Neither package is reachable from any other entry point. The price is that migrating is one import plus `npm i react-reconciler`, because Ink used to bring the reconciler along transitively. The drop-in claim says exactly that |
| A2 · the same, with `react-reconciler` in `dependencies` | Keeps the migration to a single import | **Rejected** unless the owner makes an explicit exception. It breaks rule 2 and `scripts/layer-boundaries-lock.test.ts`, and every native-API user would install a reconciler they never load |
| B · our own React-compatible runtime, in the shape of `preact/compat` | Users alias `react` to our runtime | **Rejected for v1.** It is a second product that is larger than the first. Hooks, context, effect ordering and Suspense would all become ours to reproduce. Ink's suite imports `react` directly, so grading it would need module aliasing. It might end up lighter, but that has not been measured |
| C · our own renderer, driving the user's real React through its private internals | No reconciler package at all | **Rejected.** React does not version its internals as public API, so any React minor release could break the drop-in |

**Why optional peers, not required ones.** npm 7 and later install required peers
automatically. A required peer would therefore put `react` and `react-reconciler` into
every `controlroom` install, including native-API installs that never touch React. Optional
peers leave the native closure at zero external packages. `controlroom/ink` checks for its
peers on first import. If one is missing, it throws an error whose `fix` names the install
line.

**Flexbox.** Ink lays out `Box` with yoga. A drop-in that is graded by Ink's suite has to
reproduce that layout for the props Ink exposes. `controlroom/ink` carries **a flexbox subset
implemented in TypeScript**, no yoga, and nothing outside that subpath imports it. The
native API stays arithmetic (constraint 6). This matches the family's standing line that a
drop-in may reproduce its incumbent's behaviour but may not reach outside the family to do
it (`scripts/inline-implementation-lock.test.ts`). Any Ink case whose snapshot depends on
yoga rounding that the subset does not reproduce is listed as a conditional case with its
reason, in the same way as clack's stated subset (D-001). It is never silently passed.

### Size gates, honestly

A bundled reconciler costs about as much as Ink's does. The measurement above shows that
`react-reconciler` is the single largest input to an Ink screen. **So the drop-in makes no
"lighter than Ink" claim unless the weight axis measures one.** The gates are:

| Gate | Measured | Against | Threshold |
| :-- | :-- | :-- | :-- |
| **W1 · the drop-in, bundled** | `controlroom/ink` + `react` + `react-reconciler` | `ink` + `react`, **674,652 B** today | **≤ 1.0×.** At parity with what an Ink user bundles today. The ratio is published whether it is 0.6 or 0.99 |
| **W2 · the drop-in, installed** | `controlroom` + `react` + `react-reconciler`, as packages and bytes | `ink` + `react`: 45 packages and about 8.26 MB today, including `@inkjs/ui` | **≤ 1.0×** on both numbers. The hypothesis is a large reduction here, because none of Ink's other 24 dependencies come along. It stays a hypothesis until the axis prints it |
| **W3 · the native API, bundled** | the `controlroom` root, and the reference demo | `ink` alone (644,976 B), and the Ink screen fixture (727,056 B) | **≤ 1.0×**, and the root resolves neither `react` nor `react-reconciler` (weight lock: `denied`) |
| **W4 · cold start (B2)** | importing `controlroom/ink`, and importing `controlroom` | importing `ink` + `react` | **≤ 1.0×**, as a same-run ratio. There is no baseline today |

The README and the docs site state W1 as **"no heavier than Ink"** until a measured ratio
supports a stronger sentence. W3 is where "lighter than Ink" can honestly be claimed, once
it is measured.

### Phase order

**Recommended: the core first, the drop-in second, and the native layout API alongside or
after the drop-in.** v1 ships when both the `controlroom/ink` row and the reference demo exist.

| Phase | What lands | Why in this order |
| :-- | :-- | :-- |
| **0 · prerequisites** | closeout finishes R4 (raw mode and alternate-screen restore); caique gains `./keys`; flagstaff gains `logTail`, `tabBar` and a pending mark that plugins can replace | Every later phase needs these, and each one belongs to its own package's spec |
| **1 · vendor Ink's suite, with its control run** | Ink's suite in `compat-oracle`, with `--control` graded against real Ink | This is cheap, it sets the denominator before any code is written, and it shows how many cases are layout snapshots or need a PTY. It runs in parallel with phase 0 |
| **2 · the core** | the screen lifecycle, the compositor, keys, the frame-writing seam and the static projection | Both surfaces render onto the core. Building the drop-in first would build a second engine that owns the terminal, and the native API would then have to be retrofitted underneath it |
| **3 · `controlroom/ink`** | the host config onto the core, the flexbox subset and Ink's hooks, with the pass rate ratcheting | This is the migration path for the audience the owner named, and it has an external acceptance gate from the first day |
| **4 · the native layout API** | panes, tabs, focus, collapse, the reference demo and the Gallery | This is the product's own API. The core it stands on is already proven by Ink's suite |

This is the family's pattern. flagstaff's `./ora` is a drop-in built over flagstaff's own
loop, and `roundel/chalk` is built over roundel's own policy. A drop-in built first, on its
own, would reverse that.

## Affected users and systems

**Layering.** Every arrow points up the family or into the foundation (U1). Nothing leaves
the repository (U6). The two optional peers are the user's own packages, and only
`controlroom/ink` reaches them.

| Package | Owns, in this proposal | Change |
| :-- | :-- | :-- |
| **`controlroom`** | layout, tabs, focus, keymaps, collapse, the screen lifecycle, resize, the compositor, and the screen's static projection. **`controlroom/ink`**: the React host config, the flexbox subset and Ink's hooks | New. It depends on `flagstaff`, `caique`, `closeout`, `linegauge` and `roundel`, with optional peers `react` and `react-reconciler` |
| `flagstaff` | Drawing. It gains `logTail` and `tabBar` (inline, output only), a pending mark that plugins can replace, and a frame-writing seam, so that controlroom paints through flagstaff (rule 14: flagstaff is the CSI grid) | Additive. It does not enter the alternate screen, read keys, or depend on caique. `spec.md:892` stands |
| `caique` | Keys. A new `./keys` subpath decodes key presses through `node:readline`'s keypress events, holds keymaps as data, and owns raw mode for the life of a screen. `raw.ts`'s `keyOf` is rebuilt on top of it | Additive |
| `closeout` | Restore. **Finishes its own R4** by adding `rawMode()` and `alternateScreen()` pairings beside `hideCursor` | Completes an existing requirement |
| `linegauge`, `roundel`, `paratext` | Measuring, the mode decision, and OSC | None |
| `compat-oracle` | Ink's vendored suite, its control run, and a host row | New host |
| `burgee` | Later, an optional plugin under U13 | The weight lock keeps `denied` for `.` |

**Composing pays for itself.** `.sdlc/bands/composition.json` lists `caique` and `flagstaff`
as `awaiting` a consumer in the family. controlroom is the first honest consumer of both.

**What the tenth package costs:**

- A row in `.github/vercel-apps.json` and an `apps/docs-controlroom` directory
  (`.sdlc/roadmap/marketing-and-docs.md:108`), plus a Vercel project, a DNS record and an
  Environment, which are the owner's to create.
- A mark drawn under `.sdlc/brand/identity-model.md` ("Adding a package's mark") and
  `.sdlc/brand/commission.md`.
- An npm trusted publisher, which the owner is configuring (`ofri-peretz/burgee`,
  `release.yml`, environment `production`), and a changeset.
- The reservation. **Done:** `controlroom@0.0.1` is published, and the owner task in the
  index is closed.
- `LAYERS` gains a row, which moves `scripts/layer-boundaries-lock.test.ts`'s count from 9
  layers to 10 and from 25 incumbents to 27.
- The "nine packages" sentences in `README.md:38` and `:381` and in
  `.sdlc/roadmap/launch-kit.md` describe what is published today. They move when controlroom
  publishes, not before.

**Callers.** Humans at a terminal get the screen. Agents, CI, screen readers and other
programs get the static projection or the events (rule 5). The caller matrix gains one row
per screen feature.

## Constraints

1. **Every screen has a static projection** (rule 6, U3).
   - In `pipe`, `ci` and `accessible` mode there is no alternate screen, no cursor movement,
     no `\r` and no escape byte.
   - Under `--json`, stdout belongs to the envelope. Screen events go to stderr as NDJSON,
     and each event carries its pane.
   - Off a terminal, tabs do not hide content, and no key hints are printed.
   - A screen or pane without a projection is refused at registration.
   - **For `controlroom/ink`:** where Ink's own non-TTY behaviour differs from this, the suite
     decides what the drop-in does. The difference is written down as a conditional case
     with its reason. It is never silently passed.
2. **Non-TTY never hangs.** No API waits for a key unless the mode is `tty` and stdin is a
   raw-capable TTY. A screen ends when the program's work ends.
   - The native API resolves such a wait at once, or refuses it with a `fix`.
   - If an Ink program on `controlroom/ink` would wait forever for input that cannot arrive,
     it gets an error that has a `fix`. Any Ink case that asserts the wait is listed as a
     divergence.
3. **The terminal is always restored**, through closeout's `restore` phase, on every exit
   path: normal exit, a thrown error, `SIGINT`, `SIGTERM`, `SIGHUP`, a `process.exit()`
   elsewhere, and the deadline. The cursor is shown, raw mode is off and the alternate
   screen is left. Each is registered in the same call that changed it.
   **closeout R4 is a prerequisite**, and nothing ships before it.
4. **No dependency outside the family** (rule 2, U6). `dependencies` names only same-repo
   packages. `react` and `react-reconciler` are **optional peers**, reached only from
   `controlroom/ink`. There is no `yoga-layout`, no `ink`, and no incumbent that a sibling
   replaces.
5. **The layer boundary holds.** controlroom defines no escape sequence of its own. Grid
   writes go through flagstaff. The alternate screen and raw mode go through closeout.
   flagstaff gains no caique arrow, and caique gains no flagstaff arrow.
6. **The native API has no layout engine in the browser sense.** Its layout is arithmetic
   over linegauge's widths. The flexbox subset exists only in `controlroom/ink`, as
   reproduction of the incumbent's behaviour. The subpath-isolation lock keeps it out of
   every other entry point. U8 stays flagstaff's ceiling.
7. **A library, not a framework** (rule 10). The native API needs one import and no build
   step, and has **no JSX**. JSX belongs to the user's Ink program, not to controlroom.
8. **Extendable through one plugin object** (rule 14, `plugin-contract`). Panes, keymaps and
   tab bars are registrations, and the built-ins use the same `register()`.
9. **Nothing reads the world** (rule 14). Streams, `columns` and `rows`, `resize` and the
   clock all come from a `Runtime`.

## Success criteria

1. **The reference demo reproduces the wizard's layout**, and it appears in the Gallery in
   all five modes (`apps/docs/content/docs/gallery.mdx`, generated by
   `npm run gallery:page`). The demo has:
   - a left text pane;
   - a right checklist with `◼ ▶ ◻`, a spinner and `Progress: n/m completed`;
   - a bottom log tail with `┊` and `◆`;
   - four tabs with a generated key-hint line;
   - a collapsible status section.

   The `tty` transcript is byte-identical across 20 runs under `manualClock()`.
2. **The static projection is clean.** The `pipe`, `ci` and `accessible` transcripts
   contain zero `0x1B` bytes and zero `\r`. Under `--json`, stdout carries no events and
   every stderr line parses as JSON with a pane id.
3. **Non-TTY never hangs.** The demo and the Ink screen fixture on `controlroom/ink` both exit
   on their own in 100 of 100 runs, with stdin from `/dev/null` and with stdin a pipe.
4. **The restore matrix passes through a real PTY.** It covers every exit path in
   constraint 3, crossed with the cursor, raw mode and the alternate screen. closeout's R4
   is then met as written.
5. **Ink's suite is vendored with a control run.** `npm run compat -- --control` grades it
   against real `ink@6.8.0` or a later pinned version. The denominator is the reference
   total, and the runner and case counts are recorded.
6. **`controlroom/ink` has a scoreboard row.** Its pass rate is published on
   `/docs/compatibility`, with a control band and a ratchet (U11). Conditional cases are
   listed with their reasons: cases that need a PTY, yoga rounding outside the subset, and
   non-TTY divergences. The Ink screen fixture from [Why now](#why-now) runs on
   `controlroom/ink` with only its import changed and `react-reconciler` installed.
7. **The weight gates W1–W4 are published on `/docs/benchmarks`** as axis records. W1 and
   W2 are measured against `ink` + `react`.
8. **Tests.**
   - Unit tests for every module.
   - `src/shape.test.ts` (U7).
   - Subpath isolation: no entry point except `controlroom/ink` reaches `react`,
     `react-reconciler` or the flexbox subset.
   - The independence install (U12).
   - `sideEffects` and tree-shaking (U10).
   - The plugin-schema lock.
   - `layer-boundaries-lock` with `LAYERS` at ten rows.
   - flagstaff's `logTail` and `tabBar` pass `flagstaff check` in every mode.
   - caique's `raw.ts` suite passes unchanged on top of `./keys`.
9. **The composition band moves up.** `edges` increases, and `caique` and `flagstaff` leave
   `awaiting`.

## Out of scope

- **Mouse** reporting of clicks, the wheel or drags. It is reopened only by an adopter's
  measured need.
- **A `controlroom/ink-ui` drop-in for `@inkjs/ui`.** It follows by the same method once the
  `controlroom/ink` row stands, but it does not gate v1.
- **Yoga, and flexbox outside `controlroom/ink`.**
- **Our own React runtime**, which is option B above.
- **Text editing inside a pane.** Prompts stay with caique.
- **The content of the wizard's `Visualizer` and `HN` tabs.** That is application content.
- **Windows legacy console quirks** beyond what `node:readline` already handles.
- **The wizard's other dependencies**, `yargs ^16.2.0` and `inquirer ^6.2.0`. This intent
  claims nothing about yargs 16 or inquirer 6.
- **The burgee plugin**, until the core and the demo land. It is bound by U13 when it comes.

## Naming

**`controlroom` is the package's name, and it is reserved.** The owner published
`controlroom@0.0.1` on 2026-09-27; the registry records it as `2026-09-28T01:59:41Z` UTC.
A control room is where a system is watched and run from, which is what an interactive
screen is for. Its punctuation twins `control-room` and `control_room` are both free.

**The name took three attempts, all on 2026-09-27**, and each failure is recorded so that
nobody proposes the same name again:

| # | Name | Outcome |
| :-- | :-- | :-- |
| 1 | `chartroom` | **Dropped before publishing.** `chart-room@1.0.0` exists, and npm refuses a name that differs from an existing one only by punctuation. This repo's own research had already recorded the same kind of clash, calling `configchain` "unusable: one hyphen apart" (`.sdlc/research/candidate-layers.md`, §8). The first revision of this intent checked only unhyphenated neighbours and missed this twin. It missed the same problem for its first recommendation, `signalbridge` (`signal-bridge@1.0.23` exists) |
| 2 | `conning` | **Refused by npm at publish time**, with `403 Package name too similar to existing package config`. Before publishing, the registry had returned `404` for `conning`, `con-ning` and `connings`. The index's rule of at least eight characters exists for exactly this: the name was seven characters, and it was rejected against a six-letter package that no neighbour check would have looked at |
| 3 | `controlroom` | **Published as `0.0.1`** (the reservation) |

**The lesson, restated for the next package.** A `404` means unregistered, not publishable.
npm's similarity check compares against short, popular names in ways a hand check cannot
predict: `kerf` was rejected against `keyv`, and `conning` against `config`. The only
reliable test is the reservation publish itself, so a name is chosen by publishing its
reservation, not by reading the registry.

**Reservation** followed the index's "How we take a layer", step 5: a four-file `0.0.1`
stub whose README says what the package is not, pointing at this intent. The owner published
it. The next owner step is the npm trusted publisher: `ofri-peretz/burgee`, `release.yml`,
environment `production`. No `packages/controlroom` directory exists yet. It is created in
phase 0 and 1 work, together with the family registration listed in `spec.md`.

## Open questions

All four were answered by the owner on 2026-09-27 and are closed in D-158.

1. **A new package, or a flagstaff subpath?** **Decided 2026-09-27 → D-158: a new package.**
2. **The name.** **Decided 2026-09-27 → D-158: `controlroom`**, reserved as
   `controlroom@0.0.1`. It is the third pick, after `chartroom` (it clashes with `chart-room`)
   and `conning` (npm refused it as too similar to `config`). See [Naming](#naming).
3. **An Ink drop-in graded by Ink's own suite?** **Decided 2026-09-27 → D-158: yes, in
   v1.** How React is supported, the size gates and the phase order are set out in
   [The Ink drop-in](#the-ink-drop-in) and in `spec.md`.
4. **The nine-package ceiling and "Ink: not planned".** **Decided 2026-09-27 → D-158: both
   restated.** The index now reads ten, and `cli-output-stack` records Ink as planned.
