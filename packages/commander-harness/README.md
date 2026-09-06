# commander-harness

Run a [commander](https://github.com/tj/commander.js) program **in-process**, with
`argv`, `env`, `stdin`, `cwd` and TTY-ness injected, and get back
`{ code, stdout, stderr, json, durationMs }`. No child process, no patched streams,
no real exit. Requirement T1 of the Interlace CLI floor.

```ts
import { runCommander } from 'commander-harness';
import { createProgram } from './cli.js'; // (runtime) => Command

const r = await runCommander(createProgram, { argv: ['config', 'get', 'user.name', '--json'], env: { DEMO_GREETING: 'Hi' } });
r.code;   // 0 | 1 | 2 | 3 | 4 | 130 — the E1 exit-code contract
r.json;   // parsed stdout, because --json was in argv
```

Pass an existing `Command`, or a factory `(runtime) => Command` so the program writes
through the runtime the harness fakes. Public commander APIs only: `exitOverride()`,
`configureOutput()`, `parseAsync(argv, { from: 'user' })`.

Two things worth knowing:

- `process.env` is swapped for the run and restored in `finally`, because commander
  reads `Option#env()` from `process.env` at parse time (commander #2549). A lock
  asserts it is byte-identical afterwards.
- commander's errors are recognised by shape (`code` starting with `commander.`), not by
  `instanceof`: the program under test and the harness usually resolve different copies
  of commander.

Exit mapping: help and version → `OK`; `program.error()` keeps an E1 code it was given;
every other commander error → `USAGE` (2); a thrown error → `RUNTIME` (1) with its
message on stderr; `runtime.exit(code)` → that code.
