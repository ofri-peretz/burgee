---
'roundel': minor
---

`roundel/chalk`: chalk 6's public API — the chainable builder with every modifier, colour, `Bright` variant, background and underline style, `rgb`/`hex`/`ansi256` (and `bg`/`underline` forms) downsampled as chalk does, the mutable `level`, `new Chalk({ level })`, `chalkStderr`, `supportsColor`, the name lists — over the tokens' one emitter and the policy's level, detected once at import. Graded by chalk's own suite vendored into compat-oracle: 47 / 58 (the eleven are `FORCE_COLOR` on a pipe, which the policy refuses). `roundel/tokens` gains `sgr()`, the SGR emitter the façade composes with.
