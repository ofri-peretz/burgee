# paratext

## 0.7.2

### Patch Changes

- [#604](https://github.com/ofri-peretz/burgee/pull/604) [`0e7b1e8`](https://github.com/ofri-peretz/burgee/commit/0e7b1e88a7021350cf689f109c7728f799be1589) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Each README links to its migration guides under the docs link: "Migrating from: chalk", "ora · log-update · boxen · cli-table3", and so on. That puts a path from the npm page to the guide for the library you are replacing. No code changes.

## 0.7.1

### Patch Changes

- [#588](https://github.com/ofri-peretz/burgee/pull/588) [`073037a`](https://github.com/ofri-peretz/burgee/commit/073037ab38b13490ab119c84122a46c7c605be14) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - READMEs and package descriptions now match what each drop-in path is graded at. bellpull names `bellpull/node-which` as the drop-in for npm `which` (5 / 5) and no longer lists execa as a drop-in. paratext's ansi-escapes row is 4 / 4, with the CSI half implemented. seniority's rc row is 1 / 1, dotenv's `config()` defaults to `process.env`, and lilconfig is 77 / 77. linegauge documents `ambiguousIsNarrow` and `strip` as shipped. No code changes.

## 0.7.0

### Minor Changes

- [#543](https://github.com/ofri-peretz/burgee/pull/543) [`dc1b1a7`](https://github.com/ofri-peretz/burgee/commit/dc1b1a7156f7548d7229b54b9f3d367bfda0af08) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - paratext implements `ansi-escapes`' CSI half — `cursorTo`, `cursorMove`, `eraseLines`, `clearTerminal`, `enterAlternativeScreen`, `synchronizedOutput` and the rest, byte-exact with ansi-escapes 7.3.0 — so `import ansiEscapes from 'paratext'` is a full drop-in, graded 4 / 4 by ansi-escapes' own suite (it was 1 / 4 with CSI declared `undefined`). `burgee migrate` now rewrites `ansi-escapes` to `paratext`.

- [#546](https://github.com/ofri-peretz/burgee/pull/546) [`0592441`](https://github.com/ofri-peretz/burgee/commit/0592441c9ca8f81098a4aff48f15cfb141a0bece) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `paratext/terminal-link` now links exactly where `supports-hyperlinks` 4.5.0 does. It honours `FORCE_HYPERLINK`, `--no-hyperlink` / `--hyperlink=always`, `CI`, win32 outside Windows Terminal, NETLIFY, and the incumbent's version floors for iTerm2, WezTerm, VS Code and VTE (0.50.0 segfaults on OSC 8). It also recognises kitty, alacritty, ghostty, zed, Orca and Cursor. Its previous guess disagreed with the incumbent in 30 of 55 environments. The compatibility row is now 8 / 8, so `burgee migrate` rewrites `terminal-link` imports to `paratext/terminal-link`.

### Patch Changes

- [#518](https://github.com/ofri-peretz/burgee/pull/518) [`866b972`](https://github.com/ofri-peretz/burgee/commit/866b9724652bebea867a730b8f2ea5e0ca63f5ab) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - README weight lines now count every incumbent with a graded drop-in: terminal-link and term-img (paratext), exit-hook (closeout), @inquirer/core (caique).

- [#474](https://github.com/ofri-peretz/burgee/pull/474) [`1955419`](https://github.com/ofri-peretz/burgee/commit/19554194342b55f8893161f894a8c2a4df1b0f21) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - burgee plugins can hook two more stages. `parse` runs before the command is resolved: it receives argv and may return a replacement, which is how an alias plugin maps `d` to `deploy`. `shutdown` runs once as the program exits, whether the command succeeded or failed. The family `schema.json` shipped in every package now describes both stages.

## 0.6.1

### Patch Changes

- [#508](https://github.com/ofri-peretz/burgee/pull/508) [`1aae1e2`](https://github.com/ofri-peretz/burgee/commit/1aae1e2186ce88421067df5317795773419e53d0) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `<package> --help` and `--version` answer instead of crashing. The bin took its first argument as the plugin file to import, so `roundel --help` failed with `Cannot find module '…/--help'` and exit 1. `-h`/`--help` now print usage and exit 0, `-V`/`--version` print the version and exit 0, and any other flag where the plugin file belongs is a usage error, exit 2.

## 0.6.0

### Minor Changes

- [#507](https://github.com/ofri-peretz/burgee/pull/507) [`b8e97dc`](https://github.com/ofri-peretz/burgee/commit/b8e97dcb64772e413f0b6f9e17e063c73314d242) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Runs on Node 20 and 22, not just 24+: `engines.node` is now `^20.19.0 || >=22.13.0`. Those are the first releases where `require(esm)` loads without a warning, so the CommonJS `require()` path keeps working. Every package's test suite runs on exactly 20.19.0 and 22.13.0, on Linux, macOS and Windows. caique's prompts no longer call `Promise.withResolvers`, which Node 20 doesn't have.

### Patch Changes

- [#505](https://github.com/ofri-peretz/burgee/pull/505) [`9800b43`](https://github.com/ofri-peretz/burgee/commit/9800b43d9c74a49dfb66d04a40fd0d1c48892e20) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Docs: the Benchmarks section's weight ceiling is re-measured against a fresh install of each incumbent's latest release (cosmiconfig 10.0.1, slice-ansi 9.0.1, which 7.0.0, dotenv 18.0.3, …) instead of the copies hoisted in this workspace, and names incumbents that were measured but left out of the ceiling as exactly that.

## 0.5.4

### Patch Changes

- [#494](https://github.com/ofri-peretz/burgee/pull/494) [`f7f6d4b`](https://github.com/ofri-peretz/burgee/commit/f7f6d4b8e8f9d9c7010bd4c81fda4b4d106fc9f0) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Each package's `homepage` and README docs link now point at its own documentation site, `https://<package>.interlace.tools`, instead of a page on burgee's site. The old `burgee.interlace.tools/docs/packages/<package>` URLs answer with a 301 to the new host, so nothing already linked breaks. closeout's README override example also resolves to the current release again (`npm:closeout@^0.4`; the 0.4.0 release left it at `^0.3`).

## 0.5.3

### Patch Changes

- [#480](https://github.com/ofri-peretz/burgee/pull/480) [`2dc573f`](https://github.com/ofri-peretz/burgee/commit/2dc573f884e7a4cc46829cd8f2c949a17f07710c) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - README corrections: paratext shows terminal-link at its measured 8 / 10 (was the stale 0 / 10 floor); linegauge's and closeout's `npm:` override examples resolve to the current release instead of 0.2 / 0.1.

## 0.5.2

### Patch Changes

- [#465](https://github.com/ofri-peretz/burgee/pull/465) [`acf98f3`](https://github.com/ofri-peretz/burgee/commit/acf98f3e612c6d79e6c2b78a847abcd06a063cbc) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Each README now opens with the incumbent it replaces and the agent surface it serves (`--json`, an agent event, or a static projection), so npm shows both above the fold. README text only; no code changed.

## 0.5.1

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

## 0.5.0

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

## 0.4.0

### Minor Changes

- [#380](https://github.com/ofri-peretz/burgee/pull/380) [`f3224f4`](https://github.com/ofri-peretz/burgee/commit/f3224f4f43da21bbeeac931c2ec8afc50f0c3235) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `paratext/term-img` — the `term-img` surface as a drop-in subpath.

  `terminalImage(image, options?)` and `UnsupportedTerminalError`, graded at **12 / 18**
  against term-img's own suite, up from 0. A subpath rather than the package root because the
  root default export is already `ansi-escapes`' object and term-img's default export is a
  function — one default cannot be both, which is why the row measured zero: its whole TAP was
  a `SyntaxError` about a missing named export, not eighteen failing behaviours.

  The six cases that stay red are one decision. `term-img` accepts a **path** and reads it;
  this package takes bytes only, so that `node:fs` stays out of a package that otherwise
  touches nothing but strings. The refusal is a `TypeError` thrown at exactly the point
  upstream would have opened the file, which is what keeps the four path-to-an-unsupported-
  terminal cases passing. `terminalImage(await readFile(path))` is the migration.

  The five-terminal support table is term-img's own — iTerm2 ≥ 3, WezTerm ≥ 20220319,
  Konsole ≥ 22.04, Rio ≥ 0.1.13, VSCode ≥ 1.80 — read from the environment, with no
  `iterm2-version` and no `ansi-escapes` behind it, and with upstream's iTerm2 major-version
  comparison corrected so that 10.x is not read as 1.x.

  The OSC 1337 record moved from `builtins.ts` into its own module so the new subpath can
  reach it without loading the plugin registry. `paratext`'s exported `image` capability is
  the same object it always was.

- [#372](https://github.com/ofri-peretz/burgee/pull/372) [`2f6cb16`](https://github.com/ofri-peretz/burgee/commit/2f6cb160f488668c56d61e3e3f0ed612137295af) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `paratext/terminal-link` — the `terminal-link` surface as a drop-in subpath.

  `terminalLink(text, url, options?)`, `terminalLink.stderr`, and `isSupported` on both,
  graded at **8 / 10** against terminal-link's own suite, up from 0. A subpath rather than the
  package root because the root default export is already `ansi-escapes`' object and
  terminal-link's default export is a function — one default cannot be both.

  `Runtime.isTTY` gains an optional `stderr`, since this façade's whole surface is a pair and
  deciding both streams from one would answer the wrong question for half the API.

### Patch Changes

- [#373](https://github.com/ofri-peretz/burgee/pull/373) [`a1f1d40`](https://github.com/ofri-peretz/burgee/commit/a1f1d40b7d1e7244f3a180943b641bb3b491d256) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Stage 2's artifact is now `spec.md`, the name Anthropic's AI-Native SDLC playbook gives it, so the source comments and README sections that cite a package's own design document point at `spec.md` rather than `design.md`.

  No behaviour changes. The published tarballs do move, by two bytes per surviving reference — `design.md` is nine characters and `spec.md` is seven — so the four packages carrying a weight band were re-measured against it: linegauge 83,538 to 83,536; paratext 66,343 to 66,341; closeout 84,455 to 84,453; bellpull 86,113 to 86,107.

## 0.3.0

### Minor Changes

- [#316](https://github.com/ofri-peretz/burgee/pull/316) [`c8acb28`](https://github.com/ofri-peretz/burgee/commit/c8acb2848714a1cbe3e26a2f9895d7498fb4f096) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `paratext` is now call-compatible with `ansi-escapes` for the four OSC members of its surface — `link`, `image`, `setCwd`, `beep` — as both a default export and named exports (`paratext/design.md` R8). The bytes are the incumbent's where the terminal understands them, and the static projection everywhere else: `Docs (https://x.dev)` for a link, the caption for an image, nothing for a `setCwd`. That difference is the reason to swap, and it is the difference between a pipe receiving something readable and a pipe receiving `\u001B]1337;File=inline=1;…`.

  Its **CSI half stays out of scope** — the cursor, erasing, scroll regions, the alternate screen, which `flagstaff` draws and `closeout` puts back. Those thirty-three names are nonetheless _declared_, as `undefined`, because ESM refuses a named import of a name a module does not export: without them `import ansiEscapes, { cursorTo } from 'paratext'` was a `SyntaxError` that took the whole file down before a line of it ran. TypeScript types them so that calling one is a compile error rather than a run-time surprise. Graded against `ansi-escapes@7.3.0`'s own suite the row moves **0 / 4 to 1 / 4**, which is its ceiling: three of its four cases assert CSI, so 25% there means complete.

  **Two root exports changed shape.** `link` and `image` are now the incumbent's _functions_ rather than this package's capability _records_, because a caller who swapped one import specifier would otherwise have got an object shaped nothing like a function, silently. The rule is stated rather than case-by-case — a record export survives unless `ansi-escapes` has that name — so `bell`, `clipboard`, `cwd`, `notify` and `title` are unchanged. The two that moved are reached as `capability('link')` and `capability('image')`, or through `builtins`.

  `image`'s encode template gained `preserveAspectRatio` and `size`, upstream's last two options in upstream's order, so `image()` is byte-identical to the incumbent rather than merely call-compatible. `size` is optional in the protocol and required by xterm.js, which is why upstream always writes it.

  New subpath **`paratext/plugin`**: paratext hosts `capabilities` (`plugin-contract` R5a). A plugin object registers, every key another layer owns is ignored without complaint, and `attach()` hands the contributions to the same `register()` the built-ins go through — so a third party's capability is not a second-class citizen of the registry. Refusals use the family vocabulary: `E_PLUGIN_SCHEMA`, `E_PLUGIN_CONTRACT`, and `E_NO_STATIC_PROJECTION` for a capability with no `fallback`, which is the same defect flagstaff raises it for in a component and caique in a widget.

  `Runtime` gained an optional `cwd`, which is the only thing `setCwd()` needs to default the way the incumbent defaults it to `process.cwd()` — and the way to add it without a second `process` reference in the package.

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

- [#332](https://github.com/ofri-peretz/burgee/pull/332) [`3ea38c3`](https://github.com/ofri-peretz/burgee/commit/3ea38c363b9f0cee9f1c1c2dae4037b047e98328) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - New subpath **`paratext/link`** — OSC 8 on its own, **2,337 B**, and nothing registered at import.

  The root is 17,574 B and runs `registerBuiltins()` as an import-time side effect, which is correct for a program that wants all seven capabilities and unaffordable for one that wants a clickable URL in its `--help`. `burgee` is that consumer: `help.ts` is imported _statically_ by `execute.ts`, so anything help reaches is paid for by `burgee foo --json` as much as by `burgee --help`, and a dynamic `import('paratext')` of a barrel is not shakeable — burgee has a measured 54,986 B failure from exactly that. So the dependency was refused, and the refusal was correct. This entry is the answer to it.

  ```js
  import { link, linkFor, supportsLink } from "paratext/link";

  link("Docs", "https://x.dev");
  // a supporting terminal: ESC ] 8 ; ; https://x.dev BEL Docs ESC ] 8 ; ; BEL
  // a pipe:                Docs (https://x.dev)
  ```

  `linkFor(runtime)` is the form a host should use — `burgee`'s renderer already carries a `Runtime`, and passing it means nothing in the path reads `process`. `supportsLink(runtime)` answers the guess without emitting, for a renderer deciding layout rather than bytes. `LINK` is the capability record itself, and it is the _same object_ `builtins.link` is rather than a copy: the record moved into this module and `builtins.ts` re-exports it.

  **It does not consult the registry, on purpose.** A caller who corrected our terminal guess by re-registering `link` globally does not change what this returns — the registry is what this entry deliberately does not load. `emit(runtime, 'link', …)` on the root is the form that does.

  `Support` and `supports()` moved to an internal `supports.ts` so the subpath can ask "does this terminal do OSC 8" without pulling `schema.json`, which is 6,531 B of plugin contract. Both are re-exported from their old home unchanged; no import moved.

  Also new: **`packages/paratext/src/weight.test.ts`**, the per-entry-point lock `closeout`, `caique` and `roundel` already carry. Every published entry declares what it may reach, what it may never reach, and what it may weigh, and a new export cannot ship without a rule — `./link` may not reach `capability.js`, `builtins.js`, `index.js`, `plugin.js` or `schema.json`, which is what makes "registers nothing" true by construction rather than by inspection.

  Splitting the two modules out cost the root 619 B, 16,955 → 17,574.

- [#334](https://github.com/ofri-peretz/burgee/pull/334) [`0f00f72`](https://github.com/ofri-peretz/burgee/commit/0f00f7273ab0ca111c5869e2b08eb79314df7f70) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `check()` and `register()` now read `schema.json` rather than one array out of it.

  The package's own extension surface accepted this:

  ```js
  { name: 'x', osc: { nope: true }, when: 'not an object', encode: 'e{text}', fallback: '{text}', extra: 1 }
  ```

  `when` is the one that mattered. `supports()` destructures it, a string destructures to four
  `undefined` clauses, every guard falls through, and the answer is `true` — so a capability
  with a typo there wrote OSC into whatever the caller had redirected to. Measured on the
  published build, `emit()` on a runtime with `isTTY.stdout: false` returned
  `"]8;;https://x.devDocs]8;;"`. That is the one failure this package
  exists to prevent, reached through its own documented plugin surface.

  `src/shape.ts` is a walk over the JSON-Schema keywords the file actually uses — `type`,
  `oneOf`, `const`, `minLength`, `minimum`, `items`, `properties` and
  `additionalProperties: false` — with no dependency added, because `ajv` is over 100 KB in a
  package whose root entry is under 20 KB. It is wired into `capabilityProblems()`, which both
  `check()` and `register()` already went through, so the same refusal closes the document path
  and the registry path: `register()` is the only way into the registry `emit()` reads, and it
  is that refusal, not a guard further down, that keeps a malformed `when` away from
  `supports()`. `supports()` additionally answers `false` for a `when` it cannot read, which is
  the fail-safe direction rule 6 asks for.

  Every refusal names the path it is about — `capabilities.link.when.tty`, not merely the
  capability — and carries a code from the family's one vocabulary: `CapabilityError` now has
  the `code` that `PluginError` always had, and `plugin.ts` stopped keeping its own copy of
  "fallback is required" beside `capability.ts`'s.

  **This is a behaviour change for a plugin that was already wrong.** A capability whose `osc`,
  `when`, `encode`, `fallback` or `name` does not match the published shape, or that carries a
  field the schema does not declare, is now refused at `register()` and reported by `check()`
  where it used to pass. Nothing that validated cleanly before is refused now.

  What is _not_ enforced is written down rather than left to be discovered: `$ref`, `pattern`,
  `minItems`, `maxLength`, `enum`, `allOf`, `anyOf` and `not`. None appears under a capability
  today, so nothing is silently unchecked — but a keyword added to the schema tomorrow would
  be, and the README says so instead of claiming the whole file is validated.

### Patch Changes

- [#303](https://github.com/ofri-peretz/burgee/pull/303) [`fc640dd`](https://github.com/ofri-peretz/burgee/commit/fc640ddec11255c12d1e0948c5b8e99cc3f3263b) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Stop claiming a drop-in path in the npm description until one is graded.

  The compat oracle now vendors `ansi-escapes`' own suite at 7.3.0 and grades it. The control
  is 4 / 4; `paratext` scores **0 / 4**, and the reason is one line of TAP —
  `SyntaxError: The requested module 'paratext' does not provide an export named 'default'`.
  The ansi-escapes-compatible default export (design R8) is not built, so "Drop-in paths for
  ansi-escapes, terminal-link and term-img" was a claim with a measured zero behind it. The
  description now says what is true — the OSC half of those three packages is covered — and
  defers the drop-in claim to the row that would prove it.

  No runtime behaviour changes.

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

- [#229](https://github.com/ofri-peretz/burgee/pull/229) [`6a6442e`](https://github.com/ofri-peretz/burgee/commit/6a6442e9d2cfc001bc3e05d68dab99aa2c9f451e) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The OSC layer, with extensibility as its shape rather than an addition to it.

  Seven capabilities — `link` (OSC 8), `image` (OSC 1337), `title` (OSC 0), `clipboard`
  (OSC 52), `notify` (OSC 9), `cwd` (OSC 50 + 9;9) and `bell` — and **a capability is one plain
  object with no functions in it**: a name, an OSC code, a declaration of when a terminal is
  believed to understand it, and two templates. It can be written in a config file, generated,
  diffed and validated against the published `paratext/schema.json` without running anybody's
  code, which is what PRINCIPLES rule 7 asks for and what an agent needs to ship one in a turn.

  Nothing in this layer is detectable, so every capability carries a static projection and
  `register` refuses one without it: an image becomes its caption, a notification a printed
  line, a hyperlink `text (url)`, and a pipe receives no control byte at all.

### Patch Changes

- [#229](https://github.com/ofri-peretz/burgee/pull/229) [`6a6442e`](https://github.com/ofri-peretz/burgee/commit/6a6442e9d2cfc001bc3e05d68dab99aa2c9f451e) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Name reserved for the OSC layer. `paratext` will own the escape class that addresses the
  terminal _program_ rather than the character grid — hyperlinks, inline images, the window
  title, the clipboard, desktop notifications, the working directory and the bell — each with
  a static fallback for terminals that cannot do it. Exports only its own name until its intent
  and design are approved.
