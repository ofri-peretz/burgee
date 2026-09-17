# paratext

*Paratext* is the literary term for everything around a text that is not the text — the
title, the cover, the margins, the notes. This package owns the terminal equivalent:
**OSC**, the escape class (`ESC ]`) that addresses the terminal *program* rather than the
character grid. Hyperlinks, inline images, the window title, the clipboard, desktop
notifications, the working directory, and the bell.

Zero dependencies. The intent and design live at
[`.sdlc/intents/paratext/`](https://github.com/ofri-peretz/burgee/tree/main/.sdlc/intents/paratext).

## Nothing in this layer is detectable

No terminal answers *"do you do OSC 1337"*. So every capability carries a **static
projection**, and `emit` returns it whenever support is absent or unknown: an image becomes
its caption, a notification a printed line, a hyperlink `text (url)`. Emitting the bytes and
hoping is what puts `\u001B]1337;File=inline=1;…` across the screen of anyone who piped your
output to a file, and it is what every incumbent does.

```js
import { emit, processRuntime } from 'paratext';

const runtime = processRuntime();
emit(runtime, 'link', { text: 'Docs', url: 'https://x.dev' });
// iTerm2:  \e]8;;https://x.dev\aDocs\e]8;;\a
// a pipe:  Docs (https://x.dev)
```

## A capability is data

Terminals invent OSC codes faster than any package ships releases — Kitty's graphics
protocol, WezTerm's user-vars, Ghostty's progress bar. So the surface is a registry of plain
objects rather than a fixed list of functions, and the seven built-ins register through the
same public call a third party makes.

```js
import { register } from 'paratext';

register({
  name: 'kitty-image',
  osc: 'BEL',
  when: { tty: true, term: 'xterm-kitty' },
  encode: '\u001B_Ga=T,f=100;{base64}\u001B\\',
  fallback: '{caption}', // required — there is no opt-out
});
```

No functions, so a capability travels through JSON, is diffable, and can be validated
without running its author's code. `check(document)` grades one against
[`paratext/schema.json`](https://github.com/ofri-peretz/burgee/blob/main/packages/paratext/src/schema.json), the same file every package in the family
ships. `paratext/plugin` is the host: a plugin's capabilities arrive under `capabilities`,
and every other key — another layer's `tokens`, `spinners`, `handlers` — is ignored without
complaint.

**What "grades against the schema" means, exactly.** `check()` and `register()` read the
capability entry of that file and enforce `required`, `type`, `oneOf`, `const`, `minLength`,
`minimum`, `items`, and `additionalProperties: false`, which between them is every keyword
the capability shape writes. Each refusal names the path — `capabilities.link.when.tty`, not
just the capability — and carries the family's error code. What it does **not** read is
`$ref`, `pattern`, `minItems`, `maxLength`, `enum`, `allOf`, `anyOf` and `not`: none of them
appears under a capability, so nothing is silently unchecked today, but a keyword added to
the file tomorrow would be. Until 0.3 this was presence-checking only, and `when: 'not an
object'` was therefore accepted — a string destructures to four empty clauses, so the support
guess said *yes* and the sequence went into the pipe. That is now a refusal.

## The `ansi-escapes` members it replaces

The root is call-compatible with `ansi-escapes` for the four OSC members of its surface, so
the bytes are the incumbent's where the terminal understands them and the projection
everywhere else:

```js
import ansiEscapes, { link, image, setCwd, beep } from 'paratext';
```

**Its CSI half is out of scope** — the cursor, erasing, scroll regions, the alternate
screen. That is the character grid, which `flagstaff` draws and `closeout` puts back; a
second implementation here is the copy this family exists to avoid. Those names are still
*declared*, as `undefined`, so a drop-in module loads rather than dying on an ESM named
import — and TypeScript types them such that calling one is a compile error, not a surprise
at run time.

Graded by the compat oracle against `ansi-escapes@7.3.0`'s own suite. Three of its four
cases assert CSI, so **the ceiling on that row is 1 / 4**: paratext scores it, and 25% there
means complete rather than a quarter.

MIT © Ofri Peretz

## Benchmarks

Every number here is produced by `npm run bench` and published at [/docs/benchmarks](/docs/benchmarks).

Graded by the incumbent's own test suite:

| suite | passing |
| :-- | --: |
| `ansi-escapes` | 1 / 4 |
| `term-img` | 0 / 18 |
| `terminal-link` | 0 / 10 |

Weight, installed and tree-inclusive: **66,343 bytes** against **30,912** for the incumbents it replaces — a ratio of **2.1462** (terminal-link, term-img not installed here, so the ceiling is understated).
## Where it sits

Plugins register under the `capabilities` key, against the one schema the whole family shares.

`flagstaff` builds on it, and it builds on nothing in this family.
