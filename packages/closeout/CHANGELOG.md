# closeout

## 0.2.1

### Patch Changes

- [#373](https://github.com/ofri-peretz/burgee/pull/373) [`a1f1d40`](https://github.com/ofri-peretz/burgee/commit/a1f1d40b7d1e7244f3a180943b641bb3b491d256) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Stage 2's artifact is now `spec.md`, the name Anthropic's AI-Native SDLC playbook gives it, so the source comments and README sections that cite a package's own design document point at `spec.md` rather than `design.md`.

  No behaviour changes. The published tarballs do move, by two bytes per surviving reference — `design.md` is nine characters and `spec.md` is seven — so the four packages carrying a weight band were re-measured against it: linegauge 83,538 to 83,536; paratext 66,343 to 66,341; closeout 84,455 to 84,453; bellpull 86,113 to 86,107.

## 0.2.0

### Minor Changes

- [#316](https://github.com/ofri-peretz/burgee/pull/316) [`c8acb28`](https://github.com/ofri-peretz/burgee/commit/c8acb2848714a1cbe3e26a2f9895d7498fb4f096) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Shutdown is now bounded on every path out of a program, and a breach says which handler did
  not come back.

  **The deadline reports.** When the clock expires the process still leaves — with the code it
  was already leaving with — and the report names **every handler that had not returned**, by
  the caller's `label`, the function's own `name`, or `(anonymous)`. A plugin's handlers are
  named `"<plugin>:<handler>"`. `run()` resolves with that report (`{ path, signal, code, error,
timedOut, unfinished }`), and `install({ onTimeout })` is where the line goes; the default
  writes it to stderr. A hang used to be silence; it is now a diagnosable event with a name in
  it.

  **`Infinity` and `0` are refused** at `install()` / `createRegistry()` — not at the shutdown
  they would have ruined — with a `USAGE`-class error carrying a `fix`. One waits forever; the
  other gives no asynchronous handler a turn. Both reintroduce the failure the package exists
  to remove.

  **Three more doors.** `beforeExit`, `uncaughtException` and `unhandledRejection` now run the
  handlers, and `SIGNALS` gains `SIGQUIT` and `SIGBREAK`. No incumbent in this layer listens for
  a throw or a rejection, which is why a CLI that crashes mid-render leaves the cursor hidden.
  A program with its own crash handler keeps deciding what happens next — closeout stands its
  own listener down and counts before exiting, exactly as it already did for signals.

  **One record, three renderings.** A handler is handed `{ path, signal, code, error }`, where
  `path` is `'exit' | 'beforeExit' | 'signal' | 'uncaught' | 'rejection'`, and `reportToJson()`
  and `reportToEvent()` project that same value for a `--json` line and an agent event.

  **`once(fn)`** arrives as `closeout/once`: `onetime` + `mimic-fn` — 262 M downloads a week
  between them — in 441 B with no dependency, preserving `name`, `length` and `this`.
  `closeout/cursor` is the other new leaf, 666 B, for a program that only needs to put a cursor
  back.

  **The exit code is the program's.** It is captured at the trigger, before any handler runs, so
  a handler that sets `exitCode = 0` on its way past cannot turn a `process.exit(3)` or a
  SIGTERM into a success.

  Existing callers are unaffected: `onExit(handler)` and `onExit(handler, 'flush')` both still
  work, and the handler's argument gained fields rather than losing any. The published bundle
  got _smaller_ — comments are now stripped from `dist/`, 46,066 B down to 20,417 B — and every
  entry point is on a byte ratchet.

- [#303](https://github.com/ofri-peretz/burgee/pull/303) [`fc640dd`](https://github.com/ofri-peretz/burgee/commit/fc640ddec11255c12d1e0948c5b8e99cc3f3263b) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Two graded drop-in paths: `closeout/exit-hook` and `closeout/restore-cursor`.

  Both are new subpath exports, and both are graded by the incumbent's own unedited test suite
  through `compat-oracle`, with `--control` — the same suite run against the incumbent itself —
  proving the gate first: `exit-hook@5.1.0` 21 / 21 against a 21 / 21 control, and
  `restore-cursor@5.1.0` 6 / 6 against a 6 / 6 control. `overrides: { "exit-hook":
"npm:closeout@^0.1" }` and the same for `restore-cursor` now resolve.

  `closeout/exit-hook` keeps the incumbent's per-hook `{ wait }` bound rather than imposing
  closeout's own 2 000 ms deadline — the incumbent's own suite registers a hook with
  `wait: 2000`, and a drop-in that silently tightens a caller's timeout is not a drop-in.
  closeout's bounded shutdown stays in `onExit()`.

  Nothing a caller already imports changed. Internally the signal wiring moved from `index.ts`
  to `install.ts` and the guarded `globalThis.process` lookup to `ambient.ts`, so the two
  façades can reach them without importing the package's own entry; `index.ts` re-exports every
  name it exported before.

- [#294](https://github.com/ofri-peretz/burgee/pull/294) [`3f92a60`](https://github.com/ofri-peretz/burgee/commit/3f92a6099b1b8d5d476c64405ca963d40bf9af45) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Shutdown order is now data rather than registration order, and `closeout/plugin` hosts
  `handlers`.

  A handler declares a **phase** — `flush`, `release` (the default) or `restore` — and
  `PHASES` declares the sequence. Phases run _in sequence_, so an async handler in `flush`
  settles before `release` begins; handlers inside one phase run together, in registration
  order. Terminal restore moves into `restore` and is therefore last, always.

  This closes a failure that registration order could not: the cursor's restore was registered
  by whichever renderer hid the cursor, usually the moment it first drew, so anything
  registered afterwards ran _after_ the terminal had already been handed back — cleaning up
  nothing it was registered to clean up. An order that depends on import order is not an
  order.

  `closeout/plugin` is the new subpath (`plugin-contract` R5a): `register()` keeps a plugin's
  `handlers` and ignores every other layer's keys, `attach(registry)` wires each into its
  phase, and `contributions()` projects the whole shutdown sequence without running any of it.
  A plugin may use `flush` or `release` and not `restore` — R5a says a plugin's cleanup runs
  "never after" terminal restore, and that is enforced at the door rather than asserted in
  prose. `closeout/schema.json` is exported too, because it is the specifier this package's own
  `E_PLUGIN_SCHEMA` fix names.

  Past the deadline, later phases are still **run** — they are only no longer waited for. A
  handler that hangs in `flush` does not get to decide that the cursor stays hidden.

  Existing callers are unaffected: `onExit(handler)` still works and lands in `release`, which
  is before `restore`.

- [#332](https://github.com/ofri-peretz/burgee/pull/332) [`3ea38c3`](https://github.com/ofri-peretz/burgee/commit/3ea38c363b9f0cee9f1c1c2dae4037b047e98328) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `closeout` re-raises a signal instead of exiting `128 + n`, so a process killed by Ctrl-C now really dies of SIGINT rather than exiting 130. `WIFSIGNALED` is false for the old behaviour and true for the new one, and that difference is visible to everything upstream of the program: a shell knows to print `^C` and re-raise into its own job control, `make` stops a parallel build instead of carrying on, a CI runner marks a job cancelled rather than failed, and a supervisor decides whether to restart. 128 + n is the number a shell reports _afterwards_; it was never a status a process could set for itself.

  The package used to argue the opposite in a comment — that re-raising "re-enters this listener", and that exiting explicitly is what a caller who owns `main` wants. The first half was already answered by the code around it: closeout removes its own listener _before_ it counts, which is the same `unload()`-then-`process.kill(process.pid, sig)` shape `signal-exit` uses, and `signal-exit` is closeout's declared incumbent for this surface. The second half is a preference the incumbent does not share.

  The stand-down guard is unchanged and now covers one more thing: the re-raise happens only when no other listener remains, so a program with its own `SIGINT` handler still gets the cleanup, still decides what happens next, and gets exactly **one** delivery for one Ctrl-C. A runtime that refuses to raise a given signal at itself — SIGHUP is `ENOSYS` on Windows — falls back to the POSIX code, because a shutdown that will not go is the one failure this package is named for.

  `ProcessLike` now requires `kill(pid, signal)` and `pid`. This is a breaking change to that type for anyone calling `install({ process })` with a hand-written double, and it is deliberate: optional members would have let a fake quietly take the exit path, which is how the missing re-raise survived `exit-hook`'s 21-case suite and `restore-cursor`'s 6-case suite intact. Both suites still pass 21 / 21 and 6 / 6.

  `closeout/exit-hook` is unchanged and stays faithful to its incumbent: it exits `128 + n` and listens on SIGINT and SIGTERM only — no SIGHUP — because `exit-hook@5.1.0` registers exactly `beforeExit`, `SIGINT`, `SIGTERM`, `exit` and `message`, and its own suite grades the exit codes. Use closeout's `onExit` rather than the drop-in when a closing terminal has to reach your cleanup; closeout's own wiring has covered SIGHUP all along.

### Patch Changes

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

## 0.1.0

### Minor Changes

- [#227](https://github.com/ofri-peretz/burgee/pull/227) [`cf637a8`](https://github.com/ofri-peretz/burgee/commit/cf637a8221cb08c5a0e6b631dbe2005256e9dcf8) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - closeout runs your exit handlers exactly once, on every path

  The package existed as a reserved name exporting a string constant. It now does the job
  its description has always claimed.

  A program leaves by several doors — returning from `main`, `process.exit`, SIGINT, SIGTERM,
  SIGHUP — and a handler registered on `'exit'` alone catches one of them. That is why Ctrl-C
  so often leaves a hidden cursor, a half-written file, or a lock nobody released.

  - **`onExit(handler)`** — runs once, on every path, and returns the function that
    unregisters it. Two signals, or a signal and the `'exit'` behind it, are one shutdown.
  - **`hideCursor(stream)`** — hides the cursor and registers the restore **in the same
    call**, so the two cannot drift apart. Returns the show function, which also unregisters.
    Idempotent, and silent on a non-TTY, because escape sequences in a pipe corrupt the output
    the pipe carries.
  - **A deadline**, two seconds by default. A handler awaiting something that never resolves
    turns Ctrl-C into a process the user kills twice, and the second one is SIGKILL with no
    cleanup at all. Abandoning a slow handler is the better trade.
  - **`createRegistry`** and **`install({ process })`** — the shutdown logic with no process
    attached, and the wiring pointed at one that is not the global. Every case in the suite
    runs without a real signal.

  One handler's failure is its own: a throw is reported and the rest still run. Shutdown is
  the worst place for an exception to short-circuit a loop, because the handler that restores
  the terminal is usually registered last.

  Importing the package attaches nothing — the process-wide instance installs on first use.

  Still to come: raw mode and alternate-screen restore, and the graded drop-in paths for
  `signal-exit`, `exit-hook` and `restore-cursor`.

### Patch Changes

- [#245](https://github.com/ofri-peretz/burgee/pull/245) [`9818135`](https://github.com/ofri-peretz/burgee/commit/9818135cb1a72ff3b7edcdb3b84177688927a497) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - A program that installed its own handler for a signal keeps it. `closeout` ran its cleanup
  and then exited unconditionally, which overrules a program that asked to own SIGINT — one
  that wants to finish a request and exit 7, or ignore Ctrl-C entirely. It now stands its own
  listener down, and leaves only when no other listener remains. Cleanup is unchanged: it still
  runs on every path, which is not what was being deferred.
