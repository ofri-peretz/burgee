---
id: A-20261027-yargs-parsesync-surfaces-throw
section: A
status: open
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
