# Intent — Large CLIs: groups, lazy commands, plugins, shared options, deprecation

> Stage 1 artifact. Child of [`agent-native-cli-layer`](../agent-native-cli-layer/intent.md).
> Research §8 (modularity); commander #2505 (plugin API RFC). Proposes floor additions M1–M6.

**Status:** review · **Opened:** 2026-09-06 · **Owner:** @ofri-peretz

---

## What is wanted

The things a 250-command CLI needs (yargs #1005) and neither host provides as a unit:

1. **Groups** for commands in help and manifest (yargs #684, the top issue; citty #93
   hidden/internal commands).
2. **Lazy command loading** from a directory or a map of `() => import()`, ESM-native,
   with the manifest still complete without loading handlers (yargs #1067, #2479, #2267,
   #1269; citty #151).
3. **Plugins**: a `Plugin = (program) => void` registration with ordering and a
   manifest of what each plugin added — the concrete proposal for commander #2505.
4. **Shared options** declared once and applied to a set of commands (commander #2583,
   citty #154, yargs #1755) without becoming global.
5. **Deprecation of commands** with a replacement, shown in help, schema and a one-line
   warning (yargs #2115, #2246, #2248 — "not documented and tricky").
6. **Alias → canonical** resolution available to handlers (yargs #2107) and "is this a
   known command?" (yargs #1838) and "run this command programmatically" (yargs #1605)
   as public functions on the layered program.

## Why now

- Every item is an open request on both hosts with no owner, and every one is a
  manifest operation once F1 exists — groups, laziness, plugin provenance and
  deprecation are all fields on `CommandNode`.
- commander #2505 is an open RFC with a single comment; shipping a working plugin
  shape as `commander-agent`'s own mechanism is the most useful reply.
- `interlace-ui` and the eslint repo's scripts are exactly the shape that needs shared
  options and lazy loading.

## Affected users and systems

- `@interlace/cli-core`: `CommandNode.group`, `lazy`, `plugin`, `deprecated.replacement`;
  `commander-agent` gains `withGroup`, `lazyCommand`, `use(plugin)`, `sharedOptions`,
  `deprecateCommand`, `resolveCommand`, `runCommand`.
- `yargs-agent` mirrors the same functions (yargs has `commandDir`; the layer makes it
  ESM-safe and manifest-complete).

## Constraints

1. Lazy loading never changes parse results: the manifest is built from the lightweight
   descriptor, the handler module loads on dispatch only.
2. Plugins are ordinary functions; no plugin discovery from `node_modules` by name
   (a supply-chain surface we do not want).
3. Shared options are copies per command, so `--schema` stays a tree and each command's
   help lists them under command options (H4).

## Success criteria

- A demo with 30 commands across 5 groups and 3 lazy modules: `--schema` complete
  without importing any handler module (asserted by a module-load spy); `--help`
  grouped; dispatch loads exactly one module.
- A plugin adding two commands appears in `--schema` with `plugin: '<name>'`.
- `deprecateCommand('old', { use: 'new' })` shows in help, schema and prints one warning
  line to stderr on use, exit `OK`.

## Open questions

None open. Decided at finalisation (2026-09-06):

- **Floor additions M1–M6 are adopted.**
- **Plugins are registration functions only in v1**; `setup`/`teardown` lifecycles
  (citty #92) wait for a consumer that needs them.
