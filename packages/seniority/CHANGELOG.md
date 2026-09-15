# seniority

## 0.2.0

### Minor Changes

- [#316](https://github.com/ofri-peretz/burgee/pull/316) [`c8acb28`](https://github.com/ofri-peretz/burgee/commit/c8acb2848714a1cbe3e26a2f9895d7498fb4f096) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - seniority to 1.0's requirement set: cosmiconfig's surface, measured at 186 / 241.

  The root export now carries `cosmiconfig`'s own API — `cosmiconfig`, `cosmiconfigSync`,
  `Explorer`, `ExplorerSync`, `defaultLoaders`, `defaultLoadersSync`, the search-place and
  loader tables, `decodeFileContent` and `getPropertyByPath` — with all three search
  strategies, both caches, `$import` with `mergeImportArrays`, and the meta-config merge.
  Graded by cosmiconfig 10.0.1's own suite, run unmodified, it goes from **3 / 241 (1.2%)** to
  **186 / 241 (77.2%)** against a control of 240 / 241.

  Every one of the 55 cases it does not pass is one of two named divergences: 54 are the
  absent YAML parser — this package bundles no format parser, so `loadYaml` reads the JSON
  subset of YAML and refuses the rest with an error naming the `loaders` option that supplies
  one — and one is a test-harness file path. None is a difference in how a config is found,
  merged or reported.

  Two new compatibility subpaths:

  - **`seniority/dotenv`** — dotenv 17's `parse` and `populate`, grammar included. `config`
    takes the environment it populates as `processEnv` rather than reaching for `process.env`,
    so nothing in this package touches the process.
  - **`seniority/find-up`** — `findUp`, `findUpSync`, `findUpMultiple`, `findUpMultipleSync`
    over a bounded, symlink-cycle-safe upward walk, in place of four packages.

  Also new on the root export, all additive:

  - `explanation()` — `--explain` as a record, with `explain()`'s text now literally a
    rendering of it, alongside `explanationJson()` and `explanationEvent()`.
  - `search()` / `searchAll()` — the walk, bounded by `stopAt`, a depth limit and the
    filesystem root.
  - `loadPath()`, `loaderFor()`, `LoaderError` — four builtin loaders, injected loaders for
    every other format, and a usage-class error naming the extension and the option.
  - `validate()` / `check()` — a violation reported with its provenance: `` `out` must be a
string; `./mytool.config.js:3` set it to `4` ``.
  - `provenance.line`, recorded per key for JSON config layers, and `discover`'s `loaders`,
    `extensions`, `upward` and `stopAt` options.

  No behaviour of the existing API changes, and the package still declares zero dependencies.

- [#294](https://github.com/ofri-peretz/burgee/pull/294) [`3f92a60`](https://github.com/ofri-peretz/burgee/commit/3f92a6099b1b8d5d476c64405ca963d40bf9af45) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Host `sources`, the plugin key, at `seniority/plugin` — a plugin adds a resolution source (a vault, a CI variable set, a remote config) and `--explain` names it as the provenance of the value it won.

  `Source` is now an open union, so this is additive rather than a type break, and the one code change it costs is `describe()`'s `default` branch: an unknown source renders itself from the `source` and `location` it declared, which is how a plugin explains itself without seniority knowing its name.

  `ORDER` is exported and is the single declaration the union and the new `RANK` are both generated from — the design's array and the shipped union had disagreed (`project`/`home`/`pkg` against `config`/`package`), and a plugin must not register against two spellings. The shipped five win, because `provenance.source` is a value users already read and because `project` versus `home` was one kind with two locations, which `location` already names precisely.

  A plugin's `rank` slots its source _between_ two built-ins and is refused outside `(flag, default)`: it can never beat the flag the user typed, nor sink below the declared default. The order stays the fixed thing it claims to be.

### Patch Changes

- [#316](https://github.com/ofri-peretz/burgee/pull/316) [`c8acb28`](https://github.com/ofri-peretz/burgee/commit/c8acb2848714a1cbe3e26a2f9895d7498fb4f096) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `mergeAll` refuses `prototype` as well as `__proto__` and `constructor`, and the guard is
  three comparisons rather than a `Set` lookup.

  The guard existed and had no test — it was written, and believed. CodeQL's
  `js/prototype-polluting-function` could not see it through the `Set` binding and blocked a
  merge on it, which is a fair complaint about a security guard: one a reader has to follow a
  binding to find is one a reviewer will miss too.

  What it actually prevents, measured rather than assumed. A first attempt at the test asserted
  `({}).polluted === undefined` after merging a `__proto__` key and **passed with the guard
  deleted** — `target['__proto__'] = v` goes through the setter and swaps _that object's_
  prototype; it does not write `Object.prototype`. The damage is narrower and quieter: the
  config object handed back to the caller silently inherits whatever the file said, so
  `config.isAdmin` can answer for a key no file set at the top level. `cosmiconfig-util.test.ts`
  now asserts that, and four of its six cases go red when the guard is removed.

## 0.1.0

### Minor Changes

- [#219](https://github.com/ofri-peretz/burgee/pull/219) [`ac7b9e5`](https://github.com/ofri-peretz/burgee/commit/ac7b9e5c30ccc960f4f948c40f8536e3751cc4d0) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - seniority resolves flags, env, config and defaults — with provenance

  The package existed as a reserved name exporting a string constant. It now does the job
  its description has always claimed.

  ```
  flag  >  env  >  config file  >  package.json field  >  default
  ```

  `resolve(specs, layers)` returns the values, the provenance of each, and every candidate
  that lost — so `explain(name, resolution)` can print the winning source and the ones it
  beat, generated by the same code that picked the value. A `--explain` built any other way
  can drift from the truth; this one cannot.

  `resolve` is pure: layers in, values out, no filesystem and no `process.env`. `discover`
  is the half that touches the disk and is a separate import for that reason — searching
  `NAME_CONFIG`, `./name.config.{json,mjs,js,cjs}` and `$XDG_CONFIG_HOME/name/config.json`,
  following `extends` with deep merge and rejecting cycles with the chain that formed them.

  The code is burgee's, moved down a layer where it belongs: `precedence.ts` and `config.ts`
  with their 28 tests, which passed unchanged. Its `OptionSpec` here declares only the three
  fields resolution reads, so any program's richer option type satisfies it structurally —
  no adapter, no import, and no dependency pointing back up the stack.

  Zero dependencies; Node builtins only.
