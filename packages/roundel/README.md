# roundel

chalk gives you `red`; picocolors gives you `red` for fewer bytes. Neither gives you
`error`, and each decides on its own whether the terminal has colour — which is why a
program's spinner, prompt and help so often disagree. **roundel** is the colours a CLI
carries: one output policy decided once from the runtime, nine semantic tokens over
`util.styleText`, and a theme that changes them all together, contrast-checked before it
flies. Zero dependencies, four subpaths, each costing only itself.

A **roundel** is a flag's colours carried onto another surface — the rings on an aircraft's
wing, the London Underground sign. Identity, expressed purely in colour, on something that is
not a flag. That is what this package is for a command-line program: not `red` and `blue`,
but `error`, `hint`, `command` and `flag`, the colours that mean *you*, carried onto the
terminal as a theme.

## Use

```js
import { fly } from 'roundel/theme';
import { command, error, hint } from 'roundel/tokens';

// Once, at startup. The runtime is yours to describe; nothing here reads `process`.
fly({}, { env: process.env, isTTY: { stdout: Boolean(process.stdout.isTTY) } });

console.error(`${error('missing --name')}  ${hint('try')} ${command('greet --name ada')}`);
```

Through a pipe, under `CI`, under `NO_COLOR` or `CLI_ACCESSIBLE`, or with `--json`, every
token returns its input unchanged. On a terminal it styles, at the level the terminal has.

## What is here

| Subpath | Gives you |
| :-- | :-- |
| `roundel/policy` | `outputMode(rt, { json })` → `tty \| pipe \| json \| accessible \| ci` and `colorLevel(rt)` → `0 \| 1 \| 2 \| 3`. Pure over `{ env, isTTY: { stdout } }`; the only place in the package that reads `NO_COLOR`, `FORCE_COLOR`, `TERM`, `COLORTERM`, `CI` or `CLI_ACCESSIBLE`. |
| `roundel/tokens` | `error warn ok hint muted command flag value heading` — each `(s: string) => string`, the identity until `fly()` has decided a level above 0. |
| `roundel/theme` | `fly(theme, rt)`. A theme maps tokens to `styleText` format names (`['bold', 'underline']`) or a `#rrggbb`, and declares the `ground` it will be read on. Hex is truecolor at level 3 and falls back to the nearest of 256 or 16 colours below it. |
| `roundel/contrast` | `contrast(a, b)`, `luminance(hex)`, `AA` — the WCAG 2.2 maths `fly()` checks with. |

### The policy

First match wins: `json` if the run asked for it; `accessible` if `CLI_ACCESSIBLE`; `ci` if
`CI` and not a TTY; `pipe` if not a TTY; else `tty`. The colour level is chalk's — from
`NO_COLOR`, `FORCE_COLOR`, `TERM` and `COLORTERM` — under `tty`, and `0` under every other
mode. `FORCE_COLOR` raises the level on a terminal; it never colours a pipe. A pipe is a
pipe, whatever the env says, so no two components can reach different conclusions.

### The theme

```js
fly(
  {
    ground: '#0a0a0a', // what the hex tokens are checked against; near-black by default
    error: '#f4794a', // truecolor, checked at 4.5:1 against the ground, or fly() throws
    heading: ['bold', 'underline'], // the terminal's own palette — never checked or claimed
  },
  runtime,
);
```

The defaults carry the burgee brand — rock for `error`, juniper for `ok`, each in whichever
of its deep or lifted variants reads better on the declared ground — and format names for
the other seven. A hex token below 4.5:1 is refused at every level, not only on truecolor
terminals, so a theme that would not read fails in CI rather than on one laptop. The 16-
and 256-colour fallbacks are the user's terminal palette and are not checked: a number
there would be invented.

## Weight

Every subpath is a lock, not a convention. `roundel/tokens` reaches 2,198 bytes on disk
(its ceiling is picocolors, 3.3 KB); `roundel/policy` 1,405; `roundel/theme` 5,642;
`roundel/contrast` 1,250. Importing one never loads another — the tokens never carry the
theme, the theme never carries the tokens — and `sideEffects: false` lets a bundler drop
what a program does not use. ESM with a `default` condition, so `require('roundel/tokens')`
works from CommonJS on Node ≥ 22.12.

## What is next

- **`roundel/chalk`** — chalk's chainable API over these tokens, graded by chalk's own test
  suite, so a migration is one import and your tests are unchanged.
- **`roundel/import`** — `fromBase16(scheme)` and `fromITerm(plist)`: a theme from the two
  largest corpora of terminal palettes, contrast-checked on the way in.

Part of the [burgee](https://github.com/ofri-peretz/burgee) family: a CLI on burgee declares
what it is, roundel carries its colours, flagstaff flies it, caique answers back. Each is
an independent package; none requires the others.
