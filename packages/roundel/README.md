# roundel

chalk gives you `red`; picocolors gives you `red` for fewer bytes. Neither gives you
`error`, and each decides on its own whether the terminal has colour — which is why a
program's spinner, prompt and help so often disagree. **roundel** is the colours a CLI
carries: one output policy decided once from the runtime, nine semantic tokens over
`util.styleText`, and a theme that changes them all together, contrast-checked before it
flies — plus chalk's API over the same tokens, for the program that is not ready to give
chalk up. Zero dependencies, five subpaths, each costing only itself.

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

Through a pipe with nothing asked, under `NO_COLOR`, or with `--json`, every token returns
its input unchanged. On a terminal it styles, at the level the terminal has — and on a pipe
too when the user said so with `FORCE_COLOR` or `--color`.

## What is here

| Subpath | Gives you |
| :-- | :-- |
| `roundel/policy` | `outputMode(rt, { json })` → `tty \| pipe \| json \| accessible \| ci` and `colorLevel(rt)` → `0 \| 1 \| 2 \| 3`. Pure over `{ env, isTTY: { stdout }, argv? }`; the only place in the package that reads `NO_COLOR`, `FORCE_COLOR`, `TERM`, `COLORTERM`, `CI`, `CLI_ACCESSIBLE`, the CI vendor variables or a `--color` flag. |
| `roundel/tokens` | `error warn ok hint muted command flag value heading` — each `(s: string) => string`, the identity until `fly()` has decided a level above 0. |
| `roundel/theme` | `fly(theme, rt)`. A theme maps tokens to `styleText` format names (`['bold', 'underline']`) or a `#rrggbb`, and declares the `ground` it will be read on. Hex is truecolor at level 3 and falls back to the nearest of 256 or 16 colours below it. |
| `roundel/contrast` | `contrast(a, b)`, `luminance(hex)`, `AA` — the WCAG 2.2 maths `fly()` checks with. |
| `roundel/chalk` | chalk 6's API — `chalk.red.bold(s)`, `chalk.hex('#…')`, `new Chalk({ level })`, `chalkStderr`, `supportsColor`, the name lists — over the tokens' emitter and the policy's level. Graded by chalk's own suite; see below. |

### The policy

First match wins: `json` if the run asked for it; `accessible` if `CLI_ACCESSIBLE`; `ci` if
`CI` and not a TTY; `pipe` if not a TTY; else `tty`. **The mode decides redraws — spinners,
progress, anything that rewrites a line — and never the colour level.**

The level is chalk's, and it obeys the user's explicit instruction in any mode: `NO_COLOR`
wins outright; then the `--color` flags (`--color=256`, `--color=16m`, `--no-color`,
`--color=never`…) when the caller hands the policy its `argv`; then `FORCE_COLOR`, which
names an exact level (`FORCE_COLOR=2` is 2, not "2 or better") or, as `true` or empty, only
turns colour on and lets the environment decide it. `--json` is the one output the level
never enters: structured text carries no escapes.

With no instruction at all the order is supports-color's own, deliberately: **a pipe is
`0`** — a pipe nobody asked to colour is a file or another program's stdin — with Azure
Pipelines (`TF_BUILD` *and* `AGENT_NAME`) the single exception, exactly where chalk puts it.
Once colour *is* being detected, on a terminal or because the run asked, `TERM=dumb` is the
floor, a `CI` run gets its vendor's level (GitHub and Gitea Actions and CircleCI at
truecolor; Travis, AppVeyor, GitLab, Buildkite, Drone and Codeship at 16), and anything else
is what `TERM` and `COLORTERM` report. So `FORCE_COLOR=true` on GitHub Actions gives you
truecolor logs, and nobody else's pipe changes.

One policy, one answer: no two components in a program can reach different conclusions,
which is the whole point (clack #286).

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

## Migrating from chalk

```diff
- import chalk from 'chalk';
+ import chalk from 'roundel/chalk';
```

**Identical.** The chain (`chalk.red.bold.underline(s)`, every modifier, the sixteen
colours and their `Bright` variants, backgrounds, chalk 6's underline styles and colours),
`rgb`/`hex`/`ansi256` and their `bg`/`underline` forms with chalk's own downsampling at
levels 2 and 1, nesting and line-break handling byte for byte, `chalk.level` (get and set,
validated), `new Chalk({ level })`, `chalkStderr`, `supportsColor` / `supportsColorStderr`,
`modifierNames` / `foregroundColorNames` / `backgroundColorNames` / `underlineColorNames` /
`colorNames`, `visible`, `reset`, and `Function.prototype` on every link. ESM with a
`default` condition, so `require('roundel/chalk')` works too.

**Different.**

- **The level is per façade.** `chalk.level = 0` silences `roundel/chalk` and nothing else;
  the tokens and the theme keep reading the policy. chalk's global mutable level is why chalk
  and ora disagree about the same terminal, and it stops at this door.
- **The policy decides colour.** The level is detected once at import through
  `colorLevel()`, reading the same `NO_COLOR`, `FORCE_COLOR`, `--color`, CI-vendor, `TERM`
  and `COLORTERM` rules chalk does — see [The policy](#the-policy). Every other package in
  the family reads the same answer, so `roundel/chalk` and a spinner cannot disagree about
  the terminal the way chalk and ora do.
- **No template literal.** `chalk\`{red x}\`` was removed in chalk 5 and is not resurrected.
- **No emulator allow-list.** chalk's per-terminal-program detection (`TERM_PROGRAM`,
  kitty, ghostty, wezterm, TeamCity, the Windows build number) is not reproduced; a program
  on one of those terminals that wants colour asks for it with `FORCE_COLOR` or `--color`.

**Graded by chalk's own suite**, vendored at 6.0.0 into `compat-oracle` and run unedited
through a generated shim: **58 of 58 tests (100.0%) on 2026-09-08**, alongside the same
suite scoring 58 / 58 against real chalk in the same run.

## Weight

Every subpath is a lock, not a convention. `roundel/tokens` reaches 3,283 bytes on disk
(its ceiling is picocolors, 3.3 KB); `roundel/policy` 1,997; `roundel/theme` 6,296;
`roundel/contrast` 1,250; `roundel/chalk` 9,336 (its ceiling is chalk 6.0.0's own 9,370,
before the ansi-styles and supports-color chalk also ships). Importing one never loads
another — the tokens never carry the theme, the theme never carries the tokens, chalk
carries neither — and `sideEffects: false` lets a bundler drop what a program does not use.
ESM with a `default` condition, so `require('roundel/tokens')` works from CommonJS on
Node ≥ 24.

## What is next

- **`roundel/import`** — `fromBase16(scheme)` and `fromITerm(plist)`: a theme from the two
  largest corpora of terminal palettes, contrast-checked on the way in.

Part of the [burgee](https://github.com/ofri-peretz/burgee) family: a CLI on burgee declares
what it is, roundel carries its colours, flagstaff flies it, caique answers back. Each is
an independent package; none requires the others.
