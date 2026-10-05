---
title: paratext
description: "Everything around your terminal output that is not the output: hyperlinks, images, window title, clipboard, notifications and the bell — each with a static fallback for terminals that cannot do it. Drop-in paths for ansi-escapes, terminal-link and term-img. Zero dependencies."
---

*Paratext* is the literary term for everything around a text that is not the text — the
title, the cover, the margins, the notes. This package owns the terminal equivalent:
**OSC**, the escape class (`ESC ]`) that addresses the terminal *program* rather than the
character grid. Hyperlinks, inline images, the window title, the clipboard, desktop
notifications, the working directory, and the bell.

It replaces **ansi-escapes** (the package root, 4 / 4), **terminal-link**
(`paratext/terminal-link`, 8 / 8) and **term-img** (`paratext/term-img`, 18 / 18), each
graded by the incumbent's own suite and level with it. Every OSC capability
has a static projection, so a pipe or an agent gets `Docs (https://x.dev)`, never raw escape
bytes.

Zero dependencies. The intent and design live at
[`.sdlc/intents/paratext/`](https://github.com/ofri-peretz/burgee/tree/main/.sdlc/intents/paratext).

## Install

```bash
npm install paratext
pnpm add paratext
yarn add paratext
bun add paratext
```

## Quick start

```js
import { emit, processRuntime } from 'paratext';

const runtime = processRuntime();
emit(runtime, 'link', { text: 'Docs', url: 'https://x.dev' });
// iTerm2:  \e]8;;https://x.dev\aDocs\e]8;;\a
// a pipe:  Docs (https://x.dev)
```

The same call gives the terminal's bytes where it understands them and the static projection
everywhere else; the next section is why that is the only safe default.

## Nothing in this layer is detectable

No terminal answers *"do you do OSC 1337"*. So every capability carries a **static
projection**, and `emit` returns it whenever support is absent or unknown: an image becomes
its caption, a notification a printed line, a hyperlink `text (url)`. Emitting the bytes and
hoping is what puts `\u001B]1337;File=inline=1;…` across the screen of anyone who piped your
output to a file, and it is what every incumbent does.

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

## Migrating

One import per incumbent:

```diff
- import ansiEscapes, { cursorTo, eraseLines, link, image, beep } from 'ansi-escapes';
+ import ansiEscapes, { cursorTo, eraseLines, link, image, beep } from 'paratext';
```

```diff
- import terminalLink from 'terminal-link';
+ import terminalLink from 'paratext/terminal-link';
```

```diff
- import terminalImage, { UnsupportedTerminalError } from 'term-img';
+ import terminalImage, { UnsupportedTerminalError } from 'paratext/term-img';
```

`paratext/term-img` takes a file path or image bytes, as term-img does. It is the one entry
that imports `node:fs`, to read that path; the root and every other entry touch nothing but
strings ([Coming from term-img](https://paratext.interlace.tools/docs/coming-from/term-img)).

The root is `ansi-escapes`' surface, both halves of it — `setCwd` included.

**The CSI half** — the cursor, erasing, scroll regions, the alternate screen, synchronized
output — is byte-exact with `ansi-escapes@7.3.0`. It does not degrade, because the
incumbent's does not: a cursor move silently dropped would corrupt the screen of a program
that relied on it.

The CSI half is also published on its own, as `paratext/csi` — 2,700 bytes, and it
registers none of the built-ins the root does. It is where `flagstaff` and `caique` take their
cursor moves from:

```js
import { cursorUp, eraseLines, synchronizedOutput } from 'paratext/csi';
```

**The OSC half** — `link`, `image`, `setCwd`, `beep` — gives the incumbent's bytes where the
terminal understands them and the static projection everywhere else. That is the one
deliberate difference.

`iTerm` and `ConEmu` are still *declared*, as `undefined`, so a drop-in module loads rather
than dying on an ESM named import — and TypeScript types them such that calling one is a
compile error, not a surprise at run time. `iTerm.annotation` has no equivalent yet.

Or let the codemod make the change: `npx burgee migrate --dry-run` lists every import it would
rewrite — only drop-ins graded level with their incumbent — and `npx burgee migrate` makes it
([Migrate](https://burgee.interlace.tools/docs/migrate)).

## Compatibility

Each drop-in path is graded by its incumbent's own suite, unedited, through `compat-oracle`.

Graded by the compat oracle against `ansi-escapes@7.3.0`'s own suite: **4 / 4**, level with
the control. Three of its four cases assert CSI; until the CSI half landed, that row was
1 / 4.

`paratext/terminal-link` is graded by terminal-link's suite and `paratext/term-img` by
term-img's, and both are level with the incumbent. term-img's six path cases went green when
`paratext/term-img` began reading a path the way term-img does. The current grades are
generated under *Benchmarks* below and published on the
[compatibility page](https://burgee.interlace.tools/docs/compatibility).

## Benchmarks

Every number here is produced by `npm run bench` and published at [burgee.interlace.tools/docs/benchmarks](https://burgee.interlace.tools/docs/benchmarks).

Graded by the incumbent's own test suite:

| suite | passing |
| :-- | --: |
| `ansi-escapes` | 4 / 4 |
| `term-img` | 18 / 18 |
| `terminal-link` | 8 / 8 |

Weight, installed and tree-inclusive: **119,519 bytes** against **2,235,987** for the incumbents it replaces — a ratio of **0.0535**.

## For agents

- **A pipe or an agent never sees raw escape bytes.** Every capability has a static projection,
  and `emit` returns it whenever support is absent or unknown: `Docs (https://x.dev)`, not
  `\u001B]8;;…`.
- **A capability is data.** No functions, so a capability travels through JSON, is diffable,
  and `check(document)` grades it against
  [`paratext/schema.json`](https://github.com/ofri-peretz/burgee/blob/main/packages/paratext/src/schema.json)
  without running its author's code; each refusal names the path and the family's error code.
- **A plugin can be checked before it ships.** `npx paratext check ./kitty.mjs` validates it
  and exits 0, 1 with a code and a fix, or 2 on a usage error.
- **The docs are machine-readable** at
  [paratext.interlace.tools/llms.txt](https://paratext.interlace.tools/llms.txt) and
  [llms-full.txt](https://paratext.interlace.tools/llms-full.txt).

## API

`emit`, `register`, `check` and `processRuntime` from the root, beside the whole `ansi-escapes`
surface; `paratext/plugin` for the host. Every export, with its types, is on
[paratext.interlace.tools](https://paratext.interlace.tools/docs).

## Where it sits

Plugins register under the `capabilities` key, against the one schema the whole family shares.

`caique`, `controlroom`, `flagstaff` build on it, and it builds on nothing in this family.

## The family

Ten packages, one repository, one release pipeline. A CLI on burgee declares what it is, roundel
carries its colours, flagstaff flies it and caique answers back; each installs on its own, and none
takes a dependency from outside the family.

| Package | What it is | Replaces |
| :-- | :-- | :-- |
| [burgee](https://burgee.interlace.tools/docs/packages/burgee) | The CLI framework: one declaration, every surface | commander and yargs |
| [roundel](https://roundel.interlace.tools/docs) | Colour: one output policy, semantic tokens, a theme | chalk |
| [flagstaff](https://flagstaff.interlace.tools/docs) | The frame loop: spinners, progress, boxes and tables | ora, log-update, boxen and cli-table3 |
| [caique](https://caique.interlace.tools/docs) | Prompts that are flags first, and never hang | inquirer and clack |
| [linegauge](https://linegauge.interlace.tools/docs) | Measuring, wrapping, truncating and slicing styled text | string-width, wrap-ansi, strip-ansi and slice-ansi |
| **paratext** (this package) | Hyperlinks, images, title, clipboard and notifications | ansi-escapes, terminal-link and term-img |
| [seniority](https://seniority.interlace.tools/docs) | Configuration precedence and discovery, with provenance | cosmiconfig, dotenv and rc |
| [closeout](https://closeout.interlace.tools/docs) | Exit handlers, terminal restore and a bounded shutdown | signal-exit, exit-hook and restore-cursor |
| [bellpull](https://bellpull.interlace.tools/docs) | Subprocesses, and which executable actually ran | cross-spawn and which |
| [controlroom](https://burgee.interlace.tools/docs/packages/controlroom) | Full-screen, keyboard-driven terminal screens | ink, graded by ink's own suite |

Every migration guide, and the family-wide [compatibility](https://burgee.interlace.tools/docs/compatibility)
and [benchmarks](https://burgee.interlace.tools/docs/benchmarks) pages, are on
[burgee.interlace.tools](https://burgee.interlace.tools/docs/packages).

## Contributing

Issues and pull requests are welcome at [ofri-peretz/burgee](https://github.com/ofri-peretz/burgee/issues); read
[CONTRIBUTING.md](https://github.com/ofri-peretz/burgee/blob/main/CONTRIBUTING.md) first. Report a vulnerability privately, as
[SECURITY.md](https://github.com/ofri-peretz/burgee/blob/main/SECURITY.md) describes — never in a public issue.

## Licence

MIT © Ofri Peretz — see [LICENSE](https://github.com/ofri-peretz/burgee/blob/main/packages/paratext/LICENSE).
