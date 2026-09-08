# flagstaff

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

What changes is the bill. ora ships 112.7 KB of JavaScript across **seventeen packages** —
ora, chalk, cli-spinners, string-width, log-symbols, cli-cursor, restore-cursor, onetime,
mimic-function, signal-exit, is-interactive, is-unicode-supported, stdin-discarder,
yoctocolors, strip-ansi, ansi-regex, get-east-asian-width. `flagstaff/ora` is 63.6 KB
across **two** — itself and roundel — and 20.3 KB of that is the spinner corpus ora's API
re-exports. Nothing in it reaches the frame loop, so a program that migrates its spinner
today can adopt `hoist()` a file at a time, or never.

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

log-update ships 113.4 KB across **sixteen** packages. This is 28.7 KB across **none** —
the subpath reaches no package at all, not even roundel.
It carries no port of `slice-ansi` — the wrapper already makes every row self-contained,
so clipping a frame to the terminal's height is an array slice.

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

## Weight

Every subpath is a lock, not a convention, and the numbers below are asserted by
`weight.test.ts` against `dist/`, not estimated: `flagstaff/loop` reaches 4.4 KB on disk and
never the plugin registry; `flagstaff/plugin` 8.4 KB, of which 2.4 KB is the schema;
`flagstaff/spinner` 10.1 KB; `flagstaff/ora` 45.5 KB — 63.6 KB with roundel counted, against
ora's own 112.7 KB; `flagstaff/log-update` 28.7 KB, reaching no package at all, against log-update's own
113.4 KB across sixteen. Neither façade reaches the other, and neither reaches the core. `sideEffects: false` lets a
bundler drop what a program does not use. ESM with a `default` condition, so
`require('flagstaff/spinner')` works from CommonJS on Node ≥ 24.

## What is next

- **Drop-in paths** for boxen and cli-table3, graded by their own suites through
  `compat-oracle` the way ora and log-update already are.

Part of the [burgee](https://github.com/ofri-peretz/burgee) family: a CLI on burgee declares
what it is, roundel carries its colours, flagstaff flies it, caique answers back. Each is
an independent package; none requires the others.
