# linegauge

## 0.5.1

### Patch Changes

- [#508](https://github.com/ofri-peretz/burgee/pull/508) [`1aae1e2`](https://github.com/ofri-peretz/burgee/commit/1aae1e2186ce88421067df5317795773419e53d0) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `<package> --help` and `--version` answer instead of crashing. The bin took its first argument as the plugin file to import, so `roundel --help` failed with `Cannot find module '…/--help'` and exit 1. `-h`/`--help` now print usage and exit 0, `-V`/`--version` print the version and exit 0, and any other flag where the plugin file belongs is a usage error, exit 2.

## 0.5.0

### Minor Changes

- [#507](https://github.com/ofri-peretz/burgee/pull/507) [`b8e97dc`](https://github.com/ofri-peretz/burgee/commit/b8e97dcb64772e413f0b6f9e17e063c73314d242) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Runs on Node 20 and 22, not just 24+: `engines.node` is now `^20.19.0 || >=22.13.0`. Those are the first releases where `require(esm)` loads without a warning, so the CommonJS `require()` path keeps working. Every package's test suite runs on exactly 20.19.0 and 22.13.0, on Linux, macOS and Windows. caique's prompts no longer call `Promise.withResolvers`, which Node 20 doesn't have.

### Patch Changes

- [#505](https://github.com/ofri-peretz/burgee/pull/505) [`9800b43`](https://github.com/ofri-peretz/burgee/commit/9800b43d9c74a49dfb66d04a40fd0d1c48892e20) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Docs: the Benchmarks section's weight ceiling is re-measured against a fresh install of each incumbent's latest release (cosmiconfig 10.0.1, slice-ansi 9.0.1, which 7.0.0, dotenv 18.0.3, …) instead of the copies hoisted in this workspace, and names incumbents that were measured but left out of the ceiling as exactly that.

## 0.4.4

### Patch Changes

- [#494](https://github.com/ofri-peretz/burgee/pull/494) [`f7f6d4b`](https://github.com/ofri-peretz/burgee/commit/f7f6d4b8e8f9d9c7010bd4c81fda4b4d106fc9f0) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Each package's `homepage` and README docs link now point at its own documentation site, `https://<package>.interlace.tools`, instead of a page on burgee's site. The old `burgee.interlace.tools/docs/packages/<package>` URLs answer with a 301 to the new host, so nothing already linked breaks. closeout's README override example also resolves to the current release again (`npm:closeout@^0.4`; the 0.4.0 release left it at `^0.3`).

## 0.4.3

### Patch Changes

- [#480](https://github.com/ofri-peretz/burgee/pull/480) [`2dc573f`](https://github.com/ofri-peretz/burgee/commit/2dc573f884e7a4cc46829cd8f2c949a17f07710c) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - README corrections: paratext shows terminal-link at its measured 8 / 10 (was the stale 0 / 10 floor); linegauge's and closeout's `npm:` override examples resolve to the current release instead of 0.2 / 0.1.

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

- [#421](https://github.com/ofri-peretz/burgee/pull/421) [`db3c59e`](https://github.com/ofri-peretz/burgee/commit/db3c59e3dcd373c7e6e4a057715adb173766523f) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - linegauge hosts plugins — `widths`, and it is the ninth of nine.

  `scripts/extension-surface-lock.test.ts` has carried `linegauge: { plugin: false }` since it was
  written, and the row was empty honestly: a width function is not obviously extensible, and an
  extension point invented to fill a table is worse than a gap that says so.

  What makes `widths` real is that the package already admits the problem. `width.ts` says
  ambiguous-width characters are _"counted narrow, which is what a terminal does unless it has been
  told it is rendering an East Asian locale"_ — and that covers only the ambiguity Unicode
  sanctions. A Nerd Font putting a two-column icon in the Private Use Area, a code point added by a
  Unicode release newer than the table compiled into this build, a font drawing U+2500 wide: each
  is a real, local disagreement with the built-in answer, and until now a user had no way to settle
  it short of patching the package.

  ```js
  export default {
    name: "nerd-font",
    widths: {
      icons: {
        ranges: [[0xe000, 0xf8ff]],
        columns: 2,
        why: "Nerd Font patches two-column icons into the PUA; measured in WezTerm",
      },
    },
  };
  ```

  Three fields of plain data, so a plugin can arrive as JSON, be diffed, be generated and be printed
  without running its author's code (R7). **`why` is required**, which no other `$def` in the family
  does: a width table with no provenance cannot be audited when it turns out to be wrong, and _wrong_
  is the normal outcome for ambiguous width.

  A later registration wins over an earlier one and over the built-in tables, which is the point —
  the built-in answer is right for most terminals and the user is the authority on theirs. An
  override applies **before** the zero-width and emoji rules, or it would be decorative. A program
  with no plugin pays one `length === 0` per cluster, and the ASCII fast path never reaches it.

  The family schema gains `widthRange`, `widthOverride` and `widths`, and because it is one
  byte-identical file across every host, **every host that validates against it grows by about
  1.3 KB** — five flagstaff budgets and two paratext ones moved for a definition only linegauge
  reads. That trade is the design's and is recorded as D-108 rather than absorbed.

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

### Patch Changes

- [#430](https://github.com/ofri-peretz/burgee/pull/430) [`4d1b2b3`](https://github.com/ofri-peretz/burgee/commit/4d1b2b399cff354864d1e2e843a19fde80ef1f30) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `check` now reports every refusal with its code and its fix, wherever it was raised.

  Some plugin files register themselves on import: they call `register()` at the top of the module and export the result. Until now, when such a file was refused, the error was thrown inside `check`'s `import()`, before the only `try` that turns a `PluginError` into `E_PLUGIN_SCHEMA: …` plus a `fix:` line. The author got the bare message on stderr, with no code and no fix. Now the whole of `check` runs inside that one handler, so every refusal comes out the same way on every host.

## 0.3.3

### Patch Changes

- [#400](https://github.com/ofri-peretz/burgee/pull/400) [`5b224e5`](https://github.com/ofri-peretz/burgee/commit/5b224e58db17a72c225d7ea8e14109d6d93f3968) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Thirty fewer bundled bytes per entry point, at no change in behaviour.

  The five Unicode property classes are built on first use and were cached in one object
  keyed by name. A minifier renames a module-level binding to a single character and cannot
  touch a property name, so each `classes['zeroWidth']` survived minification at full length.
  Five `let` bindings hold the same five regexes: `linegauge` 6,307 → 6,277 bundled bytes,
  `linegauge/wrap` 11,278 → 11,248, `linegauge/slice` 8,938 → 8,908.

## 0.3.2

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

- [#389](https://github.com/ofri-peretz/burgee/pull/389) [`88a6996`](https://github.com/ofri-peretz/burgee/commit/88a699645f986c6e5dcead465e3f36238f0ae77d) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The five Unicode property classes are built on first use, not at import.

  A `\p{…}` class under the `v` flag is built when V8 **compiles the literal**, not when the
  literal is evaluated — so a module carrying five of them pays for all five at import even if
  nothing calls them. Wrapping the literals in functions does not help; only constructing from
  a source string does.

  Measured on Node 24: `width.js` imports in **5.95 ms against 15.30**, `linegauge` in
  **11.60 against 19.00**, and `import 'burgee'` in **21.69 against 33.26**. A caller that
  measures a non-ASCII cluster pays the ~10 ms once, on first call.

  string-width 229/229, wrap-ansi 80/80, slice-ansi 15/15 and strip-ansi 8/8 are unchanged.

## 0.3.1

### Patch Changes

- [#373](https://github.com/ofri-peretz/burgee/pull/373) [`a1f1d40`](https://github.com/ofri-peretz/burgee/commit/a1f1d40b7d1e7244f3a180943b641bb3b491d256) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Stage 2's artifact is now `spec.md`, the name Anthropic's AI-Native SDLC playbook gives it, so the source comments and README sections that cite a package's own design document point at `spec.md` rather than `design.md`.

  No behaviour changes. The published tarballs do move, by two bytes per surviving reference — `design.md` is nine characters and `spec.md` is seven — so the four packages carrying a weight band were re-measured against it: linegauge 83,538 to 83,536; paratext 66,343 to 66,341; closeout 84,455 to 84,453; bellpull 86,113 to 86,107.

## 0.3.0

### Minor Changes

- [#303](https://github.com/ofri-peretz/burgee/pull/303) [`fc640dd`](https://github.com/ofri-peretz/burgee/commit/fc640ddec11255c12d1e0948c5b8e99cc3f3263b) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Give `linegauge/strip`, `linegauge/wrap` and `linegauge/slice` a default export, each the
  same function object as the subpath's named export.

  The three packages they replace — `strip-ansi`, `wrap-ansi`, `slice-ansi` — all publish a
  single function as their default, so `import stripAnsi from 'linegauge/strip'` now reads
  exactly like the import it replaces. The root default is untouched and still `width`: that
  one is spent on the `string-width` override recipe and cannot move.

  This is what unblocked grading those three suites. Their tests open with
  `import x from './index.js'`, and without a default the generated shim does not fail a case,
  it fails to link — measured at `# tests 0 / # pass 0 / # fail 2` on eight cases the
  implementation already satisfied. All three now grade: `strip-ansi` 8 / 8, `wrap-ansi`
  80 / 80, `slice-ansi` 13 / 15.

### Patch Changes

- [#332](https://github.com/ofri-peretz/burgee/pull/332) [`3ea38c3`](https://github.com/ofri-peretz/burgee/commit/3ea38c363b9f0cee9f1c1c2dae4037b047e98328) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Lock the two claims `linegauge` was making with nothing behind them: that its ASCII fast path
  agrees with the path it short-circuits, and that `require('linegauge')` works.

  `width()` has had two implementations of one answer since `slice` landed — `asciiColumns`
  returns `s.length` for printable ASCII, everything else walks `Intl.Segmenter`. The design
  has promised a `differential.test.ts` locking the two together since 2026-09-09, `index.ts`
  still said the fast path was unbuilt, and no test compared them. Every existing case either
  used an input the fast path rejects or one where both paths are trivially right, so widening
  the fast path's range by a byte passed the entire suite. A wrong fast path is not a slow
  program, it is a silently wrong measurement: a box a column short, a help column that stops
  lining up, and nothing thrown.

  `differential.test.ts` now asserts `width(s) === measure(strip(s))` over the intent's six-row
  grapheme table, 24 boundary fixtures and 2 000 inputs from a recorded seed, and carries the
  grapheme table itself as assertions — code units against cluster count against columns.
  Proven red before green: widening the range to `0x7F` fails 2 cases and dropping its floor to
  `0x00`, which lets `ESC` onto the fast path, fails 8.

  `shape.test.ts` covers R12. Nothing in the tree had ever called `require` on this package,
  and the override recipe it is built for — `overrides: { "string-width": "npm:linegauge@^1" }`
  — lands it inside CommonJS trees that have required `string-width` since 2015. Every
  published entry is now required from CommonJS, which proves both halves of R12 at once: Node
  refuses a graph containing a top-level `await` with `ERR_REQUIRE_ASYNC_MODULE`, so a `require`
  that returns the namespace is also the no-top-level-await check. Proven red by appending a
  top-level `await` to `widest.ts`: 3 of 8 cases fail.

  No behaviour change. 913 tests, up from 867.

- [#316](https://github.com/ofri-peretz/burgee/pull/316) [`c8acb28`](https://github.com/ofri-peretz/burgee/commit/c8acb2848714a1cbe3e26a2f9895d7498fb4f096) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `width` and the style stack now answer what `string-width` and `slice-ansi` answer on
  twenty-nine cases they did not. The `string-width` row goes 201 / 229 → **229 / 229**; the
  `slice-ansi` row goes 13 / 15 → **15 / 15**. `wrap-ansi` holds
  at 80 / 80 and `strip-ansi` at 8 / 8 across the change.

  Four defects in `width`, not twenty-eight cases. **Hangul conjoining jamo** are additive
  inside a grapheme cluster: `Intl.Segmenter` joins a run of them into one cluster, and
  measuring that cluster by its first code point answered 2 where a terminal draws 12. Modern
  Hangul composes L + V (+ T) into one two-column syllable and leaves unmatched jamo at their
  own East Asian Width. **Spacing combining marks** occupy a column — the zero-width class
  matched `\p{Mark}`, which is the spacing marks as well as the non-spacing ones, so
  Devanagari vowel sign AA measured 0. **Prepended concatenation marks** (`U+0600`, `U+06DD`,
  `U+070F`) are `Format` but not `Default_Ignorable`, so they missed the zero-width class and
  were charged a column each — the worst shape of the bug, because a character the cursor never
  advances past is invisible until a box comes out short. And **minimally-qualified emoji
  sequences** — the same ZWJ sequence or keycap without its `U+FE0F` — are still two columns
  in every terminal, but `\p{RGI_Emoji}` matches only the fully-qualified spelling.

  One defect in the style stack, which `slice`, `wrap` and `truncate` share. An SGR parameter
  with no entry in the close-code table — `ESC[20m`, `ESC[1001m` — was **dropped** at a cut, so
  the text survived and its styling did not, silently. It is now carried through and reopened
  like any other style, closed with `ESC[0m`. The sequence is the caller's, not this library's
  to vet.

  Measured cost, stated rather than absorbed: the minified bundle grows 939–1 040 bytes per
  entry that measures or cuts — `linegauge` itself from 5 241 to 6 180 bytes, 18%. `strip` is
  unchanged. `packages/linegauge/ceilings.json` carries the before, the delta and the after,
  and a new `weight.test.ts` ratchets every subpath's `dist/` closure so the next growth cannot
  be silent. That file also records, rather than hides, that R9's weight ceiling is **not met**:
  one entry of six is under the bar the design names.

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

## 0.2.0

### Minor Changes

- [#186](https://github.com/ofri-peretz/burgee/pull/186) [`3d744d9`](https://github.com/ofri-peretz/burgee/commit/3d744d99d92cdc7fc675ad105e4e4b9c6eebca5f) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `slice`, `truncate` and `widest`, over the style stack extracted from `wrap`. Cutting a
  styled string in display columns never splits a grapheme cluster, never loses a combining
  mark, and closes and reopens whatever styles the cut ran through. `truncate` measures the
  ellipsis and keeps it inside the budget. Published as `linegauge/slice`,
  `linegauge/truncate` and `linegauge/widest`, each isolated from the others.

- [#210](https://github.com/ofri-peretz/burgee/pull/210) [`59d910c`](https://github.com/ofri-peretz/burgee/commit/59d910c1da7bca519bd1c2d5ca43b6c57e260621) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `strip` (R3), and a width bug it found. `util.stripVTControlCharacters` leaves the colon
  form of an extended colour — `ESC[38:2::255:0:0m`, how every truecolor library writes one —
  in the output as text, so `width()` answered 15 for a three-column string. Measured across
  sixteen sequence shapes: Node is exact on fifteen and wrong on that one. Published as
  `linegauge/strip`.

### Patch Changes

- [#213](https://github.com/ofri-peretz/burgee/pull/213) [`ecedfa2`](https://github.com/ofri-peretz/burgee/commit/ecedfa2ed0c7aaed23d77c4d02d7c94156a78ce9) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `width` takes `ambiguousIsNarrow`. East Asian Ambiguous characters — `±`, `×`, `÷`, the
  box-drawing set, Greek and Cyrillic — are one column in a Latin terminal and two in a CJK one,
  and nothing can detect which a terminal is doing, so it is the caller's decision. Default
  `true`, matching the incumbent. The 179-range table is generated from Unicode rather than
  transcribed, with a `--check` that fails on drift. Graded: `string-width` 198 / 229 → **201 / 229**.

- [#224](https://github.com/ofri-peretz/burgee/pull/224) [`ea58e63`](https://github.com/ofri-peretz/burgee/commit/ea58e637ee0ee6cdcc655478f6bef54d854f6c0f) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - docs: the README describes the package that shipped

  It opened with "**Not yet released.** This version reserves the name", under a heading
  reading "What it will be", while `linegauge@0.1.0` was live on npm with a graded
  string-width row on the public compatibility page. Anyone who installed it was told the
  package does nothing.

  Rewritten for someone installing it today: what the five functions are, why they are one
  package rather than twelve, and what "without the edge fraying" actually guarantees — a
  cluster is atomic, a style that was open gets closed, and the ellipsis is counted inside the
  budget rather than added on top.

  `strip` and the ASCII fast path are named as still at the gate, because they are.

- [#205](https://github.com/ofri-peretz/burgee/pull/205) [`93114d3`](https://github.com/ofri-peretz/burgee/commit/93114d33b5ac3f9a0ab3b48506255897af40133b) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `width` keeps the contract `string-width` has always kept. A non-string measures `0` instead
  of throwing — a width function is usually reached with whatever a template produced, which is
  why the incumbent answers rather than making every caller guard — and a new
  `countAnsiEscapeCodes` option counts escape sequences as the characters they are made of.
  Graded: `string-width` 194 / 229 → **198 / 229**.

## 0.1.0

### Minor Changes

- [#182](https://github.com/ofri-peretz/burgee/pull/182) [`28a838f`](https://github.com/ofri-peretz/burgee/commit/28a838f0c1314fb79594d9d8bd8e02de785ea80a) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `linegauge` is real: `width` and `wrap` move out of `flagstaff` into the foundation
  package that was reserved for them (F1, the move only). The default export is `width`,
  call-compatible with `string-width`'s default. `flagstaff` imports them and deletes both
  files; its 227 tests pass unchanged, and B4's bundled bytes are identical to the byte —
  the code went to a different file, not away.

### Patch Changes

- [#193](https://github.com/ofri-peretz/burgee/pull/193) [`8586f58`](https://github.com/ofri-peretz/burgee/commit/8586f58542e7896675c0b6fa8815278f8d22d4a3) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Name the tool the package is named after.

  The npm description opened with "the width of material a saw removes in a cut" — that is a
  _kerf_, a different tool from a different trade. A line gauge is the printer's steel rule
  marked in picas and points, which is what a package that measures typeset width actually
  does. The description is the first line a reader sees on npm, so it may as well be the one
  that explains the name.

  No behaviour change.
