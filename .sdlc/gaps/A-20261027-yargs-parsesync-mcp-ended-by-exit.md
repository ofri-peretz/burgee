---
id: A-20261027-yargs-parsesync-mcp-ended-by-exit
section: A
status: closed
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

Found by the 1.8.0 re-run of the first-adopter proof. It held the #418 comment for a day: the
owner's go required `--mcp` to start a server, and on concurrently it does not. On 2026-10-28 the
owner chose to post a revised text instead (https://github.com/open-cli-tools/concurrently/issues/418#issuecomment-6455508479). It says `--mcp` behaves as it does today for
concurrently and promises no fix. The gap stayed open: every `parseSync()` program that exits on
empty argv had the same dead `--mcp`.

**Closed 2026-10-28.** It publishes with burgee's next release. Under `parseSync()`, `--mcp` is
served synchronously ([D-20261028-yargs-parsesync-mcp-serves-synchronously](../decisions/D-20261028-yargs-parsesync-mcp-serves-synchronously.md)).
`serveMcpSync` reads descriptor 0 and answers each request before it reads the next. It returns
only when the input ends, and then the façade exits 0, so `parseSync()` never hands control back
to a program that would end the server. A tool call is the program's own `.parseSync()`,
captured as `.parseAsync()`'s is. `parse-sync-surfaces.test.ts` › "--mcp under parseSync() in a
program that exits on an empty argv" runs concurrently's shape: options, `.parseSync()`, then
`showHelp(); process.exit()` when no positional is given. It requires `initialize` and an empty
`tools/list` with no help on stderr, and a `tools/call` answered as the `.parseAsync()` program
answers it. Both cases were red on `b62cf2a105`, whose `yargs/factory.ts` and `mcp.ts` are
`burgee@1.8.0`'s, with the help screen on stderr. `mcp-sync.test.ts` holds the server's edges
in-process. Re-running the concurrently proof on the published fix belongs to the first-adopter
intent: the posted #418 comment says `--mcp` is unchanged for concurrently, and the pull request
that follows it can say otherwise once this fix is on npm.
