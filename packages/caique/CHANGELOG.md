# caique

## 1.0.2

### Patch Changes

- [#897](https://github.com/ofri-peretz/burgee/pull/897) [`f29f159`](https://github.com/ofri-peretz/burgee/commit/f29f159ca0c9746f58d8ba84eec9be72b1140093) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - controlroom has its own docs site at https://controlroom.interlace.tools: its README's Docs line, its `homepage`, and every family table now link there.
- Updated dependencies [[`f29f159`](https://github.com/ofri-peretz/burgee/commit/f29f159ca0c9746f58d8ba84eec9be72b1140093)]:
  - closeout@1.0.2
  - linegauge@1.0.6
  - paratext@1.0.2
  - roundel@1.0.2

## 1.0.1

### Patch Changes

- [#886](https://github.com/ofri-peretz/burgee/pull/886) [`d33ae03`](https://github.com/ofri-peretz/burgee/commit/d33ae0342583cebfa54be1a043d0c085efd9eaaf) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The README and docs index say caique is 1.0, not "Released, pre-1.0.": it shipped 1.0.0 on 2026-10-08.

## 1.0.0

### Major Changes

- [#851](https://github.com/ofri-peretz/burgee/pull/851) [`446a691`](https://github.com/ofri-peretz/burgee/commit/446a691ae1b1ff05e06699fd44034f61e91906c2) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - caique 1.0.0. The spec is fully built, `caique/clack` (16 / 16) and `caique/inquirer` (41 / 41) pass their incumbents' own suites at the latest release, level with the incumbents, and coverage is 100% on all four measures (D-20261007-caique-controlroom-1-0-evidence). The published entries, the plugin `schema.json` and the `caique` bin become a semver contract. No API changed in this release.

### Patch Changes

- [#857](https://github.com/ofri-peretz/burgee/pull/857) [`d80b2d0`](https://github.com/ofri-peretz/burgee/commit/d80b2d0f4a535400c6825b42ac2d8e1be2827f4e) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `caique check` refuses a widget whose `static` throws on its own `sample`. It used to print the throw as a row, then `<name>: ok`, and exit 0. Now each throwing widget is an `E_NO_STATIC_PROJECTION` refusal that names the widget and what it threw, with a `fix`, and the command exits 1 without printing `ok`.

- [#848](https://github.com/ofri-peretz/burgee/pull/848) [`6ae533e`](https://github.com/ofri-peretz/burgee/commit/6ae533e4610c32bad557f5d74a24d0c9a0f07f7e) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The family `schema.json` describes what five values look like. `contract` is `1`, and burgee refuses a plugin that declares none. A caique widget's `static(spec)` gets `{ kind, message, ...sample.done }`. A seniority `rank` sits between the built-in layers at flag 0, environment 10, config file 20, `package.json` 30 and default 40. A burgee hook's `filter` is `{ command: RegExp }`, now with `command` required, so the schema and the host refuse the same filters.

- [#857](https://github.com/ofri-peretz/burgee/pull/857) [`d80b2d0`](https://github.com/ofri-peretz/burgee/commit/d80b2d0f4a535400c6825b42ac2d8e1be2827f4e) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The family `schema.json` closes a bellpull resolver's `when` with `additionalProperties: false`, so the schema and bellpull's own validation refuse the same unknown keys.

- [#848](https://github.com/ofri-peretz/burgee/pull/848) [`6ae533e`](https://github.com/ofri-peretz/burgee/commit/6ae533e4610c32bad557f5d74a24d0c9a0f07f7e) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Each README now shows a whole plugin as a default export, the command that checks it (from an install, and from a clone where `dist/` has to be built first), and the report `check` prints when the plugin passes. caique says what a widget's `static(spec)` receives. seniority gives the `rank` for each slot between the built-in layers. bellpull says that `{VAR}` is the only substitution a path gets.
- Updated dependencies [[`6ae533e`](https://github.com/ofri-peretz/burgee/commit/6ae533e4610c32bad557f5d74a24d0c9a0f07f7e), [`d80b2d0`](https://github.com/ofri-peretz/burgee/commit/d80b2d0f4a535400c6825b42ac2d8e1be2827f4e)]:
  - closeout@1.0.1
  - linegauge@1.0.5
  - paratext@1.0.1
  - roundel@1.0.1

## 0.7.2

### Patch Changes

- Updated dependencies [[`1945d65`](https://github.com/ofri-peretz/burgee/commit/1945d65f22aafabd380d67f1e40341d6ef3aa6fa), [`1945d65`](https://github.com/ofri-peretz/burgee/commit/1945d65f22aafabd380d67f1e40341d6ef3aa6fa), [`9ebef65`](https://github.com/ofri-peretz/burgee/commit/9ebef654930ac4565f1ee04ec5f8b6f735c6a1d9), [`1945d65`](https://github.com/ofri-peretz/burgee/commit/1945d65f22aafabd380d67f1e40341d6ef3aa6fa)]:
  - closeout@1.0.0
  - paratext@1.0.0
  - roundel@1.0.0

## 0.7.1

### Patch Changes

- [#810](https://github.com/ofri-peretz/burgee/pull/810) [`a47209b`](https://github.com/ofri-peretz/burgee/commit/a47209b3a7774e4ecdd1def3043d19afed5a1266) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `caique/terminal`: `createIo()`'s reader no longer drops lines that arrive before a question is asked. It listened for one `line` event per `line()` call, so `printf 'x\ny\n' | cli` lost both answers and `ask()` read the missing line as a cancellation. Lines are now queued from a single listener and handed out in order, before the end of the stream is.

- [#816](https://github.com/ofri-peretz/burgee/pull/816) [`5230016`](https://github.com/ofri-peretz/burgee/commit/52300169a98ece41b3544e5316833464e63a7c83) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - controlroom hosts plugins (R10): `keymaps` and `panes` register through `controlroom/plugin`'s `register()` against the family schema, a screen takes either by name, and `controlroom check <plugin-file>` reports what a plugin contributes. The family schema every host ships gains the `keymaps` and `panes` definitions.
- Updated dependencies [[`5230016`](https://github.com/ofri-peretz/burgee/commit/52300169a98ece41b3544e5316833464e63a7c83), [`5230016`](https://github.com/ofri-peretz/burgee/commit/52300169a98ece41b3544e5316833464e63a7c83), [`5230016`](https://github.com/ofri-peretz/burgee/commit/52300169a98ece41b3544e5316833464e63a7c83)]:
  - closeout@0.7.0
  - paratext@0.9.0
  - linegauge@1.0.4
  - roundel@0.6.3

## 0.7.0

### Minor Changes

- [#801](https://github.com/ofri-peretz/burgee/pull/801) [`81fc994`](https://github.com/ofri-peretz/burgee/commit/81fc994c27ae7731495c810c4f642ba63d7eb073) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `caique/editor`: the line editor as a component a host drives (`editor()` returns `initial`, an `onKey` reducer and `render`), with multi-line entry, history, bracketed paste treated as text, and a completion menu the program feeds. Its commands are a `caique/keys` keymap (`EDITOR_KEYS`). Off a terminal, `submissions(stdin)` yields one entry per line and ends when the input does. The editing itself moved into a module `caique/clack`'s prompts share, so there is one line editor in the package.

- [#801](https://github.com/ofri-peretz/burgee/pull/801) [`81fc994`](https://github.com/ofri-peretz/burgee/commit/81fc994c27ae7731495c810c4f642ba63d7eb073) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `caique/keys`: key presses decoded through `node:readline`'s keypress events into one `KeyPress` shape, keymaps as plain data (`match()`, `bindings()`), and `readKeys()`, which takes raw mode once through `closeout/cursor` and throws `E_NOT_A_TERMINAL` with a `fix` instead of waiting when stdin is not a terminal. `caique/raw`'s `keyOf` is rebuilt on the same decoder, and now reads the application-mode arrows (`ESC O A`) a terminal can send.

## 0.6.4

### Patch Changes

- Updated dependencies [[`b44f426`](https://github.com/ofri-peretz/burgee/commit/b44f426621ed799700cceda8c979de8f759f56b7), [`6195b99`](https://github.com/ofri-peretz/burgee/commit/6195b99344a21b4a05ab100fc38358deab229ce8)]:
  - paratext@0.8.0
  - roundel@0.6.1

## 0.6.3

### Patch Changes

- [#764](https://github.com/ofri-peretz/burgee/pull/764) [`1817b62`](https://github.com/ofri-peretz/burgee/commit/1817b6286fae3943e79686a42dc635cca0f0cdda) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `caique/clack` now grades 16 / 16 against `@clack/prompts` 1.8.1's own suite, level with clack itself at 16 / 16. It was 16 / 17. The pass count did not change. The denominator did: one case, `guide.test.ts`'s `no prompt renders a guide when withGuide is globally false`, is now excluded by its exact title. It imports `updateSettings` from `@clack/core` and asserts that the prompts read that package's module state, so it grades `@clack/core` and not `@clack/prompts` (D-20260930-caique-clack-core-exclusion). The exclusion and its reason are on the compatibility page.

  Because the row is level, `burgee migrate` now rewrites `@clack/prompts` to `caique/clack`. It refuses a file that imports `box`, `progress` or `taskLog`, which `caique/clack` does not build, and leaves that file on clack. It does not rewrite `@clack/core`. So a migrated program that imports `updateSettings` from `@clack/core` is still changing clack's settings, and caique's prompts never read them. Import `updateSettings` from `caique/clack` instead.

- Updated dependencies [[`6c2e9c5`](https://github.com/ofri-peretz/burgee/commit/6c2e9c5cee5d9962c0d75d84a766c76b76760f7f), [`6c2e9c5`](https://github.com/ofri-peretz/burgee/commit/6c2e9c5cee5d9962c0d75d84a766c76b76760f7f)]:
  - linegauge@1.0.1
  - paratext@0.7.5

## 0.6.2

### Patch Changes

- Updated dependencies [[`a115799`](https://github.com/ofri-peretz/burgee/commit/a1157991a5defddadfbea49ba8ea3bf161d4a832)]:
  - roundel@0.6.0

## 0.6.1

### Patch Changes

- [#752](https://github.com/ofri-peretz/burgee/pull/752) [`22e6dae`](https://github.com/ofri-peretz/burgee/commit/22e6dae1b71bfa478265829a1b98d20a6f9de4f7) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - A plugin that declares `contract: 0` or a negative contract is now refused with `E_PLUGIN_CONTRACT`, as `schema.json`'s minimum of 1 always said. These hosts checked only that a contract was not newer than the one they know, so 0 and below registered.
- Updated dependencies [[`12bac9c`](https://github.com/ofri-peretz/burgee/commit/12bac9c99cb87ec2b67a56b4afc38de2c21687c7), [`22e6dae`](https://github.com/ofri-peretz/burgee/commit/22e6dae1b71bfa478265829a1b98d20a6f9de4f7)]:
  - paratext@0.7.4
  - closeout@0.6.1
  - roundel@0.5.6

## 0.6.0

### Minor Changes

- [#638](https://github.com/ofri-peretz/burgee/pull/638) [`e4c1f69`](https://github.com/ofri-peretz/burgee/commit/e4c1f6951dcbc73d581ce1edce4cf3f9ae183058) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `caique/clack` now carries `@clack/prompts`' prompts, not only `limitOptions`: `text`, `password`, `confirm`, `multiline`, `date`, `path`, `select`, `selectKey`, `multiselect`, `groupMultiselect`, `autocomplete` and `autocompleteMultiselect`, with `intro`, `outro`, `cancel`, `note`, `log`, `stream`, `spinner`, `tasks`, `group`, the `S_*` glyphs, `settings`/`updateSettings` and `isCancel`, under clack's names and options. They run on caique's own keypress loop and reach nothing outside this repository. Graded by clack's own suite at 16 / 17 (was 14 / 17; the control is 17 / 17): the one case left imports `updateSettings` from `@clack/core`, which caique does not depend on (D-152). The spinner animates only on a terminal outside CI and prints each message once anywhere else. `box`, `progress` and `taskLog` are not built. `burgee migrate` reports the new grade and, since it is not level with the control, still does not rewrite `@clack/prompts`.

### Patch Changes

- [#708](https://github.com/ofri-peretz/burgee/pull/708) [`b52659f`](https://github.com/ofri-peretz/burgee/commit/b52659fbb7da12fa5fe372962af3bcdac0d022e6) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `caique/clack`: a prompt's raw mode goes through `closeout/cursor`'s `rawMode`, as `caique/raw` already does. A prompt on a stream that was already raw no longer switches raw mode off when it ends, and raw mode it did turn on is also turned off on `SIGINT` and `SIGTERM`. `caique/clack` still grades 16 / 17 against clack's suite.

- [#726](https://github.com/ofri-peretz/burgee/pull/726) [`2c631cb`](https://github.com/ofri-peretz/burgee/commit/2c631cb820ec181dd7615864cc6ce7412ee7cafe) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Two fixes in `caique/clack`, and paths no input could reach are removed. A prompt aborted while its validator was still running drew one more frame after it had closed and given the cursor back, so the frame landed under whatever the program wrote next; it now writes nothing once closed. `date` took a locale's field separator from its first literal, which in Pashto is the space after the era, so the fields read `yyyy mm dd` rather than `yyyy-mm-dd`; it now takes the literal after the first field, which is also right where the last literal is a suffix, as in Bulgarian's `г.`. `caique/raw`'s `askList`, called directly with no choices, answered a multiselect with `['']` after a space; it now answers `[]`. The fallbacks removed from `clack-core`, `clack-date`, `clack-prompts`, `clack-search`, `raw`, `binding` and `terminal` are for values that are always there; behaviour is otherwise unchanged.

- [#727](https://github.com/ofri-peretz/burgee/pull/727) [`b9de3f3`](https://github.com/ofri-peretz/burgee/commit/b9de3f341bb59b9a2139bb094809176af5a65bee) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Four checks that could never change a result are removed from `caique/inquirer`; behaviour is unchanged. The screen's last line no longer falls back to an empty string (splitting a string always yields one), the loader no longer defaults a tick that `useState(0)` always sets, `INQUIRER_KEYBINDINGS=''` no longer has its own early return (it already parses to no bindings), and `useMemo` no longer asks whether a slot that holds a value was initialised.

- [#728](https://github.com/ofri-peretz/burgee/pull/728) [`9a65722`](https://github.com/ofri-peretz/burgee/commit/9a657220fe9c877ca475e7be1f3a575a0e88a76a) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `caique/clack`'s `spinner` now ends on its `errorMessage` when the process exits with a failing code the program chose (2–127), as clack's does; before this every exit while spinning ended as a cancel, and `errorMessage` was never shown. A signal, and exit codes 0 and 1, still end as a cancel. Unreachable code is removed from the spinner and from `caique check`, whose never-called "replaces" helper is gone; behaviour is otherwise unchanged.

- [#680](https://github.com/ofri-peretz/burgee/pull/680) [`7f59bc2`](https://github.com/ofri-peretz/burgee/commit/7f59bc2a612aa71925d5eca1db96d44d9f488c9a) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Raw mode is paired with its undo through `closeout/cursor`'s `rawMode`, the way the cursor already was.

  - `caique/raw`: a list prompt on a stream that was already in raw mode — a prompt library's, or the program's own — no longer switches raw mode off when it ends; it used to call `setRawMode(false)` unconditionally and take the keyboard from its owner. Raw mode the prompt did turn on is now turned off on `SIGINT` and `SIGTERM` too, not only in the prompt's own `finally`. `KeyStream` gains an optional `isRaw`.
  - `flagstaff/ora`: stdin-discarder's raw mode goes through the same pairing. Behaviour is unchanged except that an already-raw stdin is no longer written to at all.

- [#677](https://github.com/ofri-peretz/burgee/pull/677) [`8bc14e6`](https://github.com/ofri-peretz/burgee/commit/8bc14e644f02a28ce54333d683742f2fca027917) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Measuring text against a terminal is linegauge's job, and four places did it by hand.

  - `caique/raw`: the repaint counted a frame's rows with `split('\n')` and ignored wrapping, so a choice whose hint was wider than the terminal left a stale copy of the question on screen after every keypress. It counts rows with linegauge's `lineCount` against the terminal's width, which `Writer` now carries as an optional `columns` (read through to the output stream by `createIo`). A writer without one is treated as never wrapping, as before.
  - `burgee/testing`: `stripAnsi` is linegauge's `strip`. The regex it used left private modes (`ESC[?25l`), the colon form of a truecolor SGR (`ESC[38:2::255:0:0m`) and OSC 8 hyperlinks in the text.
  - `burgee` help: descriptions and epilogues are folded by `linegauge/wrap` rather than a loop of help's own. A styled description now opens and closes its styles on each row instead of running its colour into the next row's indent, and a run of spaces at a break no longer leaves trailing whitespace. Lines the author indented are still kept verbatim, and a word wider than the row still overflows rather than breaking.
  - `burgee` `config explain`: the option column is padded in terminal columns, so a CJK option name no longer pushes its value two columns right of the others.

- [#674](https://github.com/ofri-peretz/burgee/pull/674) [`e9f45d8`](https://github.com/ofri-peretz/burgee/commit/e9f45d85d9db5b2e3dcaa1e43f292a1281a6952a) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - README: family header, badges, install, migrating, the family table.

  Every package README now opens the same way — lockup, tagline, one badge row in one order (npm version, downloads, Quality Gate, the package's own coverage, OpenSSF Scorecard, unpacked size, dependencies, types, Node, licence, npm provenance), a row of compatibility badges read from the graded baseline — and carries the same sections in the same order: Install for npm, pnpm, yarn and bun, Quick start, Migrating as a before/after diff, Compatibility, Benchmarks, For agents, API, and a generated table of the nine packages. Links are absolute, so they work on npm as well as GitHub.

- [#684](https://github.com/ofri-peretz/burgee/pull/684) [`6c7b55a`](https://github.com/ofri-peretz/burgee/commit/6c7b55a01ea2e3aa1993419f78fbf6858ade5f8b) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `paratext/csi`: the CSI half of `ansi-escapes` as a subpath of its own — cursor moves, erases, scrolling, the alternate screen and synchronized output, byte-exact with `ansi-escapes` 7.3.0. It is 2,700 bytes and, unlike the package root, registers no built-ins when imported.

  `flagstaff/log-update`, `flagstaff/ora`, `caique/raw` and `caique/inquirer` take their cursor sequences from it instead of carrying their own copies; caique now depends on paratext. Output is unchanged, with one spelling difference: `caique/raw`'s repaint clears with `ESC[J` rather than the equivalent `ESC[0J`. `caique/inquirer` keeps `@inquirer/ansi`'s answer of nothing for a zero-row move, where `ansi-escapes`' `cursorUp(0)` is `ESC[0A`.

- [#678](https://github.com/ofri-peretz/burgee/pull/678) [`088cecc`](https://github.com/ofri-peretz/burgee/commit/088ceccb7dda1cbe878950c631f49f48980dd2e2) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Whether anybody is there, whether to colour, and whether a tick can be drawn are roundel's questions, and three packages answered them by hand.

  - `roundel/terminal` (new subpath, 878 B, reaching nothing): `interactive(rt)` — a terminal on stdin, no `CI`, and no agent variable (`CLAUDECODE`, `AI_AGENT`, `CURSOR_AGENT`, `CODEX_THREAD_ID`, `GEMINI_CLI`, exported as `AGENTS`), with `FORCE_TTY=1` as the override — and `unicode(rt)`, is-unicode-supported 2.1.0's table over `{ env, platform }`.
  - `caique/decide` now depends on `roundel` and asks `interactive()`. **Behaviour change:** under an agent that has a terminal — `CLAUDECODE=1` and a TTY on stdin — a missing required value is refused with a usage error naming the flag (`--x is required when nobody is there to answer`) instead of prompting and hanging the agent. `FORCE_TTY=1` now prompts even without a terminal on stdin, as it does for burgee.
  - `caique/inquirer`'s tick and `flagstaff/ora`'s log symbols and spinner fallback use roundel's `unicode()`. caique's copy was a four-condition subset: the Linux console (`TERM=linux`) now gets `√` rather than `✔`, and ConEmu/Cmder, Terminus, Alacritty, rxvt-unicode and JetBrains' terminal on Windows now get `✔`, as `figures` draws them.
  - `burgee` help colour is roundel's `colorLevel(rt) > 0`. **Behaviour changes:** `NO_COLOR` now beats `FORCE_COLOR`; `--no-color` and `--color=…` on the command line are honoured; `CLI_ACCESSIBLE` turns help colour off; and a terminal that sets no `TERM` (Windows' conhost) gets plain help unless `FORCE_COLOR`, `--color` or `COLORTERM` asks for colour.
  - `burgee/contrast` rounds with roundel's `round2`; no output changes.
  - `paratext`: the supports-color fork behind `paratext/terminal-link` is unchanged, and now held to roundel's policy by a parity test everywhere their two incumbents agree.

- Updated dependencies [[`6d8aadf`](https://github.com/ofri-peretz/burgee/commit/6d8aadff01a4c65ef3be16fe2082b0abd0c00b90), [`ff4159d`](https://github.com/ofri-peretz/burgee/commit/ff4159d25544fd45257f145e40ff0c5f8dfc4b3a), [`5e635b0`](https://github.com/ofri-peretz/burgee/commit/5e635b0a79c16ff2b459a4d00c80d334d5d945d1), [`ff4159d`](https://github.com/ofri-peretz/burgee/commit/ff4159d25544fd45257f145e40ff0c5f8dfc4b3a), [`6ef8227`](https://github.com/ofri-peretz/burgee/commit/6ef822762f5ad19564215945d7e76aa329614585), [`7c77cd2`](https://github.com/ofri-peretz/burgee/commit/7c77cd25c8fbeea4199c38c135e3a8937907f849), [`6ef8227`](https://github.com/ofri-peretz/burgee/commit/6ef822762f5ad19564215945d7e76aa329614585), [`6ef8227`](https://github.com/ofri-peretz/burgee/commit/6ef822762f5ad19564215945d7e76aa329614585), [`e9f45d8`](https://github.com/ofri-peretz/burgee/commit/e9f45d85d9db5b2e3dcaa1e43f292a1281a6952a), [`8a338ba`](https://github.com/ofri-peretz/burgee/commit/8a338baa50bb754051b18c00dbd0972976cccba1), [`6c7b55a`](https://github.com/ofri-peretz/burgee/commit/6c7b55a01ea2e3aa1993419f78fbf6858ade5f8b), [`620fc74`](https://github.com/ofri-peretz/burgee/commit/620fc74af013834ca6b15faa2772aeb94c5013b1), [`088cecc`](https://github.com/ofri-peretz/burgee/commit/088ceccb7dda1cbe878950c631f49f48980dd2e2), [`4319563`](https://github.com/ofri-peretz/burgee/commit/4319563b902c9d968786196f495cf47e7d4d9d39)]:
  - closeout@0.6.0
  - linegauge@1.0.0
  - paratext@0.7.3
  - roundel@0.5.5

## 0.5.4

### Patch Changes

- [#627](https://github.com/ofri-peretz/burgee/pull/627) [`4a629a9`](https://github.com/ofri-peretz/burgee/commit/4a629a9ff1129f2ce6f0c34e7cfc1d159304d18a) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Lint with every published Interlace ESLint plugin, and fix what the upgrade surfaced.

  - caique: the inquirer theme merge skips `__proto__`, `constructor` and `prototype` keys, so a theme object cannot swap the merged object's prototype.
  - burgee: last-element reads use `.at(-1)`.
  - burgee, closeout, flagstaff, roundel: helpers that capture nothing from their enclosing function move to module scope.
  - seniority: suppression comments name the `no-dynamic-require` rule that now reports the config loader's dynamic `require`.

  No public API or output changes.

- Updated dependencies [[`4a629a9`](https://github.com/ofri-peretz/burgee/commit/4a629a9ff1129f2ce6f0c34e7cfc1d159304d18a)]:
  - closeout@0.5.4

## 0.5.3

### Patch Changes

- [#604](https://github.com/ofri-peretz/burgee/pull/604) [`0e7b1e8`](https://github.com/ofri-peretz/burgee/commit/0e7b1e88a7021350cf689f109c7728f799be1589) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Each README links to its migration guides under the docs link: "Migrating from: chalk", "ora · log-update · boxen · cli-table3", and so on. That puts a path from the npm page to the guide for the library you are replacing. No code changes.
- Updated dependencies [[`0e7b1e8`](https://github.com/ofri-peretz/burgee/commit/0e7b1e88a7021350cf689f109c7728f799be1589)]:
  - linegauge@0.5.4
  - closeout@0.5.3

## 0.5.2

### Patch Changes

- [#518](https://github.com/ofri-peretz/burgee/pull/518) [`866b972`](https://github.com/ofri-peretz/burgee/commit/866b9724652bebea867a730b8f2ea5e0ca63f5ab) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - README weight lines now count every incumbent with a graded drop-in: terminal-link and term-img (paratext), exit-hook (closeout), @inquirer/core (caique).

- [#474](https://github.com/ofri-peretz/burgee/pull/474) [`1955419`](https://github.com/ofri-peretz/burgee/commit/19554194342b55f8893161f894a8c2a4df1b0f21) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - burgee plugins can hook two more stages. `parse` runs before the command is resolved: it receives argv and may return a replacement, which is how an alias plugin maps `d` to `deploy`. `shutdown` runs once as the program exits, whether the command succeeded or failed. The family `schema.json` shipped in every package now describes both stages.
- Updated dependencies [[`866b972`](https://github.com/ofri-peretz/burgee/commit/866b9724652bebea867a730b8f2ea5e0ca63f5ab), [`1955419`](https://github.com/ofri-peretz/burgee/commit/19554194342b55f8893161f894a8c2a4df1b0f21), [`1b002e0`](https://github.com/ofri-peretz/burgee/commit/1b002e0b72f8dc1aa61020fb40c26e50949f16e7), [`77ff1cb`](https://github.com/ofri-peretz/burgee/commit/77ff1cb8e595d32bb8bddf441ae21fc61e6f247d)]:
  - closeout@0.5.2
  - linegauge@0.5.2

## 0.5.1

### Patch Changes

- [#508](https://github.com/ofri-peretz/burgee/pull/508) [`1aae1e2`](https://github.com/ofri-peretz/burgee/commit/1aae1e2186ce88421067df5317795773419e53d0) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `<package> --help` and `--version` answer instead of crashing. The bin took its first argument as the plugin file to import, so `roundel --help` failed with `Cannot find module '…/--help'` and exit 1. `-h`/`--help` now print usage and exit 0, `-V`/`--version` print the version and exit 0, and any other flag where the plugin file belongs is a usage error, exit 2.
- Updated dependencies [[`1aae1e2`](https://github.com/ofri-peretz/burgee/commit/1aae1e2186ce88421067df5317795773419e53d0)]:
  - closeout@0.5.1
  - linegauge@0.5.1

## 0.5.0

### Minor Changes

- [#507](https://github.com/ofri-peretz/burgee/pull/507) [`b8e97dc`](https://github.com/ofri-peretz/burgee/commit/b8e97dcb64772e413f0b6f9e17e063c73314d242) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Runs on Node 20 and 22, not just 24+: `engines.node` is now `^20.19.0 || >=22.13.0`. Those are the first releases where `require(esm)` loads without a warning, so the CommonJS `require()` path keeps working. Every package's test suite runs on exactly 20.19.0 and 22.13.0, on Linux, macOS and Windows. caique's prompts no longer call `Promise.withResolvers`, which Node 20 doesn't have.

### Patch Changes

- [#505](https://github.com/ofri-peretz/burgee/pull/505) [`9800b43`](https://github.com/ofri-peretz/burgee/commit/9800b43d9c74a49dfb66d04a40fd0d1c48892e20) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Docs: the Benchmarks section's weight ceiling is re-measured against a fresh install of each incumbent's latest release (cosmiconfig 10.0.1, slice-ansi 9.0.1, which 7.0.0, dotenv 18.0.3, …) instead of the copies hoisted in this workspace, and names incumbents that were measured but left out of the ceiling as exactly that.
- Updated dependencies [[`9800b43`](https://github.com/ofri-peretz/burgee/commit/9800b43d9c74a49dfb66d04a40fd0d1c48892e20), [`b8e97dc`](https://github.com/ofri-peretz/burgee/commit/b8e97dcb64772e413f0b6f9e17e063c73314d242)]:
  - closeout@0.5.0
  - linegauge@0.5.0

## 0.4.3

### Patch Changes

- [#494](https://github.com/ofri-peretz/burgee/pull/494) [`f7f6d4b`](https://github.com/ofri-peretz/burgee/commit/f7f6d4b8e8f9d9c7010bd4c81fda4b4d106fc9f0) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Each package's `homepage` and README docs link now point at its own documentation site, `https://<package>.interlace.tools`, instead of a page on burgee's site. The old `burgee.interlace.tools/docs/packages/<package>` URLs answer with a 301 to the new host, so nothing already linked breaks. closeout's README override example also resolves to the current release again (`npm:closeout@^0.4`; the 0.4.0 release left it at `^0.3`).
- Updated dependencies [[`f7f6d4b`](https://github.com/ofri-peretz/burgee/commit/f7f6d4b8e8f9d9c7010bd4c81fda4b4d106fc9f0)]:
  - linegauge@0.4.4
  - closeout@0.4.1

## 0.4.2

### Patch Changes

- Updated dependencies [[`69563d1`](https://github.com/ofri-peretz/burgee/commit/69563d1fb14d9a4b29364446bae2fc48d86f6103), [`2dc573f`](https://github.com/ofri-peretz/burgee/commit/2dc573f884e7a4cc46829cd8f2c949a17f07710c)]:
  - closeout@0.4.0
  - linegauge@0.4.3

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

- [#457](https://github.com/ofri-peretz/burgee/pull/457) [`44edb2f`](https://github.com/ofri-peretz/burgee/commit/44edb2f6f03a36f1b6773105867f41c899ffb6cd) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - flagstaff's npm description no longer says "Zero dependencies" (it takes four, all in-family); caique's README badge names both of its dependencies.
- Updated dependencies [[`b4584e7`](https://github.com/ofri-peretz/burgee/commit/b4584e719bc0064b294aab5ea6da1c11f698f0e9), [`bdaf364`](https://github.com/ofri-peretz/burgee/commit/bdaf364f81564c1700cf1adec18f927afe6c60c9), [`7888524`](https://github.com/ofri-peretz/burgee/commit/78885245eb292cd4a40541fe09382a198c9c45cf), [`dac303e`](https://github.com/ofri-peretz/burgee/commit/dac303e944e889ac4175ac38c94e4ca0f0ca5358)]:
  - closeout@0.3.1
  - linegauge@0.4.1

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

- Updated dependencies [[`4d1b2b3`](https://github.com/ofri-peretz/burgee/commit/4d1b2b399cff354864d1e2e843a19fde80ef1f30), [`db3c59e`](https://github.com/ofri-peretz/burgee/commit/db3c59e3dcd373c7e6e4a057715adb173766523f), [`db3c59e`](https://github.com/ofri-peretz/burgee/commit/db3c59e3dcd373c7e6e4a057715adb173766523f)]:
  - closeout@0.3.0
  - linegauge@0.4.0

## 0.3.1

### Patch Changes

- [#398](https://github.com/ofri-peretz/burgee/pull/398) [`ee35904`](https://github.com/ofri-peretz/burgee/commit/ee35904e987a0133f2c0b51371227f840e0fd677) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - A `__proto__` key in a caller's corpus stays a style.

  `fromCliSpinners` and `fromCliBoxes` built their maps by assigning `map[key] = value` over
  the caller's JSON. JSON can carry the key `__proto__`, and that assignment hands it to the
  prototype setter rather than defining a property: the entry vanished from the plugin _and_
  whatever it held became the fallback that every other `lookupSpinner` and `lookupBorder`
  inherited. Both now build with `Object.fromEntries`, which defines an own property for
  every key, and the returned map keeps `Object.prototype`.

  The registry's `deepFrozen` copy and caique's prompt binding write the same shape from a
  loop they cannot turn into an expression, and use `Object.defineProperty` instead.

  `flagstaff/import` is 80 bytes lighter for it — 838 B to 758 B — because two loops became
  two expressions.

## 0.3.0

### Minor Changes

- [#381](https://github.com/ofri-peretz/burgee/pull/381) [`8104eb9`](https://github.com/ofri-peretz/burgee/commit/8104eb9fa9bfdcb58ad9df4e9e9b1e42f7b86907) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `caique/inquirer` and `caique/clack` — two drop-in subpaths, and the first measured numbers
  either incumbent has given caique.

  `caique/inquirer` is `@inquirer/core`'s surface over `node:readline` and `node:async_hooks`:
  `createPrompt`, `useState`, `useEffect`, `useMemo`, `useRef`, `useKeypress`, `usePrefix`,
  `makeTheme`, `Separator`, the eight key predicates and the five error classes. Graded
  **41 / 41, 100.0%** against `@inquirer/core` 12.0.3's own suite, up from 0 / 41 — a suite
  that renders through a headless xterm and asserts the screen, so what passed is the prompt
  loop rather than a drawing. `usePagination` is not implemented and is named as a gap in
  `.sdlc/intents/caique/design.md` rather than shipped ungraded.

  `caique/clack` is `limitOptions`, which is the part of `@clack/prompts` that is a rule
  rather than a drawing. Graded **14 / 17, 82.4%**, up from 0 / 606 — and the denominator
  moved for a reason published in full on the compatibility page: 289 of that suite's 444
  assertions are `toMatchSnapshot()` across 17 of its 19 files, and those seventeen are
  subtracted as a declared subset, one named entry each. The three that remain unpassed are
  all of `guide.test.ts` and are a ceiling, not a shortfall: two want clack's twelve prompts
  drawn frame for frame, and the third asserts we read `updateSettings` out of `@clack/core`'s
  own module state, which a package with no external dependencies cannot see.

  Both subpaths reach `linegauge/wrap`, and `caique/inquirer` also reaches
  `closeout/exit-hook` — both published from this repository, both declared, both budgeted in
  `weight.test.ts`. The package root is unchanged: nothing in either façade is reachable from
  `caique` itself.

### Patch Changes

- [#373](https://github.com/ofri-peretz/burgee/pull/373) [`a1f1d40`](https://github.com/ofri-peretz/burgee/commit/a1f1d40b7d1e7244f3a180943b641bb3b491d256) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Stage 2's artifact is now `spec.md`, the name Anthropic's AI-Native SDLC playbook gives it, so the source comments and README sections that cite a package's own design document point at `spec.md` rather than `design.md`.

  No behaviour changes. The published tarballs do move, by two bytes per surviving reference — `design.md` is nine characters and `spec.md` is seven — so the four packages carrying a weight band were re-measured against it: linegauge 83,538 to 83,536; paratext 66,343 to 66,341; closeout 84,455 to 84,453; bellpull 86,113 to 86,107.

- Updated dependencies [[`a1f1d40`](https://github.com/ofri-peretz/burgee/commit/a1f1d40b7d1e7244f3a180943b641bb3b491d256)]:
  - closeout@0.2.1
  - linegauge@0.3.1

## 0.2.0

### Minor Changes

- [#294](https://github.com/ofri-peretz/burgee/pull/294) [`3f92a60`](https://github.com/ofri-peretz/burgee/commit/3f92a6099b1b8d5d476c64405ca963d40bf9af45) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `caique/plugin` — a plugin may now ship a prompt kind caique does not have. `register({ widgets })` keeps the `widgets` key and ignores every other layer's, so the same plugin object works on any subset of the family that is installed (`plugin-contract` R1, R5). A widget is the same shape a flagstaff component is — `{ static, frame?, sample? }` — and one without `static` is refused with `E_NO_STATIC_PROJECTION`, the same code and the same fix shape.

  `PromptKind` is an open union (`… | (string & {})`). It was closed, which made a plugin's seventh kind a type error and would have turned hosting `widgets` into a breaking change written as an additive one; the six literals stay in an editor's completion list, which a bare `string` would have thrown away.

  Because the union is open, a kind nobody registered no longer falls through to a text prompt — `projectionOf()` refuses it with `E_UNKNOWN_KIND`, and the message names the kinds that _are_ registered so the reader sees the typo rather than a text prompt where their widget should have been. The six built-ins are still drawn by caique and a plugin may not replace them: `password` guarantees that nothing writes back what it read, and a third party able to override it could defeat that from a config file.

  Also ships `caique/schema.json`, byte-identical to flagstaff's and roundel's (R2) — the specifier caique's own `E_PLUGIN_SCHEMA` fix names, so following the advice resolves.

### Patch Changes

- [#326](https://github.com/ofri-peretz/burgee/pull/326) [`88f7ba6`](https://github.com/ofri-peretz/burgee/commit/88f7ba65e3a79ed20bf7c5bc4feae8b87684122b) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - A `Runtime` seam on caique (PLAN 4.3, Y9).

  `src/runtime.ts` declares the slice of the world caique reads — `env`, `stdin`, `stdout` and
  the two `isTTY` flags — and `processRuntime()`, the one function in the package that names
  `process`. It is a function and not a constant, for the reason paratext's is: a runtime built
  at import freezes the environment as it was when the module graph loaded, which is before a
  test can say what it wants the world to look like.

  `createIo()` now takes no argument and builds over the real process, so a program gets the
  terminal it was started in without naming `process` itself; `streamsOf(runtime)` is the
  mapping for callers that already hold one. `decide()` is unchanged and still takes the
  narrower pair it reads, which is what the root export's `Runtime` continues to name.

  `runtime.test.ts` asserts the seam rather than documenting it: `runtime.ts` is the only
  non-test source in the package that reads the process, and `processRuntime()` returns two
  different answers across a change to the environment made after the import.

- [#332](https://github.com/ofri-peretz/burgee/pull/332) [`3ea38c3`](https://github.com/ofri-peretz/burgee/commit/3ea38c363b9f0cee9f1c1c2dae4037b047e98328) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Restore the cursor when a prompt is killed, by taking the job from `closeout`.

  `raw.ts` hid the cursor and put it back on one path: the keypress loop, which sees Ctrl-C
  because raw mode delivers it as a byte rather than a signal. A `SIGINT` from a parent
  process, a `SIGTERM`, a crash or a `process.exit()` elsewhere in the program never reached
  that loop, and left the cursor invisible in the user's shell until they typed `reset`.
  Measured against the built `dist/raw.js`: hide 1, show 0, for `SIGINT`, `SIGTERM` and
  `SIGHUP` alike.

  `askList()` now hides through `closeout.hideCursor()`, which registers the restore in the
  same call, with `closeout/exit-hook` running it on the paths a keypress loop cannot see.
  The two escape sequences come from `closeout/cursor` as well, so caique no longer carries
  the family's third copy of them. The bytes on the wire are unchanged for a prompt that
  ends normally, and a prompt that ended unregisters, so exit writes nothing twice.

  caique therefore installs one package, `closeout`, which this repository publishes and
  which sits in the foundation tier below it. Nothing outside this repository is installed.

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

- Updated dependencies [[`c8acb28`](https://github.com/ofri-peretz/burgee/commit/c8acb2848714a1cbe3e26a2f9895d7498fb4f096), [`fc640dd`](https://github.com/ofri-peretz/burgee/commit/fc640ddec11255c12d1e0948c5b8e99cc3f3263b), [`3f92a60`](https://github.com/ofri-peretz/burgee/commit/3f92a6099b1b8d5d476c64405ca963d40bf9af45), [`3ea38c3`](https://github.com/ofri-peretz/burgee/commit/3ea38c363b9f0cee9f1c1c2dae4037b047e98328), [`f295630`](https://github.com/ofri-peretz/burgee/commit/f2956301d5f9dcbcac0b001b00ebaf0315891fac)]:
  - closeout@0.2.0

## 0.1.1

### Patch Changes

- [#92](https://github.com/ofri-peretz/burgee/pull/92) [`24e025d`](https://github.com/ofri-peretz/burgee/commit/24e025d267ee078bf02af9706faa7574b0679942) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Lock caique's weight, per subpath, against clack.

  caique was the last published package in the family without a `weight.test.ts` — so the one
  package that talks to a person, and to an agent, was the one making an unmeasured claim.

  **The whole package is 25,627 B and reaches no package at all, against `@clack/prompts`
  1.8.0's 101,684 B across six.** Deciding _not_ to ask — the case an agent hits — costs
  4,986 B and never loads the machinery of asking.

  Every entry now declares what it may import (nothing), what it may weigh, and what it must
  never reach; and an entry cannot be added without a budget.

## 0.1.0

### Minor Changes

- [#71](https://github.com/ofri-peretz/burgee/pull/71) [`e204772`](https://github.com/ofri-peretz/burgee/commit/e204772ce0647b3158994e57dc48828163f47488) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Add `caique/raw`: arrow-key `select` and `multiselect` on a terminal that can take raw mode.

  `askList()` draws a moving highlight and repaints in place, and answers the same question
  `ask()` does with the same value — line mode stays the floor, this is decoration on top,
  and the suite proves the two agree by running one spec through both. `keyOf()` reads a
  keypress, `canRender()` says whether a runtime can take raw mode, and `renderList()` is one
  frame so the drawing is asserted rather than screenshotted.

  `Ctrl-C` cancels — in raw mode it arrives as a byte, not a signal — and the terminal is
  restored (raw mode off, cursor shown) whatever the answer.

  No dependency on flagstaff: a prompt has no spinner, and the repaint it needs is three
  escape sequences.

### Patch Changes

- [#66](https://github.com/ofri-peretz/burgee/pull/66) [`b43e1d3`](https://github.com/ofri-peretz/burgee/commit/b43e1d3ccd62aad40b295cf4151aaff526d24acb) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `ask()` — the six prompt kinds in line mode, which is also the accessible rendering rather than a second implementation of it. A stream that ends is a cancellation, not an empty answer; invalid input is re-asked a bounded five times, never forever; `projection(spec)` gives the question without the conversation.

- [#66](https://github.com/ofri-peretz/burgee/pull/66) [`b43e1d3`](https://github.com/ofri-peretz/burgee/commit/b43e1d3ccd62aad40b295cf4151aaff526d24acb) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `resolvePrompts()` — the pass a framework calls from its `preAction` hook: walks a command's options in declaration order, asks only what has to be asked, and stops at the first refusal. One host-agnostic binding rather than one per host, so nothing in caique imports burgee.

- [#66](https://github.com/ofri-peretz/burgee/pull/66) [`b43e1d3`](https://github.com/ofri-peretz/burgee/commit/b43e1d3ccd62aad40b295cf4151aaff526d24acb) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `decide()` — the pure rule that decides whether a person can be asked at all: a value from any source wins, `--json` never prompts, `--yes` answers a confirm and only a confirm, and no terminal means an error naming the flag rather than a wait. All 256 combinations the design names are enumerated in the suite, not sampled.

- [#69](https://github.com/ofri-peretz/burgee/pull/69) [`2da5883`](https://github.com/ofri-peretz/burgee/commit/2da5883d512705c370c2da1eb07efdfcfc869c29) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `createIo()` — a reader and writer over real streams, so `ask()` can be used by a program and not only by a test. A `password` prompt is not echoed, and the muting lives in the one layer that knows what echo is.
