# caique

**Pre-release.** The first working slice is here — `decide()`, below — and the rest follows
[`.sdlc/intents/caique/`](https://github.com/ofri-peretz/burgee/tree/main/.sdlc/intents/caique).

A **caique** (kah-EEK) is a small, loud, never-silent parrot — and this one always answers
back. It is also the light wooden boat of the Bosphorus and the Greek islands, the one that
runs between the ship and the shore carrying people and messages across the gap. Both are
true of this package: it is the go-between that carries a question from a program to whoever
is calling, human or agent, and brings the answer back. **It never hangs.**

## What ships today

`decide()` — the rule that decides whether a person can be asked at all, and the reason
this package can promise it never hangs. It is pure: a value, a runtime slice and the run's
flags in, a verdict out.

```js
import { decide } from 'caique/decide';

decide({
  value: undefined,                                  // nothing was passed
  spec: { kind: 'text', message: 'Where should it go?' },
  option: 'output-dir',
  runtime: { env: process.env, isTTY: { stdin: process.stdin.isTTY } },
  required: true,
});
// no terminal -> { action: 'error', code: 'USAGE',
//                  message: '--output-dir is required when there is no terminal',
//                  fix: 'pass --output-dir; it would have been asked as "Where should it go?"' }
// a terminal   -> { action: 'prompt' }
```

The order of the rule is the argument, and it is enumerated rather than described: every
one of the 256 combinations of value x kind x TTY x CI x `--json` x `--yes` x
`--interactive` x required is generated and checked in `decide.test.ts`, against the rule
written a second time, independently. The case that would be a bug report if it broke is
called out by name: **no terminal and no value is never a prompt.**

`--interactive` reaches past "we would not have asked", never past "there is nobody to
ask" — and when there is nobody, the refusal says so, rather than looking like the flag was
ignored.

## What it will be

- **Every prompt is a flag first.** A caller who passes the flag is never asked. An agent
  answers before the question, on the command line, in one pass.
- **Non-TTY never hangs.** No human on deck means an error that names the flag, exit 2, with
  a fix a machine can apply and retry.
- **`--interactive`** asks for every missing required option in one pass; **`--yes`** accepts
  every confirmation; cancellation exits `CANCELLED` and restores the terminal.
- **Accessible mode** falls back to line input with no live redraw.
- **Drop-in paths** for inquirer and clack, graded by their own suites.

Part of the [burgee](https://github.com/ofri-peretz/burgee) family: a CLI on burgee declares
what it is, roundel carries its colours, flagstaff flies it, caique answers back. Each is
an independent package; none requires the others.
