# flagstaff

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
