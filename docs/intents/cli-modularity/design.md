# Design — Modularity

Intent: [`intent.md`](./intent.md). **Status:** draft.

---

## Requirements

- **R1 (M1)** `withGroup(cmd, name)` tags a `Command`; the manifest and help renderer
  read it.
- **R2 (M2)** `lazyCommand(program, { name, description, group?, options?, load: () =>
  import('./cmds/x.js') })` registers a descriptor; on dispatch, the loaded module's
  default export (a `(cmd: Command) => void`) configures the command, then the action
  runs. `--schema` uses the descriptor.
- **R3 (M3)** `program.use(plugin, { name })` calls `plugin(program)` and records
  `plugin: name` on every command/option added during the call (diffing the tree
  before and after).
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

The plugin diff is a walk of `program.commands`/`options` before and after `plugin()`;
new nodes get `plugin: name`. No proxies, no monkey-patching.

## Verification

- 30-command demo under `examples/demo-cli-large/` with module-load spies.
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
