---
title: roundel
description: "The colours a CLI carries. One output policy, semantic tokens, a theme, and a chalk migration path lighter than chalk. Zero dependencies."
---

chalk gives you `red`; picocolors gives you `red` for fewer bytes. Neither gives you
`error`, and each decides on its own whether the terminal has colour — which is why a
program's spinner, prompt and help so often disagree. **roundel** is the colours a CLI
carries: one output policy decided once from the runtime, nine semantic tokens over
`util.styleText`, and a theme that changes them all together, contrast-checked before it
flies — plus chalk's API over the same tokens, for the program that is not ready to give
chalk up. Zero dependencies, five subpaths, each costing only itself.

For an agent, the policy is the point: under `--json`, `NO_COLOR` or a pipe nobody asked to
colour, every token returns its input unchanged, so captured output never carries an escape.

A **roundel** is a flag's colours carried onto another surface — the rings on an aircraft's
wing, the London Underground sign. Identity, expressed purely in colour, on something that is
not a flag. That is what this package is for a command-line program: not `red` and `blue`,
but `error`, `hint`, `command` and `flag`, the colours that mean *you*, carried onto the
terminal as a theme.

## Install

```bash
npm install roundel
pnpm add roundel
yarn add roundel
bun add roundel
```

## Quick start

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
| `roundel/policy` | `outputMode(rt, { json })` → `tty \| pipe \| json \| accessible \| ci` and `colorLevel(rt)` → `0 \| 1 \| 2 \| 3`. Pure over `{ env, isTTY: { stdout }, argv? }`; the only place in the package that reads `NO_COLOR`, `FORCE_COLOR`, `COLORTERM`, `CLI_ACCESSIBLE`, the CI vendor variables or a `--color` flag. |
| `roundel/tokens` | `error warn ok hint muted command flag value heading` — each `(s: string) => string`, the identity until `fly()` has decided a level above 0. |
| `roundel/plugin` | `register(plugin)`, `theme()`, `contributions()`. A plugin is the family's one plain object; roundel keeps its `tokens` and ignores every key it does not understand, so the same object works on any subset of the family that is installed. |
| `roundel/theme` | `fly(theme, rt)`. A theme maps tokens to `styleText` format names (`['bold', 'underline']`) or a `#rrggbb`, and declares the `ground` it will be read on. Hex is truecolor at level 3 and falls back to the nearest of 256 or 16 colours below it. |
| `roundel/contrast` | `contrast(a, b)`, `luminance(hex)`, `AA` — the WCAG 2.2 maths `fly()` checks with. |
| `roundel/terminal` | `interactive(rt)` — whether anybody is there to type: a terminal on stdin, no `CI` and no agent variable (`CLAUDECODE`, `AI_AGENT`, `CURSOR_AGENT`, `CODEX_THREAD_ID`, `GEMINI_CLI`), with `FORCE_TTY=1` as the override — and `unicode(rt)`, is-unicode-supported's answer over `{ env, platform }`. Not re-exported from `roundel`. |
| `roundel/import` | `fromBase16(scheme)` and `fromITerm(plist)` — a theme from a Base16 scheme (its YAML or JSON text, or the object a reader made of it) or an iTerm2 `.itermcolors` file, contrast-checked on the way in by `fly()`'s own check. Data in, data out: you read the file. Not re-exported from `roundel`. |
| `roundel/chalk` | chalk 6's API — `chalk.red.bold(s)`, `chalk.hex('#…')`, `new Chalk({ level })`, `chalkStderr`, `supportsColor`, the name lists — over the tokens' emitter and the policy's level. Graded by chalk's own suite; see below. |

### The policy

First match wins: `json` if the run asked for it; `accessible` if `CLI_ACCESSIBLE`; `ci` if
`CI` and not a TTY; `pipe` if not a TTY; else `tty`. **The mode decides redraws — spinners,
progress, anything that rewrites a line — and never the colour level.**

