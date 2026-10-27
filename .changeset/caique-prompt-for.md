---
"caique": minor
---

`promptFor` asks for a command's missing option or positional, and refuses when nobody can
answer (R1).

- `import { promptFor } from 'caique/prompt-for'`. `promptFor(command, 'name', { kind: 'text',
  message: 'Who?' })` wraps a command so its handler never sees a missing value. A person at a
  terminal is asked, on stderr, so the question never lands in the command's data. With no
  terminal, under `CI`, under a detected agent, under `--json` or in an `--mcp` tool call, it
  refuses with `USAGE`, naming how to pass the value: `<name>` for a positional, `--dry-run` for
  a `dryRun` option. A cancelled question is `CANCELLED`. burgee leaves with exit 2 or 4.
- `promptFor(command)` resolves the `prompt:` a command already declares on its options or
  arguments. The command's shape is read structurally, and nothing in caique imports burgee.
- The terminal is opened only to ask, handed to the host's exit path while it is open, and closed
  before the handler runs. Ctrl+C at the question gives the terminal back out of raw mode, on
  Linux, macOS and Windows.
- A declared prompt is left out of the command's JSON, so `--schema` does not grow.
- `caique/clack`'s `spinner({ style })` takes a spinner style as data, such as flagstaff's
  `lookupSpinner(name)` or a plugin's `spinners` entry. On a terminal its frames turn at its
  interval. Anywhere else its `static` line is printed in place of the first frame.
- `decide()` and `resolvePrompts()` take a `flag`, which is how a refusal names an option when
  `--<option>` is not how it is passed.
