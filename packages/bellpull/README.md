# bellpull

**Not yet released.** This version reserves the name. The layer is planned as wave **F4** of the
foundation tier: its intent and design are at
[`.sdlc/intents/bellpull/`](https://github.com/ofri-peretz/burgee/blob/main/.sdlc/intents/bellpull/),
under the umbrella
[`cli-foundation-stack`](https://github.com/ofri-peretz/burgee/blob/main/.sdlc/intents/cli-foundation-stack/),
and the measurements behind it are in
[`candidate-layers.md`](https://github.com/ofri-peretz/burgee/blob/main/.sdlc/research/candidate-layers.md)
and
[`replacement-map.md`](https://github.com/ofri-peretz/burgee/blob/main/.sdlc/research/replacement-map.md).
Both artifacts are `draft`; the human gate has not run, and no working release ships before
burgee's compatibility scoreboard is public.

A **bellpull** is the cord in one room wired to a bell in another. You pull it here; a bell rings there; someone comes back to you.

That is a subprocess. Request work at a distance, work happens elsewhere, a result returns.

## What it will be

- **A result, not a string and an exception.** `{ ok, code, signal, stdout, stderr, duration }`, with a static projection: readable as human text, as a `--json` envelope, or as an agent event.
- **Executable resolution included.** Finding the program and augmenting `PATH` are part of running it, not two more packages — the incumbents split this across `which` and `npm-run-path`.
- **Cross-platform argument handling**, without the shim being a separate dependency.
- **Drop-in paths** for `execa`, `cross-spawn` and `which`, graded by their own suites.
- **Zero external dependencies.**

## Licence

MIT
