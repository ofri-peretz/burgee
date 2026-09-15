---
'seniority': minor
---

seniority to 1.0's requirement set: cosmiconfig's surface, measured at 186 / 241.

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
- `validate()` / `check()` — a violation reported with its provenance: ``` `out` must be a
  string; `./mytool.config.js:3` set it to `4` ```.
- `provenance.line`, recorded per key for JSON config layers, and `discover`'s `loaders`,
  `extensions`, `upward` and `stopAt` options.

No behaviour of the existing API changes, and the package still declares zero dependencies.
