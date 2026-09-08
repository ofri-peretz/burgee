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

### Asking, once it is allowed

`ask()` is the six kinds — `text`, `confirm`, `select`, `multiselect`, `password`, `path` —
each written as a question and a line read back:

```js
import { ask } from 'caique/ask';

await ask(
  { kind: 'select', message: 'Which host?', choices: [{ value: 'ora' }, { value: 'log-update' }] },
  { reader, writer },
);
// Which host?
//   1) ora
//   2) log-update
//   enter a number (1-2):
```

**Line mode is not the fallback, it is the floor.** No raw mode, no cursor movement, no
escape sequence, no redraw — so this *is* the accessible rendering rather than a second
implementation of it, and a screen reader gets the same bytes a terminal does. The raw-mode
renderer that arrows and highlights will sit on top and answer the same questions.

A stream that ends is a **cancellation**, not an empty answer: `Ctrl-D` and a closed pipe
both mean nobody is going to type, and reading that as `''` is how a program writes to a
path nobody chose. Invalid input is re-asked five times and then gives up, because a loop
against a stream that keeps answering wrongly is the same hang wearing a hat.

`projection(spec)` gives the question without the conversation, for a gallery, a `--help`
or a transcript in an issue.

### Wiring it to a CLI

`resolvePrompts()` is the pass a framework calls from its `preAction` hook, once the flags,
environment and config have had their turn:

```js
import { resolvePrompts } from 'caique/binding';

const { values, failure } = await resolvePrompts({
  options,            // { name: { required: true, prompt: { kind: 'text', message: 'Project name?' } } }
  values,             // what every other source resolved
  runtime: { env: process.env, isTTY: { stdin: process.stdin.isTTY } },
  flags: { json, yes, interactive },
  io: { reader, writer },
});
if (failure) throw new CliError(failure.code, failure.message, { fix: failure.fix });
```

It walks the options in **declaration order** — the order the help listed — asks only what
has to be asked, and **stops at the first refusal**, because a caller about to exit is
better served by one actionable message than six.

There is one binding, not one per host. What a framework supplies is a record of options,
the values so far and a runtime; none of that needs any particular framework's types, so
`caique` imports none of them.

### On a real terminal

`createIo()` is the reader and writer over actual streams — the only file in the package
that touches a terminal:

```js
import { createIo } from 'caique/terminal';
import { ask } from 'caique/ask';

const io = createIo({ input: process.stdin, output: process.stdout });
await ask({ kind: 'password', message: 'Token?' }, io);
io.close();
```

A `password` prompt is not echoed, and that lives here rather than in the widgets: this is
the only layer that knows what echo *is*, and no widget can leak a secret by writing it
back, because no widget writes what it read. The echo is suppressed for the duration of the
question rather than by turning the terminal's echo off — which would leave it off if the
process died mid-prompt.

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
