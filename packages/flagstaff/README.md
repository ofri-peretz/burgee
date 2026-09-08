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

Keys: `spinners`, `glyphs` (`ok`, `fail`, `warn`, `info`, `running` — change them and
every built-in that draws one changes), `tokens` (a roundel theme), `components`. A spinner
or component without a `static` is refused at `register()` with `E_NO_STATIC_PROJECTION`
and a fix. The built-in `dots` and `line` styles are a plugin of exactly this shape,
registered through the same door, so the built-ins cannot grow an API a plugin cannot reach.

### `flagstaff check`

```bash
npx flagstaff check ./nyan.mjs
```

Loads the file, validates it, and prints every contribution in all five modes side by side —
escapes made visible — so an author, or an agent that just wrote one, sees the static
projection next to the animation before anything ships. Exit 1 on a refusal, with the code
and the fix.

## Weight

Every subpath is a lock, not a convention: `flagstaff/loop` reaches 4.4 KB on disk and never
the plugin registry; `flagstaff/plugin` 9.1 KB, of which 3.1 KB is the schema; `flagstaff/spinner`
10.1 KB (its ceiling is ora, recorded when ora's suite is vendored). `sideEffects: false` lets
a bundler drop what a program does not use. ESM with a `default` condition, so
`require('flagstaff/spinner')` works from CommonJS on Node ≥ 24.

## What is next

- **`progress`, `tasks`, `box`, `table`** — the remaining built-ins, each a component in the
  same shape.
- **Drop-in paths** for ora, log-update, boxen and cli-table3, graded by their own suites
  through `compat-oracle`, so "ora-compatible" is a scoreboard row.
- **`flagstaff/import`** — `fromCliSpinners(json)` and `fromCliBoxes(json)`: the two existing
  corpora as registered plugins.

Part of the [burgee](https://github.com/ofri-peretz/burgee) family: a CLI on burgee declares
what it is, roundel carries its colours, flagstaff flies it, caique answers back. Each is
an independent package; none requires the others.
