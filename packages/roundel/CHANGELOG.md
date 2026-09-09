# roundel

## 0.1.0

### Minor Changes

- [#44](https://github.com/ofri-peretz/burgee/pull/44) [`183ebc9`](https://github.com/ofri-peretz/burgee/commit/183ebc90d38c7a23afda1f923c9b147560458334) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `roundel/chalk`: chalk 6's public API — the chainable builder with every modifier, colour, `Bright` variant, background and underline style, `rgb`/`hex`/`ansi256` (and `bg`/`underline` forms) downsampled as chalk does, the mutable `level`, `new Chalk({ level })`, `chalkStderr`, `supportsColor`, the name lists — over the tokens' one emitter and the policy's level, detected once at import. Graded by chalk's own suite vendored into compat-oracle: **58 / 58**. `roundel/tokens` gains `sgr()`, the SGR emitter the façade composes with.

  `roundel/policy`: `colorLevel()` now obeys the user's explicit colour instruction in any output mode, not only on a TTY (design R2, revised 2026-09-08). `NO_COLOR` still wins outright; `FORCE_COLOR` names an _exact_ level (`FORCE_COLOR=2` is 2, not "2 or better") or, as `true`/empty, only enables colour and lets `TERM`/`COLORTERM` decide; the `--color` flags are read from a new optional `argv` on the policy's runtime shape and outrank a numeric `FORCE_COLOR`. A pipe nobody asked to colour is still 0 (Azure Pipelines excepted, where chalk excepts it), but a run that _does_ ask now gets its CI vendor's level — so `FORCE_COLOR=true` on GitHub Actions gives truecolor logs. The output mode still decides redraws, and `--json` is still always 0.

- [#25](https://github.com/ofri-peretz/burgee/pull/25) [`c65bad8`](https://github.com/ofri-peretz/burgee/commit/c65bad85111fd29a2c5941ea2b3b7d6034dff7ff) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - First working release: `roundel/policy` (`outputMode`, `colorLevel`), `roundel/tokens` (nine semantic tokens over `util.styleText`), `roundel/theme` (`fly()`, the burgee brand by default, hex → nearest 256/16 fallback) and `roundel/contrast` (the WCAG maths `fly()` refuses a theme with) — zero dependencies, each subpath weighed and isolated by its own lock.
