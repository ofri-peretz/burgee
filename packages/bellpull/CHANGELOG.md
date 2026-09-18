# bellpull

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
