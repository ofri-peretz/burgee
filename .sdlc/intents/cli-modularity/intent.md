# Intent — Large CLIs: groups, lazy commands, plugins, shared options, deprecation

> Stage 1 artifact. Child of [`agent-native-cli-layer`](../agent-native-cli-layer/intent.md).
> Research §8 (modularity); commander #2505 (plugin API RFC). Proposes floor additions M1–M6.

**Status:** shipped · **Opened:** 2026-09-06 · **Owner:** @ofri-peretz · **Shipped:** 2026-09-09 on
[`8ad4d4abb5`](https://github.com/ofri-peretz/burgee/commit/8ad4d4abb5), verified against `main` at `61bd11b9` — all three criteria locked by `examples/conformance/src/modularity.test.ts`

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

## Verified against `main` — 2026-09-09

**Status raised from `review` to `shipped`.** All three criteria are demonstrably met on `main`
and each is held by a passing lock in `examples/conformance/src/modularity.test.ts`, inside the
122-test conformance run. Two wordings drifted from the API that shipped; neither changes what
was verified, and both are recorded below rather than quietly reinterpreted.

- **A demo with 30 commands across 5 groups and 3 lazy modules; `--schema` complete without
  importing any handler module, proven by a module-load spy; `--help` grouped; dispatch loading
  exactly one module** — **met.** `node examples/demo-cli-large/dist/bin.js --schema` emits
  **33** commands — 27 eager across five groups (`Repository:` 6, `Packages:` 6,
  `Environments:` 5, `Reports:` 8, `Maintenance:` 8), plus 3 lazy modules (`inspect`, `sync`,
  `purge`), the deprecated `clean`, and 2 contributed by the `audit` plugin. The spy is
  `examples/demo-cli-large/src/cmds/loads.ts`; the suite asserts `loads()` is `[]` after both
  `--help` and `--schema`, `['sync']` after one dispatch, still `['sync']` after a second, and
  `[]` after a usage error. *Drift:* the criterion says 30 and the manifest projects 33 — 30
  describes the declared program before the plugin, the deprecation alias and the lazy set are
  counted. The suite itself asserts `toHaveLength(33)`.
- **A plugin adding two commands appears in `--schema` with `plugin: '<name>'`** — **met.**
  `audit` and `audit-fix` both carry `"plugin": "audit"` in the emitted schema, asserted directly.
- **`deprecateCommand('old', { use: 'new' })` shows in help and schema and prints one warning
  line to stderr on use, exiting `OK`** — **met in behaviour.** stderr is exactly
  `warning: 'clean' is deprecated, use 'purge'` on the first run and empty on the second, exit
  code 0, `deprecated: "purge"` in the schema, `(deprecated: use purge)` in help. *Drift:* there
  is no `deprecateCommand()` function — the shipped API is a `deprecated:` field on
  `defineCommand`, which was never renamed here.

**Note on the gate.** This intent goes from `review` straight to `shipped` without passing
through `approved`, because no owner approval was ever recorded for it while the work was built —
the drift the README's [Status drift, stated](../README.md#status-drift-stated) section already
admits to. The evidence is the lock, not the gate.

## Open questions

None open. Decided at finalisation (2026-09-06):

- **Floor additions M1–M6 are adopted.**
- **Plugins are registration functions only in v1**; `setup`/`teardown` lifecycles
  (citty #92) wait for a consumer that needs them.
