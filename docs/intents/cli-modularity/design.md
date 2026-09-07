# Design — Modularity

Intent: [`intent.md`](./intent.md). **Status:** review.

---

## Requirements

- **R1 (M1)** `withGroup(cmd, name)` tags a `Command`; the manifest and help renderer
  read it.
- **R2 (M2)** `lazyCommand(program, { name, description, group?, options?, load: () =>
  import('./cmds/x.js') })` registers a descriptor; on dispatch, the loaded module's
  default export (a `(cmd: Command) => void`) configures the command, then the action
  runs. `--schema` uses the descriptor.
- **R3 (M3)** A plugin is **data plus lazily-loaded behaviour**, never a function that
  mutates the tree. `definePlugin({ name, commands: [{ name, description, group?,
  options?, load: () => import('./x.js') }], hooks })` declares what it contributes;
  `cli manifest` emits a static JSON of every contribution at build time; at run time the
  manifest is read, one command is resolved, and only that handler is imported.
  Attribution is declared, not diffed. Hooks are rollup-shaped with `enforce: 'pre' |
  'post'`.
- **R4 (M4)** `sharedOptions(spec)` returns a function `(cmd) => cmd` that adds copies of
  the options; `--schema` shows them per command with `sharedFrom: '<set name>'`.
- **R5 (M5)** `deprecateCommand(cmd, { use })` sets `deprecated: { replacement }`; help
  and manifest show it; running prints `warning: 'old' is deprecated, use 'new'` on
  stderr once.
- **R6 (M6)** `resolveCommand(program, argv) → CommandNode | null` and
  `runCommand(program, argv, { runtime }) → RunResult` (the harness's own entry, made
  public).

## Design

All six are manifest operations plus small commander calls (`addCommand`,
`addOption`, `hook('preSubcommand')` for lazy loading). Lazy dispatch uses
`preSubcommand` to import the module before commander parses the subcommand's own
options, so parsing is unchanged.

**Plugins are declarative because discovery must not cost startup.** The rejected
imperative design (`program.use(plugin)`) required importing every plugin to learn what
it contributed, which is precisely the 250-command problem M2 exists to solve
(yargs #1005), made attribution fragile under any plugin that wraps or reorders an
existing command, and meant nothing could be known about a plugin without executing it.

The manifest inverts all three. `--help` and `--schema` are complete without loading a
single plugin; a 250-command CLI starts as fast as a one-command CLI; attribution is
exact because the plugin stated it; and a plugin can be inspected — by a person, an agent
or a CI job — without being run.

This is rolldown's hook-filter lesson (evaluate before you cross the boundary) applied to
module loading rather than FFI, plus oclif's build-time manifest. The cost is honest and
paid once: a plugin author runs `cli manifest` and commits the output. The alternative,
runtime discovery, is what makes large CLIs slow. See
`docs/research/architecture-review.md` §2.

## Verification

- 30-command demo under `examples/demo-cli-large/` with module-load spies. The lock:
  running `--help` and `--schema` on the 30-command demo imports **zero** handler
  modules, and running one command imports **exactly one**. Proven red first by asserting
  the counts against the imperative design.
- Startup time on the 30-command demo is within 2ms of the 1-command demo (B2).
- Conformance cases per requirement on both hosts.
- `commander #2505` comment posted with a link to the released `use()` shape.

## Rejected alternatives

- **`commandDir`-style filesystem scanning.** ESM, bundlers and monorepos all break it
  (yargs #1067, #2479, #2267); explicit `load` functions bundle correctly.
- **Plugin discovery by package name prefix.** A supply-chain foot-gun; explicit
  `use()` only.
- **Global options for sharing.** Globals show on every command's help and leak into
  unrelated commands (the yargs #873 shape of problem).

## Out of scope

- A plugin marketplace or registry.
- Hot reloading of commands.

## Rejected alternatives

- **`program.use(plugin)`, a function that mutates the command tree.** The original R3.
  Requires importing every plugin at startup to discover its contributions, makes
  attribution a fragile before/after diff, and makes it impossible to inspect a plugin
  without executing it. Replaced 2026-09-06; see `docs/research/architecture-review.md`
  §1.9 and §2.
- **Runtime plugin discovery by scanning `node_modules`.** Cost scales with dependency
  count on every invocation, and it is a code-execution surface driven by whatever happens
  to be installed.
- **A new hook vocabulary.** Rollup's shape (`enforce: 'pre' | 'post'`, named hooks) is
  the one plugin API in this ecosystem that everybody already knows.
