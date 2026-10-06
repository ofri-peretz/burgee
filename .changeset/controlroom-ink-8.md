---
"controlroom": minor
---

`controlroom/ink` is ink 8.0.0's API, graded 1304 / 1304 by ink 8's own suite (control 1303 / 1304). New: `usePaste`, `useAnimation`, `useBoxMetrics`, `useWindowSize`, `suspendTerminal` and `waitUntilRenderFlush` on `useApp`, the `alternateScreen` and `interactive` options, `wrap="hard"`, and the yoga props ink 8 sets — `maxWidth`/`maxHeight`, `aspectRatio`, `top`/`right`/`bottom`/`left`, `position: static`, `alignContent`. Where ink 8 changed ink 6's answer, the drop-in follows ink 8: the kitty keyboard answer is read off the input stream, Delete is no longer read as Backspace, and a non-interactive debug run ends with a newline.
