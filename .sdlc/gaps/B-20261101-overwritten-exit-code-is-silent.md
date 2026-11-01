---
id: B-20261101-overwritten-exit-code-is-silent
section: B
status: open
source: first-adopter A4, oxmutate adoption report breakage 1 (`.sdlc/research/adoption/oxmutate.md`)
recommendation: 'When a handler returns and `process.exitCode` is already a non-zero code that differs from the one burgee is about to set, burgee says so on stderr in development (not under `--json`, `--mcp` or `NODE_ENV=production`), naming both codes and the `exitCode`-on-the-data form. A case with a handler that sets `process.exitCode = 1` and returns plain data, proven red on `burgee@1.9.4` first, where the run exits 0 and prints nothing'
---

oxmutate's `--break` never failed a run before `8c72f54515` (2026-10-27). The handler set
`process.exitCode = 1` through oxmutate's own runtime seam and returned its data. burgee takes the
exit code from the returned data (`exitCodeOf` in `packages/burgee/src/execute.ts`), found none, and
wrote `0` over the `1` without a word. oxmutate's own e2e test for a score below the threshold
caught it the same day.

The report filed no gap for it. The adoption report proposes a development-time warning. Whether
burgee should warn, and where, is the decision: it adds output a caller can see, so it is B. The
convention behind it is
[B-20261101-handler-exit-code-with-data-untyped](./B-20261101-handler-exit-code-with-data-untyped.md);
either one alone would have caught this one.
