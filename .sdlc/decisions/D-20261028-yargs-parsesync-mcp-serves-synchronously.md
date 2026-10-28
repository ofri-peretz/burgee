---
id: D-20261028-yargs-parsesync-mcp-serves-synchronously
subject: 'Under `.parseSync()`, `--mcp` cannot hand back a promise, and the program goes on (to its own `process.exit()`, on concurrently) the moment `parseSync()` returns. Refuse `--mcp` there with a usage error that names `.parseAsync()`, or serve it?'
taken: 'Taken by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-28'
date: '2026-10-28'
superseded_by: —
---

**Serve it, synchronously.** Under `parseSync()`, `--mcp` runs `serveMcpSync` (`packages/burgee/src/mcp.ts`):
it reads requests from descriptor 0 with `readSync`, answers each in turn on descriptor 1 with
`writeSync`, and returns only when the input ends. Then the façade exits 0, as `--help` does,
before `parseSync()` returns. The program's own code after `parseSync()` never runs, so
concurrently's `showHelp(); process.exit()` on an empty argv cannot end the server.

**Why not refuse.** The gap's `done_when` asks for `initialize` and `tools/list` replies, and the
first-adopter owner's go on concurrently #418 asked for `--mcp` to start a server. A refusal would
have been honest, but it would not meet either. Serving is possible without patching
`process.exit`, so the refusal had nothing left to recommend it. The two other shapes were rejected:

- *Hold the process after `parseSync()` returns.* The program's next statement is its own, and on
  concurrently it is `process.exit()`. Only patching `process.exit` could stop that, and the brief
  rules out that kind of monkeypatch.
- *Run the asynchronous server in a worker and block on `Atomics.wait`.* That means more bytes and
  more moving parts, and each tool call would have to cross threads back to the instance that
  owns the program. The synchronous loop needs neither.

**What it costs, and what it does not offer.** Calls run one at a time. A tool call is the
program's own `.parseSync([...argv, '--json'])`, captured as `.parseAsync()`'s is, so its answer
is the same: `parse-sync-surfaces.test.ts` compares the two programs reply by reply. A
`notifications/cancelled` arrives after the call it names has answered, and finds nothing to
cancel. A handler that returns a promise gets yargs' own `YError` as the call's failure, which is
what the program's normal run gets. Concurrent calls, cancellation and asynchronous handlers stay
`.parseAsync()`'s. A descriptor that something in the process made non-blocking is waited on
(`EAGAIN`, then a 5 ms `Atomics.wait`), and Windows' `EOF` error on a pipe reads as the end.

**Bytes.** `mcp.js` stays lazy, and under `parseSync()` it is required, not imported, as
`completions.js` already was (D-20261027-yargs-parsesync-surface-bytes). The static walk of
`./yargs` grows by the router and the shared `invoke`: 221,755 → 222,248 B (+493). The ceilings
become 222,300 for `./yargs`, 225,350 for `./yargs/v17` and 225,550 for `./yargs/v17/yargs`.
`./mcp` grows by the server itself, 28,428 → 30,756 B, and its ceiling becomes 30,800. `node:fs` is
read through `builtin()` when the server starts, not imported, so a bundle of `burgee/mcp` that never
serves synchronously carries no extra import. Bundled, which inlines `mcp.js`' dynamic import,
`burgee/yargs` goes from 108,897 to 109,149 B (+252). The ceiling in `benchmarks/axes/weight.ts`
becomes 109,200, and `lighter-than-yargs` reads 0.977 against yargs' 111,686. `/docs/weight` moves
`burgee/yargs` from 109,250 to 109,502, `burgee/yargs/v17` from 110,415 to 110,662 (its
`OVER_INCUMBENT` row moves with it), and `burgee/mcp`'s `serveMcp` from 7,728 to 7,923. The
README's 1.42× is `burgee/commander`'s, which this change does not touch.
