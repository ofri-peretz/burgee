# Intent — interactive-screens: full-screen, keyboard-driven terminal screens without React, with a static projection for every caller

> Stage 1 artifact. Child of [`cli-output-stack`](../cli-output-stack/intent.md), floor
> rows U1, U2, U3, U5, U6, U8, U12, U13. Opened from the owner's remark on 2026-09-27 after
> seeing PostHog's setup wizard: _"I like their CLI's UI, we need to ensure our packages
> offer the same thing."_ **Proposed, awaiting the owner's approval. Nothing is built until
> the owner accepts it** (PRINCIPLES rule 12); the four calls that are the owner's are in
> [Open questions](#open-questions) and in `.sdlc/DECISIONS.md` as D-158.

**Status:** review · **Opened:** 2026-09-27 · **Owner:** @ofri-peretz

---

## What is wanted

A CLI built on this family can draw the kind of screen the owner saw, with no React, no
layout engine borrowed from a browser, and no dependency outside this repository:

- **Panes.** A two-column body, a left text panel ("Learn") and a right checklist
  ("Tasks"), over a bottom log-tail pane.
- **A checklist with states.** Done `◼`, running `▶` with a spinner, pending `◻`, and a
  summary line such as `Progress: 1/9 completed`.
- **A log tail.** The last lines of a stream, prefixed `┊`, with `◆` marking the current
  step.
- **Tabs with key hints.** `Status · Tail logs · Visualizer · HN`, a hint line such as
  `←→ switch tab  s toggle status`, and the keys doing what the hints say.
- **Collapse and expand.** A status section that a key toggles.
- **Full screen.** The alternate screen, redrawn in place, re-laid-out when the terminal is
  resized, and handed back exactly as it was found on every exit path.

The same program, unchanged, prints **stable lines** in `pipe`, `ci` and `accessible` mode
and **NDJSON events** under `--json`. It never shows an interactive screen to a caller that
cannot use one, and it never waits for a key that nobody can press.

### The proposal: one new package, two flagstaff components, and later a burgee plugin

**Recommended.** Three pieces, each in the package that already owns its concern:

1. **A new family package that replaces `ink` and `@inkjs/ui`.** It owns layout (columns,
   rows, splits, fixed and fractional sizes), tabs, focus and keymaps, collapse and expand,
   the alternate screen with resize, and the compositor that puts several live components
   on one screen. It **composes its siblings**: flagstaff components are pane content,
   caique supplies the key reader, closeout does the terminal restore, linegauge does the
   measuring, roundel decides the mode. The name is the owner's; the shortlist is in
   [Naming](#naming).
2. **Two flagstaff components, output only:** a log-tail pane and a tab bar. They ship as
   built-ins through flagstaff's own `register()`, each with a static projection, so they
   also work **inline**, in an ordinary scrolling terminal, in programs that never open a
   screen. They draw; they read no keys.
3. **Later, an optional burgee plugin** so a burgee command can open a screen. It reaches
   the new package only through U13's presence-guarded dynamic `import()` and falls back to
   the static projection when the package is absent. `import 'burgee'` never resolves it.

**Why a new package**, stated as the three rules it follows:

- **The layer rule.** flagstaff is output. A screen needs keys, and keys are caique's (or
  a seam caique owns). If the screen lived in flagstaff, flagstaff would have to depend on
  caique, and every program that only wants a spinner would install the prompt library.
  flagstaff's closure today is `closeout`, `linegauge`, `paratext` and `roundel`
  (`packages/flagstaff/package.json`); none of them reads a key. The other way round is
  also out of bounds: if flagstaff decoded keys itself, it would hand-copy a job another
  layer owns, which `scripts/inline-implementation-lock.test.ts` exists to refuse.
- **Each package is an independent product** (rule 8, U12). A screen is used and chosen on
  its own terms. It has its own incumbent, its own README comparison, its own weight row,
  and its own scoreboard row if a façade is built.
- **One package per incumbent it replaces.** The family's split follows the incumbents'
  split (`packages/compat-oracle/src/demand.ts`, `LAYERS`). Ink and `@inkjs/ui` are one
  incumbent pair, and neither maps to an existing layer.

### Alternatives considered

| Option | What it is | Why not recommended |
| :-- | :-- | :-- |
| **B · a flagstaff subpath** (`flagstaff/screen`) | the whole screen inside flagstaff | flagstaff's own design lists "Full-screen applications, alternate screen buffer, mouse, key input" as **out of scope**, points key input at caique, and calls anything more "a TUI framework and a different product" (`.sdlc/intents/flagstaff/spec.md:892`). U8 forbids flagstaff a layout engine (`.sdlc/intents/flagstaff/intent.md:74`, `packages/flagstaff/src/box.ts:6`). Keys would force the flagstaff → caique arrow described above |
| **C · a caique subpath** | the screen as a kind of prompt | caique is prompts, and a screen is not a prompt. It would need a caique → flagstaff arrow, which does not exist today (burgee spec U1, restated by D-130: `caique → closeout, linegauge`), and every prompt user would install the renderer |
| **D · recommend Ink** | point users at the incumbent | Ink 6.8.0 declares 25 direct dependencies. Six of them are incumbents this family already replaces (see [Why now](#why-now)). Recommending it contradicts U6, and it is the dependency bill the output stack exists to remove |

## Why now

**The ask.** The owner named the target on 2026-09-27. The observed UI is described above.
It was observed by the owner, not read from PostHog's source.

**What the incumbent is.** `npm view @posthog/wizard@2.78.0 dependencies` (2026-09-27)
lists `ink ^6.8.0`, `react ^19.2.4`, `@inkjs/ui ^2.0.0`, `yargs ^16.2.0` and
`inquirer ^6.2.0`. It also lists `@earendil-works/pi-tui ~0.79.8`, so **which library draws
which screen has not been verified from source**. `ink@6.8.0` declares 25 direct
dependencies, including `react-reconciler`, `yoga-layout`, `ws` and `es-toolkit`, and peers
on `react >=19.0.0`. Six of the 25 are incumbents the family's `LAYERS` table already names
as replaced: `chalk` (roundel), `string-width`, `wrap-ansi` and `slice-ansi` (linegauge),
`ansi-escapes` (paratext), and `signal-exit` (closeout).

**What it weighs.** Measured on 2026-09-27 with the weight axis's own flags
(`benchmarks/axes/weight.ts:221`: `esbuild --bundle --minify --format=esm --platform=node
--splitting`). The setup was Node 24.21.0 and esbuild 0.28.2, in a scratch project
installed with `npm i --ignore-scripts ink@6.8.0 react@19.2.4 @inkjs/ui@2.0.0`.
`react-devtools-core` is marked external because it is Ink's optional peer. These are **not
yet axis records**. The axis re-measures them when the pair is added to
`benchmarks/fixtures/entry-points.ts`, and its number is the one that publishes.

| Fixture | Bundled bytes |
| :-- | --: |
| `import { render } from 'ink'`, with `react` external | 644,976 |
| the same, with `react` bundled (ink + react) | 674,652 |
| **an equivalent screen**: `Box`/`Text`/`useInput` from ink and `Spinner` from `@inkjs/ui`: two columns, a tab line, a log pane, arrow keys | **727,056** |

The largest inputs to the screen fixture (unminified, `react` external) are
`react-reconciler` 1,159,551 B, `es-toolkit` 524,514 B, `ink` 169,374 B, `yoga-layout`
134,274 B and `ws` 132,120 B. Installed, the three packages bring **45 packages and about
8.26 MB** to disk (`npm query '*'`, then `find … -type f | stat`, with esbuild excluded).
The weight axis's `installedBytes` is the number that publishes.

**Cold start is unmeasured.** A local 30-spawn attempt gave samples too noisy to cite, and
the two Ink variants disagreed with each other in the impossible direction. The B2 axis
measures this as a same-run ratio (`benchmarks/axes/perf.ts`) and records it; see
[Success criteria](#success-criteria).

**The gap, capability by capability.** "Has" cites the file that does it today. "Missing"
is what the wizard's screen needs that nothing in the family provides.

| Capability in the wizard's UI | The family has it today | Missing |
| :-- | :-- | :-- |
| Two-column body, panes, splits | `flagstaff/box` draws one bordered block as a string (`packages/flagstaff/src/box.ts:91`); `flagstaff/table` draws a grid of cells (`table.ts:117`). Both are string functions | Any split of the screen into regions, and any sizing (fixed, fractional, min/max). No columns primitive exists, although U8 names "columns" as allowed (burgee spec U8, `.sdlc/intents/burgee/spec.md:291`). box.ts:6 says a layout engine "will not" be added to flagstaff |
| Several live components on one screen | `hoist()` raises **one** component (`packages/flagstaff/src/loop.ts:33`). Each TTY projection erases only the lines it last painted (`projection.ts:37`, `:95`) | A compositor. Two components hoisted on one stream are not composed; each repaints relative to the cursor as if it were alone |
| Checklist `◼ ▶ ◻` with a spinner | `flagstaff/tasks`: pending, running (animated by the spinner's frames), ok, fail, warn, info; the static projection is the settled tasks (`packages/flagstaff/src/tasks.ts`) | Pending is drawn as a literal space, "never a glyph a plugin owns" (`tasks.ts:35`), so `◻` cannot be themed. Settled glyphs are already plugin-owned |
| `Progress: 1/9 completed` | `flagstaff/progress`: a count and a percentage, whose static projection is the count (`progress.ts:55`) | Only composition: a summary line derived from the task list. Nothing new |
| Log tail with `┊` and `◆` | The static projection appends only the lines a reader has not seen (`projection.ts`, `staticProjection`). `flagstaff/log-update` repaints a block | A height-bounded tail component (the last _n_ lines, a current-step marker) and a scrollable pane with a scroll offset |
| Tabs with key hints | nothing | A tab bar component (output), tab state and switching (the screen), and a hint line generated from the active keymap, so the hint cannot drift from the binding |
| Keyboard navigation, focus, keymaps | caique decodes six keys, `up down space enter cancel other`, for list prompts (`packages/caique/src/raw.ts:42`, `:49`). `askList` turns raw mode on and off around one prompt (`raw.ts:151`, `:185`). `inquirer-keys.ts:17` types `node:readline`'s `KeypressEvent`, with vim and emacs sets as predicates. `inquirer-hooks.ts` runs `@inquirer/core`'s hook loop | A general decoder (left and right, tab, letters, ctrl and meta), keymaps as data, focus moving between panes, and one raw-mode owner for a screen's whole life rather than per prompt |
| Collapse and expand | nothing | Section state, a key to toggle it, and its projection: a static projection ignores collapse, because a pipe has no viewport |
| Full screen: alternate screen, redraw, resize | `paratext/csi.ts:80` exports `enterAlternativeScreen`/`exitAlternativeScreen` and synchronized-output sequences (`:83`, `:85`) as `ansi-escapes` façade constants. `flagstaff/src/runtime.ts:12` reads `columns` at call time so a resize is seen, but nothing re-renders on `resize` | Entering the alternate screen paired with its restore, a full-frame repaint, and a re-layout on `resize` |
| Terminal restored on every exit path | closeout's `restore` phase runs last (`packages/closeout/src/registry.ts:37`, `:45`). `hideCursor` hides the cursor and registers the show in one call (`cursor.ts:59`); flagstaff and caique both use it | **The other two thirds of closeout's own R4.** The design promises "raw mode off, cursor shown, alternate screen left" (`.sdlc/intents/closeout/spec.md:22`), but `cursor.ts` does hide and show only, and closeout's README says so: "Still to come: raw mode and alternate-screen restore" (`packages/closeout/README.md:320`). caique turns raw mode off in a `finally`, not in the restore phase |
| Width, wrap, slice, truncate | `linegauge`: `width`, `wrap`, `slice`, `truncate`, `widest`, `strip` (`packages/linegauge/src/index.ts:31`) | Nothing; reused as is |
| Output mode decided once | `roundel/policy`: `tty`, `pipe`, `json`, `accessible` and `ci` (`packages/roundel/src/policy.ts:18`) | Nothing; the screen reads it and enters the alternate screen only in `tty` |
| A static projection for a whole screen | every component must have `static` (`packages/flagstaff/src/plugin.ts:34`) | A screen-level projection: pane order, pane labels, and NDJSON events carrying a pane id |
| Mouse | nothing | **Out of scope**; see below |

## Affected users and systems

**Layering.** Every arrow points up the family or into the foundation (U1). Nothing leaves
the repository (U6).

| Package | Owns, in this proposal | Change |
| :-- | :-- | :-- |
| **the new package** | layout (splits and sizes), tabs, focus, keymaps, collapse and expand, the screen lifecycle, resize, the compositor, the screen's static projection | new. Depends on `flagstaff`, `caique`, `closeout`, `linegauge` and `roundel` |
| `flagstaff` | drawing. **New:** `logTail` and `tabBar` components, inline and output only; a plugin-ownable pending glyph; a frame-writing seam, so the new package paints through flagstaff rather than defining its own cursor sequences (rule 14: flagstaff is the CSI grid) | additive. It does **not** enter the alternate screen, read keys, or gain a caique arrow. `spec.md:892` stands |
| `caique` | keys. **New:** a `./keys` subpath, which decodes keys through `node:readline`'s keypress events (a platform component, not a substitute), holds keymaps as data, and owns raw mode for a whole screen. `raw.ts`'s `keyOf` is rebuilt on it, so the family has one key decoder | additive |
| `closeout` | restore. **Finishes its own R4**: `rawMode()` and `alternateScreen()` pairings beside `hideCursor`, each registering its undo in the `restore` phase in the same call that does the thing | completes an existing requirement; no new scope |
| `linegauge` | measuring | none |
| `roundel` | the mode decision | none |
| `paratext` | none. It keeps the alternate-screen **constants** for its `ansi-escapes` façade; the family's pairing of enter with restore is closeout's, as `packages/paratext/src/index.ts:15` already records | none |
| `burgee` | later: an optional plugin under U13 | the weight lock keeps `denied` for `.` |

**What composing costs, and what it pays.** The new package's install closure is five
same-repo packages and nothing else. In exchange, `.sdlc/bands/composition.json` currently
lists `caique` and `flagstaff` as `awaiting`, meaning no package in the family uses them.
This package would be the first honest consumer of both, and that list would shrink by two.

**What a tenth package costs.** Stated so the owner decides with the full bill in view:

- **A docs app.** One row in `.github/vercel-apps.json` and one `apps/docs-<name>`
  directory, with no workflow edit (`.sdlc/roadmap/marketing-and-docs.md:108`). Plus a
  Vercel project, a DNS record and an Environment, which are the owner's
  (`.sdlc/intents/README.md`, Execution status).
- **A mark.** Drawn under `.sdlc/brand/identity-model.md` ("Adding a package's mark") and
  the hard constraints in `.sdlc/brand/commission.md`: the palette, the Interlace mark,
  3:1 contrast, legibility at 16px.
- **Release wiring.** An npm trusted publisher for the new name (the owner's, npm 2FA), a
  changeset, and the name reserved honestly first (README, "How we take a layer", step 5).
- **Locks that count to nine, which move deliberately.** `LAYERS` in
  `packages/compat-oracle/src/demand.ts` gains a row. `scripts/layer-boundaries-lock.test.ts`
  asserts exactly 9 layers and 25 incumbents. `scripts/intent-artifacts-lock.test.ts` then
  requires an `intent.md` and a `spec.md` under the package's own name.
- **Published claims.** "Nine packages" appears in `README.md:38` and `:381`, in
  `.sdlc/roadmap/launch-kit.md`, and as **"Nine packages is the ceiling for this repo"**
  (`.sdlc/intents/README.md:401`). That last one is a stated ceiling, and moving it is the
  owner's.
- **A recorded "not planned".** `cli-output-stack` says "Not planned, on purpose: **Ink**"
  (`.sdlc/intents/cli-output-stack/intent.md:127`). flagstaff's design rejects "A React
  reconciler (Ink's model)" (`spec.md:879`). This proposal keeps both reasons: it has no
  React and no reconciler. What it reverses is only "not planned", and that line is
  restated on acceptance.

**Callers.** Humans at a terminal get the screen. Agents, CI, screen readers and other
programs get the static projection or the events (rule 5). The caller matrix
(`caller-matrix`) gains one row per screen feature.

## Constraints

1. **Every screen has a static projection** (rule 6, U3). In `pipe`, `ci` and `accessible`
   mode the program prints stable lines, **never** an interactive screen: no alternate
   screen, no cursor movement, no carriage return, no escape byte. Under `--json`, stdout is
   the envelope's and screen events go to stderr as NDJSON, one per transition, each
   carrying its pane. This is flagstaff's convention (`projection.ts`, `jsonProjection`),
   not a new one. Tabs do not hide content off a terminal: every pane's projection is
   printed, in declared order, because nobody can press `→`. Key hints are not printed off
   a terminal, because they name keys that cannot be pressed. A screen or pane without a
   projection is refused at registration.
2. **Non-TTY never hangs.** No API waits for a key unless the mode is `tty` and stdin is a
   raw-capable TTY (`canRender`'s test, `raw.ts:66`). A screen ends when the program's work
   ends. A "press q to quit" binding is a `tty` affordance, never the only way out. An API
   that would otherwise wait resolves immediately with the static result, or refuses with a
   `fix`, in the manner of caique's decision table.
3. **The terminal is always restored**, through closeout's `restore` phase, on every exit
   path: a normal exit, a thrown handler, `SIGINT`, `SIGTERM`, `SIGHUP`, `process.exit()`
   elsewhere, and the deadline firing. That means cursor shown, raw mode off and the
   alternate screen left. Each is registered in the same call that changed it, so the change
   and its undo cannot drift. No package in this proposal restores the terminal outside
   closeout.
4. **No dependency outside the family** (rule 2, U6): no `react`, no `react-reconciler`, no
   `yoga-layout`, no `ink`, and no incumbent a sibling replaces
   (`scripts/layer-boundaries-lock.test.ts`).
5. **The layer boundary holds.** The new package defines **no escape sequence of its own**.
   Grid writes go through flagstaff, and the alternate screen and raw mode go through
   closeout. flagstaff gains **no** caique arrow and enters no alternate screen. caique
   gains no flagstaff arrow.
6. **No layout engine in the browser sense.** Layout is arithmetic over linegauge's widths:
   splits, fixed and fractional sizes, and minimums. There is no flexbox, no constraint
   solver, no measure-then-layout pass over arbitrary trees, and no yoga. U8 stays
   flagstaff's ceiling, and this package is where the owner's "different package" in
   `box.ts:6` lands.
7. **A library, not a framework** (rule 10): one import, one file, no build step, **no
   JSX**. A screen is declared as data plus handlers.
8. **Extendable through one plugin object** (rule 14, `plugin-contract`). Panes, keymaps
   and tab bars from a third party are registrations, validated by the family schema. The
   built-ins go through the same `register()`.
9. **Nothing reads the world** (rule 14, dependency inversion). Streams, `columns`/`rows`,
   `resize` and the clock come from a `Runtime`, so a screen snapshots byte for byte under
   `manualClock()` (`loop.ts`).
10. **Nothing is built until the owner accepts this intent.** The name is not reserved,
    and no spec is written ahead of the gate.

## Success criteria

Each line is checkable by a command or a test. Criteria 1–4 are the non-negotiables made
executable.

1. **The reference demo exists and reproduces the wizard's layout.** It has a left text
   pane, a right checklist (`◼ ▶ ◻`, a spinner, `Progress: n/m completed`), a bottom log
   tail (`┊`, `◆`), four tabs with a generated key-hint line, and a collapsible status
   section. It is rendered **in all five modes** on the Gallery page
   (`apps/docs/content/docs/gallery.mdx`, generated by `npm run gallery:page`), with the
   `tty` row showing the frames and every other row showing the projection. The `tty`
   transcript is byte-identical across 20 runs under `manualClock()`.
2. **The static projection is clean.** The demo's `pipe`, `ci` and `accessible`
   transcripts contain zero `0x1B` bytes and zero `\r`. Under `--json`, stdout is empty of
   events and every stderr line parses as JSON with a pane id. A test asserts both.
3. **Non-TTY never hangs.** The demo run with stdin from `/dev/null` and with stdin a pipe
   exits on its own in 100 of 100 runs, under a timeout the test states. A keypress-waiting
   API called off a TTY returns or refuses with a `fix` rather than waiting.
4. **The restore matrix is green through a real PTY, not a synthetic key stream.** This
   covers every exit path in constraint 3, each crossed with the three states (cursor, raw
   mode, alternate screen). The transcript ends with the cursor shown and the alternate
   screen left, and the TTY reports raw mode off. closeout's R4 is then met as written.
5. **Weight (B4), against the incumbent.** The new package's entry and the demo-equivalent
   fixture are added to `benchmarks/fixtures/entry-points.ts` beside `ink` alone, `ink` +
   `react`, and the Ink screen fixture above. The gate is **≤ 1.0×** each incumbent, the
   family's standing rule (U5), and the ratio is published on `/docs/benchmarks`. The
   hypothesis is that the ratio is far below that, since the bulk of 727,056 B is
   `react-reconciler`, `es-toolkit` and `yoga-layout`, none of which this needs. It is a
   hypothesis until the axis prints it. The installed row reads **0 external** against
   Ink's closure.
6. **Cold start (B2), against Ink.** The perf axis's same-run ratio of importing the new
   package against importing `ink` + `react`, gated at ≤ 1.0× and published. There is no
   baseline today, and none is claimed.
7. **Tests.** Each module has unit tests. The package also passes the family's standing
   locks: its own `src/shape.test.ts` (U7), subpath isolation, the independence install
   (U12), `sideEffects` and tree-shake (U10), the plugin-schema lock, and
   `layer-boundaries-lock` with `LAYERS` at ten rows. flagstaff's `logTail` and `tabBar`
   pass `flagstaff check` in every mode and are registered through `register()` and nothing
   else. caique's `raw.ts` passes its existing suite on the new `./keys` decoder, unchanged.
8. **Composition moves the right way.** `.sdlc/bands/composition.json`'s `edges` goes up,
   and `caique` and `flagstaff` leave `awaiting`.

## Out of scope

- **Mouse**, including click, wheel and drag reporting. It adds an input protocol per
  terminal and has no static projection worth the name. Keys first. It is reopened only by
  an adopter's request with a measured need.
- **An Ink or `@inkjs/ui` façade in the first release.** This is open question 3; the
  default is not to build one yet.
- **React, JSX, a reconciler, flexbox, yoga, or any constraint solver.**
- **Text editing inside a pane.** Prompts stay caique's. Whether a screen hosts a caique
  prompt in a pane is a design question for `spec.md`, not a new widget set.
- **The content of the wizard's `Visualizer` and `HN` tabs.** They are application
  content, not framework surface.
- **Windows legacy console quirks** beyond what `node:readline` already handles, as in
  flagstaff.
- **The wizard's other dependencies.** It also uses `yargs ^16.2.0` and `inquirer ^6.2.0`.
  `burgee/yargs` is graded against yargs 18.1.0 and `caique/inquirer` against its own
  vendored suite. **This intent claims nothing about yargs 16 or inquirer 6.**
- **The burgee plugin**, until the new package and its demo land. When it comes, it is
  bound by U13.

## Naming

Checked against the registry on 2026-09-27 (`npm view <name> name`; `E404` means free), and
held to the repo's naming rules: at least eight characters, edit-distance-one neighbours
checked, no `<parent>-<thing>` form.

| Name | Registry | Meaning | Note |
| :-- | :-- | :-- | :-- |
| **`signalbridge`** | free | the ship's station where flag signals are displayed and read | **recommended.** It sits in the flag register with `burgee`, `roundel` and `flagstaff`, and it is what the package is for: a screen that shows the state of everything. Neighbours `signalbrige` and `signalbridges` are also free |
| **`chartroom`** | free | where charts are laid out side by side | **alternate.** This is the layout meaning. Neighbours `chartoom` and `chartrooms` are also free |
| `jackstaff` | free | the small staff at the bow that flies the jack | **rejected.** It is too close to `flagstaff`: the same `-staff`, the same register, and it would read as flagstaff's accessory, which is what rule 8 forbids a name to say |
| `bridge`, `helm`, `wheelhouse`, `binnacle`, `ensign`, `pennant`, `masthead`, `crowsnest`, `quarterdeck` | taken | — | — |

Also free and not shortlisted: `taffrail`, `bowsprit`, `gunwale`, `companionway`,
`sternsheets`, `foredeck` and `spinnaker`. **The owner picks.** A 404 is not publishable
until `npm publish` passes npm's similarity check (README, "How we take a layer", step 4).

## Open questions

All four are the owner's under `.sdlc/DECISIONS.md`'s escalation table, because each
concerns a package's identity or a published claim. Each is recorded in D-158 with a
default, and **the default stands until the owner answers.**

1. **A new package, or a flagstaff subpath?** **Decided 2026-09-27 → D-158 (owner's call;
   default stands).** The default is a new package, for the three reasons under
   [The proposal](#the-proposal-one-new-package-two-flagstaff-components-and-later-a-burgee-plugin).
   The subpath's real advantage is that it costs no tenth docs app, mark, publisher or lock
   bump. Its cost is flagstaff's identity: flagstaff would become the TUI framework its
   own design says it is not.
2. **The name.** **Decided 2026-09-27 → D-158 (owner's call; default stands).** The default
   is `signalbridge`, with `chartroom` as the alternate. Nothing is reserved until the
   owner chooses, because reserving is publishing.
3. **An Ink-compatible façade, graded by Ink's own suite, as the other drop-ins are?**
   **Decided 2026-09-27 → D-158 (owner's call; default stands).** The trade-off:

   **For.** Rule 3 says every product that replaces something ships a façade graded by
   the incumbent's suite. That is how commander, yargs, chalk, ora, boxen and log-update
   were taken. The CLI the owner pointed at is an Ink program, so a façade is the
   one-import migration for exactly that audience.

   **Against.** Ink's public API is React: components and hooks, with `react` imported by
   the user's own code. A faithful façade therefore needs a React-compatible reconciler.
   Either it depends on `react-reconciler`, the largest single input in the measurement
   above at 1,159,551 B, and breaks U6 or ships the bill this package exists to remove.
   Or it builds a React-compatible runtime of its own, a second product larger than the
   first. That is why `cli-output-stack` recorded Ink as not planned and flagstaff
   rejected a reconciler. Grading has a second problem: any Ink case that snapshots
   yoga's flexbox arithmetic is a case a flexbox-free package fails by design. clack's
   row settled the same shape of problem as a stated subset (D-001).

   **In between, unknown.** A subpath that peers on the user's own `react` would add
   nothing to an existing Ink app's install and nothing to anyone else's. Whether it can
   work without `react-reconciler` is unknown. caique's `inquirer-hooks.ts` shows the
   family can run an incumbent's hook loop without React, but `@inquirer/core`'s hooks
   are its own, while Ink's are React's. Ink's suite (size, runner, and how many cases
   are layout snapshots) is **recorded when vendored** (rule 4), not estimated here.

   **Default:** no façade in the first release. After the package and the reference
   demo land, a spike vendors Ink's suite, counts its cases by kind, and tests whether a
   React-peer façade can hold U6. The owner decides on those numbers.
4. **The nine-package ceiling and the Ink "not planned" line.** **Decided 2026-09-27 →
   D-158 (owner's call; default stands).** `.sdlc/intents/README.md:401` says nine is the
   ceiling, justified by rule 10's context budget, and `cli-output-stack` says Ink is not
   planned. The default is that both lines are restated on acceptance, with the reason:
   this package does not fragment an existing layer, which is the danger the ceiling
   guards against. It is the one incumbent family with no layer at all. If the owner holds
   the ceiling at nine, alternative B is the fallback.
