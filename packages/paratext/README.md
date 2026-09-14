# paratext

**Name reserved.** The intent and design live at
[`.sdlc/intents/paratext/`](https://github.com/ofri-peretz/burgee/tree/main/.sdlc/intents/paratext)
and are at `draft`. This release exports only its own name.

*Paratext* is the literary term for everything around a text that is not the text — the
title, the cover, the margins, the notes. This package will own the terminal equivalent:
**OSC**, the escape class that addresses the terminal program rather than the character
grid. Hyperlinks, inline images, the window title, the clipboard, desktop notifications,
the working directory, and the bell.

Every one of those is capability-gated and none of them is reliably detectable, so each
will ship with a static fallback — an image becomes its caption, a notification a printed
line, a hyperlink `text (url)`. Emitting the bytes and hoping is what puts
`]1337;File=inline=1;…` across a user's screen today.

MIT © Ofri Peretz

## Benchmarks

Every number here is produced by `npm run bench` and published at [/docs/benchmarks](/docs/benchmarks).

Graded by the incumbent's own test suite:

| suite | passing |
| :-- | --: |
| `ansi-escapes` | 0 / 4 |

Weight, installed and tree-inclusive: **44,113 bytes** against **30,912** for the incumbents it replaces — a ratio of **1.4271** (terminal-link, term-img not installed here, so the ceiling is understated).

That ratio is not yet a claim: nothing here passes an incumbent suite, so it is the weight of a package that does not do the job.
