# bellpull

## 0.3.1

### Patch Changes

- [#508](https://github.com/ofri-peretz/burgee/pull/508) [`1aae1e2`](https://github.com/ofri-peretz/burgee/commit/1aae1e2186ce88421067df5317795773419e53d0) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `<package> --help` and `--version` answer instead of crashing. The bin took its first argument as the plugin file to import, so `roundel --help` failed with `Cannot find module '…/--help'` and exit 1. `-h`/`--help` now print usage and exit 0, `-V`/`--version` print the version and exit 0, and any other flag where the plugin file belongs is a usage error, exit 2.

## 0.3.0

### Minor Changes

- [#507](https://github.com/ofri-peretz/burgee/pull/507) [`b8e97dc`](https://github.com/ofri-peretz/burgee/commit/b8e97dcb64772e413f0b6f9e17e063c73314d242) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Runs on Node 20 and 22, not just 24+: `engines.node` is now `^20.19.0 || >=22.13.0`. Those are the first releases where `require(esm)` loads without a warning, so the CommonJS `require()` path keeps working. Every package's test suite runs on exactly 20.19.0 and 22.13.0, on Linux, macOS and Windows. caique's prompts no longer call `Promise.withResolvers`, which Node 20 doesn't have.

### Patch Changes

- [#505](https://github.com/ofri-peretz/burgee/pull/505) [`9800b43`](https://github.com/ofri-peretz/burgee/commit/9800b43d9c74a49dfb66d04a40fd0d1c48892e20) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Docs: the Benchmarks section's weight ceiling is re-measured against a fresh install of each incumbent's latest release (cosmiconfig 10.0.1, slice-ansi 9.0.1, which 7.0.0, dotenv 18.0.3, …) instead of the copies hoisted in this workspace, and names incumbents that were measured but left out of the ceiling as exactly that.

## 0.2.3

### Patch Changes

- [#494](https://github.com/ofri-peretz/burgee/pull/494) [`f7f6d4b`](https://github.com/ofri-peretz/burgee/commit/f7f6d4b8e8f9d9c7010bd4c81fda4b4d106fc9f0) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Each package's `homepage` and README docs link now point at its own documentation site, `https://<package>.interlace.tools`, instead of a page on burgee's site. The old `burgee.interlace.tools/docs/packages/<package>` URLs answer with a 301 to the new host, so nothing already linked breaks. closeout's README override example also resolves to the current release again (`npm:closeout@^0.4`; the 0.4.0 release left it at `^0.3`).

## 0.2.2

### Patch Changes

- [#465](https://github.com/ofri-peretz/burgee/pull/465) [`acf98f3`](https://github.com/ofri-peretz/burgee/commit/acf98f3e612c6d79e6c2b78a847abcd06a063cbc) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Each README now opens with the incumbent it replaces and the agent surface it serves (`--json`, an agent event, or a static projection), so npm shows both above the fold. README text only; no code changed.

## 0.2.1

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

## 0.2.0

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

- [#415](https://github.com/ofri-peretz/burgee/pull/415) [`47b541a`](https://github.com/ofri-peretz/burgee/commit/47b541ade1977e781968bdfb94a41c2bd990b203) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The matrix suite no longer leaks a `SIGTERM`-ignoring child when a hook times out.

  Two of its fixtures are pinned open by a `setInterval` and one declines `SIGTERM` on purpose —
  it is the control case for R2, the whole reason `startDeadline` has a second rung. That rung is
  a timer in the _parent_, so a parent that dies first never fires it: when a hook in the file
  timed out, vitest tore the worker down and left the child spinning. One was found hours later
  with its temp directory already deleted out from under it.

  The leak paid for itself in the wrong direction. Every timed-out hook left a process that made
  the next timeout likelier, which is why this suite read as merely load-sensitive (D-091) and
  degraded over a long session rather than flaking at random.

  Both fixtures now carry a 60-second self-limit — far longer than any case here, whose deadlines
  are in the hundreds of milliseconds, and far shorter than _until the machine is rebooted_. The
  two `afterAll` teardowns get the 60 s budget every other filesystem- and process-touching hook
  in the file already had. `fixture-lifetime.test.ts` reads the fixture sources and refuses a
  long-lived one without its own limit; it fails on the unfixed file.

  No change to `bellpull`'s published behaviour — this is the suite, not the package.

- [#430](https://github.com/ofri-peretz/burgee/pull/430) [`4d1b2b3`](https://github.com/ofri-peretz/burgee/commit/4d1b2b399cff354864d1e2e843a19fde80ef1f30) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `check` now reports every refusal with its code and its fix, wherever it was raised.

  Some plugin files register themselves on import: they call `register()` at the top of the module and export the result. Until now, when such a file was refused, the error was thrown inside `check`'s `import()`, before the only `try` that turns a `PluginError` into `E_PLUGIN_SCHEMA: …` plus a `fix:` line. The author got the bare message on stderr, with no code and no fix. Now the whole of `check` runs inside that one handler, so every refusal comes out the same way on every host.

## 0.1.1

### Patch Changes

- [#373](https://github.com/ofri-peretz/burgee/pull/373) [`a1f1d40`](https://github.com/ofri-peretz/burgee/commit/a1f1d40b7d1e7244f3a180943b641bb3b491d256) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Stage 2's artifact is now `spec.md`, the name Anthropic's AI-Native SDLC playbook gives it, so the source comments and README sections that cite a package's own design document point at `spec.md` rather than `design.md`.

  No behaviour changes. The published tarballs do move, by two bytes per surviving reference — `design.md` is nine characters and `spec.md` is seven — so the four packages carrying a weight band were re-measured against it: linegauge 83,538 to 83,536; paratext 66,343 to 66,341; closeout 84,455 to 84,453; bellpull 86,113 to 86,107.

## 0.1.0

### Minor Changes

- [#332](https://github.com/ofri-peretz/burgee/pull/332) [`3ea38c3`](https://github.com/ofri-peretz/burgee/commit/3ea38c363b9f0cee9f1c1c2dae4037b047e98328) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `bellpull` was a reserved name exporting one string. It now runs programs.

  `run(cmd, args, { runtime })` returns a `Result` — `{ ok, code, signal, stdout, stderr, duration, command, args, executable, timedOut }` — for **every** outcome a process can have. A non-zero exit resolves with `ok: false`; the promise rejects only where no process ran, which is a missing executable or a failed spawn. `execa` throws on a non-zero exit, so every caller wraps it and every wrapper rebuilds these same fields out of the error; this repository already had two of those, in `compat-oracle/src/run.ts` and `vendor.ts`, both reading a result through a `catch`.

  `timeout` is finite by default (30 s) and the kill is a ladder — `SIGTERM`, then `SIGKILL` after a grace window — because a child that traps `SIGTERM` makes a single-signal timeout a timeout that times nothing out. Output written before the kill is kept: a CI timeout with the output discarded is undiagnosable.

  `bellpull/which` resolves an executable and reports **which `PATH` entry answered**, which is the open position in this layer — `which` + `isexe` + `path-key` is 779 M downloads a week across three packages and none of them returns it, and neither zero-dependency rival in the spawn layer resolves at all. Two `PATH` entries are refused rather than searched: an empty one, which POSIX reads as the working directory and is the oldest privilege-escalation trick there is, and a relative one, whose meaning changes with wherever the program was run from. `searchPath()` reports each skip with its reason rather than quietly doing less than its author expected.

  `bellpull/cross-spawn` is the drop-in, graded **68 / 68** by `cross-spawn`'s own vendored suite against a control of 68 / 68 on the same machine (macOS, 2026-09-15). On POSIX it is a pass-through, because `cross-spawn` is one — everything it is famous for is Windows-only, and a façade that "improved" on the pass-through would change the error a caller sees and the process tree. The Windows half invokes `cmd.exe` itself with `windowsVerbatimArguments`, having quoted each argument for `CommandLineToArgvW` and caret-escaped every `cmd.exe` metacharacter. It never sets `shell: true` to solve a Windows problem; `shell` is available, off by default, and documented as the injection surface it is.

  `bellpull/plugin` hosts **`resolvers`** (`plugin-contract` R5a, PLAN 1.5) — how an executable is found, since `which` is the part every environment does differently. A resolver is `{ rank, paths, extensions?, when? }` and carries **no function at all**, so it survives JSON and a `plugin check` can print a search order without running anything; `{VAR}` in a path is substituted from the environment, the way paratext templates an OSC payload. A path that is not absolute after substitution is refused at `register()`, because a resolver's directories are searched ahead of `PATH` and a relative one means a different directory every time the program runs from somewhere else. Ships `bellpull/schema.json`, byte-identical to flagstaff's (R2).

  Zero dependencies on every entry point, and `bellpull/which` is a leaf that loads two files. Installed, tree-inclusive: 82,270 bytes against a ceiling of 714,984 for `execa` + `cross-spawn` + `which` — a ratio of 0.1151, up from 0.0067 when the package did nothing, which is the honest direction.

  Not built, and said rather than implied: `execa`'s streaming API and its template-literal form are out of scope, and no number is claimed against `tinyexec`, which is not installed in this workspace.

### Patch Changes

- [#332](https://github.com/ofri-peretz/burgee/pull/332) [`3ea38c3`](https://github.com/ofri-peretz/burgee/commit/3ea38c363b9f0cee9f1c1c2dae4037b047e98328) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `bellpull/cross-spawn` reads `spawn` off the default import instead of a captured named
  binding, so a consumer under `commander`'s own mocks sees the mock.

  This is a compatibility requirement, not a style. `commander`'s suite does
  `t.mock.method(childProcess, 'spawn', …)` in roughly 23 `executableSubcommand` cases. A named
  ESM binding is captured at import and never re-syncs without `syncBuiltinESMExports()`, so a
  consumer calls the real thing instead: measured, wiring `burgee/commander` to this package took
  it from **1360 / 1360 to ungradeable** — an un-mocked spawn ran a real subcommand whose exit
  killed the test runner.

  A property read off the default import sees it. `cross-spawn` stays **68 / 68** either way, so
  the change costs this package nothing and is the whole blocker between bellpull and its first
  consumer.

  `ChildProcess` and `SpawnSyncReturns` are re-exported because a consumer that declared them
  itself would trip `inline-implementation-lock`, which matches a type-only `node:child_process`
  import too.

- [#332](https://github.com/ofri-peretz/burgee/pull/332) [`3ea38c3`](https://github.com/ofri-peretz/burgee/commit/3ea38c363b9f0cee9f1c1c2dae4037b047e98328) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `bellpull` failed on Windows — the one platform it exists for. Twenty-five cases red on `Node 24 · windows-latest`, and it was the only package failing there. One of them was a real defect; the rest were tests that had only ever described POSIX.

  **The defect.** `run()` resolved the command with a single `PATHEXT` walk while `parse()` used two — the second with expansion disabled, which is how a file with no extension and a `#!` line is found at all. So on Windows a shebang script resolved for the parse and was then refused by `run()` with `NotFoundError`: a command the package had already worked out how to run, rejected by the half that runs it. The walk is now one exported function, `resolveExecutable`, and both callers use it. Off Windows `PATHEXT` expansion is always `['']`, so the second attempt is the first and the divergence could not show up — which is how it survived a 68 / 68 grading against `cross-spawn`'s own suite.

  **The tests.** `which.test.ts` built a `platform: 'linux'` runtime and then fed it `mkdtemp` paths from the host, so on Windows it joined `C:\…\a` and `C:\…\b` with `:` and read two drive letters as two relative entries. Policy cases (search order, refusals, `PATHEXT`, `runPath`) now take invented runtimes and are pure functions of them; filesystem cases take a runtime describing the actual machine, with fixtures named `tool.CMD` on Windows so they are executable under that platform's own rule. Both branches of `executableByName` now run somewhere. `matrix.test.ts` joined its fixture `PATH` with `:` under a `process.platform` runtime; it uses `node:path`'s `delimiter`. `escape.test.ts` asserted that `x; touch <marker>` fires through `shell: true` — on Windows there is no `touch` and `;` separates nothing, so the vector is now written for each platform's own shell, and a Windows-only block runs a hostile argument end-to-end through a real `node_modules/.bin/*.cmd` shim, which is the first execution of the double-escape path anywhere.

  **`weight.test.ts` was the joke.** It measured the package with `execFileSync('npm', …)`, and on Windows `npm` is `npm.cmd`, which Node has refused to spawn without `shell: true` since the fix for CVE-2024-27980. The weight lock of the package that exists because `npm` is `npm.cmd` broke on `npm` being `npm.cmd`. It now spawns through this package's own `parse`.

  **The kill ladder is proven without a clock.** The end-to-end cell handed `run()` a 300 ms deadline and asserted `SIGKILL`, but the stubborn child installs its `SIGTERM` handler on its first executed line — so a deadline shorter than `node`'s cold start kills it by the default action and the run truthfully reports `SIGTERM`. One cold start in twelve took 265 ms on an idle Mac, and macOS CI went red on exactly that. `startDeadline` is exported and takes a structural `Killable`, so both rungs are now asserted on fake timers — which signal at which tick, with no process and no scheduler. The end-to-end cells calibrate their deadline against a cold start measured on the runner they are running on, and each asserts the child's own output first, because that line is the proof it was armed.

  `newLine: 'lf'` is pinned for the build, so `npm pack`'s byte count is a fact about the package rather than about the operating system that compiled it.

  Weight moved 82,141 → 85,129 B against the same 714,984 B ceiling, ratio 0.1149 → 0.1191.

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
