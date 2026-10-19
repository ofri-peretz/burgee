---
"roundel": minor
---

New entry point `roundel/supports-color`: supports-color 11's default `{ stdout, stderr }` and its `createSupportsColor(stream, options)`, graded 55 / 55 by supports-color 11.0.0's own `test.js`, level with supports-color itself, and bundled at 1,807 B against supports-color's 2,145. It answers in supports-color's order, which differs from `roundel/policy` in two places on purpose: a set `FORCE_COLOR` outranks `--no-color` there, and `NO_COLOR` is not read. `roundel/policy` does not change.
