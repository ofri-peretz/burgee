# closeout

**Not yet released.** This version reserves the name. The layer is planned as wave **F2** of the
foundation tier: its intent and design are at
[`.sdlc/intents/closeout/`](https://github.com/ofri-peretz/burgee/blob/main/.sdlc/intents/closeout/),
under the umbrella
[`cli-foundation-stack`](https://github.com/ofri-peretz/burgee/blob/main/.sdlc/intents/cli-foundation-stack/),
and the measurements behind it are in
[`candidate-layers.md`](https://github.com/ofri-peretz/burgee/blob/main/.sdlc/research/candidate-layers.md)
and
[`replacement-map.md`](https://github.com/ofri-peretz/burgee/blob/main/.sdlc/research/replacement-map.md).
Both artifacts are `draft`; the human gate has not run, and no working release ships before
burgee's compatibility scoreboard is public.

To **close out** is to settle and finish — an account, a position, a shift. Everything outstanding is resolved and nothing is left open.

That is what a process should do on the way out, and mostly does not: handlers run once, resources released, the terminal returned to how it was found, and a deadline so a hung handler cannot hold the door.

## What it will be

- **Exactly once, on every path.** Normal exit, every signal, uncaught exception, unhandled rejection. Registering twice does not run twice.
- **Terminal restore.** Cursor, raw mode and alternate screen returned to how they were found, so a cancelled program never leaves a terminal it broke.
- **A bounded deadline.** Cleanup that hangs is cleanup that failed. Handlers get a budget, and exceeding it is reported rather than waited on — a hung handler is exactly what strands an agent with no human on deck.
- **Drop-in paths** for `signal-exit`, `exit-hook` and `restore-cursor`, graded by their own suites.
- **Zero external dependencies.**

## Licence

MIT