The level is chalk's, and it obeys the user's explicit instruction in any mode: `NO_COLOR`
wins outright; then `FORCE_COLOR=0`, which supports-color settles before it reads any flag,
so **an explicit "colour off" is never overridden into colour on** — `FORCE_COLOR=0` with
`--color=256` is 0, not 2; then the `--color` flags (`--color=256`, `--color=16m`,
`--no-color`, `--no-colors`, `--color=never`… both spellings, as has-flag has them) when the
caller hands the policy its `argv`; then `FORCE_COLOR`, which names an exact level
(`FORCE_COLOR=2` is 2, not "2 or better") or, as `true` or empty, only turns colour on and
lets the environment decide it. `--json` is the one output the level never enters:
structured text carries no escapes.

With no instruction at all the order is supports-color's own, deliberately: **a pipe is
`0`** — a pipe nobody asked to colour is a file or another program's stdin — and
**accessible mode is `0` too**, because `CLI_ACCESSIBLE` is itself an instruction from a
human and ANSI colour is noise to a screen reader; an explicit ask still colours either of
them. Azure Pipelines (`TF_BUILD` *and* `AGENT_NAME`) is the single exception on a pipe,
exactly where chalk puts it.
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

### Importing a theme

```js
import { readFileSync } from 'node:fs';
import { fromBase16, fromITerm } from 'roundel/import';
import { fly } from 'roundel/theme';

fly(fromBase16(readFileSync('gruvbox-dark-hard.yaml', 'utf8')), runtime);
fly(fromITerm(readFileSync('Dracula.itermcolors', 'utf8')), runtime);
```

The two largest corpora of terminal palettes, read into the theme `fly()` takes. Each token
takes the colour its default names, from the ANSI slot both formats already agree on: `error`
red, `warn` yellow, `ok` green, `flag` cyan, `value` magenta, and `ground` the background
(Base16 `base08`, `base0A`, `base0B`, `base0C`, `base0E`, `base00`; iTerm `Ansi 1`, `3`, `2`,
`6`, `5`, `Background Color` — exported as `BASE16_SLOTS` and `ITERM_SLOTS`). `hint`,
`command` and `heading` keep their attributes and `muted` keeps the terminal's grey: a
scheme's comment grey is built to recede, 2.50:1 in Default Dark.

The result is checked before it is returned, by `audit()` — so whatever an importer returns,
`fly()` accepts. A scheme that does not read is refused with an `ImportError` naming the slot:
Tomorrow Night's red is `roundel/import: below 4.5:1 (WCAG AA) — error (base08) #cc6666 on
#1d1f21, 4.46:1`. Every refusal carries a `code` — `E_IMPORT_FORMAT`, `E_IMPORT_SLOT` or
`E_IMPORT_CONTRAST` — and a `fix`. Pass `{ conformance: 'AAA' }` to check at 7:1. No network
and no bundled corpus: the file is yours to supply.

## Migrating

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

