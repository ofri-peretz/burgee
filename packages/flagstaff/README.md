<p align="center">
  <a href="https://github.com/ofri-peretz/burgee/tree/main/packages/flagstaff" target="blank">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/ofri-peretz/burgee/main/brand-assets/flagstaff-lockup.svg" />
      <img src="https://raw.githubusercontent.com/ofri-peretz/burgee/main/brand-assets/flagstaff-lockup-light.svg" alt="flagstaff" width="360" />
    </picture>
  </a>
</p>

<p align="center">
  The staff the flag flies from — a terminal frame loop that an agent can read.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/flagstaff"><img src="https://img.shields.io/npm/v/flagstaff?style=flat-square&color=0a6b47" alt="npm version" /></a>
  <img src="https://img.shields.io/badge/dependencies-roundel-0a6b47?style=flat-square" alt="One dependency: roundel" />
  <img src="https://img.shields.io/badge/Node.js-24+-green.svg?style=flat-square" alt="Node.js 24+" />
  <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="License: MIT" />
</p>

ora animates a spinner and, off a terminal, prints frames anyway — `\r` after `\r` into the
log an agent reads back. Ink fixes the terminal by shipping React and a layout engine.
**flagstaff** is the staff the flag flies from: a frame loop that hoists a component, holds
it, changes it and lowers it, and a **static projection** that is what every mode but the
terminal gets — one line per state on a pipe, one event per transition under `--json`,
plain text for a screen reader. Plugins are data. No layout engine. One dependency, and it
is [roundel](../roundel/README.md).

A **flagstaff** is the simplest part of the whole apparatus and the only one that is always
in view: a flag is hoisted on it, held there, changed, and lowered when it is done. That is a
terminal render loop — the place frames are hoisted, held, changed and lowered, in view of
whoever is reading.

## Use

```js
import { hoist } from 'flagstaff/loop';
import { spinner } from 'flagstaff/spinner';

const flag = hoist(spinner(), rt, { text: 'building' });
// ... work ...
flag.update({ text: 'linking' });
flag.lower({ text: 'built', status: 'ok' });
```

`rt` is a runtime — `{ env, isTTY: { stdout }, stdout, stderr, clock }`; burgee's satisfies
it, so does a literal in a test. Which of the five modes runs is decided once by roundel's
output policy, never by this package:

| mode | what the same three calls write |
| :-- | :-- |
| `tty` | `⠋ building` repainted in place on the clock, then `✔ built` left on screen |
| `pipe`, `ci` | `… building` ⏎ `… linking` ⏎ `✔ built` — one line per state change, no `\r`, no escape |
| `json` | `{"event":"spinner","state":{"text":"building"}}` … one NDJSON event per transition, on stderr |
| `accessible` | the static text, never a redraw |

## What is here

### The loop

`hoist(component, rt, initial, { json })` returns `{ update(state), lower(state?), mode }`.
A component is `{ name, static(state), frame?(t, state), interval? }`. `static` is
required and is the artifact: what a pipe, an agent, a screen reader and the docs gallery
read. `frame` is optional and decorative. Nothing in the loop reads `process`; time comes
from `rt.clock`, so `manualClock()` makes a spinner's terminal output a fixed string a test
can assert byte for byte.

### The plugin host

A plugin is one plain object, validated against [`schema.json`](./src/schema.json) — the
same file that ships in the tarball — and registered once:

```js
// a third-party plugin, in full
export default {
  name: 'nyan',
  spinners: { nyan: { frames: ['≋', '≈', '~'], interval: 80, static: '…' } },
};
```

```js
import { register } from 'flagstaff/plugin';
register(nyan);
spinner('nyan');
```

Keys: `spinners`, `borders`, `glyphs` (`ok`, `fail`, `warn`, `info`, `running` — change them
and every built-in that draws one changes), `tokens` (a roundel theme), `components`. A spinner
or component without a `static` is refused at `register()` with `E_NO_STATIC_PROJECTION`
and a fix. The built-in `dots` and `line` styles are a plugin of exactly this shape,
registered through the same door, so the built-ins cannot grow an API a plugin cannot reach.

`register()` is the **only** way in, and that is a property rather than a convention:
`registered()` hands back a copy — new maps over the frozen objects `register()` stored — so
`registered().spinners.set(…)` puts nothing in the registry and `.clear()` empties nothing.
A contribution that never met `validate()` cannot be reached by `spinner()`, `box()` or the
gallery, which is what makes "refused at the door" (U3) a fact about the code rather than
advice. Freezing also means the object you registered stays yours: edit it afterwards and
the registry does not change.

