# flagstaff

## 0.2.0

### Minor Changes

- [#86](https://github.com/ofri-peretz/burgee/pull/86) [`e927678`](https://github.com/ofri-peretz/burgee/commit/e927678f4590e29765d9db947f6141eb12aa34d8) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Add `flagstaff/boxen`: boxen 8's API, graded **84 / 84 by boxen's own test suite**.

  Every one of boxen's 84 cases is a snapshot of the exact characters the box comes out as, so
  matching the drawing byte for byte _is_ the compatibility claim rather than a way of
  avoiding one — a user leaving boxen cares about one thing, whether the box still looks the
  same.

  `borderStyle` (all eight cli-boxes styles, a style object, or `none`), `borderColor`,
  `backgroundColor`, `dimBorder`, `title`/`titleAlignment`, `textAlignment`, `padding`,
  `margin`, `width`, `height`, `float`, `fullscreen`, and the `_borderStyles` re-export.

  Eight dependencies folded in. boxen reaches `string-width`, `wrap-ansi`, `cli-boxes`,
  `ansi-align`, `widest-line`, `camelcase`, `chalk` and `type-fest`; this reaches `width.js`
  and `wrap.js` — both already shipped for `flagstaff/ora` and `flagstaff/log-update` — plus
  `roundel/chalk`. **43.0 KB in two packages, against boxen 8.0.1's 151.4 KB in fourteen.**

  It carries cli-boxes' table itself rather than reading the plugin registry: `_borderStyles`
  is boxen's public surface, and a façade whose drawing changed when somebody registered a
  plugin would be reinterpreting its host. Named borders through the registry stay
  `flagstaff/box`'s job.

- [#116](https://github.com/ofri-peretz/burgee/pull/116) [`3daa412`](https://github.com/ofri-peretz/burgee/commit/3daa4126eba162ff036caeac26c5568ca2096b47) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Add `flagstaff/cli-table3`: cli-table3 0.6.5's API, graded **29 / 29 by cli-table3's own
  test suite**.

  The full option surface — `head`, `chars`, `style`, `colWidths`, `rowHeights`, `colAligns`,
  `rowAligns`, `truncate`, `wordWrap`, `wrapOnWordBoundary`, per-cell `colSpan`, `rowSpan`,
  `hAlign`, `vAlign`, `href`, and the `debug` channel with `table.messages` and
  `Table.reset()`. It extends `Array`, because cli-table3 does and its callers push rows onto
  it.

  **One module, not four.** Upstream is `table.js`, `layout-manager.js`, `cell.js` and
  `utils.js`, and 201 of its 234 cases test those files directly. Those are reported beside
  the number and never gate it — passing them would mean copying cli-table3's file layout
  rather than matching its behaviour, which is the one thing a façade owes its users.

  **42.3 KB in two packages, against cli-table3 0.6.5's 161.7 KB in seven.** It reaches
  `width.js`, already shipped for the other three façades, plus `roundel/chalk` for the two
  default styles. It carries its own wrapping rather than sharing `wrap.js`: cli-table3 splits
  on `/(\s+)/` and counts with its own `strlen`, which a wrap-ansi port does not reproduce.

### Patch Changes

- [#149](https://github.com/ofri-peretz/burgee/pull/149) [`0d2520b`](https://github.com/ofri-peretz/burgee/commit/0d2520b04d297880f7117e54757361d0e04018c4) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Correct the published weight comparisons against boxen and cli-table3, both of which overstated the incumbent. boxen 8.0.1 is 132,414 B across nineteen packages, not the 151,351 in fourteen the README and weight rules claimed; cli-table3 0.6.5 is 105,983 across seven, not 161,690. ora and log-update reproduce to the byte and are unchanged.

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

- [#117](https://github.com/ofri-peretz/burgee/pull/117) [`ec43c47`](https://github.com/ofri-peretz/burgee/commit/ec43c473f7cb609d6690087f1fc369240d56a315) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `register()` lists a plugin name once instead of accumulating it — every other contribution already landed in a `Map`, so re-registering replaced entries while the name list grew, and `flagstaff check` and the docs gallery both project that list.

- [#75](https://github.com/ofri-peretz/burgee/pull/75) [`f2eaa6a`](https://github.com/ofri-peretz/burgee/commit/f2eaa6a7d170e24827a5bbb110ad9968b12d19e9) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `hoist()` puts the cursor back when a signal ends the process. `close()` restored it, and
  `close()` does not run for a signal with no listener — so Ctrl+C during a frame left the
  terminal with no cursor at all. The loop now shares the `cursor.js` both façades use.

- [#182](https://github.com/ofri-peretz/burgee/pull/182) [`28a838f`](https://github.com/ofri-peretz/burgee/commit/28a838f0c1314fb79594d9d8bd8e02de785ea80a) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `linegauge` is real: `width` and `wrap` move out of `flagstaff` into the foundation
  package that was reserved for them (F1, the move only). The default export is `width`,
  call-compatible with `string-width`'s default. `flagstaff` imports them and deletes both
  files; its 227 tests pass unchanged, and B4's bundled bytes are identical to the byte —
  the code went to a different file, not away.
- Updated dependencies [[`61bd11b`](https://github.com/ofri-peretz/burgee/commit/61bd11b9a1bf1fe73dd5a6e76e0898614e988ec7), [`8586f58`](https://github.com/ofri-peretz/burgee/commit/8586f58542e7896675c0b6fa8815278f8d22d4a3), [`28a838f`](https://github.com/ofri-peretz/burgee/commit/28a838f0c1314fb79594d9d8bd8e02de785ea80a), [`7c5eeb0`](https://github.com/ofri-peretz/burgee/commit/7c5eeb0c04a9a692db748ea7f3ccb2f3339fa5a2)]:
  - roundel@0.2.0
  - linegauge@0.1.0

## 0.1.0

### Minor Changes

- [#45](https://github.com/ofri-peretz/burgee/pull/45) [`4e376fe`](https://github.com/ofri-peretz/burgee/commit/4e376fe5381b8b7e94237273ab8f65096c3bb6a1) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The first working release: `hoist()` with a static projection per mode, `register()` over `schema.json`, the `dots` and `line` spinners as a plugin, and `flagstaff check`.

- [#62](https://github.com/ofri-peretz/burgee/pull/62) [`5e34676`](https://github.com/ofri-peretz/burgee/commit/5e3467603b5d1f84f8257f095f1e95f8154fc935) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `flagstaff/ora` — ora 9's whole API, graded 99 / 99 by ora's own test suite. One import changes; the seventeen packages ora ships become two, 113,577 B of JavaScript becomes 55,641 B (49%), and the spinner corpus, the display width, the log symbols, the cursor control — restored on `SIGINT`, `SIGTERM` and `SIGHUP` as well as a clean exit — and the stdin discarder come with it. Both sides counted the same way from the entry point: shipped `.js` plus the `.json` a module imports, `package.json` excluded.

### Patch Changes

- [#66](https://github.com/ofri-peretz/burgee/pull/66) [`b43e1d3`](https://github.com/ofri-peretz/burgee/commit/b43e1d3ccd62aad40b295cf4151aaff526d24acb) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The four remaining built-ins: `progress`, `tasks`, `box` and `table`, each on its own subpath. `box()` and `table()` are also plain string functions for the callers who want the string. Every one answers the static projection separately — a progress bar is `12/30 files · 40%` off a terminal, a table is `header: value` pairs — because a stripped drawing is not information.

- [#68](https://github.com/ofri-peretz/burgee/pull/68) [`8666f70`](https://github.com/ofri-peretz/burgee/commit/8666f70c46bfd09111815ee1e950466bea125ea7) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `flagstaff/log-update` restores the cursor when the process is signalled, not only when it exits normally. It shipped with `process.once('exit', …)` and nothing else — which node does not run when a signal with no listener terminates the process — so Ctrl+C mid-frame left the terminal with no cursor. That is the same defect `flagstaff/ora` fixed before it shipped, so the fix is now one module, `src/cursor.ts`, that both façades import: `signal-exit`'s 22.0 KB in 1.4 KB, with the re-raise and its `listenerCount` guard, so a program that installed its own `SIGINT` handler is still delivered exactly one signal and is never overruled. Graded per façade against the built `dist/` in a child process that is really signalled.

- [#66](https://github.com/ofri-peretz/burgee/pull/66) [`b43e1d3`](https://github.com/ofri-peretz/burgee/commit/b43e1d3ccd62aad40b295cf4151aaff526d24acb) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `flagstaff/import` — `fromCliSpinners()` and `fromCliBoxes()` turn the corpora you already have into ordinary plugins, through the same `register()` and the same schema. Neither corpus is bundled; 838 B, reaching nothing. The plugin contract gains `borders`, and the built-in border styles move into the built-ins plugin with the spinners, so `box()` can draw with a style a plugin registered.

- [#66](https://github.com/ofri-peretz/burgee/pull/66) [`b43e1d3`](https://github.com/ofri-peretz/burgee/commit/b43e1d3ccd62aad40b295cf4151aaff526d24acb) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `flagstaff/log-update` — log-update 8's API, graded 99 / 99 by log-update's own suite, which renders every frame through a real terminal emulator. Sixteen packages and 113.4 KB become **none** and 28.7 KB: the subpath reaches no package at all. Brings `wrap()`, an ANSI-aware wrapper graded differentially against wrap-ansi, which `box` and `table` share.

- [#76](https://github.com/ofri-peretz/burgee/pull/76) [`847f79a`](https://github.com/ofri-peretz/burgee/commit/847f79a02e3fbd82b58a360db91b46bd7ed09c48) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Export `flagstaff/schema.json`.

  `PluginError`'s fix for `E_PLUGIN_SCHEMA` tells a plugin author to "compare the object
  against flagstaff/schema.json", and that specifier did not resolve — following the advice
  got `ERR_PACKAGE_PATH_NOT_EXPORTED`. The file already shipped in the tarball; only the
  `exports` entry was missing.

- [#66](https://github.com/ofri-peretz/burgee/pull/66) [`b43e1d3`](https://github.com/ofri-peretz/burgee/commit/b43e1d3ccd62aad40b295cf4151aaff526d24acb) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The static projection writes only what is new. A component whose projection is a growing list — `tasks`, whose static is every task that has settled — reprinted every line already in the log on each change; it now writes the lines past the common prefix. An empty projection writes nothing at all, rather than a blank line. Found by generating the docs gallery from the components themselves.
- Updated dependencies [[`183ebc9`](https://github.com/ofri-peretz/burgee/commit/183ebc90d38c7a23afda1f923c9b147560458334), [`c65bad8`](https://github.com/ofri-peretz/burgee/commit/c65bad85111fd29a2c5941ea2b3b7d6034dff7ff)]:
  - roundel@0.1.0
