---
id: D-20261005-flagstaff-frame-seam
subject: 'How flagstaff builds controlroom R3 and R16: the frame seam''s shape, two components that are both factories and registered built-ins, and where the widget contract is pinned'
taken: Taken
date: '2026-10-05'
superseded_by: —
---

**The seam is a stateful writer, `frameWriter(out) → { paint(lines), release() }`, exported
from `flagstaff/loop`; `logTail` and `tabBar` are factories that also register their default
instance through the public `register()` when their subpath loads; the widget contract is
pinned in `packages/flagstaff/src/widget-contract.d.ts`.** Taken in the flagstaff lane of
controlroom phase 0, under the default in `.sdlc/DECISIONS.md` (decide, record, continue).
Nothing here moves a ceiling or a published number.

## 1. The frame seam

- **Stateful, not a pure function.** "Diffed line by line" needs the last frame, so the seam
  is a writer that remembers it: `paint(lines)` writes the difference, `release()` forgets the
  frame without erasing it (it becomes scrollback). A pure `(before, after) → bytes` would
  hand every caller the bookkeeping of row counts at the width each frame was painted at.
- **The diff.** Leading lines that did not change are not written. A changed line that is one
  row before and after is rewritten in place (`CSI 1G`, a vertical move, `CSI 2K`), under
  DECSC/DECRC so the cursor ends where it rested. The first change that moves a row boundary —
  a line that wraps differently, a line added or removed, a new width, or a change on the last
  line — rewrites from there with `CSI 0J`. A frame identical to the last writes nothing.
- **Synchronized output is spelled in `projection.ts`**, not imported from `paratext/csi`:
  two eight-byte constants against a new edge into paratext's runtime seam for every program
  that hoists. The module already spells its CSI erase by hand.
- **`ttyProjection` paints through the seam.** So the bytes a hoisted component writes on a
  terminal changed: each frame is now one `ESC[?2026h … ESC[?2026l` block, a repaint of
  identical text writes nothing, and a multi-line frame whose first line alone changed is
  edited in place rather than erased and redrawn. A terminal that does not know mode 2026
  ignores it. Every transcript test was updated to the new bytes, and the screen-level
  assertions (the wrapped-row case, the shape test's tarball run) are unchanged in what they
  show. `./loop` is 6,746 B against a 7,000 budget, `.` 28,656 B against 29,300; neither
  budget moved.

## 2. `logTail` and `tabBar`: factories, and registered

D-125 says the built-in *components* are factories, not plugin contributions, because their
options do not fit the component shape. controlroom R3 says both new components "register
through `register()`". Both hold:

- `logTail({ height })` and `tabBar({ separator })` are factories on their own subpaths, like
  `tasks`.
- Each module registers its default instance — with a `sample` — under the plugin name
  `flagstaff`, as `log-tail` and `tab-bar`, through the same `register()` a plugin uses. A
  plugin that registers a component of the same name replaces it, and controlroom can look a
  tab bar up by name (its R10).
- **The cost:** registering at load is a top-level call to an imported function, so both
  files are listed in `sideEffects` (`scripts/side-effects-lock.test.ts`, rule 3), and neither
  is re-exported from the root — `import 'flagstaff'` keeps every one of its modules
  droppable. Each subpath carries the plugin host, as `./tasks` does: 11,879 B and 10,893 B.
- **The alternative not taken:** the two components inside `builtins.ts`. That would have put
  their code into every subpath that reads the registry (`./spinner`, `./tasks`, `./box`,
  `./plugin`), about 2.8 KB each, and pushed `./spinner` past its ceiling.

## 3. What each static projection is

- **`logTail`'s static is the whole stream, never the window.** `staticProjection` prints the
  lines past the common prefix with what it printed last, so a growing stream appends each line
  once. A static of the window would slide, share no prefix, and print the window on every
  line; the pipe test is proven red against that mutation. The current-step mark is a property
  of the entry (`{ step }`), not of its position, so a printed line never changes later.
- **`tabBar`'s static is the active label.** Out of range is the empty string, which prints
  nothing.
- **Without colour, the active tab is bracketed.** When `heading` paints nothing, `[Tail logs]`
  — otherwise a terminal with `NO_COLOR` shows no active tab at all.

## 4. Glyphs

`pending` (a space, so a task list looks as it did), `tail` (`┊`) and `step` (`◆`) join the
built-in glyphs. The literal pending space in `tasks.ts` is gone.

## 5. Where the widget contract lives (R16)

`packages/flagstaff/src/widget-contract.d.ts` declares `Writer`, `Clock`, `Component`,
`FrameWriter` and `frameWriter` exactly as flagstaff publishes them. A `.d.ts` in `src/` is
type-checked and never emitted, so it costs the tarball nothing.
`src/widget-contract.test.ts` holds the published `dist/*.d.ts` declarations to it word for
word (comments and layout aside) and the types to it both ways through `expectTypeOf`, which
`npm run typecheck` checks. controlroom keeps a byte-identical copy, and its own lock holds that
copy to this file, so a change made on one side alone turns the other red.
