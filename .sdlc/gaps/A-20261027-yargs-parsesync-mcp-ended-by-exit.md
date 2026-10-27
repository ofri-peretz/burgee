---
id: A-20261027-yargs-parsesync-mcp-ended-by-exit
section: A
status: open
source: first-adopter A3 re-run on burgee@1.8.0 against open-cli-tools/concurrently (`.sdlc/research/adoption/concurrently.md`)
done_when: 'A `burgee/yargs` program that ends in `.parseSync()` and then acts on the argv it gets back (shows help and calls `process.exit()` when no positional is given, as concurrently does) answers `prog --mcp` with `initialize` and `tools/list` replies, with a case in `packages/burgee/src/yargs` proven red first on `burgee@1.8.0`; then the concurrently proof is re-run on the published fix'
---

`burgee@1.8.0` (#1311) stopped `prog --mcp` from crashing `.parseSync()` programs, but on a real
program the server never answers. `#burgeeSurface` starts the server without handing its promise
to `parseSync()`, and `parseSync()` returns the short-circuit argv, as `--help` does under
`exitProcess(false)`. The program then carries on with that argv. concurrently's `bin/index.ts`
does what most CLIs do with it:

```ts
const args = program.parseSync();
// …
if (!commands.length) {
    program.showHelp();
    process.exit();
}
```

So `concurrently --mcp` prints the help screen to stderr and exits 0 before the server reads its
first line. An `initialize` request on stdin gets no reply; stdout is empty. The output is
byte-identical to yargs 18.0.0, which treats `--mcp` as an unknown flag. It is not a crash, but
`--mcp` does not serve.

`parse-sync-surfaces.test.ts` did not catch it because its three-line program does nothing after
`.parseSync()` returns. Nothing else in the process exits, so the server runs until stdin ends.
The real shape is a program that reads the returned argv and exits when it finds nothing to do.

`--help` does not have the problem because yargs exits the process itself (`exitProcess(true)`
is the default), and `completion <shell>` prints synchronously and exits before `parseSync()`
returns. For `--mcp`, a fix has to keep control away from the program while the server runs, and
it cannot block synchronously. Options to weigh: never return from `parseSync()` on `--mcp` (hold
the process on the server and exit from its promise, as the `completion` branch exits), or
document that `--mcp` needs `.parseAsync()` and make `parseSync()` print one clear line on stderr
instead of silently falling through. Either way the case needs a program that exits on empty
argv, red on `burgee@1.8.0` first.

Found by the 1.8.0 re-run of the first-adopter proof. It holds the #418 comment: the owner's go
required `--mcp` to start a server, and on concurrently it does not.