A component may declare `sample: { running, done }` — the two states `flagstaff check` and
the docs gallery *show* it with. The loop never reads it; a running program's state comes
from the program. Without one, both assume `{ phase: 'running' }` / `{ phase: 'done' }` and
say so in the output, rather than rendering an invented state as if it were yours.

### The built-ins

Five components, each on its own subpath, each answering the static projection for itself:

```js
import { progress } from 'flagstaff/progress';
import { tasks } from 'flagstaff/tasks';
import { box, boxComponent } from 'flagstaff/box';
import { table, tableComponent } from 'flagstaff/table';
```

| component | on a terminal | everywhere else |
| :-- | :-- | :-- |
| `spinner` | `⠹ building` | `… building`, then `✔ built` |
| `progress` | a bar of blocks | `12/30 files · 40%` |
| `tasks` | every task, the running one animated | one line per task that has **settled** |
| `box` | the border, padding and title | `title: text` |
| `table` | the grid | one line per row of `header: value` pairs |

That table is the package's argument in one place. A bar of `█` in a log file tells an agent
nothing and tells a screen reader less; the count and the percentage tell both.

`box` and `table` are also plain string functions, because most callers want the string:

```js
box('Ready on :3000', { title: 'dev', width: 40 });
table([['ora', '99'], ['log-update', '99']], { head: ['host', 'tests'] });
```

No layout engine, and there will not be one: these measure with `width()`, wrap with
`wrap()`, and join strings.

### The ora path

`flagstaff/ora` is ora 9's whole API, graded **99 / 99 by ora's own test suite** through
[`compat-oracle`](../compat-oracle/README.md). One import changes:

```diff
-import ora from 'ora';
+import ora from 'flagstaff/ora';
```

Everything else stays: `ora({ text, spinner, color, indent, prefixText, suffixText })`,
`.start() .stop() .succeed() .fail() .warn() .info() .stopAndPersist()`, `oraPromise()`,
the `spinners` corpus, the stream hooks that keep a `console.log` above the frame, the
synchronized-output sequences, the render deferral, the stdin discarder.

What changes is the bill. ora 9.4.1 ships 113,577 B of JavaScript across **seventeen
packages** — ora, chalk, cli-spinners, string-width, log-symbols, cli-cursor,
restore-cursor, onetime, mimic-function, signal-exit, is-interactive, is-unicode-supported,
stdin-discarder, yoctocolors, strip-ansi, ansi-regex, get-east-asian-width. `flagstaff/ora`
is 55,641 B across **two** — itself and roundel — **49% of ora's**, and 20,250 B of that is
the spinner corpus ora's API re-exports. Nothing in it reaches the frame loop, so a program
that migrates its spinner today can adopt `hoist()` a file at a time, or never.

Both sides are counted the same way, so the number reproduces: shipped code and data —
`.js`/`.mjs`/`.cjs` plus the `.json` a module imports, `package.json` never counted. Ours is
the import graph walked from `dist/` by `weight.test.ts`; ora's is every package that graph
touches in ora's own resolved tree, counted whole. Counting ora the stricter way — only the
27 files its graph actually reaches — gives 101,809 B, and `flagstaff/ora` is still 55% of
that.

The cursor comes back the way ora's does. A spinner that hid the cursor restores it on a
clean exit **and** on `SIGINT`, `SIGTERM` and `SIGHUP` — node does not run `'exit'`
listeners for a signalled process, and Ctrl+C is how a spinner usually dies — then re-raises
the signal so the process still terminates, unless the program installed its own handler for
it. That is what ora buys with `restore-cursor` → `signal-exit`; here it is twenty lines and
no dependency. ora's own 99 never kill a process, so `ora.test.ts` grades it instead.

**The repo's accessible switch does not reach this surface.** `CLI_ACCESSIBLE=1` changes
what `roundel/policy` decides for every other entry point in the stack, but `flagstaff/ora`
imports `roundel/chalk` and never the policy, because a façade that reinterpreted its host
would fail the host's suite — so on a terminal `CLI_ACCESSIBLE=1` still animates and still
writes cursor escapes (measured: 4 escapes, cursor hidden), where `CI=true` disables the
spinner outright (0 escapes) because that is ora's own rule. Off a terminal it is moot. Use
`hoist()` when you want the switch to be honoured.

