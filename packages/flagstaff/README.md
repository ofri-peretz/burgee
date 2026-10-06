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
  <a href="https://www.npmjs.com/package/flagstaff"><img src="https://img.shields.io/npm/v/flagstaff?style=flat-square&color=0a6b47" alt="flagstaff on npm: the latest version" /></a>
  <a href="https://www.npmjs.com/package/flagstaff"><img src="https://img.shields.io/npm/dm/flagstaff?style=flat-square" alt="flagstaff downloads per month on npm" /></a>
  <a href="https://github.com/ofri-peretz/burgee/actions/workflows/quality.yml?query=branch%3Amain"><img src="https://img.shields.io/github/actions/workflow/status/ofri-peretz/burgee/quality.yml?branch=main&style=flat-square&label=Quality%20Gate" alt="Quality Gate: the CI status of main" /></a>
  <a href="https://app.codecov.io/gh/ofri-peretz/burgee/components"><img src="https://img.shields.io/codecov/c/github/ofri-peretz/burgee/main?component=flagstaff&style=flat-square" alt="flagstaff line coverage: its Codecov component" /></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/ofri-peretz/burgee"><img src="https://img.shields.io/ossf-scorecard/github.com/ofri-peretz/burgee?style=flat-square&label=OpenSSF%20Scorecard" alt="OpenSSF Scorecard for the repository" /></a>
  <a href="https://www.npmjs.com/package/flagstaff?activeTab=code"><img src="https://img.shields.io/npm/unpacked-size/flagstaff?style=flat-square" alt="Unpacked size of the latest flagstaff release on npm" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/flagstaff/package.json"><img src="https://img.shields.io/badge/dependencies-4%20in%20family%2C%200%20outside-0a6b47?style=flat-square" alt="Four dependencies, all in the burgee family (closeout, linegauge, paratext, roundel), none outside it" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/flagstaff/package.json"><img src="https://img.shields.io/badge/types-included-blue?style=flat-square" alt="TypeScript types included for every entry point" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/flagstaff/package.json"><img src="https://img.shields.io/badge/Node.js-20.19%2B%20%7C%2022.13%2B-green?style=flat-square" alt="Node.js 20.19+ or 22.13+" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/flagstaff/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License: MIT" /></a>
  <a href="https://www.npmjs.com/package/flagstaff#provenance"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fregistry.npmjs.org%2Fflagstaff%2Flatest&query=%24.dist.attestations.provenance~&label=npm&style=flat-square&color=0a6b47" alt="npm provenance of the latest release, read live from its registry attestation" /></a>
</p>

<p align="center">
  <a href="https://burgee.interlace.tools/docs/compatibility"><img src="https://img.shields.io/badge/boxen%20suite-213%2F213-0a6b47?style=flat-square" alt="flagstaff/boxen passes 213 of 213 cases of the boxen test suite" /></a>
  <a href="https://burgee.interlace.tools/docs/compatibility"><img src="https://img.shields.io/badge/cli--table3%20suite-29%2F29-0a6b47?style=flat-square" alt="flagstaff/cli-table3 passes 29 of 29 cases of the cli-table3 test suite" /></a>
  <a href="https://burgee.interlace.tools/docs/compatibility"><img src="https://img.shields.io/badge/log--update%20suite-99%2F99-0a6b47?style=flat-square" alt="flagstaff/log-update passes 99 of 99 cases of the log-update test suite" /></a>
  <a href="https://burgee.interlace.tools/docs/compatibility"><img src="https://img.shields.io/badge/ora%20suite-99%2F99-0a6b47?style=flat-square" alt="flagstaff/ora passes 99 of 99 cases of the ora test suite" /></a>
</p>

<p align="center">
  Docs: <a href="https://flagstaff.interlace.tools">https://flagstaff.interlace.tools</a><br />
  Migrating from: <a href="https://flagstaff.interlace.tools/docs/coming-from/ora">ora</a> · <a href="https://flagstaff.interlace.tools/docs/coming-from/log-update">log-update</a> · <a href="https://flagstaff.interlace.tools/docs/coming-from/boxen">boxen</a> · <a href="https://flagstaff.interlace.tools/docs/coming-from/cli-table3">cli-table3</a>
</p>

