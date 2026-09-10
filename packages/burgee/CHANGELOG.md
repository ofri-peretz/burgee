# burgee

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
