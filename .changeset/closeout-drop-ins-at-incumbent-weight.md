---
"closeout": patch
---

`closeout/exit-hook` and `closeout/signal-exit` now bundle lighter than the packages they replace. `closeout/exit-hook` is 1,579 B against exit-hook 5.1.0's 1,645 B, down from 4,819 B, and `closeout/signal-exit` is 2,656 B against signal-exit 4.1.0's 2,856 B, down from 3,634 B (esbuild, minified, one imported name). `closeout/exit-hook` no longer runs on closeout's registry. It runs exit-hook's own shutdown, so it now behaves as exit-hook does in three places it did not before: it prints nothing when `max(wait)` runs out, its hooks are not ordered against closeout's own `restore` phase, and a hook that throws is not caught. closeout's `onExit` keeps all three. `closeout/signal-exit` gains an `import` build beside its CommonJS one, as signal-exit ships both: `import` loads an ES module and `require()` the CommonJS file, over the same code and one shared emitter. Grades are unchanged: exit-hook 21 / 21, and signal-exit level with signal-exit itself.
