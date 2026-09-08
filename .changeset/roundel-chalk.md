---
'roundel': minor
---

`roundel/chalk`: chalk 6's public API — the chainable builder with every modifier, colour, `Bright` variant, background and underline style, `rgb`/`hex`/`ansi256` (and `bg`/`underline` forms) downsampled as chalk does, the mutable `level`, `new Chalk({ level })`, `chalkStderr`, `supportsColor`, the name lists — over the tokens' one emitter and the policy's level, detected once at import. Graded by chalk's own suite vendored into compat-oracle: **58 / 58**. `roundel/tokens` gains `sgr()`, the SGR emitter the façade composes with.

`roundel/policy`: `colorLevel()` now obeys the user's explicit colour instruction in any output mode, not only on a TTY (design R2, revised 2026-09-08). `NO_COLOR` still wins outright; `FORCE_COLOR` names an *exact* level (`FORCE_COLOR=2` is 2, not "2 or better") or, as `true`/empty, only enables colour and lets `TERM`/`COLORTERM` decide; the `--color` flags are read from a new optional `argv` on the policy's runtime shape and outrank a numeric `FORCE_COLOR`. A pipe nobody asked to colour is still 0 (Azure Pipelines excepted, where chalk excepts it), but a run that *does* ask now gets its CI vendor's level — so `FORCE_COLOR=true` on GitHub Actions gives truecolor logs. The output mode still decides redraws, and `--json` is still always 0.
