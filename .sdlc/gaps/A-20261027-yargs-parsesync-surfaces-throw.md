---
id: A-20261027-yargs-parsesync-surfaces-throw
section: A
status: closed
source: first-adopter A3 proof on open-cli-tools/concurrently (`.sdlc/research/adoption/concurrently.md`)
done_when: 'A `burgee/yargs` program that ends in `.parseSync()` answers `prog --mcp` and `prog completion zsh` as a `.parseAsync()` program does, with no YError, with a case in `packages/burgee/src/yargs` proven red first on `burgee@1.7.2`; then the concurrently proof is re-run on the published fix'
---

`burgee@1.7.2` crashes any `burgee/yargs` program that calls `.parseSync()` when it is run as
`prog --mcp` or `prog completion <anything>`:

```text
YError: .parseSync() must not be used with asynchronous builders, handlers, or middleware
    at YargsInstance.parseSync (burgee/dist/yargs/factory.js:720:19)
```

The cause is in `#burgeeSurface` (`packages/burgee/src/yargs/factory.ts`). For `completion` and
`--mcp` it returns a promise, because it lazy-loads `completions.js` and `mcp.js` so that neither
sits on the startup path. `parseSync()` throws on any promise from `parse()`. `--schema` is
synchronous and works. A three-line program reproduces it: `yargs(hideBin(process.argv)).option(…)`,
then `.parseSync()`. It reproduces with a `$0` handler too, and `.parse()` or `.parseAsync()` do
not. An unknown shell crashes as well (`prog completion foo`). That branch resolves `false`, but
only after returning a promise.

Found on concurrently, whose `bin/index.ts` ends in `program.parseSync()`. There, 36 of 40
argument vectors behave identically after `burgee migrate`, and these two shapes print a stack
trace. `parseSync()` is yargs' documented synchronous entry, so every adopter that uses it is
exposed. It holds the first-adopter pull request
([`adoption-draft.md`](../intents/first-adopter/adoption-draft.md)): the maintainer's first
condition in their #418 was "full compatibility".

The fix keeps both surfaces off the startup path and stops returning a promise to `parseSync()`.
One way: under `parseSync()`, load the module synchronously with `createRequire` (the dist is
ESM, so this needs `require(esm)`, which the `^20.19.0 || >=22.13.0` floor guarantees). Another:
run the surface itself and exit from inside the promise, returning a sentinel `parseSync()`
accepts. Keep the bundled-bytes ceilings that lazy loading protects.

**Closed 2026-10-27** by #1311, which publishes with burgee's next release. `parseSync()` sets a
flag around its `parse()`. Under it, `completion <shell>` requires `completions.js` synchronously:
the module stays off the start-up path, and the script prints and exits before `parseSync()`
returns. `--mcp` serves without handing back its promise; `parseSync()` returns the short-circuit
argv, as `--help` does under `exitProcess(false)`. The façade names the shells before anything
loads, so `completion foo` falls through to the program, as on the commander façade. That also
fixed `.parseAsync()`, where `completion foo` printed nothing and ran nothing.
`packages/burgee/src/yargs/parse-sync-surfaces.test.ts` runs a three-line `burgee/yargs` program
ending in `.parseSync()` beside the same program ending in `.parseAsync()`. It runs every shell,
`fig`, an unknown shell, `--mcp`, `--schema` and `--json`, and requires identical stdout and
exit codes with no `YError`. Every case but `--schema` and `--json` was red on `c5e86d3044`
(`burgee@1.7.2`'s source); those two were already green. The cost is +56 B on `./yargs`
([D-20261027-yargs-parsesync-surface-bytes](../decisions/D-20261027-yargs-parsesync-surface-bytes.md)).
Re-running the concurrently proof on the published fix belongs to the first-adopter intent, which
holds the pull request until it is done.
