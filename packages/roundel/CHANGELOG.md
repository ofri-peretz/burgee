# roundel

## 0.2.0

### Minor Changes

- [#78](https://github.com/ofri-peretz/burgee/pull/78) [`7c5eeb0`](https://github.com/ofri-peretz/burgee/commit/7c5eeb0c04a9a692db748ea7f3ccb2f3339fa5a2) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Add `roundel/plugin`: a plugin ships a theme, and roundel reads it.

  `tokens` has been in the plugin schema all along, described as "a roundel theme", with
  nothing to read it — a plugin that shipped one was validated and then ignored. `register()`
  now collects them, `theme()` hands the result to `fly()`, and `contributions()` reports
  which plugin won each token and which it shadowed.

  The same plugin object works on any subset of the family: keys roundel does not understand —
  `glyphs`, `spinners`, `components` — are ignored, not refused. A misspelt token name _is_
  refused, naming the ten valid ones, because a silently dropped `errror` looks like it worked.

  Registering does not fly the theme; the program still calls `fly()` once, and a plugin token
  below 4.5:1 throws there exactly as a hand-written one does. Nothing is imported from
  flagstaff — the plugin shape is declared structurally, so no package in the family requires
  another. The subpath reaches no module at all: 2,812 B, most of it refusal messages.

### Patch Changes

- [#82](https://github.com/ofri-peretz/burgee/pull/82) [`61bd11b`](https://github.com/ofri-peretz/burgee/commit/61bd11b9a1bf1fe73dd5a6e76e0898614e988ec7) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - One door into the registry, and a `check` that grades what it actually found.

  `registered()` handed out the live registry behind a `Readonly<Registry>` type that freezes
  property bindings, not the `Map`s behind them — so `registered().spinners.set(…)` put a
  spinner with no static projection where `spinner()` would find it, and `.clear()` removed
  the built-ins. It now returns a copy over the frozen objects `register()` stores, which
  makes U3's "a contribution without a static projection is refused at the door" a property of
  the code rather than advice. Registering also copies: edit your plugin object afterwards and
  the registry does not change.

  `flagstaff check` opens with a census of the contributions it found and closes with the
  verdict, so `ok` is never printed before the rendering that would justify it. A plugin whose
  keys are misspelled — the schema allows unknown keys on purpose, for the rest of the family —
  is now `E_NO_CONTRIBUTION` and exit 1 with the unknown keys named, rather than `ok` and exit 0. Each component block states the state it was rendered with: a component may declare
  `sample: { running, done }`, and without one the assumed `{ phase }` shape is said out loud
  instead of silently invented. A `static` that throws is `E_COMPONENT_THREW` with a fix and
  the modes it broke in, rather than an uncaught crash after an `ok`.

  roundel is bumped with it because the plugin schema is hosted in both packages and both
  publish it: `packages/roundel/src/schema.json` gained the same `sample` key, and
  `plugin-schema-lock.test.ts` requires the two to be byte-identical. Without a roundel
  release the copies would agree in git and disagree in the registry — the contract's own
  "byte-identical in every tarball" rule holding in the repository and breaking where anyone
  would actually read it. This is the first contract change since roundel became a plugin
  host, so the pairing is worth establishing now rather than after the second one.

  Both of those codes are now members of the exported `PluginErrorCode`, which is the union
  every refusal in the family comes from. They were bare string literals inside `cli.ts`, so a
  second host could have spelled either one its own way and nothing would have noticed — the
  plugin contract's "one error vocabulary" held only as long as nobody tested it. `refuse()`
  takes `PluginErrorCode` rather than `string`, and a repo lock reads each host's declaration
  out of its source and refuses any `E_…` literal that is not in it. The union is a type, so
  this costs no bytes on any subpath.

## 0.1.0

### Minor Changes

- [#44](https://github.com/ofri-peretz/burgee/pull/44) [`183ebc9`](https://github.com/ofri-peretz/burgee/commit/183ebc90d38c7a23afda1f923c9b147560458334) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `roundel/chalk`: chalk 6's public API — the chainable builder with every modifier, colour, `Bright` variant, background and underline style, `rgb`/`hex`/`ansi256` (and `bg`/`underline` forms) downsampled as chalk does, the mutable `level`, `new Chalk({ level })`, `chalkStderr`, `supportsColor`, the name lists — over the tokens' one emitter and the policy's level, detected once at import. Graded by chalk's own suite vendored into compat-oracle: **58 / 58**. `roundel/tokens` gains `sgr()`, the SGR emitter the façade composes with.

  `roundel/policy`: `colorLevel()` now obeys the user's explicit colour instruction in any output mode, not only on a TTY (design R2, revised 2026-09-08). `NO_COLOR` still wins outright; `FORCE_COLOR` names an _exact_ level (`FORCE_COLOR=2` is 2, not "2 or better") or, as `true`/empty, only enables colour and lets `TERM`/`COLORTERM` decide; the `--color` flags are read from a new optional `argv` on the policy's runtime shape and outrank a numeric `FORCE_COLOR`. A pipe nobody asked to colour is still 0 (Azure Pipelines excepted, where chalk excepts it), but a run that _does_ ask now gets its CI vendor's level — so `FORCE_COLOR=true` on GitHub Actions gives truecolor logs. The output mode still decides redraws, and `--json` is still always 0.

- [#25](https://github.com/ofri-peretz/burgee/pull/25) [`c65bad8`](https://github.com/ofri-peretz/burgee/commit/c65bad85111fd29a2c5941ea2b3b7d6034dff7ff) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - First working release: `roundel/policy` (`outputMode`, `colorLevel`), `roundel/tokens` (nine semantic tokens over `util.styleText`), `roundel/theme` (`fly()`, the burgee brand by default, hex → nearest 256/16 fallback) and `roundel/contrast` (the WCAG maths `fly()` refuses a theme with) — zero dependencies, each subpath weighed and isolated by its own lock.
