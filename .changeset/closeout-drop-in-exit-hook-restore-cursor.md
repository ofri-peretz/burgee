---
'closeout': minor
---

Two graded drop-in paths: `closeout/exit-hook` and `closeout/restore-cursor`.

Both are new subpath exports, and both are graded by the incumbent's own unedited test suite
through `compat-oracle`, with `--control` — the same suite run against the incumbent itself —
proving the gate first: `exit-hook@5.1.0` 21 / 21 against a 21 / 21 control, and
`restore-cursor@5.1.0` 6 / 6 against a 6 / 6 control. `overrides: { "exit-hook":
"npm:closeout@^0.1" }` and the same for `restore-cursor` now resolve.

`closeout/exit-hook` keeps the incumbent's per-hook `{ wait }` bound rather than imposing
closeout's own 2 000 ms deadline — the incumbent's own suite registers a hook with
`wait: 2000`, and a drop-in that silently tightens a caller's timeout is not a drop-in.
closeout's bounded shutdown stays in `onExit()`.

Nothing a caller already imports changed. Internally the signal wiring moved from `index.ts`
to `install.ts` and the guarded `globalThis.process` lookup to `ambient.ts`, so the two
façades can reach them without importing the package's own entry; `index.ts` re-exports every
name it exported before.