The static projection is the reason to move on eventually, not the reason to move:
`hoist()` is what gives a pipe one line per state instead of frames. `flagstaff/ora` is the
door, and it is deliberately ora's behaviour to the byte.

### The boxen path

`flagstaff/boxen` is boxen 8's API, graded **84 / 84 by boxen's own test suite** — every one
of whose cases is a snapshot of the exact characters the box comes out as.

```diff
-import boxen from 'boxen';
+import boxen from 'flagstaff/boxen';
```

`borderStyle` (all eight of cli-boxes', a style object, or `none`), `borderColor`,
`backgroundColor`, `dimBorder`, `title` and `titleAlignment`, `textAlignment`, `padding`,
`margin`, `width`, `height`, `float`, `fullscreen`, and `_borderStyles`.

The drawing **is** the contract here, and matching it byte for byte is the compatibility
claim rather than a way of avoiding one: a user leaving boxen cares about one thing, whether
the box still looks the same. It carries cli-boxes' table itself rather than reading the
plugin registry — a façade whose drawing changed when somebody registered a plugin would be
reinterpreting its host. Named borders through the registry are `flagstaff/box`'s job.

### The cli-table3 path

`flagstaff/cli-table3` is cli-table3 0.6.5's API, graded **29 / 29 by cli-table3's own test
suite** — the 38 of its cases that go through the public surface, less the nine that grade
`cli-table`, the *legacy* incumbent, and so pass whatever the target is. The other 197
`require('../src/…')` and test its four internal modules directly; those are reported beside
the number and never gate it, because passing them would mean copying cli-table3's file
layout rather than matching its behaviour.

```diff
-const Table = require('cli-table3');
+import Table from 'flagstaff/cli-table3';
```

`head`, `chars`, `style` (padding, `head`, `border`, `compact`), `colWidths`, `rowHeights`,
`colAligns`, `rowAligns`, `truncate`, `wordWrap`, `wrapOnWordBoundary`, per-cell `colSpan`,
`rowSpan`, `hAlign`, `vAlign`, `href`, and the `debug` channel with `table.messages` and
`Table.reset()`. It extends `Array`, because cli-table3 does and its callers push rows onto
it.

Four dependencies folded into one module rather than four: cli-table3's `table.js`,
`layout-manager.js`, `cell.js` and `utils.js` become one file, because the architecture is
not the contract — the drawing is.

### The log-update path

`flagstaff/log-update` is log-update 8's API, graded **99 / 99 by log-update's own test
suite** — which renders every frame through a real terminal emulator and asserts the
screen, not the bytes.

```diff
-import logUpdate from 'log-update';
+import logUpdate from 'flagstaff/log-update';
```

`logUpdate()`, `.clear()`, `.done()`, `.persist()`, `createLogUpdate(stream, options)` and
`logUpdateStderr`, with the row-level diffing intact: a five-row frame whose last row is a
counter costs one row of output per tick, not five.

log-update ships 113.4 KB across **sixteen** packages. This is 29.6 KB across **none** —
the subpath reaches no package at all, not even roundel.
It carries no port of `slice-ansi` — the wrapper already makes every row self-contained,
so clipping a frame to the terminal's height is an array slice. `signal-exit`, 22.0 KB of
those sixteen, is 1.4 KB here: `cursor.ts`, shared with the ora façade because both
incumbents port the same `cli-cursor` → `restore-cursor` → `signal-exit` chain. Ctrl+C
mid-frame puts your cursor back, and still terminates — unless your program installed its
own `SIGINT` handler, in which case it is delivered once, to you, and this stays out of it.

**This is the one façade that lowers a layer guarantee, and it says so.** R5 — no cursor
escape off a terminal — cannot survive here: log-update's own suite asserts erase sequences
on a plain non-TTY stream, so a façade that suppressed them would fail the suite that is
the whole claim. What survives is the half the complaint behind R5 was actually about:
nothing this writes is ever a `\r`, **and never an absolute cursor-home** — every move is
a relative row move — on a terminal or off one, so a captured transcript stays parseable.
`log-update.test.ts` asserts both halves, and `hoist()` is what gives you the whole
guarantee.

### Bringing a corpus with you

The ecosystem already has ~80 spinner styles and eight border sets, as plain JSON. Neither
is bundled here — the weight of a corpus nobody asked for is the thing this package exists
to avoid — so `flagstaff/import` turns the one you have into an ordinary plugin:

```js
import cliSpinners from 'cli-spinners';
import { fromCliSpinners } from 'flagstaff/import';
import { register } from 'flagstaff/plugin';

register(fromCliSpinners(cliSpinners));
spinner('moon');
```

`fromCliBoxes(cliBoxes)` does the same for borders, after which `box('…', { border:
'arrow' })` draws with one. Both go through the same `register()` and the same schema, so
the gallery opens full and a third-party plugin starts as a copy of one of these. The
importer is 838 B and reaches nothing.

### `flagstaff check`

```bash
npx flagstaff check ./nyan.mjs
```

Loads the file, validates it, and prints every contribution in all five modes side by side —
escapes made visible — so an author, or an agent that just wrote one, sees the static
projection next to the animation before anything ships. Exit 1 on a refusal, with the code
and the fix.

It opens with a census of what it found and closes with the verdict, so `ok` is never
printed before the rendering that would justify it:

```text
nyan — 1 spinner, 0 borders, 0 components, 0 glyphs, 0 tokens
spinner nyan
  tty         ␛[?25l≋ working␛[1G␛[0J…
  pipe        ~nyan~ working⏎ ✔ done⏎
  …
nyan: ok
```

`0 spinners, 0 components` is how a misspelled key tells on itself. The schema is
`additionalProperties: true` on purpose — a key another package in the family reads belongs
in the same object — so a typo cannot be refused by the schema, and `check` is the surface
that has to notice:

```text
typo — 0 spinners, 0 borders, 0 components, 0 glyphs, 0 tokens
  unknown     componets, spinner — flagstaff reads none of these; a key another package in the family reads is allowed here
E_NO_CONTRIBUTION: typo registers, but contributes nothing flagstaff can render
  fix: flagstaff reads spinners, borders, components, glyphs and tokens; check those spellings. …
```

Each component block names the state it was rendered with — the component's own `sample`
when it declares one, and otherwise the assumed `{ phase }` shape, said out loud. A `static`
that throws on the state it is handed is a refusal like any other, naming the modes it broke
in (`json` emits the state and never calls `static`, so it is usually the one that survives):

```text
E_COMPONENT_THREW: g threw in tty, pipe, ci, accessible
  fix: `static(state)` must return a string for the state it is rendered with; …
```

## Weight

Every subpath is a lock, not a convention, and the numbers below are asserted by
`weight.test.ts` against `dist/`, not estimated: `flagstaff/loop` reaches 4.4 KB on disk and
never the plugin registry; `flagstaff/plugin` 8.4 KB, of which 2.4 KB is the schema;
`flagstaff/spinner` 9.4 KB; `flagstaff/ora` 46.5 KB — 55.9 KB with roundel counted, against
ora's own 113.6 KB; `flagstaff/log-update` 29.6 KB, reaching **no package at all**, against
log-update's own 113.4 KB across sixteen; `flagstaff/boxen` 33.7 KB — 43.0 KB with roundel
counted, against boxen's own 151.4 KB across fourteen; `flagstaff/cli-table3` 32.9 KB —
42.3 KB with roundel, against cli-table3's own 161.7 KB across seven. The three façades share `wrap.js` and
`width.js`, and the first two share `cursor.js`; none reaches another's port, and none
reaches the core. `sideEffects: false` lets a
bundler drop what a program does not use. ESM with a `default` condition, so
`require('flagstaff/spinner')` works from CommonJS on Node ≥ 24.

## What is next

- **Drop-in paths** for boxen and cli-table3, graded by their own suites through
  `compat-oracle` the way ora and log-update already are.

Every component, every registered plugin and every border is on the
[gallery](https://github.com/ofri-peretz/burgee/blob/main/apps/docs/content/docs/gallery.mdx),
which is generated by running them — the static projection beside the animation, in all
five modes.

## Following along

The intent and design are committed before the code is, so you can read what it will be —
and argue with it — before it exists:

- [`.sdlc/intents/flagstaff/`](https://github.com/ofri-peretz/burgee/tree/main/.sdlc/intents/flagstaff)
  — the intent and the design.
- [Open an issue](https://github.com/ofri-peretz/burgee/issues) if your CLI needs something
  this list does not cover. That is the cheapest time to say so.

---

Part of the [burgee](https://github.com/ofri-peretz/burgee) family: a CLI on
[burgee](https://www.npmjs.com/package/burgee) declares what it is,
[roundel](https://www.npmjs.com/package/roundel) carries its colours, flagstaff flies it, and
[caique](https://www.npmjs.com/package/caique) answers back. Each is an independent package;
none requires the others.

MIT © Ofri Peretz — see [LICENSE](./LICENSE).
