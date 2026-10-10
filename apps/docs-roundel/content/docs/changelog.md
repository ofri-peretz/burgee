---
title: Changelog
description: "Every release of roundel, newest first, from its CHANGELOG.md — what changed and the pull request it came from."
---

## 1.0.3

### Patch Changes

- [#917](https://github.com/ofri-peretz/burgee/pull/917) [`735f0f6`](https://github.com/ofri-peretz/burgee/commit/735f0f68048f2d0f5e4effad151ed5132b480bb8) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - README: the opening paragraph says what the package does first. The drop-in path follows it as one line, naming the incumbent and `npx burgee migrate`, and every compatibility row and benchmark is unchanged.

## 1.0.2

### Patch Changes

- [#897](https://github.com/ofri-peretz/burgee/pull/897) [`f29f159`](https://github.com/ofri-peretz/burgee/commit/f29f159ca0c9746f58d8ba84eec9be72b1140093) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - controlroom has its own docs site at https://controlroom.interlace.tools: its README's Docs line, its `homepage`, and every family table now link there.

## 1.0.1

### Patch Changes

- [#848](https://github.com/ofri-peretz/burgee/pull/848) [`6ae533e`](https://github.com/ofri-peretz/burgee/commit/6ae533e4610c32bad557f5d74a24d0c9a0f07f7e) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The family `schema.json` describes what five values look like. `contract` is `1`, and burgee refuses a plugin that declares none. A caique widget's `static(spec)` gets `{ kind, message, ...sample.done }`. A seniority `rank` sits between the built-in layers at flag 0, environment 10, config file 20, `package.json` 30 and default 40. A burgee hook's `filter` is `{ command: RegExp }`, now with `command` required, so the schema and the host refuse the same filters.

- [#857](https://github.com/ofri-peretz/burgee/pull/857) [`d80b2d0`](https://github.com/ofri-peretz/burgee/commit/d80b2d0f4a535400c6825b42ac2d8e1be2827f4e) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The family `schema.json` closes a bellpull resolver's `when` with `additionalProperties: false`, so the schema and bellpull's own validation refuse the same unknown keys.

## 1.0.0

### Major Changes

- [#830](https://github.com/ofri-peretz/burgee/pull/830) [`1945d65`](https://github.com/ofri-peretz/burgee/commit/1945d65f22aafabd380d67f1e40341d6ef3aa6fa) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - roundel 1.0.0. The spec is fully built, every drop-in passes its incumbent's own suite at the latest release level with the incumbent itself, and coverage is 100% on all four measures (D-20261006-foundation-1-0-evidence). 1.0 makes the published entries, the plugin `schema.json` and the `roundel` bin a semver contract. No API changed in this release.

## 0.6.3

### Patch Changes

- [#816](https://github.com/ofri-peretz/burgee/pull/816) [`5230016`](https://github.com/ofri-peretz/burgee/commit/52300169a98ece41b3544e5316833464e63a7c83) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - controlroom hosts plugins (R10): `keymaps` and `panes` register through `controlroom/plugin`'s `register()` against the family schema, a screen takes either by name, and `controlroom check <plugin-file>` reports what a plugin contributes. The family schema every host ships gains the `keymaps` and `panes` definitions.

## 0.6.2

### Patch Changes

- [#783](https://github.com/ofri-peretz/burgee/pull/783) [`08976ae`](https://github.com/ofri-peretz/burgee/commit/08976ae734f0494720e0dce06dd850bf7177766f) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `ctx.interactive` is roundel's `interactive()`, the family's one rule for whether a person may be asked: a terminal on **stdin**, no `CI`, and no detected agent, with `FORCE_TTY=1` over all three. caique's prompts already ask it, so a handler and a prompt now agree about the same shell.

  It used to read stdout and ignore `CI`. Three things change for a handler that reads it:

  - Under a non-empty `CI` it is `false`, even on a pseudo-terminal.
  - With stdin piped it is `false`, even when stdout is a terminal.
  - With stdout piped and stdin a terminal (`tool deploy | tee log`) it is `true`, because an answer can still be typed.

  burgee loads `roundel/terminal` in a chunk of its own (`ctx.js`, 330 B), only on the path that runs a handler. Help, `--version`, `--schema`, `--mcp` and failures never load it. The root entry shrinks (35,629 → 35,437 B on disk), and so does the bundled initial load of `import { run } from 'burgee'` (24,297 → 24,278 B). `ctx.agent`, `detectAgent`, `AGENT_PROBES` and help's colour, which reads stdout, are unchanged. `runBurgee` forwards `tty` onto stdin too, so `tty: true` is still a terminal a person can answer on.

  The agent variables stay at five (`AI_AGENT`, `CLAUDECODE`, `CURSOR_AGENT`, `CODEX_THREAD_ID`, `GEMINI_CLI`). One joins only when it uniquely identifies an agent, so `CURSOR_TRACE_ID`, which Cursor sets in every integrated terminal, never will. roundel's `AGENTS` documents that rule, and a test pins that a person in Cursor is asked.

## 0.6.1

### Patch Changes

- [#770](https://github.com/ofri-peretz/burgee/pull/770) [`6195b99`](https://github.com/ofri-peretz/burgee/commit/6195b99344a21b4a05ab100fc38358deab229ce8) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `roundel/chalk` is faster.

  - A builder keeps the escapes it opens and closes with, built one pair at a time as its chain grows, instead of rebuilding them on every call.
  - It reads its links as kept properties rather than through a Proxy trap on every access, and it skips the re-open and line-break passes a string doesn't need.
  - In B5, ours ÷ chalk on the 10k-string workload went from 3.55× to 1.17×.
  - `roundel/tokens` exports the pieces: `painter(at, pair)`, `painted(painter, text)` and `UNPAINTED`. `sgr(chain, text)` is unchanged.
  - `./chalk` stays under chalk 6.0.0's own source size (9,361 of 9,370 B).

## 0.6.0

### Minor Changes

- [#760](https://github.com/ofri-peretz/burgee/pull/760) [`a115799`](https://github.com/ofri-peretz/burgee/commit/a1157991a5defddadfbea49ba8ea3bf161d4a832) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `roundel/import`: `fromBase16(scheme)` and `fromITerm(plist)` read a Base16 scheme (its YAML or JSON text, or the object a reader made of it) or an iTerm2 `.itermcolors` file into the theme `fly()` takes.

  `error`, `warn`, `ok`, `flag` and `value` take the ANSI hue each one's default names, and `ground` the background; the mapping is exported as `BASE16_SLOTS` and `ITERM_SLOTS`. The theme is checked by `audit()` before it is returned, so a scheme that does not read on its own background is refused with an `ImportError` naming the slot, and whatever an importer returns, `fly()` accepts. Every refusal carries a `code` (`E_IMPORT_FORMAT`, `E_IMPORT_SLOT`, `E_IMPORT_CONTRAST`) and a `fix`. No network and no bundled corpus: the file is yours to supply. Its own subpath, not re-exported from `roundel`.

  `roundel/chalk` is now graded by chalk 6.0.1's own suite: 59 / 59, level with chalk itself.

## 0.5.6

### Patch Changes

- [#752](https://github.com/ofri-peretz/burgee/pull/752) [`22e6dae`](https://github.com/ofri-peretz/burgee/commit/22e6dae1b71bfa478265829a1b98d20a6f9de4f7) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - A plugin that declares `contract: 0` or a negative contract is now refused with `E_PLUGIN_CONTRACT`, as `schema.json`'s minimum of 1 always said. These hosts checked only that a contract was not newer than the one they know, so 0 and below registered.

## 0.5.5

### Patch Changes

- [#674](https://github.com/ofri-peretz/burgee/pull/674) [`e9f45d8`](https://github.com/ofri-peretz/burgee/commit/e9f45d85d9db5b2e3dcaa1e43f292a1281a6952a) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - README: family header, badges, install, migrating, the family table.

  Every package README now opens the same way — lockup, tagline, one badge row in one order (npm version, downloads, Quality Gate, the package's own coverage, OpenSSF Scorecard, unpacked size, dependencies, types, Node, licence, npm provenance), a row of compatibility badges read from the graded baseline — and carries the same sections in the same order: Install for npm, pnpm, yarn and bun, Quick start, Migrating as a before/after diff, Compatibility, Benchmarks, For agents, API, and a generated table of the nine packages. Links are absolute, so they work on npm as well as GitHub.

- [#710](https://github.com/ofri-peretz/burgee/pull/710) [`620fc74`](https://github.com/ofri-peretz/burgee/commit/620fc74af013834ca6b15faa2772aeb94c5013b1) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Three code paths no input could reach are removed; behaviour is unchanged. `roundel check` no longer carries a "(replaces …)" suffix it could never print, because it loads one plugin into an emptied registry. The 16-colour fallback no longer carries a bright-black branch or a lookup default, because black returns before the bright form is built and three bits index all eight names.

- [#678](https://github.com/ofri-peretz/burgee/pull/678) [`088cecc`](https://github.com/ofri-peretz/burgee/commit/088ceccb7dda1cbe878950c631f49f48980dd2e2) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Whether anybody is there, whether to colour, and whether a tick can be drawn are roundel's questions, and three packages answered them by hand.

  - `roundel/terminal` (new subpath, 878 B, reaching nothing): `interactive(rt)` — a terminal on stdin, no `CI`, and no agent variable (`CLAUDECODE`, `AI_AGENT`, `CURSOR_AGENT`, `CODEX_THREAD_ID`, `GEMINI_CLI`, exported as `AGENTS`), with `FORCE_TTY=1` as the override — and `unicode(rt)`, is-unicode-supported 2.1.0's table over `{ env, platform }`.
  - `caique/decide` now depends on `roundel` and asks `interactive()`. **Behaviour change:** under an agent that has a terminal — `CLAUDECODE=1` and a TTY on stdin — a missing required value is refused with a usage error naming the flag (`--x is required when nobody is there to answer`) instead of prompting and hanging the agent. `FORCE_TTY=1` now prompts even without a terminal on stdin, as it does for burgee.
  - `caique/inquirer`'s tick and `flagstaff/ora`'s log symbols and spinner fallback use roundel's `unicode()`. caique's copy was a four-condition subset: the Linux console (`TERM=linux`) now gets `√` rather than `✔`, and ConEmu/Cmder, Terminus, Alacritty, rxvt-unicode and JetBrains' terminal on Windows now get `✔`, as `figures` draws them.
  - `burgee` help colour is roundel's `colorLevel(rt) > 0`. **Behaviour changes:** `NO_COLOR` now beats `FORCE_COLOR`; `--no-color` and `--color=…` on the command line are honoured; `CLI_ACCESSIBLE` turns help colour off; and a terminal that sets no `TERM` (Windows' conhost) gets plain help unless `FORCE_COLOR`, `--color` or `COLORTERM` asks for colour.
  - `burgee/contrast` rounds with roundel's `round2`; no output changes.
  - `paratext`: the supports-color fork behind `paratext/terminal-link` is unchanged, and now held to roundel's policy by a parity test everywhere their two incumbents agree.

## 0.5.4

### Patch Changes

- [#627](https://github.com/ofri-peretz/burgee/pull/627) [`4a629a9`](https://github.com/ofri-peretz/burgee/commit/4a629a9ff1129f2ce6f0c34e7cfc1d159304d18a) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Lint with every published Interlace ESLint plugin, and fix what the upgrade surfaced.

  - caique: the inquirer theme merge skips `__proto__`, `constructor` and `prototype` keys, so a theme object cannot swap the merged object's prototype.
  - burgee: last-element reads use `.at(-1)`.
  - burgee, closeout, flagstaff, roundel: helpers that capture nothing from their enclosing function move to module scope.
  - seniority: suppression comments name the `no-dynamic-require` rule that now reports the config loader's dynamic `require`.

  No public API or output changes.

## 0.5.3

### Patch Changes

- [#604](https://github.com/ofri-peretz/burgee/pull/604) [`0e7b1e8`](https://github.com/ofri-peretz/burgee/commit/0e7b1e88a7021350cf689f109c7728f799be1589) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Each README links to its migration guides under the docs link: "Migrating from: chalk", "ora · log-update · boxen · cli-table3", and so on. That puts a path from the npm page to the guide for the library you are replacing. No code changes.

## 0.5.2

### Patch Changes

- [#474](https://github.com/ofri-peretz/burgee/pull/474) [`1955419`](https://github.com/ofri-peretz/burgee/commit/19554194342b55f8893161f894a8c2a4df1b0f21) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - burgee plugins can hook two more stages. `parse` runs before the command is resolved: it receives argv and may return a replacement, which is how an alias plugin maps `d` to `deploy`. `shutdown` runs once as the program exits, whether the command succeeded or failed. The family `schema.json` shipped in every package now describes both stages.

- [#519](https://github.com/ofri-peretz/burgee/pull/519) [`77ff1cb`](https://github.com/ofri-peretz/burgee/commit/77ff1cb8e595d32bb8bddf441ae21fc61e6f247d) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The drop-ins now export their incumbents' type names, so a TypeScript program migrates by its import alone: `roundel/chalk` gains chalk's `Color`, `ForegroundColor`, `BackgroundColor`, `Modifiers` and `Options`; `flagstaff/ora` gains `Spinner`, `PrefixTextGenerator` and `SuffixTextGenerator`; `flagstaff/boxen` gains `Options`, `CustomBorderStyle` and `Boxes`; `flagstaff/log-update`, `linegauge`, `linegauge/wrap` and `closeout/exit-hook` gain `Options`; `burgee/yargs/parser` gains `Arguments`, `Options` and `Configuration`. Types only — no runtime bytes.

## 0.5.1

### Patch Changes

- [#508](https://github.com/ofri-peretz/burgee/pull/508) [`1aae1e2`](https://github.com/ofri-peretz/burgee/commit/1aae1e2186ce88421067df5317795773419e53d0) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `<package> --help` and `--version` answer instead of crashing. The bin took its first argument as the plugin file to import, so `roundel --help` failed with `Cannot find module '…/--help'` and exit 1. `-h`/`--help` now print usage and exit 0, `-V`/`--version` print the version and exit 0, and any other flag where the plugin file belongs is a usage error, exit 2.

## 0.5.0

### Minor Changes

- [#507](https://github.com/ofri-peretz/burgee/pull/507) [`b8e97dc`](https://github.com/ofri-peretz/burgee/commit/b8e97dcb64772e413f0b6f9e17e063c73314d242) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Runs on Node 20 and 22, not just 24+: `engines.node` is now `^20.19.0 || >=22.13.0`. Those are the first releases where `require(esm)` loads without a warning, so the CommonJS `require()` path keeps working. Every package's test suite runs on exactly 20.19.0 and 22.13.0, on Linux, macOS and Windows. caique's prompts no longer call `Promise.withResolvers`, which Node 20 doesn't have.

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

### Patch Changes

- [#430](https://github.com/ofri-peretz/burgee/pull/430) [`4d1b2b3`](https://github.com/ofri-peretz/burgee/commit/4d1b2b399cff354864d1e2e843a19fde80ef1f30) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `check` now reports every refusal with its code and its fix, wherever it was raised.

  Some plugin files register themselves on import: they call `register()` at the top of the module and export the result. Until now, when such a file was refused, the error was thrown inside `check`'s `import()`, before the only `try` that turns a `PluginError` into `E_PLUGIN_SCHEMA: …` plus a `fix:` line. The author got the bare message on stderr, with no code and no fix. Now the whole of `check` runs inside that one handler, so every refusal comes out the same way on every host.

## 0.3.1

### Patch Changes

- [#326](https://github.com/ofri-peretz/burgee/pull/326) [`88f7ba6`](https://github.com/ofri-peretz/burgee/commit/88f7ba65e3a79ed20bf7c5bc4feae8b87684122b) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - One `Runtime` seam per package, and one file in each that names the process (Y9).

  `roundel/src/runtime.ts` and `flagstaff/src/runtime.ts` each declare a `Runtime` — the slice
  of the world that package actually needs — and a `processRuntime()` that is the only place
  the real process is named. Six files stop naming it: `roundel/chalk`, and flagstaff's `cli`,
  `ora`, `boxen`, `cursor` and `log-update`.

  Nothing about the ports' behaviour moved, and the shape of each seam is what holds that.
  roundel's returns a literal, because chalk's contract is to detect the terminal once at
  import; flagstaff's hands back the live process narrowed to the interface, because its
  incumbents read the process at call time — boxen takes `stdout.columns` every time a box is
  drawn, so a box drawn after a resize still uses the new width, and ora still hooks the real
  stream objects and still looks up `kill` when it re-signals a swallowed Ctrl+C. The
  compatibility rows are unchanged: chalk 58/58, ora 99/99, log-update 99/99, boxen 84/84,
  restore-cursor 6/6.

- [#294](https://github.com/ofri-peretz/burgee/pull/294) [`3f92a60`](https://github.com/ofri-peretz/burgee/commit/3f92a6099b1b8d5d476c64405ca963d40bf9af45) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - paratext validates against the family plugin schema, with its shape under `capabilities`.

  paratext shipped its own `schema.json` whose root _was_ one capability, so the family had
  three plugin schemas where the contract says one (PRINCIPLES 14, `plugin-contract` R2).
  The capability shape is now `$defs/capability` of the shared file, reached through a
  `capabilities` key beside `spinners`, `tokens` and `components`, and
  `packages/*/src/schema.json` hashes to one value. flagstaff and roundel ship the same
  bytes: their published `./schema.json` gains the capability definitions and nothing about
  what they validate changes.

  `check()` follows the schema's `$defs/capabilityDocument` and takes either shape:

  - a plugin carrying its capabilities under `capabilities`, which is where they live from
    now on, and whose problems are reported at `capabilities.<key>`;
  - **deprecated** — one capability written as the whole document, which is what a 0.2
    capability file looks like. It still validates, and `check()` returns a `deprecated:`
    line saying to move it under `capabilities`. paratext 1.0 stops accepting it
    (`.sdlc/PLAN.md` D2).

  `refusals()` and `isDeprecation()` are exported to tell the two kinds of line apart; the
  lines that are not deprecations are the ones that block, and the ones `register()` throws
  on. `register(capability)` is unchanged: it takes one capability, not a document, so it
  neither reports nor accepts the document-level deprecation.

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

## 0.3.0

### Minor Changes

- [#218](https://github.com/ofri-peretz/burgee/pull/218) [`214f6f8`](https://github.com/ofri-peretz/burgee/commit/214f6f83b16068d7dc53d79799fba03c26a3cbe2) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `audit()` and `reportTheme()` — ask whether your colouring meets WCAG AA and get rows back
  instead of an exception. Two rows per hex token, `truecolor` and `256`, because those are the
  two colours a terminal can be sent; none for 16, whose values are the user's own theme.
  `fly()` is now a filter over `audit()`, so the refusal and the report cannot disagree.

- [#218](https://github.com/ofri-peretz/burgee/pull/218) [`214f6f8`](https://github.com/ofri-peretz/burgee/commit/214f6f83b16068d7dc53d79799fba03c26a3cbe2) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Colour correctness, in three parts. The contrast check now covers the 256-colour entry the
  terminal actually receives, not just the hex an author wrote — 167 hexes in an sRGB sweep read
  at truecolor and failed at 256. That substitution is chosen by nearest-in-OKLab **among
  entries that clear the floor**, which is perceptually closer than per-channel rounding and
  readable by construction rather than by luck. And `Theme.conformance` takes `'AA'` (default) or
  `'AAA'`, raising the floor for the check and the search together.

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
