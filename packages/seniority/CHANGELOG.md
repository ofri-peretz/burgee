# seniority

## 0.5.0

### Minor Changes

- [#507](https://github.com/ofri-peretz/burgee/pull/507) [`b8e97dc`](https://github.com/ofri-peretz/burgee/commit/b8e97dcb64772e413f0b6f9e17e063c73314d242) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Runs on Node 20 and 22, not just 24+: `engines.node` is now `^20.19.0 || >=22.13.0`. Those are the first releases where `require(esm)` loads without a warning, so the CommonJS `require()` path keeps working. Every package's test suite runs on exactly 20.19.0 and 22.13.0, on Linux, macOS and Windows. caique's prompts no longer call `Promise.withResolvers`, which Node 20 doesn't have.

### Patch Changes

- [#505](https://github.com/ofri-peretz/burgee/pull/505) [`9800b43`](https://github.com/ofri-peretz/burgee/commit/9800b43d9c74a49dfb66d04a40fd0d1c48892e20) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Docs: the Benchmarks section's weight ceiling is re-measured against a fresh install of each incumbent's latest release (cosmiconfig 10.0.1, slice-ansi 9.0.1, which 7.0.0, dotenv 18.0.3, …) instead of the copies hoisted in this workspace, and names incumbents that were measured but left out of the ceiling as exactly that.

## 0.4.3

### Patch Changes

- [#494](https://github.com/ofri-peretz/burgee/pull/494) [`f7f6d4b`](https://github.com/ofri-peretz/burgee/commit/f7f6d4b8e8f9d9c7010bd4c81fda4b4d106fc9f0) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Each package's `homepage` and README docs link now point at its own documentation site, `https://<package>.interlace.tools`, instead of a page on burgee's site. The old `burgee.interlace.tools/docs/packages/<package>` URLs answer with a 301 to the new host, so nothing already linked breaks. closeout's README override example also resolves to the current release again (`npm:closeout@^0.4`; the 0.4.0 release left it at `^0.3`).

## 0.4.2

### Patch Changes

- [#465](https://github.com/ofri-peretz/burgee/pull/465) [`acf98f3`](https://github.com/ofri-peretz/burgee/commit/acf98f3e612c6d79e6c2b78a847abcd06a063cbc) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Each README now opens with the incumbent it replaces and the agent surface it serves (`--json`, an agent event, or a static projection), so npm shows both above the fold. README text only; no code changed.

## 0.4.1

### Patch Changes

- [#454](https://github.com/ofri-peretz/burgee/pull/454) [`b4584e7`](https://github.com/ofri-peretz/burgee/commit/b4584e719bc0064b294aab5ea6da1c11f698f0e9) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Every package's npm `homepage` now points at its page on the docs site, `https://burgee.interlace.tools/docs/packages/<name>`, and each README links it under the header. The keywords add what people and models search for: `burgee` gains `cli-framework`, `argument-parser`, `subcommands`, `json-schema`, `mcp-server`, `model-context-protocol`, `ai-agent`, `llm`, `shell-completion`, `typescript`, `zero-dependency`, `commander-alternative` and `yargs-alternative`; the other eight gain `agent`, `ai-agent`, `non-tty`, `json` and `zero-dependency` where the package does that — `zero-dependency` only on the six that install nothing at all.

  `burgee`'s README gains a short FAQ (commander alternative, agent use, MCP, dependencies) and states the compatibility counts the oracle holds — 1,360 / 1,360 of commander's tests and 804 / 804 of yargs' — where it had said 1,215 and 1,185. `caique`'s README no longer calls a released package pre-release.

- [#442](https://github.com/ofri-peretz/burgee/pull/442) [`bdaf364`](https://github.com/ofri-peretz/burgee/commit/bdaf364f81564c1700cf1adec18f927afe6c60c9) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Every package now lists `plugin`, `plugins` and `extensible` in its npm keywords, because every package takes plugins through one shared contract.

  A plugin is a plain object, validated against the `schema.json` that ships in every package, and checked with the package's own `check` command. Each package reads its own key and ignores the rest, so one object can extend any subset of the family. The [plugins page](https://github.com/ofri-peretz/burgee/blob/main/apps/docs/content/docs/plugins.mdx) has a nine-layer example that every package's `check` accepts in CI.

- [#435](https://github.com/ofri-peretz/burgee/pull/435) [`7888524`](https://github.com/ofri-peretz/burgee/commit/78885245eb292cd4a40541fe09382a198c9c45cf) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `schema.json` now describes every plugin host in the family.

  The one schema each package ships as its plugin contract used to cover only four hosts: roundel's `tokens`, flagstaff's `glyphs`, `spinners`, `borders` and `components`, paratext's `capabilities`, and linegauge's `widths`. Five hosts validated their keys in their own code, but the file an author (or a model) writes against said nothing about them. It now describes all of them:

  - bellpull `resolvers`, including the absolute-path rule on `paths`
  - caique `widgets`
  - closeout `handlers`, including the phases a plugin may use
  - seniority `sources`, including the rank bounds
  - burgee `commands`, `hooks` and `enforce`

  Where the schema can express a rule, it gives the same verdict as the host's own validator, and a test holds the two together. Function-valued fields (`static`, `run`, `read`, `handler`) are described and required, but not typed, because JSON Schema can't say "function".

  **flagstaff** now validates a plugin against only its own keys, not the whole family schema. It no longer refuses a plugin over another host's key, which lets one plugin object contribute to several hosts. Its entry points are also 4.7–5.9 KB lighter for it.

- [#445](https://github.com/ofri-peretz/burgee/pull/445) [`dac303e`](https://github.com/ofri-peretz/burgee/commit/dac303e944e889ac4175ac38c94e4ca0f0ca5358) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Every package now declares `sideEffects` truthfully, so bundlers can drop what you don't import.

  Six packages declared nothing, so no bundler could drop any of their modules. A named import from the root now bundles to the same bytes as the same import from its subpath:

  | import                                |  before |   after |
  | :------------------------------------ | ------: | ------: |
  | `import { explain } from 'seniority'` | 2,939 B | 1,067 B |
  | `import { decide } from 'caique'`     | 1,235 B |   734 B |
  | `import { strip } from 'linegauge'`   | 1,102 B |   940 B |
  | `import { once } from 'closeout'`     |   353 B |   235 B |

  flagstaff and roundel used to declare `false`, but each ships a `check` command whose file runs when loaded. Each now lists that file, which is the true statement. paratext also lists the two modules that register its built-in capabilities when they load.

## 0.4.0

### Minor Changes

- [#421](https://github.com/ofri-peretz/burgee/pull/421) [`db3c59e`](https://github.com/ofri-peretz/burgee/commit/db3c59e3dcd373c7e6e4a057715adb173766523f) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Every plugin host has a `check` command.

  ```bash
  npx linegauge check ./my-widths.mjs
  npx burgee check ./my-plugin.mjs --json
  ```

  PRINCIPLES 7 asks three things of an extension surface: the plugin is data validated against one
  published schema, there is a **`check` command that shows it every way it can be seen**, and the
  bar is measured. The first was built in all nine hosts; the second existed in `flagstaff` alone.
  So an author writing a plugin for any other host found out what it did by shipping it into a
  program — and a surface nobody can check is a surface nobody outside this repository can write
  against.

  Each command validates, registers, and shows what the host does with the plugin, in the host's own
  terms: linegauge measures each code point **before and after** the override, paratext shows a
  capability's `encode` **and** its `fallback`, roundel each token and what it replaced, caique each
  widget's static projection rendered with its own sample. burgee's returns a **document** rather
  than printing one, so `burgee check --json` is the form an agent that just wrote a plugin reads.

  They share one contract with the author, held identically across all nine:

  - a readable report, contribution by contribution, with **`ok` as the last line**;
  - a refusal with a code from the family's vocabulary and a `fix`, exit 1;
  - **`E_NO_CONTRIBUTION`** for a plugin that contributes nothing to this host — the schema allows
    unknown keys so one object registers everywhere, which makes a misspelled key silent, and this
    is how that typo tells on itself;
  - exit 2 with no file.

  Each host also gains an eval case measuring the one-turn claim, proved to discriminate before it
  was committed: green against a correct plugin, red against the same plugin with one field broken.

- [#418](https://github.com/ofri-peretz/burgee/pull/418) [`c0fa8a3`](https://github.com/ofri-peretz/burgee/commit/c0fa8a37913fab17a6d06615b7432116b1c0e1db) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `explain` moves from `seniority/precedence` to `seniority/explain`.

  A re-export is not free across a package boundary. `explain` was exported from `precedence.ts`,
  so every program that resolved a configuration loaded `explain.js` whether or not anything ever
  explained one — **1,018 bundled bytes and one more module on the startup path** for the branch
  taken when a user asks _why did this option get that value_.

  `import { explain } from 'seniority'` is unchanged: the root barrel still exports it, from its
  new home. Only `seniority/precedence` stops re-exporting it. `burgee/config` re-exports it the
  same way it always did, and `burgee`'s engine loads it behind an `await import('seniority/explain')`
  on the `--explain` branch, which is now the only thing that pays for it.

  Measured on burgee's core entry: **28,637 → 27,552 bundled bytes**, and 22 → 21 modules for
  `import 'burgee'`.

### Patch Changes

- [#430](https://github.com/ofri-peretz/burgee/pull/430) [`4d1b2b3`](https://github.com/ofri-peretz/burgee/commit/4d1b2b399cff354864d1e2e843a19fde80ef1f30) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `check` now reports every refusal with its code and its fix, wherever it was raised.

  Some plugin files register themselves on import: they call `register()` at the top of the module and export the result. Until now, when such a file was refused, the error was thrown inside `check`'s `import()`, before the only `try` that turns a `PluginError` into `E_PLUGIN_SCHEMA: …` plus a `fix:` line. The author got the bare message on stderr, with no code and no fix. Now the whole of `check` runs inside that one handler, so every refusal comes out the same way on every host.

## 0.3.1

### Patch Changes

- [#386](https://github.com/ofri-peretz/burgee/pull/386) [`5a85175`](https://github.com/ofri-peretz/burgee/commit/5a85175da66df5e797446eaada1c3492cc8b8fff) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The Unicode segmenter is built on first use rather than at import, and both packages now
  strip comments from what they publish.

  `new Intl.Segmenter()` loads ICU's grapheme-break data. Two were constructed at module
  scope, and almost nothing paid for them: every caller takes the ASCII fast path first, so a
  run of printable ASCII — a help screen, a flag name, a path — never reaches `segment()`.
  `segmenter` is now a function; the two call sites become `segmenter()`.

  `linegauge` and `seniority` were also the two published packages whose build never ran
  `strip-comments` at all. Unpacked: linegauge 83,538 → 56,148 and seniority 193,682 →
  139,793.

  Together these take `import 'burgee'` from 56.87 ms to 44.39 ms, medians of seven.

## 0.3.0

### Minor Changes

- [#379](https://github.com/ofri-peretz/burgee/pull/379) [`955b979`](https://github.com/ofri-peretz/burgee/commit/955b9790560ad2e478a1abbcbe42ec2bc4ba7423) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `seniority/lilconfig` and `seniority/rc` — two new drop-in subpaths, and `seniority/dotenv`
  grows the default export its incumbent has.

  `seniority/lilconfig` is lilconfig 3.1.3's surface: `lilconfig`, `lilconfigSync`,
  `defaultLoaders`, `defaultLoadersSync`, and **no fifth runtime export**, because lilconfig's
  own suite compares the module's keys against cosmiconfig's. Graded at **67 / 77** against that
  suite, up from 0 — the same number its control scores, so no case in it now separates the two.
  The zero was not a missing feature: the row had been pointed at the package _root_, which
  presents cosmiconfig's surface and answers `lilconfigSync is not a function` seventy-seven
  times.

  `seniority/rc` is rc 1.2.8's merge with none of its four dependencies: the file stack in rc's
  own order, `__` nesting for environment keys, JSON-with-comments, `deep-extend`'s merge, and
  `configs` / `config` reporting which files were read. INI is refused by name with the argument
  that would parse it, the way YAML already is. Its environment arrives as an argument rather
  than off the process, which is the one divergence and the reason its compat row stays at 0 / 1.

  `seniority/dotenv` now has a default export carrying `config`, `parse` and `populate`, so a
  CJS caller `require()`ing it gets the same mutable object `require('dotenv')` gives — which is
  what dotenv's own suite stubs. `populate` also matches 17.4.2 more closely: it validates
  `parsed` (not `processEnv`), returns the keys it actually set, and logs under `debug`. The row
  moves **74 / 141 → 80 / 141**.

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

- [#339](https://github.com/ofri-peretz/burgee/pull/339) [`f295630`](https://github.com/ofri-peretz/burgee/commit/f2956301d5f9dcbcac0b001b00ebaf0315891fac) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `schema.json` constrains token names, because it was promising something no host honours.

  `tokens` was described as any name to a `#rrggbb` colour. `roundel`'s `validate()` accepts
  ten semantic names — `error`, `warn`, `ok`, `hint`, `muted`, `command`, `flag`, `value`,
  `heading`, `ground` — and throws on everything else. So a plugin author doing exactly what
  their own `E_PLUGIN_SCHEMA` error tells them, comparing their object against
  `roundel/schema.json`, got a green from the schema and `"accent" is not a token` from
  `register()`. Measured 2026-09-16 with `{ accent: '[#336699](https://github.com/ofri-peretz/burgee/issues/336699)' }`.

  The schema now carries `propertyNames.enum`, and `scripts/plugin-contract-lock.test.ts`
  pins the enum and the runtime set to each other from both sides, so neither can grow a
  name the other does not know.

  Every host ships a byte-identical copy of this file (`plugin-schema-lock.test.ts` asserts
  it), which is why nine packages are listed. Only the key `roundel` owns is constrained:
  describing `widgets`, `handlers`, `sources`, `resolvers` or `commands` in a file all eight
  hosts share is what made _flagstaff_ start validating caique's key last time
  (`PluginError: plugin.widgets.later: expected object, got boolean`), and those stay in
  `plugin-schema-lock`'s `UNDESCRIBED` list with that reason.

  `linegauge` is in the list for a different change: `ceilings.json`'s R9 block now records
  the bar as D1's tree-inclusive ceiling — 83,538 against 170,342, a ratio of 0.4904 — and
  keeps the superseded `get-east-asian-width` bar beside it with the count of entries that
  cleared it.

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
