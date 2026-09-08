# roundel

**Not yet released.** This version reserves the name; the first working release follows
[`.sdlc/intents/roundel/`](https://github.com/ofri-peretz/burgee/tree/main/.sdlc/intents/roundel).

A **roundel** is a flag's colours carried onto another surface — the rings on an aircraft's
wing, the London Underground sign. Identity, expressed purely in colour, on something that is
not a flag. That is what this package is for a command-line program: not `red` and `blue`,
but `error`, `hint`, `command` and `flag`, the colours that mean *you*, carried onto the
terminal as a theme.

## What it will be

- **One output policy**, decided once from the runtime: `tty`, `pipe`, `json`, `accessible`
  or `ci`. Every component reads it; none detects the terminal on its own.
- **Semantic tokens** over `util.styleText`, silent under every mode but `tty`.
- **A theme** that changes every token at once, contrast-checked when it emits truecolor.
- **`roundel/chalk`** — chalk's API over Node natives, graded by chalk's own test suite, so a
  migration is one import and your tests are unchanged.
- **Zero dependencies**, and every subpath measured against the lightest incumbent it replaces.

Part of the [burgee](https://github.com/ofri-peretz/burgee) family: a CLI on burgee declares
what it is, roundel carries its colours, flagstaff flies it, caique answers back. Each is
an independent package; none requires the others.
