---
"provedone": minor
---

`intent check` and `intent new` read a repository's own design file name: `design.md` beside
`intent.md` counts as the spec, and `intent new` copies whichever of `spec.md` or `design.md` the
`_template/` holds. Each `fix:` now names that file and the `--dir` given, not always
`.sdlc/intents/<slug>/spec.md`. On eslint's `docs/intents` this turns 32 false "has no spec.md"
findings into 0.
