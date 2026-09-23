# burgee

## 0.9.2

### Patch Changes

- [#465](https://github.com/ofri-peretz/burgee/pull/465) [`acf98f3`](https://github.com/ofri-peretz/burgee/commit/acf98f3e612c6d79e6c2b78a847abcd06a063cbc) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Each README now opens with the incumbent it replaces and the agent surface it serves (`--json`, an agent event, or a static projection), so npm shows both above the fold. README text only; no code changed.
- Updated dependencies [[`acf98f3`](https://github.com/ofri-peretz/burgee/commit/acf98f3e612c6d79e6c2b78a847abcd06a063cbc)]:
  - roundel@0.4.2
  - linegauge@0.4.2
  - seniority@0.4.2
  - bellpull@0.2.2
  - closeout@0.3.2

## 0.9.1

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

- Updated dependencies [[`b4584e7`](https://github.com/ofri-peretz/burgee/commit/b4584e719bc0064b294aab5ea6da1c11f698f0e9), [`bdaf364`](https://github.com/ofri-peretz/burgee/commit/bdaf364f81564c1700cf1adec18f927afe6c60c9), [`7888524`](https://github.com/ofri-peretz/burgee/commit/78885245eb292cd4a40541fe09382a198c9c45cf), [`dac303e`](https://github.com/ofri-peretz/burgee/commit/dac303e944e889ac4175ac38c94e4ca0f0ca5358)]:
  - bellpull@0.2.1
  - closeout@0.3.1
  - linegauge@0.4.1
  - roundel@0.4.1
  - seniority@0.4.1

## 0.9.0

### Minor Changes

- [#421](https://github.com/ofri-peretz/burgee/pull/421) [`db3c59e`](https://github.com/ofri-peretz/burgee/commit/db3c59e3dcd373c7e6e4a057715adb173766523f) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `ExitCode.AUTH` — a refused credential gets its own code (E6).

  `RUNTIME` is the code for everything: _it failed, read the message_. A caller — a script, a
  retry loop, an agent — cannot branch on it, so a 401 and a null-pointer look identical from
  outside and a retry on one is a retry on both, forever.

  ```ts
  import { AuthError } from "burgee";

  throw new AuthError(
    "the registry refused the token",
    "the token has expired",
    "mytool login",
  );
  // exit 5, and on --json: { ok: false, error: { code: 5, message, hint, fix } }
  ```

  `AUTH` says _get a credential and run it again_, which is a different action from `USAGE`'s
  _fix the script_ and `CONFIG`'s _fix the runner_. The requirement calls it "the most actionable
  single code in the survey"; it was the one the taxonomy was missing.

  **5, where `gh` uses 4.** Four is `CANCELLED` here and has been since the contract was written,
  and moving a published code to match a neighbour's is a breaking change for everyone already
  branching on it. `aws` v2 uses 252/253/254 and agrees with nobody either — what matters is that
  the code is stable and documented.

  `fix` is the line a caller runs where `hint` is the prose a person reads, and both reach the
  `--json` envelope, so an agent never has to parse the message.

  374 bytes on the core entry.

- [#412](https://github.com/ofri-peretz/burgee/pull/412) [`4b64f6a`](https://github.com/ofri-peretz/burgee/commit/4b64f6ac6b90a5f3d6444a6f6a1731dd3fdd296f) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `burgee/meow` — meow's surface, over burgee.

  `import meow from 'burgee/meow'` takes the place of `import meow from 'meow'`: the options
  object, the flags contract (`type`, `default`, `shortFlag`, `aliases`, `choices`,
  `isRequired`, `isMultiple`), `commands`, the help and version blocks with `autoHelp` and
  `autoVersion`, `showHelp`/`showVersion`, and the `input`/`flags`/`unnormalizedFlags`/`pkg`
  result. Graded by meow's own suite at **132 / 148 (89.2%)** against a control of 146 / 148.

  meow is one function over `yargs-parser`, and burgee already ships its own for
  `burgee/yargs`, so this takes no new dependency into the tree. The entry costs 59,820
  bundled bytes; upstream meow looks lighter only because it depends on `yargs-parser` rather
  than carrying it, and a caller installing meow installs both.

- [#428](https://github.com/ofri-peretz/burgee/pull/428) [`f0370b4`](https://github.com/ofri-peretz/burgee/commit/f0370b4e56e3c98a0214ac1fe4fcb1aedbeb8b16) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - A deprecation now has to name its replacement.

  ```ts
  defineCommand({ name: 'push', deprecated: 'publish', /* … */ });
  options: { legacy: { type: 'boolean', deprecated: '--force' } }
  ```

  `deprecated: true` used to produce `(deprecated)` in help and `warning: 'push' is deprecated` on
  stderr, which tells the reader to stop without saying where to go. `defineCommand`, and
  `Manifest.use()` for plugin commands, now refuse `true` and `''` on a command or any option, and
  the error says how to fix it. A named replacement already appeared in all three places:
  `(deprecated: use publish)` in help, `deprecated` in `--schema`, and `, use 'publish'` in the
  warning.

  **Breaking for anyone who wrote `deprecated: true`**: replace it with the name of what to use
  instead. Commander and yargs programs running on burgee's front-ends are unaffected. Those
  incumbents accept a bare deprecation, and the front-ends keep accepting it.

- [#424](https://github.com/ofri-peretz/burgee/pull/424) [`fb92e13`](https://github.com/ofri-peretz/burgee/commit/fb92e131039b5504b5b7398a99168760e213e1b0) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Help is coloured on a terminal, and `NO_COLOR` and `FORCE_COLOR` mean what they say.

  The engine rendered help plain everywhere. That met "no ANSI in a pipe or under `NO_COLOR`" only by
  never colouring at all, and it left `FORCE_COLOR` with nothing to override. Now one decision covers
  every help path:

  - `FORCE_COLOR` decides whenever it is set: `0` or `false` turns colour off, anything else (the
    empty string included) turns it on, even through a pipe and over `NO_COLOR`. This matches Node's
    own `getColorDepth`.
  - Otherwise help is coloured only on an interactive terminal with no non-empty `NO_COLOR` and a
    `TERM` other than `dumb`. **A detected agent is not an interactive terminal**, so Claude Code,
    Cursor and the rest still read plain help even when they have a TTY.

  Colour adds ANSI and nothing else: stripped, coloured help is byte-identical to the plain render,
  and `NO_COLOR=1` gives back the plain render exactly.

- [#415](https://github.com/ofri-peretz/burgee/pull/415) [`47b541a`](https://github.com/ofri-peretz/burgee/commit/47b541ade1977e781968bdfb94a41c2bd990b203) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - **The root barrel stops holding five modules open, and the initial load a consumer pays halves.**

  `import { run } from 'burgee'` was loading `help.ts`, `mcp.ts`, `schema.ts`, `plugin.ts`,
  `manifest.ts` and `seniority/precedence` whether or not a program read any of them, because
  `index.ts` re-exported their value half as a convenience. `execute.ts` already loaded each one
  behind an `await import()`; the barrel was the only thing keeping them on the startup path.

  Measured over the transitive closure of `import` statements — the bytes a bundler actually puts
  on a consumer's startup path:

  |                                   |   before |        after |
  | :-------------------------------- | -------: | -----------: |
  | `burgee` initial load, bundled    | 57,880 B | **28,637 B** |
  | `burgee` static graph, on disk    | 60,823 B | **42,223 B** |
  | cold start, `burgee ÷ cac`        |   2.567× |   **1.737×** |
  | modules Node loads for the import |       22 |           17 |

  **Breaking, and narrowly.** Every moved value has a subpath of its own:

  | was                                                                     | is now          |
  | :---------------------------------------------------------------------- | :-------------- |
  | `renderHelp`                                                            | `burgee/help`   |
  | `serveMcp`, `toolsOf`, `annotationsOf`, `MCP_PROTOCOL_VERSION`          | `burgee/mcp`    |
  | `schemaOf`, `commandSchemaOf`, `inputSchemaOf`, `summaryOf`, `Manifest` | `burgee/schema` |
  | `definePlugin`, `CONTRACT`, `PluginError`                               | `burgee/plugin` |
  | `resolve`, `explain`, `envName`, `screaming`, `ConfigError`             | `burgee/config` |

  **Every `type` stayed where it was.** A type re-export is erased and costs a consumer nothing,
  so the whole type surface — `Manifest` included, which is what keeps `defineProgram`'s return
  type nameable — still imports from `burgee`. A typed program that never called one of the moved
  functions needs no change at all.

  `--explain` and `--schema` also load on their own branch now rather than at import: `schema.ts`
  is 2,640 bundled bytes and `seniority`'s explain half is 1,018, and neither runs unless a reader
  asks for a document.

  This is D-093 reversed. That decision declined the split on a cold-start argument it did not
  have a number for; the number is 830 ms of ratio and 29,243 bytes.

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

- [#421](https://github.com/ofri-peretz/burgee/pull/421) [`db3c59e`](https://github.com/ofri-peretz/burgee/commit/db3c59e3dcd373c7e6e4a057715adb173766523f) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `runBurgee` forwards `cwd`, `stdin` and TTY-ness to the engine. It did not.

  The harness built a whole `fakeRuntime` — argv, env, cwd, stdin, per-stream TTY-ness, exit,
  clock — and then passed **six of those nine** to `execute`. The other three were computed and
  dropped, which `.sdlc/intents/burgee/spec.md` records as T1 and calls _"the row most likely to
  make a test pass for the wrong reason"_. It is, and precisely:

  - **`tty: true` changed nothing.** `execute` reads TTY-ness off `opts.stdout.isTTY` and hands it
    to `detectAgent`; the harness passed a bare `{ write }`. A test asking for a terminal got the
    non-interactive floor and asserted on it happily.
  - **`cwd` changed nothing.** Config discovery starts at `io.cwd`, which fell through to
    `host.cwd()` — the _real_ process directory. A test pointing at a fixture tree was reading the
    repository it was running in.
  - **`stdin` changed nothing**, so nothing that reads it could be driven through the harness at all.

  `testing-harness-forward.test.ts` is the check and both cases were proved to fail on the
  six-field version: `interactive` read `[false, false]` for `tty: true`/`false`, and a
  `<name>.config.json` under the given `cwd` never reached the handler.

  The cost is **92 bytes** on `burgee/testing`, which is test-time only.

- [#415](https://github.com/ofri-peretz/burgee/pull/415) [`47b541a`](https://github.com/ofri-peretz/burgee/commit/47b541ade1977e781968bdfb94a41c2bd990b203) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The MCP server and the help renderer load on the branch that uses them.

  `--mcp` serves a protocol until stdin closes and `--help` lays out prose with measured
  columns; a program that does neither should carry neither. Both are now reached through
  `await import()`, so a bundler with code splitting leaves them off the startup path.

  Measured as an entry chunk: `burgee` **58,056 → 19,540 bytes**, and `burgee/commander`
  **69,431 → 51,306**. No API changed — `renderHelp` and `serveMcp` are still exported from the
  root and still do the same thing.

  `commander`'s `--schema` deliberately stayed synchronous: `parse()` is synchronous by
  contract and a lazy import there returned a Promise nobody awaited, so the document never
  printed. The suite caught it.

- [#421](https://github.com/ofri-peretz/burgee/pull/421) [`db3c59e`](https://github.com/ofri-peretz/burgee/commit/db3c59e3dcd373c7e6e4a057715adb173766523f) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `onError` fires on the commander and yargs front ends. It did not.

  The plugin contract is three hooks, and the contract _between_ them is what makes them usable:
  `preRun` opens, and **exactly one of `postRun` or `onError` closes**. A plugin that starts a
  span, opens a file, takes a lock or writes an audit line in `preRun` has nowhere to finish it
  otherwise — and "otherwise" is every command that throws.

  The engine held that. Both façades ran `preRun → handler → postRun` as a `.then` chain, so a
  handler that threw **skipped `postRun` and never reached `onError`**: a plugin got an opening
  hook and no closing one at all. And `onError` was never fired by either façade under any
  circumstances, so a plugin declaring it was silently dead on a commander- or yargs-syntax
  program — the two drop-in front ends this package exists for, and a hook neither commander nor
  yargs can offer at all.

  `plugin-lifecycle.test.ts` holds the contract on both façades, in both directions, and all four
  new cases were proved to fail on the `.then`-only chain.

  68 bytes on `burgee/yargs`, 62 on `burgee/commander`.

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

- [#418](https://github.com/ofri-peretz/burgee/pull/418) [`c0fa8a3`](https://github.com/ofri-peretz/burgee/commit/c0fa8a37913fab17a6d06615b7432116b1c0e1db) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `burgee/yargs` loads the MCP server on the `--mcp` branch, not at import.

  `yargs/factory.ts` imported `serveMcp` at the top of the file while the note above `#surfaces`
  said _"Completions and `--mcp` load lazily, so those two return a promise"_. The note was right
  about the shape and wrong about the fact: the branch already returns a promise, so the server
  always could have been loaded on it, and until now its **2,520 bytes sat on the startup path of
  every `burgee/yargs` program**.

      burgee/yargs, bundled     107,665 B  ->  105,240 B
      burgee/yargs ÷ yargs          0.969  ->  0.947

  The same shape as the root-barrel split, missed here because a comment said it had already been
  done. The weight lock's `./yargs` budget comes down from 256,000 to 214,800 with it — a ceiling
  41 KB above the measurement is not a ratchet.

- Updated dependencies [[`47b541a`](https://github.com/ofri-peretz/burgee/commit/47b541ade1977e781968bdfb94a41c2bd990b203), [`4d1b2b3`](https://github.com/ofri-peretz/burgee/commit/4d1b2b399cff354864d1e2e843a19fde80ef1f30), [`db3c59e`](https://github.com/ofri-peretz/burgee/commit/db3c59e3dcd373c7e6e4a057715adb173766523f), [`db3c59e`](https://github.com/ofri-peretz/burgee/commit/db3c59e3dcd373c7e6e4a057715adb173766523f), [`c0fa8a3`](https://github.com/ofri-peretz/burgee/commit/c0fa8a37913fab17a6d06615b7432116b1c0e1db)]:
  - bellpull@0.2.0
  - closeout@0.3.0
  - linegauge@0.4.0
  - roundel@0.4.0
  - seniority@0.4.0

## 0.8.0

### Minor Changes

- [#382](https://github.com/ofri-peretz/burgee/pull/382) [`0a37307`](https://github.com/ofri-peretz/burgee/commit/0a37307b01d0909753285c7ca88a2e4ef7cd4eee) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `burgee migrate` — the mechanical path from commander or yargs to burgee.

  Every migration that actually happened shipped the codemod before the wave, not after it:
  `jest-codemods`, `pnpm import`, `biome migrate eslint`. burgee already had the strongest
  possible version of the claim — change one import and commander's own 1,360 tests still pass
  — and no path from _could_ to _did_.

  ```
  $ burgee migrate --dry-run
  files: 3
  imports: 3
  mapped: [{"from":"commander","to":"burgee/commander","imports":3,"files":3}]
  refused: []
  detected: {"declared":["commander"],"imported":["commander"]}
  dependencies: {"before":["commander"],"removable":["commander"],"after":0}
  graded: [{"host":"commander","reference":1360,"passed":1360,"rate":1}]
  ```

  It detects hosts from two independent sources that are allowed to disagree — `package.json`
  and the specifiers source actually imports — rewrites `commander`, `yargs`, `yargs/yargs`
  and `yargs/helpers` across all five specifier positions, and **refuses by file and line** on
  a deep import or a non-literal dynamic specifier, leaving that whole file untouched (D-051).
  It refuses a dirty git tree unless `--force`, writes nothing under `--dry-run`, never edits
  `package.json` (D-054), and never touches an API call site (D-053). The compat figures are
  read from `compat-oracle`'s baseline through a lock, never typed into the report.

  **Specifiers, not syntax trees** (D-050): a scan over five known positions needs no parser
  and therefore no dependency, and it is the fast choice as well as the rule-2 one. Measured
  over a generated 1,000-file tree: **the whole scan phase is 17 ms** and **the slowest single
  file 0.074 ms** against a 1 ms budget; the rest of the command is filesystem.

  The gate is `examples/demo-cli-commander`, which holds the same program written twice — once
  against `commander`, once against `burgee/commander` — and predates this feature. Migrating
  the commander variant produces the hand-written drop-in's import byte for byte.

  The engine gains one thing on its behalf, in `execute.ts`: a command's result may name an
  `exitCode`, and `emit` honours it. Before this there was exactly one success path and it left
  with `OK`, so a command could emit a document _or_ fail, never both — and an agent migrating
  a repository unattended needs the refusal list **and** the code. **162 bytes** measured
  (60,661 → 60,823 on the root entry), opt-in by naming the field. `migrate` itself is 10,878
  bytes loaded through a dynamic import and is denied to the root entry by name, so
  `import 'burgee'` never reaches it.

- [#384](https://github.com/ofri-peretz/burgee/pull/384) [`7f32875`](https://github.com/ofri-peretz/burgee/commit/7f328752e8318fefd70bf87eebcb0c05d789d607) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - A program written in commander's or yargs' own syntax now gets burgee's agent surfaces.

  `--mcp` lists every command instead of none: a façade command arrives with no `effects`
  because neither incumbent has such a concept, and the filter used to read undeclared as
  _not a tool_. It is now listed with `effects: "undeclared"` — absent from the list is
  strictly worse for a caller than present with an honest annotation. `withheld` still means
  absent.

  `tools/call` used to return **nothing at all** — the reply writer was read out of
  `_outputConfiguration` at reply time, and the first tool call replaces that so the run can
  be captured. A client waited forever. It now answers the `--json` envelope, call after call.

  `--json` works at the root of a command group and no longer swallows the operand after it,
  and a failure under `--json` is the envelope on stdout with `fix:` rather than prose on
  stderr.

  commander stays 1360 / 1360 and yargs 804 / 804 against their own suites.

### Patch Changes

- [#385](https://github.com/ofri-peretz/burgee/pull/385) [`c219e65`](https://github.com/ofri-peretz/burgee/commit/c219e65e2a4b0de1836b285c0df8e43a92c74189) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - A kebab-case option key is now refused where it is declared, instead of silently never
  reaching the handler.

  `toParseConfig` kebabs each declared name to build the flag and `canonical` camels every
  parsed key back, so the flag layer handed to `resolveLayers` is keyed camelCase while the
  specs beside it are keyed as declared. Declare `'dry-run'` and the two never meet: `--dry-run`
  parses, resolves to nothing, and the handler is given `undefined`. No error anywhere.

  Three of burgee's own commands were live instances. `burgee brand --allow-low-contrast` never
  suppressed the WCAG failure it names, `--bordure-width` was always `1.5` whatever was passed,
  and `burgee dev --no-watch` still watched. All three are fixed by spelling the key `camelCase`;
  the flags are unchanged, and `--bordure-width 7` now reaches the SVG as `stroke-width="14"`
  against the default's `3`, `--allow-low-contrast` emits, and `--no-watch` logs no reload when
  the entry is edited.

  **Breaking for a declaration, not for a command line.** `checkDefinition` refuses a key that
  does not survive `camel(kebab(key))` — `'dry-run'`, and also `URL`, whose canonical form is
  `url`. It throws through the clash message that was already there, because it is the same
  defect: two keys that meet on the command line, one of them written by `kebab()` rather than
  by the author. The engine was not taught a second spelling. Threading one through help,
  `--schema`, Fig, the env, config and package.json layers and the relation names, to reach a
  key that already has exactly one canonical form, is a larger surface than the bug.

  **No weight ceiling moved**, which is what D-073 asks for. `./plugin` had 5 bytes of headroom
  and a standalone message cost 187, so two things moved to pay for it: V5's reserved names out
  of their own loop in `checkCommand` into the pass `checkDefinition` was already making, and
  the numeric-bound check out of that loop into the spec helper beside the relation names. Both
  read better where they are now — `flag` is computed once and `kebab` is the identity on every
  reserved name, and a numeric bound is a fact about a spec rather than about a name.
  `definition.js` is 51 bytes smaller than before the check existed. `checkDefinition` now
  carries the reserved names; `checkCommand` is still the one door both callers reach.

  Found while building `burgee migrate`: it showed up only through the built binary, because
  every in-process case had been written camelCase.

- Updated dependencies [[`5a85175`](https://github.com/ofri-peretz/burgee/commit/5a85175da66df5e797446eaada1c3492cc8b8fff), [`88a6996`](https://github.com/ofri-peretz/burgee/commit/88a699645f986c6e5dcead465e3f36238f0ae77d)]:
  - linegauge@0.3.2
  - seniority@0.3.1

## 0.7.1

### Patch Changes

- [#373](https://github.com/ofri-peretz/burgee/pull/373) [`a1f1d40`](https://github.com/ofri-peretz/burgee/commit/a1f1d40b7d1e7244f3a180943b641bb3b491d256) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Stage 2's artifact is now `spec.md`, the name Anthropic's AI-Native SDLC playbook gives it, so the source comments and README sections that cite a package's own design document point at `spec.md` rather than `design.md`.

  No behaviour changes. The published tarballs do move, by two bytes per surviving reference — `design.md` is nine characters and `spec.md` is seven — so the four packages carrying a weight band were re-measured against it: linegauge 83,538 to 83,536; paratext 66,343 to 66,341; closeout 84,455 to 84,453; bellpull 86,113 to 86,107.

- Updated dependencies [[`955b979`](https://github.com/ofri-peretz/burgee/commit/955b9790560ad2e478a1abbcbe42ec2bc4ba7423), [`a1f1d40`](https://github.com/ofri-peretz/burgee/commit/a1f1d40b7d1e7244f3a180943b641bb3b491d256)]:
  - seniority@0.3.0
  - bellpull@0.1.1
  - closeout@0.2.1
  - linegauge@0.3.1

## 0.7.0

### Minor Changes

- [#332](https://github.com/ofri-peretz/burgee/pull/332) [`3ea38c3`](https://github.com/ofri-peretz/burgee/commit/3ea38c363b9f0cee9f1c1c2dae4037b047e98328) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - E5 and O5, which the design has marked `R` since it was written and which nothing implemented.

  `exit-code.ts` has declared `SIGINT: 130` with the comment _"SIGINT after the terminal was restored (E5)"_ from the first day of the contract, and `exit-code-lock.test.ts` grades that no other literal reaches an exit. Neither could see what was actually missing: **no code path produced 130 and nothing restored anything.** `grep -rn SIGINT packages/burgee/src` returned the declaration and nothing else. O5 — _"stdout is flushed before any exit path"_, yargs [#1519](https://github.com/ofri-peretz/burgee/issues/1519) and [#2118](https://github.com/ofri-peretz/burgee/issues/2118), _"No truncated JSON"_ — was the same shape one line down, against `host.exit(code)`, which is `process.exit` and truncates a pipe by definition.

  Both are now `closeout`'s, which is burgee's first dependency on it and the reason it exists: bound every exit path, run the handlers exactly once, hand the terminal back last. Writing the listener in burgee instead would have been the fourth copy of one in this repository.

  - **`ctx.onExit(handler, label?)`** — cleanup that runs on every path out of a run: a normal return, `ctx.exit`, Ctrl-C, SIGTERM, a terminal closing out from under you, an uncaught throw. It runs after stdout has drained and before the terminal is handed back, and exactly once however many of those arrive together. `label` is what a breached shutdown deadline calls it; an unlabelled arrow is reported as `(anonymous)`, and the anonymous arrow is the shape that hangs.
  - **A run that owns the process** gets closeout's full wiring — `exit`, `beforeExit`, five signals, `uncaughtException`, `unhandledRejection`. A run that injects its own `exit` — the harness, the MCP loop, every façade test — gets the same registry **detached**, with no listeners on anybody's process.
  - **Every exit now goes through one place.** `ctx.exit(code)` used to call the injected exit and then throw; on the real path the first half was `process.exit`, so cleanup registered a line earlier could never run. It now throws only, and the failure path drains, runs the cleanup and leaves — which makes the file's own sentence, _"exactly one code path from argv to exit"_, true of the exit as well as of the parse.

  Measured: commander 1360 / 1360 and yargs 804 / 804 before and after, unchanged — the two front-ends do not reach `execute.ts`. The core entry is 51,293 → 52,683 bytes against an unchanged 53,300 budget, so nothing was ratcheted for it; `shutdown.ts` is 1,001 of those and the engine's routing is the other 389. `npm i burgee` gains closeout's 81,360 bytes unpacked, and closeout depends on nothing.

- [#361](https://github.com/ofri-peretz/burgee/pull/361) [`a0cb8ca`](https://github.com/ofri-peretz/burgee/commit/a0cb8caf22a1e1e56105cccd65fe02cab1516804) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - An error carries `fix` — the exact flag to run next — beside `hint`.

  E3 asks for _"`code`, `message`, `hint`, and where possible `fix`: **the exact command or flag
  to run next**"_. The envelope was `{code, message, hint}`, and `hint` is prose.

  The distinction matters most for the caller this package exists for. **An agent can execute a
  `fix`.** A `hint` it has to read, interpret and guess at — one more turn, and the turn where
  it invents a flag that does not exist. Every _plugin_ error in the family already carried
  `fix`; the engine's own did not.

  ```
  $ tool deploy --forc --json
  {"ok":false,"error":{"code":2,"message":"unknown option --forc",
                       "hint":"did you mean --force?","fix":"--force"}}
  ```

  `fix` is omitted, never guessed, when there is no near match: an executed guess burns the turn
  the field exists to save.

- [#361](https://github.com/ofri-peretz/burgee/pull/361) [`a0cb8ca`](https://github.com/ofri-peretz/burgee/commit/a0cb8caf22a1e1e56105cccd65fe02cab1516804) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `--help --json` prints help as data.

  It printed the same prose as `--help`. A caller who asked for a machine-readable answer got
  one they had to parse — the exact failure the whole `--json` surface exists to avoid, on the
  flag people type first. burgee's design recorded it as **F2, `Not built`**: _"no JSON help
  surface; `--help --json` prints the same prose as `--help`."_

  The document is `commandSchemaOf` scoped to the node you asked about — the same shape
  `--schema` publishes, so a reader learns it once — plus `schemaVersion`, and for a group the
  names of its children. A group's help is a menu; a reader who wants a child's detail asks for
  that child, which is the same walk they would do on the text.

  Plain `--help` is unchanged.

- [#337](https://github.com/ofri-peretz/burgee/pull/337) [`e974114`](https://github.com/ofri-peretz/burgee/commit/e974114a8da753d4fd4f97d7e79928407d82e54a) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Options can declare `dependsOn` and `exclusive`, and the declaration is enforced rather
  than documented.

  They are an **alias**, not a second engine: `exclusive` desugars to `conflicts` and
  `dependsOn` to `implies`, into the `Relation` union that already existed. Command-level
  `relations` are evaluated first and the derived entries after, so no existing command
  changes which error it reports first.

  The second spelling exists because it is the one the two incumbents use on the _option_
  rather than on the command — commander's `.conflicts()` / `.implies()` and yargs'
  `conflicts` / `implies` both hang off an option, and a drop-in that only accepts the
  command-level form is not drop-in.

  Enforced at parse time through the existing usage path: `UsageError`, exit 2, text
  `error: --out requires --force` with `hint: pass --force`, and `--json` gives exactly
  `{ok:false,error:{code:2,message,hint}}`. No new error shape.

  Refused at _definition_ time when a name is not an option of that command, or is the
  option itself. Both are silent at run time, in opposite directions: the first can never
  fire, the second always does.

  Projected three ways, because a relationship a caller cannot see is a relationship they
  will violate: `--schema` carries both spellings, help renders `(requires --force)` and
  `(conflicts with --table)` — it rendered no constraint of any kind before this — and the
  Fig spec emits `dependsOn` / `exclusiveOn`, Fig's own two keys.

- [#334](https://github.com/ofri-peretz/burgee/pull/334) [`0f00f72`](https://github.com/ofri-peretz/burgee/commit/0f00f7273ab0ca111c5869e2b08eb79314df7f70) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - burgee's plugin host now refuses a plugin it cannot host, and a plugin's commands go through
  the guards a first-party command goes through. **This is a breaking change to a published
  extension point, and it is deliberately a loud one.**

  The defect, measured rather than inferred. `definePlugin(plugin)` was `return plugin;`, and
  `Manifest.use()` pushed the plugin and called `this.add()` directly — where `defineCommand`
  enforces the reserved names of V5 and runs `checkDefinition`. So a plugin's command was
  admitted unread, and `toParseConfig` seeds `json: { type: 'boolean' }` and then writes every
  declared option over the top of it. **A plugin option named `json` therefore did not clash
  with the envelope flag; it replaced it**, on a framework whose entire agent-facing contract is
  that `--json` is machine-readable output. Four more were accepted the same way: `enforce:
'mid'` (`NaN` in the hook comparator), a plugin with no `name` (commands carried
  `plugin: undefined`, so M3 attribution was silently lost), a hook with no `handler` (a
  `TypeError` one run later, classified `RUNTIME`), and a contributed path that was already
  declared — which `find()` and `resolve()` answer differently.

  **What `contract` means, and how an old plugin fails.** `packages/burgee/src/plugin.ts` is
  now a plugin host in the sense the rest of the family means: it owns `Plugin`, `validate()`,
  `PluginError` and a `PluginErrorCode` of `E_PLUGIN_SCHEMA | E_PLUGIN_CONTRACT`, both already
  in the vocabulary home's union. `contract` is the revision of the family plugin object a
  plugin was written against, and this burgee knows `1`. A plugin that declares none is refused
  with `E_PLUGIN_CONTRACT` naming the version:

  > plugin "acme" declares no contract; burgee 0.6.1 and earlier validated none of it
  > — rebuild it against this burgee (`definePlugin` stamps `contract: 1`), or add that key by hand

  That refusal is the point rather than a side effect. An object with no `contract` was authored
  against a host that checked nothing, so the honest reading of its silence is _unknown_, not
  _fine_ — and it may be carrying exactly the `json` option above. A silent behaviour change on
  a published extension point is worse than a loud breaking one. `definePlugin` now stamps the
  contract it was compiled against, so a plugin rebuilt against this release needs no edit, and
  only objects built against the unvalidated host are refused.

  Two supporting changes. The definition-time checks moved from `validate.ts` to a new
  `definition.ts`, because the plugin host pulls them into every graph that reaches the manifest
  — including the commander and yargs front-ends, which reach nothing else of the engine.
  Importing `validate.js` whole for `checkDefinition` put 6,409 bytes of run-time coercion into
  both front-ends and took `burgee/commander` over the 128,000-byte budget that exists to prove
  it is no heavier than commander's own `lib/`; the split keeps it at 125,667. And burgee ships
  `src/schema.json`, byte-identical to the family's, exported as `burgee/schema.json`.

  Measured: `burgee/commander` 1,360 / 1,360 and `burgee/yargs` 804 / 804 against the
  incumbents' own suites, unchanged. Core costs 4,191 bytes on disk (52,959 → 57,150), priced
  per entry in `weight.test.ts`.

- [#361](https://github.com/ofri-peretz/burgee/pull/361) [`a0cb8ca`](https://github.com/ofri-peretz/burgee/commit/a0cb8caf22a1e1e56105cccd65fe02cab1516804) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - burgee's extension surface: `./plugin` is published, and `effects` is no longer optional.

  **`burgee/plugin`.** Every other host in the family publishes its plugin module at
  `<host>/plugin` — `bellpull`, `caique`, `closeout`, `flagstaff`, `paratext`, `roundel`,
  `seniority`. burgee, the package that declares the plugin shape the other seven register
  against, did not, so `scripts/plugin-contract-lock.test.ts` had to reach it by relative path
  and recorded the gap as a declared one. It is the shape `plugin-schema-lock` caught in
  flagstaff — a host whose own refusal names something the author cannot reach — and burgee's
  version was the quieter kind, because the `fix` named no specifier at all: it said _rebuild
  it against this burgee, `definePlugin` stamps the contract_, and left the author to work out
  where `definePlugin` lives. The convention the family teaches is `burgee/plugin`, and that
  threw `ERR_PACKAGE_PATH_NOT_EXPORTED`. Both halves are fixed: the subpath resolves, and the
  message says its name. `burgee/plugin` exports `CONTRACT`, `definePlugin`, `validate`,
  `PluginError`, `Plugin` and `PluginErrorCode`; the root barrel keeps the four it always
  carried, because one module behind two doors is what `burgee/yargs` and
  `burgee/yargs/helpers` already are, and `Manifest.use(plugin: Plugin)` is a root export.
  `validate()` and the `Plugin` interface are the half only the subpath carries — the host's
  vocabulary rather than a program author's.

  **`effects` is required on a command that runs — a breaking change.** Any CLI with an
  un-annotated runnable command will now fail at definition time rather than starting. The
  one-line migration: add `effects: 'withheld'` to every runnable command that declared none,
  then replace it with `read_only`, `idempotent` or `non_idempotent` on each command an agent
  should be able to call.

  It is breaking on purpose, because the old behaviour was silent. `toolsOf` serves only a
  command that declared its `effects`, and that filter is right and unchanged: an agent gaining
  shell-equivalent power over a CLI nobody meant to publish is a security posture, not a
  convenience. What was wrong is that its input had one spelling for two different things.
  _I decided agents should not have this_ and _I forgot_ both arrived as `undefined`, so the
  second shipped as the first — you released, and the tool you built for an agent simply was
  not in `tools/list`, with a shorter list than you expected as the only evidence.

  So `effects` has no default, and declining is something an author writes down:
  `effects: 'withheld'`, a fourth value of the same field. Not `'none'`, which reads as _this
  command has no effects_ — that is `read_only`, the one value it could be confused with. Not a
  second boolean field either: beside a now-required `effects` that would mean declaring what a
  command does to the world silently opts it into the tool list, and the new field's default
  would be the silence this change removes. One field, four answers, no default, and therefore
  no state in which forgetting is possible.

  The three projections then disagree on purpose, each correctly. `--schema` publishes
  `effects: "withheld"`, because an agent reading a program as data is better served by _this
  exists and is not for you_ than by a gap it cannot tell from a command that does not exist.
  `tools/list` omits it. The Fig spec and the shell completions carry it exactly as before —
  nothing in `completions.ts` reads `effects` and nothing here makes it start, because
  withholding is about agents and a person typing at a terminal is not one.

  Two limits, stated rather than implied. The refusal is on burgee's own declaration API:
  a command built through `burgee/commander` or `burgee/yargs` reaches the manifest without
  passing that door, because neither incumbent has a notion of effects and their graded suites
  declare none — commander **1360 / 1360** and yargs **804 / 804**, both unchanged by this
  release — so a façade user's command is withheld in fact and cannot be made to say so. And
  `effects` stays optional on the TypeScript type, because a field whose presence depends on a
  sibling's would mean splitting `Command` into a union at the cost of the option-spec
  inference every caller relies on; the check is at definition time, not at compile time.

  `burgee dev` is the first command in this repository to declare `'withheld'`, and not as a
  formality: `dev` **is** an MCP server, so a tool call that started it would be a second,
  never-finishing server nested inside the first, on the same pipe. `burgee brand` declares
  `non_idempotent`, because it overwrites six files in a directory the caller names.

  Weight, measured on a forced rebuild rather than a cached `dist/`: the core entry goes
  58,771 → 59,732 bytes on disk (`+961` over both changes, of which `+938` is the refusal),
  `burgee/testing` 62,992 → 63,953, `burgee/cli` 78,071 → 79,088, `burgee/commander`
  126,989 → 127,876 inside its unchanged 128,000, and `burgee/yargs` 230,869 → 231,756 inside
  its unchanged 256,000. The new `burgee/plugin` entry is 7,095 and costs a program nothing:
  `manifest.js` imports `validate` as a value because `use()` is synchronous, so every entry
  that reaches the manifest already carried those bytes.

- [#360](https://github.com/ofri-peretz/burgee/pull/360) [`61c51f9`](https://github.com/ofri-peretz/burgee/commit/61c51f99481aab65c0743077feaea2dbff39acca) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `burgee/commander` spawns `executableSubcommand` through `bellpull`, and burgee no longer
  imports `node:child_process` anywhere.

  The gap was declared, dated, and carried its own release condition.
  `inline-implementation-lock` read: _"commander's `executableSubcommand` spawns a sub-binary
  and forwards five signals to it. Both are bellpull's job; bellpull was a seven-line
  placeholder when this was written, and the engine lane adopts it once bellpull grades
  against cross-spawn's suite."_ It grades **68 / 68**.

  What it buys a consumer is the Windows branch. Upstream commander sends **every** Windows
  spawn through `node`, because `spawn` does not search `PATHEXT` and, since the fix for
  CVE-2024-27980, Node refuses a `.cmd` without `shell: true`. That is a workaround for a
  resolution problem, and it is wrong for a subcommand that is a `.cmd`, a `.bat`, or has a
  shebang that is not node — a real program with a real sub-binary. `bellpull` resolves the
  executable, builds the `cmd.exe /d /s /c` line itself and escapes every argument, so
  nothing reaches a shell as text.

  `ChildProcess` comes from `bellpull/cross-spawn` too, which re-exports it precisely so a
  consumer does not have to name `node:child_process` for a type.

  **commander stays 1360 / 1360, ▲ 0**, measured after the wiring — which is the whole
  question, since `spawn` is mocked in roughly 23 of those cases and the earlier attempt at
  this took the row to ungradeable. `bellpull/cross-spawn` reads `spawn` off its default
  import for that reason, and this consumer reads it off the namespace at the call site.

  Cost: **+1,097 B** on `./commander`, ratcheted at the measurement.

### Patch Changes

- [#332](https://github.com/ofri-peretz/burgee/pull/332) [`3ea38c3`](https://github.com/ofri-peretz/burgee/commit/3ea38c363b9f0cee9f1c1c2dae4037b047e98328) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Two checks that grade what was previously asserted by snapshot or by fake: the Fig spec is
  checked against Fig's own vocabulary, and Ctrl+C is pressed at a real terminal.

  **`fig-schema.test.ts` — Fig publishes no schema, and that is the finding.** PLAN 2.5.3 asks
  for the emitted spec to be validated "against Fig's own schema". There is none:
  `@withfig/autocomplete-types@1.31.0` ships four files — `LICENSE`, `README.md`,
  `package.json` and `index.d.ts` — so the contract is a TypeScript namespace declaration, not
  anything a validator reads at runtime. It was last published 2024-05-08.

  So the check is structural, and the objection `fig-spec.test.ts` recorded against doing one —
  _"writing the allowed-key table from memory would be worse than not checking"_ — is answered
  by giving the table a provenance rather than by giving up. The allowed keys were extracted
  mechanically from Fig's own `index.d.ts`, recorded with the version and the file's SHA-256, the
  way `compat-oracle` vendors an incumbent's suite. **No dependency is added**: the table is
  forty strings, and the package is not installed, not in `devDependencies` and not in the
  lockfile. It reproduces Fig's own asymmetry — `Subcommand` and `Option` extend
  `BaseSuggestion`, `Arg` extends nothing and so has no `priority` and no `displayName` — which
  is the part a table written from memory gets wrong.

  Covered: every emitted key is one Fig declares, on the node type it is emitted on; `name` is
  present and is `SingleOrArray<string>` where Fig requires one; `subcommands`, `options`, `args`
  and `suggestions` have the shapes Fig declares; the whole tree is walked. Not covered, and said
  rather than implied: Fig's semantics past its key names — a `priority` outside 0–100, a
  malformed `generators` entry, a `loadSpec` naming a spec that does not exist. Nothing here
  means "this works in Fig", only "this is not obviously not a Fig spec".

  Proven red on the unfixed state: with `renderFigSpec` emitting `subCommands` — the typo the
  snapshot blessed — the case fails with `<root>: 'subCommands' is not a key Fig declares on a
subcommand`. Nine more cases prove it refuses a missing name, a name of the wrong type, a
  container that is not a list, an arg given a subcommand-only key, and a fault three levels
  down; one more proves it is not simply refusing everything.

  **`pty-signal.test.ts` — the signal path, graded through a real tty.** `shutdown.test.ts`
  raises signals on a `ProcessLike` that records, so the "signal" never leaves the test process.
  Between a keypress and a handler sits the tty line discipline, which neither that test nor a
  pipe has: in canonical mode `ISIG` turns `0x03` into a `SIGINT`, and in **raw** mode the
  identical keystroke arrives as a byte and raises nothing. A test that writes `\x03` to a pipe
  grades the raw path whatever it believes it is grading — which is how `caique` shipped a prompt
  that restored the cursor on a cancel and never on a signal, with a green suite.

  This runs burgee's built `dist/shutdown.js` on a real pty, presses Ctrl+C, and asserts the tty
  echoed `^C`, that the handler the program registered ran, and that the process **died of**
  `SIGINT` rather than calling `exit(130)` — which is the POSIX-correct outcome and not what
  `shutdown.test.ts`'s fake records: 130 is a shell's arithmetic for `128 + 2`, not an exit call.
  A program that exited 130 here would tell its parent it chose to stop.

  The pty comes from `python3`'s standard-library `pty.fork()`, so nothing enters the lockfile —
  the same borrowing as calling `git` in `compat-oracle/src/vendor.ts`. Two other dependency-free
  routes were considered: `script(1)` was measured and rejected, because BSD `script` calls
  `tcgetattr` on its own stdin and dies with `Operation not supported on socket` under any test
  runner; and `zsh/zpty`, which `scripts/complete-zsh.zsh` already uses for the zsh completion
  case, is right where the subject _is_ a shell widget but is gated on `has('zsh')` and an
  apt-install, where `python3` is preinstalled on every hosted runner. **Windows is skipped with its
  reason**, not quietly dropped: Python's `pty` is POSIX-only and a Windows pseudo-console means
  ConPTY through a native addon, so the third OS PLAN 2.5.4 asks for costs `node-pty` — a native
  build on every runner, and `compat.yml` installs with `--ignore-scripts`. That is a decision for
  a person.

  Proven red on the unfixed state: with the fixture using the engine's pre-`shutdown.ts` exit — a
  bare `process.exit(130)` on SIGINT — both cases fail, on `cleanup ran: expected '' to be
'cleaned up'` and `killed by SIGINT (2): expected +0 to be 2`.

  commander 1360 / 1360, yargs 804 / 804 and cross-spawn 68 / 68 before and after, unchanged.

- [#332](https://github.com/ofri-peretz/burgee/pull/332) [`3ea38c3`](https://github.com/ofri-peretz/burgee/commit/3ea38c363b9f0cee9f1c1c2dae4037b047e98328) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Help measured its columns with `String.length`, so a CJK or emoji command name mis-drew its own help screen.

  `.length` is the count of UTF-16 code units, which equals the number of columns a terminal draws only for the Latin-1 subset. `部署` is two code units and four columns; `🚀` is two and two. `help.ts` used it in five places — sizing the shared term column, deciding which terms overflow it, padding after a term, and both width tests inside the word wrapper — so a program whose commands are not spelled in ASCII got a description column that did not line up and description text wider than the terminal it asked for.

  `yargs/cliui.ts`, one directory over, has imported `width` from `linegauge` for exactly this job since it was ported, and its own comment records the reason: cliui's port carried its own `stringWidth`, the ITU T.416 sub-parameter form `ESC[38:2::255:0:0m` that chalk emits for truecolor left `:2::255:0:0m` behind, and a 13-column string measured 25. burgee already depended on `linegauge`. This file simply was not asking.

  - **Every measurement of rendered text in `help.ts` is now `linegauge`'s `width`**, and the term column is `widest`, which is the function that exists so a caller does not spread a large array into `Math.max`. The wrapper carries a running column count rather than re-measuring the accumulated line per word, so a long paragraph stays linear.
  - **For ASCII the two agree exactly**, which is why no graded screen moves: commander 1360 / 1360 and yargs 804 / 804 before and after, unchanged.
  - **What is still not fixed, in any character set:** a single token longer than the row is not broken. `wrap('see https://…/no/spaces now', 20)` leaves the URL on one over-long row today, `linegauge`'s own `wrap` defaults to `hard: false` for the same reason, and hard-breaking would re-draw the graded screens that contain URLs. A test pins that as a known limit rather than leaving it to be re-found.

  Help also has snapshots now (PLAN 2.5.1), which it had none of: five command shapes × the plan's three widths — 33 where the term column is clamped, 80 where the ordinary case wraps, 120 where alignment is what is on trial. A help screen is a drawing and a drawing is a contract, which is the call this repository already made for `boxen`; the renderer's by-construction fixes were each asserted once by a test that names the property it checks, and therefore could not see a change nobody was looking for.

  The core entry is 52,683 → 52,893 bytes against an unchanged 53,300 budget, so nothing was ratcheted. `linegauge` joins `closeout` and `seniority/precedence` as a bare import core admits, on the same argument as both: measuring a line is linegauge's own job the way precedence is the parser's, and the alternative here was the second copy of a width function staying wrong.

- [#343](https://github.com/ofri-peretz/burgee/pull/343) [`b245fb0`](https://github.com/ofri-peretz/burgee/commit/b245fb06db7fb796fe9e12d1f15c72adc10dd5c9) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `burgee` declares `sideEffects`, so a consumer's bundler may drop a module nothing imports.

  Every module in the package is a declaration or a pure const except one, and that one is
  named rather than the field being set to a flat `false`: `dist/cli.js` ends in `run(program)`,
  because it is the package's own command line and executing on import is the whole point of it.
  `sideEffects: ["./dist/cli.js"]` is therefore the accurate statement, where `false` would have
  been a claim the package does not meet. `roundel` and `flagstaff` already carried the field;
  `burgee` did not, which is the only reason this is a change rather than a fact.

  Measured against the B4 fixtures, esbuild takes **9 bytes** off the core entry point
  (56,868 → 56,859) and nothing off `burgee/commander` or `burgee/yargs` — esbuild's own
  tree-shaking had already reached everything the field would have licensed it to drop. The
  field is worth more to webpack and rollup, which consult it directly and are conservative
  without it. No entry point changes shape, and every compat row is where it was: commander
  1360 / 1360, yargs 804 / 804.

- [#351](https://github.com/ofri-peretz/burgee/pull/351) [`488cbe5`](https://github.com/ofri-peretz/burgee/commit/488cbe56b8d2b0b8f6f21b252f4d9db95e290d81) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `--schema` on a yargs-shaped CLI now emits the same document as the other two front ends.

  `yargs/factory.ts` hand-rolled `JSON.stringify(schemaOf(manifest), null, 2)` where `execute.ts` and `commander/command.ts` both call `machineJson(value, head)`. The façade therefore could not see `--format=json-pretty` — the escape hatch R1 added for the person debugging a schema — and emitted the indented document unconditionally. On the fixture this change is tested against, a plain `--schema` wrote **365 bytes through yargs against 240 through the engine and through commander**: the same value, 52% more bytes, and no way to ask for either form.

  **What changes for a caller.** A yargs-shaped program's `--schema` is now compact by default, and indented only when `--format=json-pretty` is passed. Both documents parse to the same value, so a reader that parses is unaffected; a reader that diffed the raw bytes, or eyeballed the stream, will see the compact form where it used to see the pretty one.

  The cost is **+71 bytes** on `burgee/yargs` bundled (114,738 → 114,809): `machineJson` and its flag constant could previously be tree-shaken out of that entry, and now cannot. `burgee` core and `burgee/commander` are unchanged to the byte. That entry is already over `lighter-than-yargs` (1.032 → 1.033), and this makes it marginally worse on purpose — three front ends that disagree about what `--schema` means is not a weight saving, it is a defect the weight measurement was hiding.

  The property is now locked end to end rather than per writer: `machine-json.test.ts` drives one CLI definition through all three front ends and asserts the bytes are identical, in both the compact and the pretty form. The two suites that existed before were each true of a single writer in isolation, which is how three writers came to disagree.

- [#298](https://github.com/ofri-peretz/burgee/pull/298) [`ead5f01`](https://github.com/ofri-peretz/burgee/commit/ead5f016ee7fd20492a041c1e6159aea27b2ed5f) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `cliui`'s `toString()` is now linear in the cell it renders. `rowToString` ended each line
  with `str.replace(/ +$/, "")`, whose unanchored start makes the engine retry at every
  position in a run of trailing spaces; a row built from a 50,000-space cell cost 1,223 ms,
  and doubling the cell quadrupled it. The trim now scans, and the same call takes 69 ms —
  the second half of the fix that `measurePadding` got in [#278](https://github.com/ofri-peretz/burgee/issues/278). Output is unchanged: only
  U+0020 is removed, so a trailing tab still survives under `wrap: false` as it did before.

- [#332](https://github.com/ofri-peretz/burgee/pull/332) [`3ea38c3`](https://github.com/ofri-peretz/burgee/commit/3ea38c363b9f0cee9f1c1c2dae4037b047e98328) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - A ratchet on whether the family actually composes: every package except `burgee` must be used
  by another package in it.

  `layer-boundaries-lock` is the negative half of PRINCIPLES rule 14 — no package does a job a
  sibling exists to do. This is the positive half, and it is the one that was failing. Measured:
  **five dependency edges in a nine-package family**, with `caique`, `paratext`, `closeout`,
  `bellpull` and `flagstaff` used by nothing at all — and one job, putting the cursor back
  however the process dies, implemented **three times**, by three files each of which argues in
  its own comments that a second copy is the danger.

  A layer nothing else uses has never been proven to fit the stack. The split into nine packages
  is only real if the packages compose; otherwise it is a directory layout and the fit is an
  assumption.

  `edges` may only go up and `awaiting` may only shrink, each entry carrying the reason it is
  still there. A package must leave `awaiting` the moment it gains a consumer — otherwise the
  list becomes a place to park the problem, and the ratchet never notices the work was done.

- [#332](https://github.com/ofri-peretz/burgee/pull/332) [`3ea38c3`](https://github.com/ofri-peretz/burgee/commit/3ea38c363b9f0cee9f1c1c2dae4037b047e98328) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Six designs now say what their package offers, how a consumer extends it, and what it
  deliberately does not do — derived from `package.json`'s `exports` map and `src/plugin.ts`,
  not from the README.

  `burgee`, `roundel`, `flagstaff`, `caique`, `closeout` and `bellpull` each gain two sections:
  a table with one row per published subpath and the exported names behind it, an extension
  section stating what a plugin may contribute, what is validated, what is refused and what
  happens on a bad one — and a record of every claim the design was making that the code does
  not support. Each table carries the two commands that re-derive it, so the next reader checks
  rather than trusts.

  The findings are the point. `roundel/import` (`fromBase16`, `fromITerm`) is described in
  `roundel`'s R11 and in its shipped README and exists in neither the `exports` map nor `src/`.
  `bellpull`'s R7 promises a root default export matching `execa`'s and a `./run-path` subpath;
  neither exists, so the `npm-run-path` override recipe cannot be written, and R3's `which` is
  spelled `whichSync` in the code while R5's `toJSON` is `toJson`. `closeout`'s R6 promises a
  root default matching `signal-exit`'s, and the root has no default export.
  `flagstaff`'s R6 names `flagstaff/table` as the `cli-table3` façade — `./table` is the
  built-in grid component and `./cli-table3` is the façade, so a reader following R6 imports the
  wrong module — and its R10 "depends on `roundel` only" is contradicted by the package's own
  shape test, which asserts three dependencies.

  Two structural findings cross package lines. **burgee's `definePlugin` is not the shape the
  layers register against.** `manifest.ts` declares `{ name, commands?, hooks?, enforce? }` —
  no `contract`, no layer key — validates nothing (its body is `return plugin;`), refuses
  nothing, and has no `src/plugin.ts`, so it is outside the vocabulary lock that polices every
  other host. Plugin-contributed commands bypass `defineCommand`, so the reserved-name guard
  and `checkDefinition` never run on them, and a plugin option named `json` silently overwrites
  the envelope flag. **And the shared `schema.json` describes none of the three newest keys:**
  `widgets`, `handlers` and `resolvers` validate only because the root sets
  `additionalProperties: true`, so `caique`, `closeout` and `bellpull` each publish a schema
  that says nothing about the one key they host — and announces itself as flagstaff's file.

  Documentation only: no `packages/**` file is touched, and `npx tsx scripts/plan-progress.ts`
  prints the same 22/36 before and after, byte for byte.

- [#332](https://github.com/ofri-peretz/burgee/pull/332) [`3ea38c3`](https://github.com/ofri-peretz/burgee/commit/3ea38c363b9f0cee9f1c1c2dae4037b047e98328) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The cliui backtracking guard is checked by shape rather than by clock, after three timing
  instruments failed on it, each differently.

  1. `< 400 ms` at a small size — a CI box returned 440. A 10% margin measures the runner.
  2. A growth **ratio** read **15.04 on macOS CI against 4.09 locally for identical code**,
     batched 256 times, so not noise. Per call that runner was 3x slower at n and 11x slower at
     4n: a 48,000-character cell is 96 KB of UTF-16 where a 12,000-character one is 24 KB, and the
     larger crosses a cache boundary the smaller does not. The ratio measured the memory
     hierarchy, and no ceiling repairs that.
  3. An absolute budget cannot work either, and the numbers say why: at n = 50,000 the quadratic
     implementation costs **1,072 ms here** while the linear one costs **~1,780 ms on CI**.
     Correct code on the slow machine is dearer than buggy code on the fast one, so no threshold
     separates them — and any threshold that passes CI cannot fail locally.

  The bug is one shape: a quantifier with no anchor before it, matched against the row text, so
  the engine retries at every position in a long run and each attempt walks to the end.
  `cliui.ts`'s own comment records the cost — 1,049 ms of `toString()`'s 1,223 ms for a cell of
  50,000 spaces, quadrupling when the cell doubled. The check now asserts that shape is absent:
  deterministic, microseconds, no flake. Reintroducing `str.replace(/ +$/, "")` turns it red.

  What it gives up is generality — it catches the shape rather than the behaviour, so a new
  quadratic written another way would pass. That is stated in the test. Its first run also
  matched the comment that documents the bug, which is why comments are stripped first: the third
  checker in this repository to be caught reading printed source rather than shape.

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

- [#332](https://github.com/ofri-peretz/burgee/pull/332) [`3ea38c3`](https://github.com/ofri-peretz/burgee/commit/3ea38c363b9f0cee9f1c1c2dae4037b047e98328) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - A lock for PRINCIPLES rule 14: no package does a job another package in the family exists to
  do.

  The family splits nine ways precisely so a program can adopt one layer without the other
  eight. The moment `burgee` measures a string's width itself, or reaches for `chalk` instead of
  `roundel`, that split stops being real and the layers become a directory layout. Until now
  that was intent — every other invariant here has a lock and this one did not.

  The concern table is not restated. `compat-oracle/src/demand.ts` already declares which
  incumbents each layer replaces, and that list _is_ the definition of each layer's job, so the
  rule is derived from it: a package may not depend on an incumbent another layer replaces, nor
  on the one it replaces itself. Needing that job is the same thing as needing the sibling.

  It does not forbid a drop-in façade reproducing its own incumbent — `burgee/commander` spawns
  child processes and forwards five signals because commander's `executableSubcommand` does, and
  commander's own 1360-case suite grades exactly that. Reproducing the incumbent is the
  compatibility claim.

  Family state today: no package depends on any incumbent, its own or a sibling's, and no
  package carries a runtime dependency outside the family.

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

- Updated dependencies [[`3ea38c3`](https://github.com/ofri-peretz/burgee/commit/3ea38c363b9f0cee9f1c1c2dae4037b047e98328), [`3ea38c3`](https://github.com/ofri-peretz/burgee/commit/3ea38c363b9f0cee9f1c1c2dae4037b047e98328), [`3ea38c3`](https://github.com/ofri-peretz/burgee/commit/3ea38c363b9f0cee9f1c1c2dae4037b047e98328), [`c8acb28`](https://github.com/ofri-peretz/burgee/commit/c8acb2848714a1cbe3e26a2f9895d7498fb4f096), [`fc640dd`](https://github.com/ofri-peretz/burgee/commit/fc640ddec11255c12d1e0948c5b8e99cc3f3263b), [`3f92a60`](https://github.com/ofri-peretz/burgee/commit/3f92a6099b1b8d5d476c64405ca963d40bf9af45), [`3ea38c3`](https://github.com/ofri-peretz/burgee/commit/3ea38c363b9f0cee9f1c1c2dae4037b047e98328), [`fc640dd`](https://github.com/ofri-peretz/burgee/commit/fc640ddec11255c12d1e0948c5b8e99cc3f3263b), [`3ea38c3`](https://github.com/ofri-peretz/burgee/commit/3ea38c363b9f0cee9f1c1c2dae4037b047e98328), [`c8acb28`](https://github.com/ofri-peretz/burgee/commit/c8acb2848714a1cbe3e26a2f9895d7498fb4f096), [`c8acb28`](https://github.com/ofri-peretz/burgee/commit/c8acb2848714a1cbe3e26a2f9895d7498fb4f096), [`88f7ba6`](https://github.com/ofri-peretz/burgee/commit/88f7ba65e3a79ed20bf7c5bc4feae8b87684122b), [`3f92a60`](https://github.com/ofri-peretz/burgee/commit/3f92a6099b1b8d5d476c64405ca963d40bf9af45), [`f295630`](https://github.com/ofri-peretz/burgee/commit/f2956301d5f9dcbcac0b001b00ebaf0315891fac), [`c8acb28`](https://github.com/ofri-peretz/burgee/commit/c8acb2848714a1cbe3e26a2f9895d7498fb4f096), [`3f92a60`](https://github.com/ofri-peretz/burgee/commit/3f92a6099b1b8d5d476c64405ca963d40bf9af45)]:
  - bellpull@0.1.0
  - closeout@0.2.0
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
