# burgee

## 0.6.2

### Patch Changes

- [#298](https://github.com/ofri-peretz/burgee/pull/298) [`ead5f01`](https://github.com/ofri-peretz/burgee/commit/ead5f016ee7fd20492a041c1e6159aea27b2ed5f) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `cliui`'s `toString()` is now linear in the cell it renders. `rowToString` ended each line
  with `str.replace(/ +$/, "")`, whose unanchored start makes the engine retry at every
  position in a run of trailing spaces; a row built from a 50,000-space cell cost 1,223 ms,
  and doubling the cell quadrupled it. The trim now scans, and the same call takes 69 ms —
  the second half of the fix that `measurePadding` got in [#278](https://github.com/ofri-peretz/burgee/issues/278). Output is unchanged: only
  U+0020 is removed, so a trailing tab still survives under `wrap: false` as it did before.

- [#324](https://github.com/ofri-peretz/burgee/pull/324) [`4a7b4ca`](https://github.com/ofri-peretz/burgee/commit/4a7b4ca59981ec00728fa17c49c3da9618f37868) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `scripts/lanes.ts --check` now grants every lane its own changeset, which `.sdlc/LANES.md` has
  granted since the first run of these lanes.

  The document said it; the script did not implement it. So `--check` called each lane's own
  changeset a stray, and every lane brief had to tell its agent to ignore the result of its own
  boundary check — which makes the check worth nothing. A rule stated in the document and absent
  from the enforcement is the exact drift this file exists to prevent, committed by the file that
  prevents it.

  The exemption is read from the paragraph that grants it rather than written down a second time,
  and it is narrow on both axes: `.changeset/config.json` is still a stray, `*` does not cross a
  slash, and another lane's source file is still another lane's. `lane-boundaries-lock.test.ts`
  holds all three, and goes red when the exemption is reverted.

- [#326](https://github.com/ofri-peretz/burgee/pull/326) [`88f7ba6`](https://github.com/ofri-peretz/burgee/commit/88f7ba65e3a79ed20bf7c5bc4feae8b87684122b) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Read the process through one live seam, and fix the cliui growth gate's instrument.

  `src/runtime.ts` is now the only file in the package that names `process` (PLAN 4.3, Y9); the
  allow-list in `process-reference-lock.test.ts` is down from nine burgee entries to one. Every
  member of the new `host` export is a getter, because the commander and yargs front-ends
  reproduce their incumbents' process contracts and those suites swap `process.argv`, `exit` and
  `env` per test — a captured object literal would hand a test the value from before its own
  swap. Graded before and after: commander 1360/1360, yargs 804/804, unchanged. Two reads that
  had been captured at import are now live, `yargs-parser`'s default env among them.

  `growth()` in `yargs/cliui.test.ts` was measuring the clock on one of its two assertions: at
  n = 12,000 both the cost at n and the cost at 4n fell under the helper's 0.05 ms floor, so the
  padding gate computed `0.05 / 0.05` and reported 1.0000 in 17 of 20 runs. It now calibrates a
  batch until the window at n is a real measurement, and takes the minimum of each side across
  samples rather than the minimum of the per-sample ratios — the second is what let a
  GC-perturbed numerator produce the 10.145 that failed CI. The ceiling stays at 8.

- [#326](https://github.com/ofri-peretz/burgee/pull/326) [`88f7ba6`](https://github.com/ofri-peretz/burgee/commit/88f7ba65e3a79ed20bf7c5bc4feae8b87684122b) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The process-reference lock now catches the **binding**, not only the member read.

  The seams built for PLAN 4.3 showed the hole up. `flagstaff/src/runtime.ts` reads the world
  through `import process from 'node:process'`, and `roundel/src/runtime.ts` through a guarded
  `(globalThis as { process?: … }).process` bound to a local — and both files passed the existing
  pattern **untouched**. Their being on the allow-list was a statement of intent rather than
  something the lock enforced.

  Which means any file in any package could have done the same and stayed green: bind the global
  once, then read `proc.env` forever, because the member read is now on a local whose name a
  textual pattern cannot tell from any other. The same hole the `globalThis.` lookbehind closed
  in September, reopened through a different door.

  Proven against a real file in `linegauge/src` — a package with no allow-list entry — in both
  spellings, each green before the change and caught after. And the new pattern's own first catch
  was a **comment** in `chalk.ts` saying where a cast had moved to, which is the defect this file
  already carries a paragraph about: a checker that reads printed source and not shape. Comments
  are stripped before it sees them, and that case is now one of its row-by-row tests.

- [#321](https://github.com/ofri-peretz/burgee/pull/321) [`48aec0a`](https://github.com/ofri-peretz/burgee/commit/48aec0a500b474be8f4c477f1d18433e4b3467bf) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Every package README now carries a generated `## Where it sits`: which key plugins register
  under, and what is above and below the package in the family (PLAN 5.2).

  Both facts are derived rather than written down a second time. The keys come off each
  package's own `export interface Plugin` — its members besides `name` and `contract` _are_ the
  keys — and the edges come from the manifests' own dependency lists. The first version matched
  a fixed alternation of key names instead and reported flagstaff as hosting none, when it hosts
  four the alternation had never heard of: the whole argument against a second copy, made by the
  function that was the second copy.

  `scripts/readme-lock.test.ts` holds it. The assertion that matters is 5.2's own
  done-condition — a hand edit fails — and it is proven rather than asserted: the test edits a
  README and requires the check to notice. Tampering `caique`'s real file with a `gadgets` key
  turns it red, which is the check that makes the other five mean something.

- Updated dependencies [[`fc640dd`](https://github.com/ofri-peretz/burgee/commit/fc640ddec11255c12d1e0948c5b8e99cc3f3263b), [`c8acb28`](https://github.com/ofri-peretz/burgee/commit/c8acb2848714a1cbe3e26a2f9895d7498fb4f096), [`c8acb28`](https://github.com/ofri-peretz/burgee/commit/c8acb2848714a1cbe3e26a2f9895d7498fb4f096), [`88f7ba6`](https://github.com/ofri-peretz/burgee/commit/88f7ba65e3a79ed20bf7c5bc4feae8b87684122b), [`3f92a60`](https://github.com/ofri-peretz/burgee/commit/3f92a6099b1b8d5d476c64405ca963d40bf9af45), [`c8acb28`](https://github.com/ofri-peretz/burgee/commit/c8acb2848714a1cbe3e26a2f9895d7498fb4f096), [`3f92a60`](https://github.com/ofri-peretz/burgee/commit/3f92a6099b1b8d5d476c64405ca963d40bf9af45)]:
  - linegauge@0.3.0
  - seniority@0.2.0
  - roundel@0.3.1

## 0.6.1

### Patch Changes

- [#280](https://github.com/ofri-peretz/burgee/pull/280) [`50cc1a3`](https://github.com/ofri-peretz/burgee/commit/50cc1a325bc99b144b4e1dba701de624bbd76de6) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The B1 agent-cost axis now recognises an empty credential as no credential. A workflow that maps an unset repository secret into the environment leaves the variable **present and empty**, not absent, so a guard testing against `undefined` never fired: the axis ran, `claude` failed to authenticate on all 25 task-runs, and the skip reported that `claude` "answered but nothing it produced passed a task's own check" — pointing a reader at a prompt-quality problem that did not exist.

- [#278](https://github.com/ofri-peretz/burgee/pull/278) [`862e837`](https://github.com/ofri-peretz/burgee/commit/862e83716b66e9aa363a0fa3b703cc9cd38b8929) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - **🐛 Fix** — help screens wrap against the real width: `width`, `strip` and `wrap` come from `linegauge`

  `burgee/yargs`' cliui port carried its own `stringWidth`, `stripAnsi` and a wrap-ansi
  implementation. The strip was wrong: the ITU T.416 sub-parameter form
  `ESC[38:2::255:0:0m` — what chalk emits for truecolor — left `:2::255:0:0m` in the string,
  so a 13-column string measured as 25 and every help screen wrapped against a width that was
  not the width. linegauge owns measuring and wrapping text and had already fixed it.

## 0.6.0

### Minor Changes

- [#265](https://github.com/ofri-peretz/burgee/pull/265) [`0750ebc`](https://github.com/ofri-peretz/burgee/commit/0750ebcf2a66c0254a8f9ae52c83d3d50a37b67a) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - **♻️ Refactor** — precedence and config discovery come from `seniority` rather than a second copy

  burgee carried its own `precedence.ts` and `config.ts`; `config.ts` was byte-identical to
  seniority's and `precedence.ts` differed by nineteen lines. Two copies of a precedence order
  is two answers to "where did this value come from", and `--explain` is only worth anything
  if the thing that picked the value is the thing that reports it.

  The public surface is unchanged — `resolve`, `explain`, `envName`, `screaming`,
  `ConfigError` and their types are still exported from `burgee`, now re-exported from
  `seniority@^0.1.0`, which is a new runtime dependency.

## 0.5.0

### Minor Changes

- [#194](https://github.com/ofri-peretz/burgee/pull/194) [`8693415`](https://github.com/ofri-peretz/burgee/commit/86934153a9389d7e2380c07424cd414748e696a1) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - burgee consumes `roundel` instead of carrying a copy of it.

  `contrast.ts` existed twice — the same WCAG luminance and ratio code in both packages,
  identical constants and identical maths, differing only in which package name the hex error
  message says. That is what a rule forbidding the dependency arrow produces: it does not
  remove the need, it converts it into a copy, which is the one outcome zero-external-deps
  exists to prevent.

  The family order now runs bottom-up — foundation, output stack, engine — so each layer
  consumes the layers below it. burgee is last, because a command declares itself and then
  asks the layers beneath it to render, colour and prompt.

  What a caller installs still comes from one repo: **zero external dependencies** is
  unchanged, and is the claim that was ever worth making.

- [#246](https://github.com/ofri-peretz/burgee/pull/246) [`14b4cb2`](https://github.com/ofri-peretz/burgee/commit/14b4cb2be80deb78079aea2d748ad44aac9a96ff) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `--schema` publishes `relations` (S2/S6). `validate.ts` has enforced `exactlyOneOf`,
  `conflicts`, `implies` and the rest since the surface shipped, and the schema never said so —
  an agent could only discover a constraint by violating it. A predicate `implies` publishes as
  `"(predicate)"` rather than the `null` `JSON.stringify` would leave.

### Patch Changes

- Updated dependencies [[`214f6f8`](https://github.com/ofri-peretz/burgee/commit/214f6f83b16068d7dc53d79799fba03c26a3cbe2), [`214f6f8`](https://github.com/ofri-peretz/burgee/commit/214f6f83b16068d7dc53d79799fba03c26a3cbe2)]:
  - roundel@0.3.0

## 0.4.0

### Minor Changes

- [#156](https://github.com/ofri-peretz/burgee/pull/156) [`799a461`](https://github.com/ofri-peretz/burgee/commit/799a4616881f6cedc0bb1eae31b0b186969b217c) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `--schema` is compact by default (agent-headroom R1). The document an agent reads to
  discover a CLI drops 42% — 39,512 → 22,964 bytes on the large reference demo — for a
  byte-identical parse. `--format=json-pretty` restores indentation for a person reading it.
  Both writers change: the engine's `--schema` and the commander front-end's.

- [#160](https://github.com/ofri-peretz/burgee/pull/160) [`b6fc349`](https://github.com/ofri-peretz/burgee/commit/b6fc349b113f50b6aba3961718aaea76c0f84ffa) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Every boolean option accepts `--no-<name>`. burgee's precedence is `flag > env > config file > package.json field > default`, and the config and package.json layers set options by name — so any boolean can arrive `true` without the user typing anything, while a boolean flag carries no value and `--x=false` is refused. Before this the top layer of that chain could only ever say `true`, and a boolean turned on in a config file could not be turned off from the command line at all. `--x` and `--no-x` together: the later one wins. String options are unaffected, and `--no-config` still means "load none".

- [#134](https://github.com/ofri-peretz/burgee/pull/134) [`7a38fe7`](https://github.com/ofri-peretz/burgee/commit/7a38fe7c321ca2efe54d89a73dcba9205316dc2d) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `burgee/brand` gains three options, so a family of marks can come out of one declaration.

  `shape` replaces the swallowtail with your own silhouette (SVG path data, same `0 0 100 100` box, filled `evenodd` so a nested subpath cuts a hole) — for a sibling brand whose name is not a flag: a roundel is rings, a parrot is a parrot.

  `sheen` lays a soft highlight across the field, clipped to the silhouette and drawn under the charge, so the mark keeps the contrast it was measured at. `alive()` is the same mark with that highlight sweeping across — for a site header, never a favicon — parked still under `prefers-reduced-motion`.

  `bevel` is the third dimension a logo can afford: two stroked copies of the silhouette clipped to itself, light offset toward the light source and dark away from it, so the edge lifts and the face stays flat. Sub-pixel at 16px, where it disappears rather than muddies.

  All three are additive: a brand that declares none renders byte-for-byte what it rendered before.

- [#151](https://github.com/ofri-peretz/burgee/pull/151) [`8f1043a`](https://github.com/ofri-peretz/burgee/commit/8f1043ae367aeb4b7d107e18491bb6c2653cde42) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - A mistyped option now says which one was meant: `error: unknown option --nmae` / `hint: did you mean --name?`, taken from the options the command declared. Exit 2 already told an agent to rewrite the command; this is the half that says how. Previously the native path printed `node:util.parseArgs`'s own message — three lines about `--` and positional arguments, which never mentions the option the caller almost typed — while the commander façade had suggestions all along.

  The edit-distance code is loaded on the failure path only, so `import { defineCommand } from 'burgee'` does not carry it. The core entry point got _smaller_, because the single-dash hint moved out of it too.

### Patch Changes

- [#151](https://github.com/ofri-peretz/burgee/pull/151) [`8f1043a`](https://github.com/ofri-peretz/burgee/commit/8f1043ae367aeb4b7d107e18491bb6c2653cde42) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The repo now dogfoods a twelfth Interlace ESLint plugin, `browser-security`, scoped to the docs app — 41 more rules at `error` over the surface the engine never touches and a browser application does.

- [#151](https://github.com/ofri-peretz/burgee/pull/151) [`8f1043a`](https://github.com/ofri-peretz/burgee/commit/8f1043ae367aeb4b7d107e18491bb6c2653cde42) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Marks for the foundation tier — `linegauge`, `seniority`, `bellpull` and `closeout` — from the same declaration as the other four. No API change: `burgee/brand` already had `shape`, and this is four more of them.

- [#162](https://github.com/ofri-peretz/burgee/pull/162) [`a447fc4`](https://github.com/ofri-peretz/burgee/commit/a447fc434b2162a61b6cf5ce7814cacb1559d06a) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Completions offer `--no-<name>` for every declared boolean, in all four shells, and fish emits the CLI form rather than the declaration name. fish alone built its own spelling instead of going through `flags()`, so it had been completing `-l dryRun` where the flag is `--dry-run` — a flag the parser refuses — for every camelCase option. The reserved surfaces are excluded: `--no-json` and `--no-help` are not accepted by the parser and are not offered.

- [#158](https://github.com/ofri-peretz/burgee/pull/158) [`97ca535`](https://github.com/ofri-peretz/burgee/commit/97ca53593c253d2504892cda62247a0d574bd698) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `--version` and `-V` answer on a program that is a pure command group. `dispatch` had always handled them, but only once a command resolved, so a program whose root runs nothing fell through to `unknown command "--version"` and exit 2 — which under E1 means _rewrite the command_. Real commander and real yargs both print the version and exit 0 for the identical program.

- [#170](https://github.com/ofri-peretz/burgee/pull/170) [`3e4071c`](https://github.com/ofri-peretz/burgee/commit/3e4071c75e417c71961891e18a85238deb3e3d8d) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `burgee/yargs` finds its locale table from the package root rather than from the depth of
  one file. It resolved `../locales` relative to itself, which was correct only while that file
  sat directly in `dist/`; the moment it moved into a directory the path became `dist/locales`,
  y18n returned the key for every string, and 14 of yargs' own 804 tests failed. Walking up to
  `package.json` resolves the same from `src/`, from `dist/`, and from an installed
  `node_modules/burgee/dist/`.

## 0.3.0

### Minor Changes

- [#24](https://github.com/ofri-peretz/burgee/pull/24) [`cf951de`](https://github.com/ofri-peretz/burgee/commit/cf951de876b23c5f9bc38d734e3028b723983178) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `Runtime` gains a `clock` (`now`, `schedule`) with a deterministic fake in `burgee/testing`, and `renderHelp` accepts `{ color, theme }` — a structural token map the output stack can fill without burgee importing it.

- [#33](https://github.com/ofri-peretz/burgee/pull/33) [`8ad4d4a`](https://github.com/ofri-peretz/burgee/commit/8ad4d4abb5077433dfa875f3f1a95480e95c2a52) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Large CLIs (M1–M6): `load: () => import('./x.js')` on a command loads its handler on dispatch only — help, `--schema` (which marks it `lazy`), completions and the MCP tool list are complete without it; `sharedOptions(name, specs)` declares a set once and each copy is tagged `sharedFrom` in the schema; a command with `deprecated: 'new'` warns once on stderr and runs; `group` and `plugin` ride on the schema; `resolveCommand` and `runCommand` are public. The commander façade gains `.deprecate(use?)` and projects `.helpGroup()`. A required positional that argv did not supply is now a usage error naming it — it had never been enforced.

- [#23](https://github.com/ofri-peretz/burgee/pull/23) [`0770990`](https://github.com/ofri-peretz/burgee/commit/07709908c423411ab97252812dfa5ec8d3cf4e0a) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `burgee dev <entry>`: your agent is connected to your CLI while you write it. The entry (exporting `program` as a burgee manifest, a commander `Command` or a yargs instance) is served as MCP on stdio; on every save it is re-imported as a fresh module graph, the served manifest is swapped, `notifications/tools/list_changed` goes out, and the diff plus the rendered help are printed on stderr. Dev-time only and removable: nothing a shipped CLI imports can reach it. `startMcp()` is the swappable server `serveMcp()` now wraps.

- [#19](https://github.com/ofri-peretz/burgee/pull/19) [`9670224`](https://github.com/ofri-peretz/burgee/commit/96702248dfccff5074874ce4a3d0b9d19754a3fc) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - burgee's additions on yargs syntax, guarded so a program that asks for none of them runs exactly as on yargs (804 / 804 still): `yargs.manifest` projected from what the program registered (builders run on a scratch instance, as yargs' completion does), `use(plugin)` with `preRun`/`postRun` around every handler, `.effects()` inside a builder, `--json` as the `{ ok, data, meta }` envelope when the program did not declare it anywhere in its tree, `--schema`, `--mcp` and `completion <shell>` from the manifest, and `.burgee({ stdout, stderr, exit })` injecting the streams and reporting E1 exit codes.

- [#16](https://github.com/ofri-peretz/burgee/pull/16) [`c7d1aa0`](https://github.com/ofri-peretz/burgee/commit/c7d1aa0f271c0733b42213c0351e6aebcc7dd909) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `burgee/yargs/parser`: the ported yargs-parser as its own entry — what `import parser from 'yargs-parser'` gave, for a program that imported the parser directly. With it, and with the compatibility harness able to `require()` its vendored root as a package, both façades now pass **100%** of their hosts' own suites: `burgee/commander` 1,361 / 1,361 and `burgee/yargs` 804 / 804.

## 0.2.0

### Minor Changes

- [#14](https://github.com/ofri-peretz/burgee/pull/14) [`95a954f`](https://github.com/ofri-peretz/burgee/commit/95a954f82f44ce1249fa1a051e529ad46b258376) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `burgee/yargs` and `burgee/yargs/helpers`: yargs 18 ported method for method — with its whole dependency tree (yargs-parser 22, cliui 9 with string-width and wrap-ansi, y18n 5 and the 29 locales, escalade, get-caller-file) reimplemented over no dependency — and graded by yargs' own suite: **782 / 804** on the first run, one short of the 783 the real package scores in the same environment. The one test left asserts that `Parser` is the same object as the `yargs-parser` npm package, which a dependency-free port cannot be. `import yargs from 'burgee/yargs'` and `import { hideBin, applyExtends, Parser } from 'burgee/yargs/helpers'` are the drop-in; `examples/conformance` proves the demo byte-identical on both.

### Patch Changes

- [#13](https://github.com/ofri-peretz/burgee/pull/13) [`21d0f4f`](https://github.com/ofri-peretz/burgee/commit/21d0f4f32722b19831fcfa3c7f4d73849eaeaed5) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `burgee/commander`: `parse()` is synchronous again and `parseAsync()` starts synchronously, exactly as commander's do. Since the `--schema`/`--mcp` surface landed, both went through an `async` surface check, so a synchronous action ran a microtask after `parse()` returned and a `preAction` hook after `parseAsync()` handed back its promise — commander's own suite asserts on both after every parse. 638 of its 1,331 tests had been failing on `main` while the Compatibility job reported success, because a `| tee` pipe hid the grader's exit code; every workflow step that pipes into `tee` now runs with `pipefail`.
