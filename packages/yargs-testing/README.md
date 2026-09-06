# yargs-testing

Run a [yargs](https://github.com/yargs/yargs) CLI **in-process**, with `argv`, `env`,
`stdin`, `cwd` and TTY-ness injected, and get back
`{ code, stdout, stderr, json, durationMs }`. The same result shape as
`commander-harness`, so one suite can run one CLI built on either host. Requirement T1
of the Interlace CLI floor.

```ts
import { runYargs } from 'yargs-testing';
import { buildCli } from './cli.js'; // (y, runtime) => Argv

const r = await runYargs(buildCli, { argv: ['greet', 'ada', '--shout'] });
r.code;    // 0 | 1 | 2 | 3 | 4 | 130
r.stdout;  // 'HELLO, ADA!\n'
```

Takes a builder rather than an instance, because a yargs instance holds parse state.
Public yargs APIs only: `.exitProcess(false)`, `.showHelpOnFail(false)`, `.fail()`,
`.getHelp()`, `.parseAsync()`.

- `--help` is rendered by the harness through `getHelp()` rather than parsed, because
  yargs cannot render help for a given argv without printing (yargs #2450).
- `.fail(msg)` without an error is a usage error → `USAGE` (2); with an error it is the
  handler failing → `RUNTIME` (1), or the E1 code the error carries.
- `process.env` is swapped for the run and restored in `finally`; `console.*` is routed
  into the result while the run lasts and restored afterwards.