ora animates a spinner on a terminal and, off one, writes the line it started with and the
line it stopped with — every state in between is lost to the log an agent reads back. Ink fixes the terminal by shipping React and a layout engine.
**flagstaff** is the staff the flag flies from: a frame loop that hoists a component, holds
it, changes it and lowers it, and a **static projection** that is what every mode but the
terminal gets — one line per state on a pipe, one event per transition under `--json`,
plain text for a screen reader. Plugins are data. No layout engine. Four dependencies, all
from this repository: [roundel](https://github.com/ofri-peretz/burgee/blob/main/packages/roundel/README.md), [paratext](https://github.com/ofri-peretz/burgee/blob/main/packages/paratext/README.md),
[linegauge](https://github.com/ofri-peretz/burgee/blob/main/packages/linegauge/README.md) and [closeout](https://github.com/ofri-peretz/burgee/blob/main/packages/closeout/README.md).

It replaces **ora**, **log-update**, **boxen** and **cli-table3**, each through a drop-in path
graded by the incumbent's own suite — see [Migrating](#migrating).

A **flagstaff** is the simplest part of the whole apparatus and the only one that is always
in view: a flag is hoisted on it, held there, changed, and lowered when it is done. That is a
terminal render loop — the place frames are hoisted, held, changed and lowered, in view of
whoever is reading.

## Install

```bash
npm install flagstaff
pnpm add flagstaff
yarn add flagstaff
bun add flagstaff
```

## Quick start

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

A plugin is one plain object, validated against [`schema.json`](https://github.com/ofri-peretz/burgee/blob/main/packages/flagstaff/src/schema.json) — the
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

### A log tail and a tab bar

Two output-only components for screens built on flagstaff — controlroom's panes, or a plain
scrolling terminal. Neither reads a key.

```js
import { logTail } from 'flagstaff/log-tail';
import { tabBar } from 'flagstaff/tab-bar';

hoist(logTail({ height: 5 }), rt, { lines: [{ step: 'Installing' }, 'npm install', 'added 12 packages'] });
hoist(tabBar(), rt, { tabs: ['Status', 'Tail logs', 'Visualizer'], active: 1 });
```

| component | on a terminal | everywhere else |
| :-- | :-- | :-- |
| `logTail` | the last _n_ rows, `┊` before each line, `◆` on the step in progress — pinned to the top once it scrolls out | the whole stream, **appended**: each new line printed once, nothing repainted |
| `tabBar` | `Status · Tail logs · Visualizer`, the active tab styled through roundel's `heading` (bracketed without colour) | the active tab's label |

Importing either registers its built-in (`log-tail`, `tab-bar`) through the same public
`register()` a plugin uses, so a plugin can replace it; the `┊` and `◆` marks are the `tail`
and `step` glyphs. The task list's pending mark is the `pending` glyph too — a space unless a
plugin sets one, `◻` say.

### A streamed reply and a diff

Two components for chat-style programs, where a model's reply arrives a token at a time and an
edit is shown before it is written.

```js
import { markdown } from 'flagstaff/markdown';
import { diff } from 'flagstaff/diff';

let text = '';
const reply = hoist(markdown(), rt, { text });
for await (const token of stream) reply.update({ text: (text += token) });
reply.lower({ text, done: true });

hoist(diff(), rt, { diff: patch }).lower();
```

| component | on a terminal | everywhere else |
| :-- | :-- | :-- |
| `markdown` | the reply so far: headings, lists, emphasis, inline code and fenced code styled through roundel; with no colour, the source as written | the markdown's own source, **committed a block at a time** — each block printed once, when a later line closes it |
| `diff` | old and new line numbers on every line, removals and additions coloured | the diff unchanged, byte for byte |

A block is committed only by a complete line — a blank line, a heading, a fence, a closing
fence — so wherever the stream is cut, the blocks committed so far are the whole reply's first
blocks; the suite cuts a fixture at every byte offset and holds that. There is no syntax
highlighting inside a fence. `markdownBlocks(text, done)` is exported for a program that
places committed blocks itself, as controlroom's inline screen does.

### Writing a whole frame

`hoist` repaints one component. A program that lays several out in one frame paints the frame
through the same writer `hoist` uses:

```js
import { frameWriter } from 'flagstaff/loop';

const frame = frameWriter(process.stdout);
frame.paint(['Status · Tail logs', '┊ npm install', '┊ added 12 packages']);
frame.paint(['Status · Tail logs', '┊ npm install', '┊ added 13 packages']); // rewrites one row
frame.release(); // the frame stays on screen as scrollback
```

`paint` writes only the rows that changed since the last paint, inside one synchronized-output
block (`ESC[?2026h … ESC[?2026l`), so a terminal that supports it never shows a half-drawn
frame and one that does not ignores the two sequences. It is the only grid-writing code in the
family: controlroom composites through it rather than painting on its own.

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
  tty         ␛[?25l␛[?2026h≋ working␛[?2026l␛[?2026h␛[1G␛[0J…
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

## Migrating

Four drop-in paths, one import each. `npx burgee migrate --dry-run` lists the imports the codemod
would rewrite — only drop-ins graded level with their incumbent — and `npx burgee migrate` makes
the change ([Migrate](https://burgee.interlace.tools/docs/migrate)).

### The ora path

`flagstaff/ora` is ora 9's whole API, graded **99 / 99 by ora's own test suite** through
[`compat-oracle`](https://github.com/ofri-peretz/burgee/blob/main/packages/compat-oracle/README.md). One import changes:

```diff
-import ora from 'ora';
+import ora from 'flagstaff/ora';
```

Everything else stays: `ora({ text, spinner, color, indent, prefixText, suffixText })`,
`.start() .stop() .succeed() .fail() .warn() .info() .stopAndPersist()`, `oraPromise()`,
the `spinners` corpus, the stream hooks that keep a `console.log` above the frame, the
synchronized-output sequences, the render deferral, the stdin discarder.

What changes is the bill. ora 9.4.1 ships 114,102 B of JavaScript across **seventeen
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

log-update ships 113.4 KB across **sixteen** packages. This subpath reaches two, both from
this repository: `linegauge/wrap` for the wrapper, and `closeout` for the cursor.
It carries no port of `slice-ansi` — the wrapper already makes every row self-contained,
so clipping a frame to the terminal's height is an array slice. `signal-exit`, 22.0 KB of
those sixteen, is `closeout`'s to own, shared with the ora façade because both
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

### The boxen path

`flagstaff/boxen` is boxen 9's API, graded **213 / 213 by boxen 9.0.0's own test suite** — whose
cases assert the exact characters the box comes out as. boxen 8 is no longer graded or claimed:
9 changed two of its answers (a hex colour must be real hex, and `vertical` / `horizontal` are a
fallback for the sides rather than an override), and this follows 9.

```diff
-import boxen from 'boxen';
+import boxen from 'flagstaff/boxen';
```

`borderStyle` (all eight of cli-boxes', a style object, or `none`), `borderColor`,
`backgroundColor`, `borderBackgroundColor`, `dimBorder`, `title`, `titleColor` and
`titleAlignment`, `footer` and `footerAlignment`, `textAlignment`, `padding`, `margin`, `width`,
`maxWidth`, `height`, `float`, `fullscreen`, and `_borderStyles`. A tab, a backspace or a cursor
move inside the text, a label or a border is written the way a terminal would draw it, as boxen 9
does, so it cannot break the box.

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

## Compatibility

Each façade is graded by its incumbent's own suite, unedited, through
[`compat-oracle`](https://github.com/ofri-peretz/burgee/blob/main/packages/compat-oracle/README.md),
beside a control run of the same suite against the incumbent itself. What each suite does and
does not reach is under its path above — cli-table3's number counts only the cases that go
through its public surface, and ora's never kills a process, so `ora.test.ts` grades the signal
path instead. The current grades are generated under *Benchmarks* below and published on the
[compatibility page](https://burgee.interlace.tools/docs/compatibility).

## Weight

Every subpath is a lock, not a convention, and the numbers below are asserted by
`weight.test.ts` against `dist/`, not estimated: `flagstaff/loop` reaches 4.4 KB on disk and
never the plugin registry; `flagstaff/plugin` 8.4 KB, of which 2.4 KB is the schema;
`flagstaff/spinner` 9.4 KB; `flagstaff/ora` 46.5 KB — 55.9 KB with roundel counted, against
ora's own 113.6 KB; `flagstaff/log-update` 29.6 KB, against
log-update's own 113.4 KB across sixteen, reaching only `linegauge/wrap` and `closeout`; `flagstaff/boxen` 17.6 KB — 67.8 KB with linegauge and
roundel counted, against boxen 9's own 114.9 KB across fourteen; `flagstaff/cli-table3` 32.9 KB —
42.3 KB with roundel, against cli-table3's own 106.0 KB across seven. The three façades share `wrap.js` and
`width.js`, and the first two share `closeout`; none reaches another's port, and none
reaches the core. `sideEffects: false` lets a
bundler drop what a program does not use. ESM with a `default` condition, so
`require('flagstaff/spinner')` works from CommonJS on Node 20.19+ and 22.13+.

## Benchmarks

Every number here is produced by `npm run bench` and published at [burgee.interlace.tools/docs/benchmarks](https://burgee.interlace.tools/docs/benchmarks).

Graded by the incumbent's own test suite:

| suite | passing |
| :-- | --: |
| `boxen` | 213 / 213 |
| `cli-table3` | 29 / 29 |
| `log-update` | 99 / 99 |
| `ora` | 99 / 99 |

## For agents

- **Off a terminal, frames become facts.** Every component has a required `static` projection:
  one line per state on a pipe, one NDJSON event per transition under `--json`, plain text for a
  screen reader — never `\r` after `\r` into the log an agent reads back.
- **The mode is decided once, by roundel's output policy**, never by this package, so the
  spinner, the prompt and the help cannot disagree about the terminal.
- **A plugin can be checked before it ships.** `npx flagstaff check ./nyan.mjs` prints every
  contribution in all five modes side by side, escapes made visible, and exits 1 with the code
  and the fix on a refusal — so an agent that just wrote one sees the static projection before
  anything ships.
- **The docs are machine-readable** at
  [flagstaff.interlace.tools/llms.txt](https://flagstaff.interlace.tools/llms.txt) and
  [llms-full.txt](https://flagstaff.interlace.tools/llms-full.txt).

## Gallery

Every component, every registered plugin and every border is on the
[gallery](https://burgee.interlace.tools/docs/gallery),
which is generated by running them — the static projection beside the animation, in all
five modes.

## Following along

The intent and design are committed before the code is, so you can read what it will be —
and argue with it — before it exists:

- [`.sdlc/intents/flagstaff/`](https://github.com/ofri-peretz/burgee/tree/main/.sdlc/intents/flagstaff)
  — the intent and the design.
- [Open an issue](https://github.com/ofri-peretz/burgee/issues) if your CLI needs something
  this list does not cover. That is the cheapest time to say so.

## API

The loop, the plugin host and the built-ins are under [What is here](#what-is-here); every
export, with its types, is on [flagstaff.interlace.tools](https://flagstaff.interlace.tools/docs).

## Where it sits

Plugins register under the `tokens`, `glyphs`, `spinners`, `borders`, `components` keys, against the one schema the whole family shares.

`controlroom` builds on it, and it builds on `closeout`, `linegauge`, `paratext`, `roundel`.

## The family

Ten packages, one repository, one release pipeline. A CLI on burgee declares what it is, roundel
carries its colours, flagstaff flies it and caique answers back; each installs on its own, and none
takes a dependency from outside the family.

| Package | What it is | Replaces |
| :-- | :-- | :-- |
| [burgee](https://burgee.interlace.tools/docs/packages/burgee) | The CLI framework: one declaration, every surface | commander and yargs |
| [roundel](https://roundel.interlace.tools/docs) | Colour: one output policy, semantic tokens, a theme | chalk |
| **flagstaff** (this package) | The frame loop: spinners, progress, boxes and tables | ora, log-update, boxen and cli-table3 |
| [caique](https://caique.interlace.tools/docs) | Prompts that are flags first, and never hang | inquirer and clack |
| [linegauge](https://linegauge.interlace.tools/docs) | Measuring, wrapping, truncating and slicing styled text | string-width, wrap-ansi, strip-ansi and slice-ansi |
| [paratext](https://paratext.interlace.tools/docs) | Hyperlinks, images, title, clipboard and notifications | ansi-escapes, terminal-link and term-img |
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

MIT © Ofri Peretz — see [LICENSE](https://github.com/ofri-peretz/burgee/blob/main/packages/flagstaff/LICENSE).
