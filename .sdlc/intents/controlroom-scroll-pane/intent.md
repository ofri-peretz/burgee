# Intent — A controlroom pane scrolls

> Stage 1 artifact. Opened from the wave-3 ranking
> ([`next-wave-3-2026-10.md`](../../research/next-wave-3-2026-10.md)). Scrolling is the
> longest-running open request on Ink, the incumbent controlroom replaces. controlroom's own
> intent lists a scrollable pane as needed and unbuilt.

**Status:** approved · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz

---

## What is wanted

A pane whose content is taller than its rectangle can be scrolled by the person at the screen:
arrows, PgUp/PgDn, Home/End, bound in the keymap as data like every other action. A pane at its
bottom follows new lines (a log tail). A pane scrolled up stays where it was put, and a hint says
how many lines are below. The static projection, for a pipe, CI, a screen reader or an agent,
prints every line of every pane, because nobody there can press a key.

## Why now

- **Demand.** ink #222, *"Scrolling"*: opened 2019, open, **23 comments** re-read on github.com
  2026-10-12. The comments carry 22 reactions between them; the 2026-09-08 dump in
  `.sdlc/research/output-stack-open-issues.md` §10 records 9 on the issue. ink #765, `overflow:
  scroll` with a virtual scrollbar (9 reactions, from the Gemini CLI team, reopened). The
  research note's U8 row cites both for "no layout engine".
- **controlroom says it is missing.** `.sdlc/intents/controlroom/intent.md` line 172 lists *"a
  height-bounded tail component and a scrollable pane"* as needed.
  `packages/flagstaff/src/log-tail.ts` line 3 hands it over: *"a scrollable pane is
  controlroom's"*.
- **The tree cuts instead.** `fit` in `packages/controlroom/src/compose.ts` (line 36) keeps the
  first `height` rows of a pane and drops the rest, with no offset and no way to reach them.
  `ScreenState` in `tabs.ts` has tabs, focus and collapse, and no scroll.

## Affected users and systems

- `packages/controlroom`: `tabs.ts` (state, reducer, default keymap, hints), `compose.ts`
  (`fit` with an offset).
- `controlroom/ink` is not changed. Ink's `overflow: scroll` is outside its graded subset
  (`packages/controlroom/src/ink/flex.ts` line 12), and ink 8 does not have it either.

## Constraints

- **The static projection is the whole content.** Scroll state never reaches it (controlroom's
  R6 rule for `liveOnly`).
- **The keymap is data.** Scrolling is a set of actions, bound by default and rebindable, shown
  in the hint line by the existing `hints()`.
- **The reducer stays pure.** The offset is state the reducer computes from actions and the
  content height. No component keeps its own.

## Success criteria

1. A 200-line pane in a 20-row rectangle shows rows 1–20. PgDn shows 21–40, End shows the last
   20, and a new line at the end stays visible while the pane is at its bottom.
2. Scrolled up, a new line does not move the view, and the hint shows `↓ N`.
3. Piped, the same screen prints all 200 lines.
4. A resize clamps the offset, so the view never sits past the end.

## Open questions

- Which pane receives scroll keys. **Answered 2026-10-12 in `spec.md`**: the focused one, using
  the focus order `ScreenState.panes` already keeps.
- Mouse wheel. **Answered 2026-10-12 in `spec.md`**: out of scope. controlroom puts mouse input
  out of scope.