Or let the codemod make the change: `npx burgee migrate --dry-run` lists every import it would
rewrite — only drop-ins graded level with their incumbent — and `npx burgee migrate` makes it.
See [Migrate](https://burgee.interlace.tools/docs/migrate).

## Compatibility

**Graded by chalk's own suite**, vendored at 6.0.1 into `compat-oracle` and run unedited
through a generated shim: **59 of 59 tests (100.0%) on 2026-09-30**, alongside the same
suite scoring 59 / 59 against real chalk in the same run.

The grade is re-run on every change to `roundel/chalk`; the current figure is generated under
*Benchmarks* below and published with every other drop-in on the
[compatibility page](https://burgee.interlace.tools/docs/compatibility).

## Weight

Every subpath is a lock, not a convention. `roundel/tokens` reaches 3,258 bytes on disk
(its ceiling is picocolors, 3.3 KB); `roundel/policy` 1,972; `roundel/theme` 6,271;
`roundel/plugin` 2,812 and reaching no module at all;
`roundel/contrast` 1,250; `roundel/terminal` 878 and reaching no module; `roundel/import`
16,415, most of it the theme and contrast check it runs; `roundel/chalk` 9,311 (its ceiling is
chalk 6.0.0's own 9,370 — 6.0.1 is 9,521 — before the ansi-styles and supports-color chalk
also ships). Importing one never loads
another — the tokens never carry the theme, the theme never carries the tokens, chalk
carries neither — and `sideEffects: false` lets a bundler drop what a program does not use.
ESM with a `default` condition, so `require('roundel/tokens')` works from CommonJS on
Node 20.19+ and 22.13+.

## Benchmarks

Every number here is produced by `npm run bench` and published at [burgee.interlace.tools/docs/benchmarks](https://burgee.interlace.tools/docs/benchmarks).

Graded by the incumbent's own test suite:

| suite | passing |
| :-- | --: |
| `chalk` | 59 / 59 |

## For agents

- **Captured output is plain.** `outputMode(rt, { json })` answers `json` under `--json`, and
  under `NO_COLOR` or on a pipe nobody asked to colour the level is 0 — every token returns
  its input unchanged, so a transcript an agent reads back never carries an escape.
- **The decision is a function, not a side effect.** `roundel/policy` is pure over
  `{ env, isTTY, argv }`, so a harness can ask the question the program asked and get the same
  answer.
- **A theme plugin can be checked before it ships.** `npx roundel check ./theme.mjs` validates
  a plugin against the family schema, prints what it contributes, and exits 0, 1 with a code
  and a fix, or 2 on a usage error.
- **The docs are machine-readable** at
  [roundel.interlace.tools/llms.txt](https://roundel.interlace.tools/llms.txt) and
  [llms-full.txt](https://roundel.interlace.tools/llms-full.txt).

## API

The subpaths are listed under [What is here](#what-is-here); every export, with its types, is
on [roundel.interlace.tools](https://roundel.interlace.tools/docs).

## Where it sits

Plugins register under the `tokens` key, against the one schema the whole family shares.

`burgee`, `caique`, `flagstaff` build on it, and it builds on nothing in this family.

## The family

Ten packages, one repository, one release pipeline. A CLI on burgee declares what it is, roundel
carries its colours, flagstaff flies it and caique answers back; each installs on its own, and none
takes a dependency from outside the family.

| Package | What it is | Replaces |
| :-- | :-- | :-- |
| [burgee](https://burgee.interlace.tools/docs/packages/burgee) | The CLI framework: one declaration, every surface | commander and yargs |
| **roundel** (this package) | Colour: one output policy, semantic tokens, a theme | chalk |
| [flagstaff](https://flagstaff.interlace.tools/docs) | The frame loop: spinners, progress, boxes and tables | ora, log-update, boxen and cli-table3 |
| [caique](https://caique.interlace.tools/docs) | Prompts that are flags first, and never hang | inquirer and clack |
| [linegauge](https://linegauge.interlace.tools/docs) | Measuring, wrapping, truncating and slicing styled text | string-width, wrap-ansi, strip-ansi and slice-ansi |
| [paratext](https://paratext.interlace.tools/docs) | Hyperlinks, images, title, clipboard and notifications | ansi-escapes, terminal-link and term-img |
| [seniority](https://seniority.interlace.tools/docs) | Configuration precedence and discovery, with provenance | cosmiconfig, dotenv and rc |
| [closeout](https://closeout.interlace.tools/docs) | Exit handlers, terminal restore and a bounded shutdown | signal-exit, exit-hook and restore-cursor |
| [bellpull](https://bellpull.interlace.tools/docs) | Subprocesses, and which executable actually ran | cross-spawn and which |
| [controlroom](https://burgee.interlace.tools/docs/packages/controlroom) | Reserved, not usable yet — planned: full-screen, keyboard-driven terminal screens | ink, planned |

Every migration guide, and the family-wide [compatibility](https://burgee.interlace.tools/docs/compatibility)
and [benchmarks](https://burgee.interlace.tools/docs/benchmarks) pages, are on
[burgee.interlace.tools](https://burgee.interlace.tools/docs/packages).

## Contributing

Issues and pull requests are welcome at [ofri-peretz/burgee](https://github.com/ofri-peretz/burgee/issues); read
[CONTRIBUTING.md](https://github.com/ofri-peretz/burgee/blob/main/CONTRIBUTING.md) first. Report a vulnerability privately, as
[SECURITY.md](https://github.com/ofri-peretz/burgee/blob/main/SECURITY.md) describes — never in a public issue.

## Licence

MIT © Ofri Peretz — see [LICENSE](https://github.com/ofri-peretz/burgee/blob/main/packages/roundel/LICENSE).
