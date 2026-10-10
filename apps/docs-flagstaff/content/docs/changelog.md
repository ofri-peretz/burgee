---
title: Changelog
description: "Every release of flagstaff, newest first, from its CHANGELOG.md — what changed and the pull request it came from."
---

## 1.2.5

### Patch Changes

- [#938](https://github.com/ofri-peretz/burgee/pull/938) [`9babb6d`](https://github.com/ofri-peretz/burgee/commit/9babb6da1ae7783c7e8367f89e3da9dffc85ffdb) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - npm description and README: the description says what the package does, then its dependency fact in one of two wordings ("Zero dependencies." or "No dependency outside the burgee family."), then its drop-in paths. The README's family section states how the family is built — the leaves, one-way dependencies, nothing from outside the family, trusted publishing with provenance — and its table column is "Migrates from". No API, compatibility grade or benchmark changes.
- Updated dependencies [[`9babb6d`](https://github.com/ofri-peretz/burgee/commit/9babb6da1ae7783c7e8367f89e3da9dffc85ffdb)]:
  - closeout@1.0.4
  - linegauge@1.0.8
  - paratext@1.0.4
  - roundel@1.0.4

## 1.2.4

### Patch Changes

- [#917](https://github.com/ofri-peretz/burgee/pull/917) [`735f0f6`](https://github.com/ofri-peretz/burgee/commit/735f0f68048f2d0f5e4effad151ed5132b480bb8) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - README: the opening paragraph says what the package does first. The drop-in path follows it as one line, naming the incumbent and `npx burgee migrate`, and every compatibility row and benchmark is unchanged.
- Updated dependencies [[`735f0f6`](https://github.com/ofri-peretz/burgee/commit/735f0f68048f2d0f5e4effad151ed5132b480bb8)]:
  - closeout@1.0.3
  - linegauge@1.0.7
  - paratext@1.0.3
  - roundel@1.0.3

## 1.2.3

### Patch Changes

- [#897](https://github.com/ofri-peretz/burgee/pull/897) [`f29f159`](https://github.com/ofri-peretz/burgee/commit/f29f159ca0c9746f58d8ba84eec9be72b1140093) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - controlroom has its own docs site at https://controlroom.interlace.tools: its README's Docs line, its `homepage`, and every family table now link there.
- Updated dependencies [[`f29f159`](https://github.com/ofri-peretz/burgee/commit/f29f159ca0c9746f58d8ba84eec9be72b1140093)]:
  - closeout@1.0.2
  - linegauge@1.0.6
  - paratext@1.0.2
  - roundel@1.0.2

## 1.2.2

### Patch Changes

- [#848](https://github.com/ofri-peretz/burgee/pull/848) [`6ae533e`](https://github.com/ofri-peretz/burgee/commit/6ae533e4610c32bad557f5d74a24d0c9a0f07f7e) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The family `schema.json` describes what five values look like. `contract` is `1`, and burgee refuses a plugin that declares none. A caique widget's `static(spec)` gets `{ kind, message, ...sample.done }`. A seniority `rank` sits between the built-in layers at flag 0, environment 10, config file 20, `package.json` 30 and default 40. A burgee hook's `filter` is `{ command: RegExp }`, now with `command` required, so the schema and the host refuse the same filters.

- [#857](https://github.com/ofri-peretz/burgee/pull/857) [`d80b2d0`](https://github.com/ofri-peretz/burgee/commit/d80b2d0f4a535400c6825b42ac2d8e1be2827f4e) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The family `schema.json` closes a bellpull resolver's `when` with `additionalProperties: false`, so the schema and bellpull's own validation refuse the same unknown keys.

- [#854](https://github.com/ofri-peretz/burgee/pull/854) [`fd8e659`](https://github.com/ofri-peretz/burgee/commit/fd8e659076420852b954c8dc57828f575c1df8b8) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `flagstaff/boxen` draws a box about 40% faster: text with no escape, tab or backspace skips the control-character walk, and a border bar of ASCII or box-drawing characters is cut by index instead of walked. Output is unchanged; boxen 9.0.0's own suite still passes 213 / 213.
- Updated dependencies [[`6ae533e`](https://github.com/ofri-peretz/burgee/commit/6ae533e4610c32bad557f5d74a24d0c9a0f07f7e), [`d80b2d0`](https://github.com/ofri-peretz/burgee/commit/d80b2d0f4a535400c6825b42ac2d8e1be2827f4e)]:
  - closeout@1.0.1
  - linegauge@1.0.5
  - paratext@1.0.1
  - roundel@1.0.1

## 1.2.1

### Patch Changes

- Updated dependencies [[`1945d65`](https://github.com/ofri-peretz/burgee/commit/1945d65f22aafabd380d67f1e40341d6ef3aa6fa), [`1945d65`](https://github.com/ofri-peretz/burgee/commit/1945d65f22aafabd380d67f1e40341d6ef3aa6fa), [`9ebef65`](https://github.com/ofri-peretz/burgee/commit/9ebef654930ac4565f1ee04ec5f8b6f735c6a1d9), [`1945d65`](https://github.com/ofri-peretz/burgee/commit/1945d65f22aafabd380d67f1e40341d6ef3aa6fa)]:
  - closeout@1.0.0
  - paratext@1.0.0
  - roundel@1.0.0

## 1.2.0

### Minor Changes

- [#827](https://github.com/ofri-peretz/burgee/pull/827) [`cd34546`](https://github.com/ofri-peretz/burgee/commit/cd345466edf47327be61a469eba5add35e1da2a2) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `flagstaff/boxen` is boxen 9.0.0's API, graded 213 / 213 by boxen 9's own suite (control 213 / 213). New options: `footer` and `footerAlignment`, `titleColor`, `borderBackgroundColor`, `maxWidth`; a tab, a backspace or a cursor move inside the text, a label or a border is written the way a terminal would draw it; a border side may be wider than one column or empty; and a size or spacing that is not a usable number means its default. Two of boxen 8's answers change with boxen 9: a hex colour must be real hex (`#GGG` now throws, as it does in boxen 9), and `vertical` / `horizontal` are a fallback for the sides rather than an override of them.

### Patch Changes

- [#824](https://github.com/ofri-peretz/burgee/pull/824) [`4be8d59`](https://github.com/ofri-peretz/burgee/commit/4be8d5999875f7decb1963a91a0ad6cce3289176) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The README states ora's current tree, 114,102 B (it was 113,577 B on 2026-09-09); `flagstaff/ora` is still 49% of it.

## 1.1.1

### Patch Changes

- [#816](https://github.com/ofri-peretz/burgee/pull/816) [`5230016`](https://github.com/ofri-peretz/burgee/commit/52300169a98ece41b3544e5316833464e63a7c83) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - controlroom hosts plugins (R10): `keymaps` and `panes` register through `controlroom/plugin`'s `register()` against the family schema, a screen takes either by name, and `controlroom check <plugin-file>` reports what a plugin contributes. The family schema every host ships gains the `keymaps` and `panes` definitions.
- Updated dependencies [[`5230016`](https://github.com/ofri-peretz/burgee/commit/52300169a98ece41b3544e5316833464e63a7c83), [`5230016`](https://github.com/ofri-peretz/burgee/commit/52300169a98ece41b3544e5316833464e63a7c83), [`5230016`](https://github.com/ofri-peretz/burgee/commit/52300169a98ece41b3544e5316833464e63a7c83)]:
  - closeout@0.7.0
  - paratext@0.9.0
  - linegauge@1.0.4
  - roundel@0.6.3

## 1.1.0

### Minor Changes

- [#806](https://github.com/ofri-peretz/burgee/pull/806) [`f30e011`](https://github.com/ofri-peretz/burgee/commit/f30e011b129abe89c4c79706e4e6a7432c2fab7f) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - New `flagstaff/markdown`: a reply streamed as tokens arrive, committed a block at a time (headings, lists, emphasis, inline code, fenced code); off a terminal it prints the markdown's own source, each block once. New `flagstaff/diff`: a unified diff with old and new line numbers on a terminal, and the diff unchanged everywhere else.

- [#806](https://github.com/ofri-peretz/burgee/pull/806) [`f30e011`](https://github.com/ofri-peretz/burgee/commit/f30e011b129abe89c4c79706e4e6a7432c2fab7f) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `frameWriter()` from `flagstaff/loop`: paint a whole frame and only the changed rows are written, in one synchronized-output block. `hoist` repaints through it, so a terminal frame no longer redraws unchanged text. New `flagstaff/log-tail` (the last lines of a stream, `┊` and `◆`, a static projection that appends) and `flagstaff/tab-bar` (the active tab's label off a terminal), each registered through `register()`. The task list's pending mark is the replaceable `pending` glyph.

## 1.0.3

### Patch Changes

- Updated dependencies [[`b44f426`](https://github.com/ofri-peretz/burgee/commit/b44f426621ed799700cceda8c979de8f759f56b7), [`6195b99`](https://github.com/ofri-peretz/burgee/commit/6195b99344a21b4a05ab100fc38358deab229ce8)]:
  - paratext@0.8.0
  - roundel@0.6.1

## 1.0.2

### Patch Changes

- [#763](https://github.com/ofri-peretz/burgee/pull/763) [`6c2e9c5`](https://github.com/ofri-peretz/burgee/commit/6c2e9c5cee5d9962c0d75d84a766c76b76760f7f) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Faster, and lighter:

  - `link()` from `paratext` reads the process once, on its first call, where it used to rebuild the runtime and re-read the environment on every call.
  - `paratext/terminal-link` decides hyperlink support once per stream, as `supports-hyperlinks` does at import, and emits a link as a single concatenation.
  - Templates are parsed once, and `eraseLines` keeps the strings for the counts a redraw uses.
  - In B5 (ours ÷ incumbent, in-process), `paratext` against ansi-escapes went from 8.9× to 0.97× locally, and `paratext/terminal-link` against terminal-link from 20.9× to 0.78×.
  - The root bundle is 1,356 B smaller (8,417 → 7,061), because the plugin-schema fragments paratext and flagstaff import to validate no longer carry the schema's prose. The published `schema.json` is unchanged.

- Updated dependencies [[`6c2e9c5`](https://github.com/ofri-peretz/burgee/commit/6c2e9c5cee5d9962c0d75d84a766c76b76760f7f), [`6c2e9c5`](https://github.com/ofri-peretz/burgee/commit/6c2e9c5cee5d9962c0d75d84a766c76b76760f7f)]:
  - linegauge@1.0.1
  - paratext@0.7.5

## 1.0.1

### Patch Changes

- Updated dependencies [[`a115799`](https://github.com/ofri-peretz/burgee/commit/a1157991a5defddadfbea49ba8ea3bf161d4a832)]:
  - roundel@0.6.0

## 1.0.0

### Major Changes

- [#685](https://github.com/ofri-peretz/burgee/pull/685) [`6ef8227`](https://github.com/ofri-peretz/burgee/commit/6ef822762f5ad19564215945d7e76aa329614585) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - flagstaff 1.0.0. No API changes from 0.4: this release makes a promise. Every published entry point is now under semver and can change incompatibly only in a new major: `flagstaff` and `flagstaff/loop`, `plugin`, `import`, `spinner`, `progress`, `tasks`, `box` and `table`, the four drop-in subpaths, the `schema.json` plugin contract and the `flagstaff` bin. Each drop-in path is graded at 100% by its incumbent's own test suite, vendored at the release tag and run unmodified: ora 9.4.1 by 99 of 99 cases (`flagstaff/ora`), log-update 8.0.0 by 99 of 99 (`flagstaff/log-update`), boxen 8.0.1 by 84 of 84 (`flagstaff/boxen`) and cli-table3 0.6.5 by 29 of 29 (`flagstaff/cli-table3`). Out of scope: `flagstaff/boxen` is a boxen 8 drop-in. boxen 9 is released but is not graded or claimed, and a program on it is left alone by `burgee migrate`. Earlier majors of the four incumbents are not claimed either.

### Patch Changes

- [#680](https://github.com/ofri-peretz/burgee/pull/680) [`7f59bc2`](https://github.com/ofri-peretz/burgee/commit/7f59bc2a612aa71925d5eca1db96d44d9f488c9a) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Raw mode is paired with its undo through `closeout/cursor`'s `rawMode`, the way the cursor already was.

  - `caique/raw`: a list prompt on a stream that was already in raw mode — a prompt library's, or the program's own — no longer switches raw mode off when it ends; it used to call `setRawMode(false)` unconditionally and take the keyboard from its owner. Raw mode the prompt did turn on is now turned off on `SIGINT` and `SIGTERM` too, not only in the prompt's own `finally`. `KeyStream` gains an optional `isRaw`.
  - `flagstaff/ora`: stdin-discarder's raw mode goes through the same pairing. Behaviour is unchanged except that an already-raw stdin is no longer written to at all.

- [#711](https://github.com/ofri-peretz/burgee/pull/711) [`d26728b`](https://github.com/ofri-peretz/burgee/commit/d26728b26b44cbcc5edafca6bf1a91acbd1e1d35) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Code no test could reach is gone, and nothing a caller can observe changes.

  - `table()`: the column-shrinking loop no longer checks for a column already at the three-cell minimum — `table()` never offers less than that per column, so while the table is too wide its widest column is always wider than the minimum. The widths are found with `Math.max`/`indexOf` instead of an indexed loop with `?? 0` fallbacks that could not fire. Ties still go to the leftmost column. `flagstaff/table` is 342 B lighter.
  - The terminal projection no longer keeps a placeholder cursor net for a `close()` without an `open()`, or for a second `close()`: `hoist()` opens first and lowers at most once, so neither can happen.

- [#685](https://github.com/ofri-peretz/burgee/pull/685) [`6ef8227`](https://github.com/ofri-peretz/burgee/commit/6ef822762f5ad19564215945d7e76aa329614585) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Fixed: `hoist()` on a terminal left stale rows behind when a frame was wider than the terminal. The tty projection counted the rows it had painted as lines of text, so a line that wrapped onto the next row was erased as one and the rows it wrapped onto stayed on screen under every repaint. It now counts painted rows with `linegauge`'s `lineCount` at the writer's `columns` (80 when the writer does not say), the measurement `flagstaff/ora` already clears by. `Writer` gains an optional `columns`, which `process.stdout` already carries.

- [#665](https://github.com/ofri-peretz/burgee/pull/665) [`12fea8e`](https://github.com/ofri-peretz/burgee/commit/12fea8eae4d556b11dc693581cca73e16c2b633c) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Three defects carried over from the incumbents, and three places where a port answered differently from the incumbent on a bad value.

  - `burgee/yargs/parser`: with `unknown-options-as-args`, every `-`-prefixed argument ran through five flag regexes, and two of them backtracked — one quadratically, one cubically (a 4,000-character argument took ten seconds). They are linear scans now, and give the same answer as the regexes for every input, checked against them over every short string of the characters involved. yargs' own suite still passes 804 of 804.
  - `burgee/yargs/parser`: `{ "a": null }` in one config and `a.b` from a default or a second config threw "Cannot read properties of null". A `null` parent is now an absent one, as the parser's own key lookup already treated it.
  - `burgee/yargs`: `showHelp()` with an async default-command builder that rejected left an unhandled rejection that ended the process. The rejection now goes to `fail`, where yargs sends a command handler's rejection, so a `.fail()` handler receives it.
  - `burgee/meow`: `importMeta: null` throws meow's own "The `importMeta` option is required" TypeError instead of a null dereference, and `input: null` or an array is refused as meow refuses it.
  - `flagstaff/cli-table3`: a style name that cannot be read off a colour function (`caller`, `arguments`) draws the cell plain, as cli-table3 does, instead of throwing out of `toString()`.

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

## 0.4.4

### Patch Changes

- [#627](https://github.com/ofri-peretz/burgee/pull/627) [`4a629a9`](https://github.com/ofri-peretz/burgee/commit/4a629a9ff1129f2ce6f0c34e7cfc1d159304d18a) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Lint with every published Interlace ESLint plugin, and fix what the upgrade surfaced.

  - caique: the inquirer theme merge skips `__proto__`, `constructor` and `prototype` keys, so a theme object cannot swap the merged object's prototype.
  - burgee: last-element reads use `.at(-1)`.
  - burgee, closeout, flagstaff, roundel: helpers that capture nothing from their enclosing function move to module scope.
  - seniority: suppression comments name the `no-dynamic-require` rule that now reports the config loader's dynamic `require`.

  No public API or output changes.

- Updated dependencies [[`4a629a9`](https://github.com/ofri-peretz/burgee/commit/4a629a9ff1129f2ce6f0c34e7cfc1d159304d18a)]:
  - closeout@0.5.4
  - roundel@0.5.4

## 0.4.3

### Patch Changes

- [#604](https://github.com/ofri-peretz/burgee/pull/604) [`0e7b1e8`](https://github.com/ofri-peretz/burgee/commit/0e7b1e88a7021350cf689f109c7728f799be1589) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Each README links to its migration guides under the docs link: "Migrating from: chalk", "ora · log-update · boxen · cli-table3", and so on. That puts a path from the npm page to the guide for the library you are replacing. No code changes.
- Updated dependencies [[`0e7b1e8`](https://github.com/ofri-peretz/burgee/commit/0e7b1e88a7021350cf689f109c7728f799be1589)]:
  - roundel@0.5.3
  - linegauge@0.5.4
  - closeout@0.5.3
  - paratext@0.7.2

## 0.4.2

### Patch Changes

- [#474](https://github.com/ofri-peretz/burgee/pull/474) [`1955419`](https://github.com/ofri-peretz/burgee/commit/19554194342b55f8893161f894a8c2a4df1b0f21) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - burgee plugins can hook two more stages. `parse` runs before the command is resolved: it receives argv and may return a replacement, which is how an alias plugin maps `d` to `deploy`. `shutdown` runs once as the program exits, whether the command succeeded or failed. The family `schema.json` shipped in every package now describes both stages.

- [#522](https://github.com/ofri-peretz/burgee/pull/522) [`f4be6a8`](https://github.com/ofri-peretz/burgee/commit/f4be6a8733e338bea4483992edeaa72fcddd36fd) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `require('bellpull/cross-spawn')`, `require('flagstaff/cli-table3')`, `require('burgee/yargs')`, `require('seniority/dotenv')` and `require('seniority/rc')` now return what the incumbent's `require()` does — the function, the class, the factory, the object — instead of an ES module namespace. Each exports its default as `'module.exports'`, which is what Node hands a CommonJS caller, and which yargs' own entry already does. `const spawn = require('…'); spawn(…)` threw before.

- [#519](https://github.com/ofri-peretz/burgee/pull/519) [`77ff1cb`](https://github.com/ofri-peretz/burgee/commit/77ff1cb8e595d32bb8bddf441ae21fc61e6f247d) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The drop-ins now export their incumbents' type names, so a TypeScript program migrates by its import alone: `roundel/chalk` gains chalk's `Color`, `ForegroundColor`, `BackgroundColor`, `Modifiers` and `Options`; `flagstaff/ora` gains `Spinner`, `PrefixTextGenerator` and `SuffixTextGenerator`; `flagstaff/boxen` gains `Options`, `CustomBorderStyle` and `Boxes`; `flagstaff/log-update`, `linegauge`, `linegauge/wrap` and `closeout/exit-hook` gain `Options`; `burgee/yargs/parser` gains `Arguments`, `Options` and `Configuration`. Types only — no runtime bytes.
- Updated dependencies [[`866b972`](https://github.com/ofri-peretz/burgee/commit/866b9724652bebea867a730b8f2ea5e0ca63f5ab), [`1955419`](https://github.com/ofri-peretz/burgee/commit/19554194342b55f8893161f894a8c2a4df1b0f21), [`1b002e0`](https://github.com/ofri-peretz/burgee/commit/1b002e0b72f8dc1aa61020fb40c26e50949f16e7), [`77ff1cb`](https://github.com/ofri-peretz/burgee/commit/77ff1cb8e595d32bb8bddf441ae21fc61e6f247d), [`dc1b1a7`](https://github.com/ofri-peretz/burgee/commit/dc1b1a7156f7548d7229b54b9f3d367bfda0af08), [`0592441`](https://github.com/ofri-peretz/burgee/commit/0592441c9ca8f81098a4aff48f15cfb141a0bece)]:
  - paratext@0.7.0
  - closeout@0.5.2
  - linegauge@0.5.2
  - roundel@0.5.2

## 0.4.1

### Patch Changes

- [#508](https://github.com/ofri-peretz/burgee/pull/508) [`1aae1e2`](https://github.com/ofri-peretz/burgee/commit/1aae1e2186ce88421067df5317795773419e53d0) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `<package> --help` and `--version` answer instead of crashing. The bin took its first argument as the plugin file to import, so `roundel --help` failed with `Cannot find module '…/--help'` and exit 1. `-h`/`--help` now print usage and exit 0, `-V`/`--version` print the version and exit 0, and any other flag where the plugin file belongs is a usage error, exit 2.
- Updated dependencies [[`1aae1e2`](https://github.com/ofri-peretz/burgee/commit/1aae1e2186ce88421067df5317795773419e53d0)]:
  - closeout@0.5.1
  - linegauge@0.5.1
  - paratext@0.6.1
  - roundel@0.5.1

## 0.4.0

### Minor Changes

- [#507](https://github.com/ofri-peretz/burgee/pull/507) [`b8e97dc`](https://github.com/ofri-peretz/burgee/commit/b8e97dcb64772e413f0b6f9e17e063c73314d242) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Runs on Node 20 and 22, not just 24+: `engines.node` is now `^20.19.0 || >=22.13.0`. Those are the first releases where `require(esm)` loads without a warning, so the CommonJS `require()` path keeps working. Every package's test suite runs on exactly 20.19.0 and 22.13.0, on Linux, macOS and Windows. caique's prompts no longer call `Promise.withResolvers`, which Node 20 doesn't have.

### Patch Changes

- Updated dependencies [[`9800b43`](https://github.com/ofri-peretz/burgee/commit/9800b43d9c74a49dfb66d04a40fd0d1c48892e20), [`b8e97dc`](https://github.com/ofri-peretz/burgee/commit/b8e97dcb64772e413f0b6f9e17e063c73314d242)]:
  - closeout@0.5.0
  - linegauge@0.5.0
  - paratext@0.6.0
  - roundel@0.5.0

## 0.3.7

### Patch Changes

- [#494](https://github.com/ofri-peretz/burgee/pull/494) [`f7f6d4b`](https://github.com/ofri-peretz/burgee/commit/f7f6d4b8e8f9d9c7010bd4c81fda4b4d106fc9f0) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Each package's `homepage` and README docs link now point at its own documentation site, `https://<package>.interlace.tools`, instead of a page on burgee's site. The old `burgee.interlace.tools/docs/packages/<package>` URLs answer with a 301 to the new host, so nothing already linked breaks. closeout's README override example also resolves to the current release again (`npm:closeout@^0.4`; the 0.4.0 release left it at `^0.3`).
- Updated dependencies [[`f7f6d4b`](https://github.com/ofri-peretz/burgee/commit/f7f6d4b8e8f9d9c7010bd4c81fda4b4d106fc9f0)]:
  - roundel@0.4.3
  - linegauge@0.4.4
  - closeout@0.4.1
  - paratext@0.5.4

## 0.3.6

### Patch Changes

- Updated dependencies [[`69563d1`](https://github.com/ofri-peretz/burgee/commit/69563d1fb14d9a4b29364446bae2fc48d86f6103), [`2dc573f`](https://github.com/ofri-peretz/burgee/commit/2dc573f884e7a4cc46829cd8f2c949a17f07710c)]:
  - closeout@0.4.0
  - paratext@0.5.3
  - linegauge@0.4.3

## 0.3.5

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
  - paratext@0.5.1
  - roundel@0.4.1

## 0.3.4

### Patch Changes

- [#430](https://github.com/ofri-peretz/burgee/pull/430) [`4d1b2b3`](https://github.com/ofri-peretz/burgee/commit/4d1b2b399cff354864d1e2e843a19fde80ef1f30) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `check` now reports every refusal with its code and its fix, wherever it was raised.

  Some plugin files register themselves on import: they call `register()` at the top of the module and export the result. Until now, when such a file was refused, the error was thrown inside `check`'s `import()`, before the only `try` that turns a `PluginError` into `E_PLUGIN_SCHEMA: …` plus a `fix:` line. The author got the bare message on stderr, with no code and no fix. Now the whole of `check` runs inside that one handler, so every refusal comes out the same way on every host.

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

- Updated dependencies [[`4d1b2b3`](https://github.com/ofri-peretz/burgee/commit/4d1b2b399cff354864d1e2e843a19fde80ef1f30), [`db3c59e`](https://github.com/ofri-peretz/burgee/commit/db3c59e3dcd373c7e6e4a057715adb173766523f), [`db3c59e`](https://github.com/ofri-peretz/burgee/commit/db3c59e3dcd373c7e6e4a057715adb173766523f)]:
  - closeout@0.3.0
  - linegauge@0.4.0
  - paratext@0.5.0
  - roundel@0.4.0

## 0.3.3

### Patch Changes

- [#404](https://github.com/ofri-peretz/burgee/pull/404) [`c70ff9c`](https://github.com/ofri-peretz/burgee/commit/c70ff9c6bf00ec4aff9b8a735f4246dd3193fb1a) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `flagstaff/cli-table3`'s `Cell` carries `ColSpanCell` and `RowSpanCell`, the way cli-table3's
  own `src/cell.js` publishes them — `module.exports = Cell; module.exports.ColSpanCell = …;
module.exports.RowSpanCell = …`. A caller who reaches `Cell.RowSpanCell` on the incumbent now
  reaches it here. Both names were already named exports of the module; this is a second
  spelling of the incumbent's shape, and nothing new is published.

  With it, cli-table3's internal suite reads **103 / 104** against a control of 103 / 104 — the
  target matches the reference exactly, up from 90.

## 0.3.2

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

## 0.3.1

### Patch Changes

- [#375](https://github.com/ofri-peretz/burgee/pull/375) [`98ac9a3`](https://github.com/ofri-peretz/burgee/commit/98ac9a38adce19bd8067d47b72573bb5fe0a3637) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `flagstaff/cli-table3` — cli-table3's internal surface now hangs off the default export, and
  the informational internals column moves **0 / 104 to 90 / 104** against a control of 103 / 104.

  No behaviour changed and the gated row is 29 / 29 before and after. All 104 internal cases
  were failing as `X is not a function`: the compat oracle reaches a target's internals through
  a CommonJS shim whose body is `module.exports = loaded?.default ?? loaded`, and that unwrap
  hands the suite the `Table` class rather than the namespace where `Cell`, `strlen`,
  `computeWidths` and fifteen more already lived. `Object.assign(Table, { … })` at the foot of
  the module publishes them the way cli-table3's own `src/cell.js` publishes `ColSpanCell` and
  `RowSpanCell` — a second spelling of names this subpath already exported, plus six that were
  private only because nothing had asked.

  Two ceilings are recorded with the measurement in `compat-oracle/src/hosts.ts` rather than
  chased: 13 cases in `table-layout-test.js` that resolve `Cell` to `Table` because the shim
  collapses four internal modules onto one entry, and the 94 cases of `cell-test.js`, which
  never register in the control run either.

  `./cli-table3`'s byte ratchet rises 29,000 to 29,300 for the 240 B this costs, with the
  reasoning in `weight.test.ts`. It is a ceiling moving in the loosening direction and is the
  owner's to reverse.

- [#373](https://github.com/ofri-peretz/burgee/pull/373) [`a1f1d40`](https://github.com/ofri-peretz/burgee/commit/a1f1d40b7d1e7244f3a180943b641bb3b491d256) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Stage 2's artifact is now `spec.md`, the name Anthropic's AI-Native SDLC playbook gives it, so the source comments and README sections that cite a package's own design document point at `spec.md` rather than `design.md`.

  No behaviour changes. The published tarballs do move, by two bytes per surviving reference — `design.md` is nine characters and `spec.md` is seven — so the four packages carrying a weight band were re-measured against it: linegauge 83,538 to 83,536; paratext 66,343 to 66,341; closeout 84,455 to 84,453; bellpull 86,113 to 86,107.

- Updated dependencies [[`f3224f4`](https://github.com/ofri-peretz/burgee/commit/f3224f4f43da21bbeeac931c2ec8afc50f0c3235), [`2f6cb16`](https://github.com/ofri-peretz/burgee/commit/2f6cb160f488668c56d61e3e3f0ed612137295af), [`a1f1d40`](https://github.com/ofri-peretz/burgee/commit/a1f1d40b7d1e7244f3a180943b641bb3b491d256)]:
  - paratext@0.4.0
  - closeout@0.2.1
  - linegauge@0.3.1

## 0.3.0

### Minor Changes

- [#340](https://github.com/ofri-peretz/burgee/pull/340) [`c123029`](https://github.com/ofri-peretz/burgee/commit/c12302982e13432d7145399def4c790890546cc3) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `flagstaff/box` and `flagstaff/table` render a path or a url as a terminal hyperlink, and `flagstaff` is the first package in the family to build on `paratext` (paratext R12).

  A table cell may be `{ text, href }` and a box may be given `{ href }`. On a terminal believed to understand OSC 8 the text becomes a real hyperlink; on a pipe, in a log, under `TERM=dumb`, and for a screen reader it reads `src/index.ts (file:///repo/src/index.ts)` — the destination survives rather than being dropped with the escape, and no control byte reaches a file. Neither the guess nor the sequence is flagstaff's: both come from `paratext/link`, and `flagstaff` passes it a runtime instead of re-deciding.

  `flagstaff/cli-table3`'s `hyperlink()` now builds its sequence the same way. It still emits unconditionally and byte for byte what upstream emits — that is the drop-in contract, and cli-table3 still grades 29 / 29 — but the escape itself is no longer written out a second time in this package. `src/link.test.ts` locks that: no published file here spells an OSC 8 sequence of its own.

  `paratext/link` rather than `paratext`: 2,410 B and no registry against 20,221 B and `registerBuiltins()` at import, measured in paratext's own `dist/`. `flagstaff/table` grew 1,675 B and `flagstaff/box` 1,502 B; the two budgets in `weight.test.ts` moved with them and the reasoning is recorded there.

### Patch Changes

- [#332](https://github.com/ofri-peretz/burgee/pull/332) [`3ea38c3`](https://github.com/ofri-peretz/burgee/commit/3ea38c363b9f0cee9f1c1c2dae4037b047e98328) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `flagstaff` no longer carries its own copy of "put the cursor back however the process dies". `src/cursor.ts` is deleted and its three consumers — the `ora` façade, the `log-update` façade and the loop's `tty` projection — reach `closeout` instead, which owns `restore-cursor` and `signal-exit` and grades 6 / 6 against `restore-cursor`'s own suite. That module's own header argued there is exactly one correct implementation of this and that a second copy is a second place to get it wrong; it was the second copy. There was a third, in `caique`.

  The two façades use `closeout/restore-cursor`, whose contract is the one their incumbents grade: the stream is a property of the _process_ — stderr if it is a terminal, else stdout — decided when you call, and written at exit whatever `isTTY` says by then. The projection uses `closeout`'s `onExit` in the `restore` phase, because it draws on the stream the Runtime handed it and must not learn that `process` exists. `closeout/exit-hook` is deliberately **not** used: it is faithful to its own incumbent, which never registers SIGHUP, so a closing terminal would not have reached the restore.

  **A defect went with it.** The deleted module held a process-wide `cursorRestoreInstalled` flag — first caller installs the net, every later caller gets a no-op. That reads like a guard against a duplicate restore. It was a lost one: the second surface's writer was never registered, so a program with a hoisted frame on stdout and a spinner on stderr hid two cursors and put back one, leaving stderr's hidden. Measured on the previous build at `stderr { hide: 1, show: 0 }`. Registering per caller fixes it, and `src/cursor-net.test.ts` grades both halves — every hidden stream restored, and the one redundant (idempotent) show that two surfaces on a single stream now write.

  No compatibility row moves: ora 99 / 99, log-update 99 / 99, boxen 84 / 84. None of those suites kills the process, which is why the guarantee is graded by flagstaff's own signal cases against the built `dist/` in a child that is really signalled.

  `flagstaff` now depends on `closeout`. The per-entry weight measurements fall — `.` −1,666 B, `./loop` −1,666 B, `./ora` −1,591 B, `./log-update` −1,591 B — and **nothing got lighter**: the walk stops at a bare specifier, so the code left the measurement while staying in the program. Installed bytes go up, not down.

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

- Updated dependencies [[`c8acb28`](https://github.com/ofri-peretz/burgee/commit/c8acb2848714a1cbe3e26a2f9895d7498fb4f096), [`fc640dd`](https://github.com/ofri-peretz/burgee/commit/fc640ddec11255c12d1e0948c5b8e99cc3f3263b), [`3f92a60`](https://github.com/ofri-peretz/burgee/commit/3f92a6099b1b8d5d476c64405ca963d40bf9af45), [`3ea38c3`](https://github.com/ofri-peretz/burgee/commit/3ea38c363b9f0cee9f1c1c2dae4037b047e98328), [`fc640dd`](https://github.com/ofri-peretz/burgee/commit/fc640ddec11255c12d1e0948c5b8e99cc3f3263b), [`3ea38c3`](https://github.com/ofri-peretz/burgee/commit/3ea38c363b9f0cee9f1c1c2dae4037b047e98328), [`c8acb28`](https://github.com/ofri-peretz/burgee/commit/c8acb2848714a1cbe3e26a2f9895d7498fb4f096), [`88f7ba6`](https://github.com/ofri-peretz/burgee/commit/88f7ba65e3a79ed20bf7c5bc4feae8b87684122b), [`c8acb28`](https://github.com/ofri-peretz/burgee/commit/c8acb2848714a1cbe3e26a2f9895d7498fb4f096), [`3f92a60`](https://github.com/ofri-peretz/burgee/commit/3f92a6099b1b8d5d476c64405ca963d40bf9af45), [`fc640dd`](https://github.com/ofri-peretz/burgee/commit/fc640ddec11255c12d1e0948c5b8e99cc3f3263b), [`3ea38c3`](https://github.com/ofri-peretz/burgee/commit/3ea38c363b9f0cee9f1c1c2dae4037b047e98328), [`0f00f72`](https://github.com/ofri-peretz/burgee/commit/0f00f7273ab0ca111c5869e2b08eb79314df7f70), [`f295630`](https://github.com/ofri-peretz/burgee/commit/f2956301d5f9dcbcac0b001b00ebaf0315891fac)]:
  - closeout@0.2.0
  - linegauge@0.3.0
  - roundel@0.3.1
  - paratext@0.3.0

## 0.2.1

### Patch Changes

- Updated dependencies [[`214f6f8`](https://github.com/ofri-peretz/burgee/commit/214f6f83b16068d7dc53d79799fba03c26a3cbe2), [`214f6f8`](https://github.com/ofri-peretz/burgee/commit/214f6f83b16068d7dc53d79799fba03c26a3cbe2), [`ecedfa2`](https://github.com/ofri-peretz/burgee/commit/ecedfa2ed0c7aaed23d77c4d02d7c94156a78ce9), [`ea58e63`](https://github.com/ofri-peretz/burgee/commit/ea58e637ee0ee6cdcc655478f6bef54d854f6c0f), [`3d744d9`](https://github.com/ofri-peretz/burgee/commit/3d744d99d92cdc7fc675ad105e4e4b9c6eebca5f), [`59d910c`](https://github.com/ofri-peretz/burgee/commit/59d910c1da7bca519bd1c2d5ca43b6c57e260621), [`93114d3`](https://github.com/ofri-peretz/burgee/commit/93114d33b5ac3f9a0ab3b48506255897af40133b)]:
  - roundel@0.3.0
  - linegauge@0.2.0

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
