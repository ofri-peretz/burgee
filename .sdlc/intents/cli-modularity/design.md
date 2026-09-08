# Design — Modularity

Intent: [`intent.md`](./intent.md). **Status:** review — built on the engine and projected from the commander façade, 2026-09-08.

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
`.sdlc/research/architecture-review.md` §2.

## What shipped (2026-09-08)

On the engine, as manifest operations, exactly as the design asked:

| Requirement | Shape |
| :-- | :-- |
| M1 groups | `group` on a command; help lists under the heading, `--schema` carries `group` |
| M2 lazy | `load: () => import('./x.js')` on a command or a plugin's node; the module exports `run` (or default). `Manifest.add` gives such a node a `run` that imports on first dispatch, so help, schema, completions and the MCP tool list are complete from the descriptor; `--schema` marks it `lazy: true` |
| M3 plugins | `definePlugin({ name, commands, hooks, enforce })` — already declarative; a plugin's commands may carry `load`; the manifest attributes each with `plugin`, which `--schema` carries. `--schema` *is* the build-time manifest the design called `cli manifest` |
| M4 shared options | `sharedOptions(name, specs)` returns the set tagged `sharedFrom`; spread into each command's `options`, so the handler's type carries them and `--schema` says where each came from. A spread rather than the `(cmd) => cmd` wrapper the draft named: the wrapper broke the handler's inferred `options` type |
| M5 deprecation | `deprecated: 'new'`; help and schema show it; the first run per process prints `warning: 'old' is deprecated, use 'new'` on stderr and goes on, exit OK |
| M6 public | `resolveCommand(manifest, argv)` → node or null; `runCommand(manifest, argv, opts?)` → `{ code, stdout, stderr }` |

On the commander façade: `.deprecate(use?)` (help, schema, the same one-line warning) and
commander 15's own `.helpGroup()` projected as `group`. yargs' native command
deprecation was already projected; it gets no runtime warning, because yargs itself prints
none and X8 forbids changing a yargs program's default behaviour. Lazy commands and shared
options on the façades are the next slice: both hosts have their own registration order.

## Verification

- `examples/demo-cli-large`: 30 commands across 5 groups, three handlers loaded lazily,
  one deprecated command, a plugin contributing two, shared options on all; `loads()`
  reports which handler modules have been imported. `examples/conformance/src/modularity.test.ts`
  is the lock: `--help` and `--schema` import **zero** handler modules, one lazy command
  imports **exactly one** and a second run imports none. Proven red first (rule 4): with
  `Manifest.add` calling `load()` at registration, the count read three where one was
  expected.
- The same suite covers groups in help and schema, `plugin` attribution, `sharedFrom` per
  command, the warning exactly once, and `resolveCommand` / `runCommand`.
- What the M6 test found on the way: the engine had never enforced a required positional —
  `greet` without a name printed `Hello, !`. It is a usage error now, naming the argument.
- B2 (startup within 2 ms of the one-command demo) is not asserted: the manifest is built
  from descriptors either way and the lazy modules never load, so there is nothing to
  measure but the descriptor count; `--help` on the demo runs in the same tens of
  milliseconds as the reference demo.
- `commander #2505`: not yet posted; the `use()` shape is released, the comment is the
  owner's to write.

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
  without executing it. Replaced 2026-09-06; see `.sdlc/research/architecture-review.md`
  §1.9 and §2.
- **Runtime plugin discovery by scanning `node_modules`.** Cost scales with dependency
  count on every invocation, and it is a code-execution surface driven by whatever happens
  to be installed.
- **A new hook vocabulary.** Rollup's shape (`enforce: 'pre' | 'post'`, named hooks) is
  the one plugin API in this ecosystem that everybody already knows.
