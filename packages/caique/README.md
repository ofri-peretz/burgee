<p align="center">
  <a href="https://github.com/ofri-peretz/burgee/tree/main/packages/caique" target="blank">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/ofri-peretz/burgee/main/brand-assets/caique-lockup.svg" />
      <img src="https://raw.githubusercontent.com/ofri-peretz/burgee/main/brand-assets/caique-lockup-light.svg" alt="caique" width="360" />
    </picture>
  </a>
</p>

<p align="center">
  Prompts that are flags first — so an agent answers before it is asked, and nothing ever hangs.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/caique"><img src="https://img.shields.io/npm/v/caique?style=flat-square&color=0a6b47" alt="caique on npm: the latest version" /></a>
  <a href="https://www.npmjs.com/package/caique"><img src="https://img.shields.io/npm/dm/caique?style=flat-square" alt="caique downloads per month on npm" /></a>
  <a href="https://github.com/ofri-peretz/burgee/actions/workflows/quality.yml?query=branch%3Amain"><img src="https://img.shields.io/github/actions/workflow/status/ofri-peretz/burgee/quality.yml?branch=main&style=flat-square&label=Quality%20Gate" alt="Quality Gate: the CI status of main" /></a>
  <a href="https://app.codecov.io/gh/ofri-peretz/burgee/components"><img src="https://img.shields.io/codecov/c/github/ofri-peretz/burgee/main?component=caique&style=flat-square" alt="caique line coverage: its Codecov component" /></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/ofri-peretz/burgee"><img src="https://img.shields.io/ossf-scorecard/github.com/ofri-peretz/burgee?style=flat-square&label=OpenSSF%20Scorecard" alt="OpenSSF Scorecard for the repository" /></a>
  <a href="https://www.npmjs.com/package/caique?activeTab=code"><img src="https://img.shields.io/npm/unpacked-size/caique?style=flat-square" alt="Unpacked size of the latest caique release on npm" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/caique/package.json"><img src="https://img.shields.io/badge/dependencies-4%20in%20family%2C%200%20outside-0a6b47?style=flat-square" alt="Four dependencies, all in the burgee family (closeout, linegauge, paratext, roundel), none outside it" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/caique/package.json"><img src="https://img.shields.io/badge/types-included-blue?style=flat-square" alt="TypeScript types included for every entry point" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/caique/package.json"><img src="https://img.shields.io/badge/Node.js-20.19%2B%20%7C%2022.13%2B-green?style=flat-square" alt="Node.js 20.19+ or 22.13+" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/caique/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License: MIT" /></a>
  <a href="https://www.npmjs.com/package/caique#provenance"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fregistry.npmjs.org%2Fcaique%2Flatest&query=%24.dist.attestations.provenance~&label=npm&style=flat-square&color=0a6b47" alt="npm provenance of the latest release, read live from its registry attestation" /></a>
</p>

<p align="center">
  <a href="https://burgee.interlace.tools/docs/compatibility"><img src="https://img.shields.io/badge/%40clack%2Fprompts%20suite-16%2F16-0a6b47?style=flat-square" alt="caique/clack passes 16 of 16 cases of the @clack/prompts test suite" /></a>
  <a href="https://burgee.interlace.tools/docs/compatibility"><img src="https://img.shields.io/badge/%40inquirer%2Fcore%20suite-41%2F41-0a6b47?style=flat-square" alt="caique/inquirer passes 41 of 41 cases of the @inquirer/core test suite" /></a>
</p>

<p align="center">
  Docs: <a href="https://caique.interlace.tools">https://caique.interlace.tools</a><br />
  Migrating from: <a href="https://caique.interlace.tools/docs/coming-from/inquirer">inquirer</a> · <a href="https://caique.interlace.tools/docs/coming-from/clack">clack</a>
</p>

**1.0.** `decide()`, `ask()` and the `caique/inquirer` and `caique/clack` drop-in paths are a
semver contract, each path graded by its incumbent's own suite on the
[compatibility page](https://burgee.interlace.tools/docs/compatibility), level with the incumbent
at its latest release (D-20261007-caique-controlroom-1-0-evidence).

A **caique** (kah-EEK) is a small, loud, never-silent parrot — and this one always answers
back. It is also the light wooden boat of the Bosphorus and the Greek islands, the one that
runs between the ship and the shore carrying people and messages across the gap. Both are
true of this package: it is the go-between that carries a question from a program to whoever
is calling, human or agent, and brings the answer back. **It never hangs.**

## Install

```bash
npm install caique
pnpm add caique
yarn add caique
bun add caique
```

## Quick start

`decide()` — the rule that decides whether a person can be asked at all, and the reason
this package can promise it never hangs. It is pure: a value, a runtime slice and the run's
flags in, a verdict out.

```js
import { decide } from 'caique/decide';
import { processRuntime } from 'caique';

decide({
  value: undefined,                                  // nothing was passed
  spec: { kind: 'text', message: 'Where should it go?' },
  option: 'output-dir',
  runtime: processRuntime(),                         // or your own { env, isTTY: { stdin } }
  required: true,
});
// no terminal -> { action: 'error', code: 'USAGE',
//                  message: '--output-dir is required when there is no terminal',
//                  fix: 'pass --output-dir; it would have been asked as "Where should it go?"' }
// a terminal   -> { action: 'prompt' }
```

The order of the rule is the argument, and it is enumerated rather than described: every
one of the 256 combinations of value x kind x TTY x CI x `--json` x `--yes` x
`--interactive` x required is generated and checked in `decide.test.ts`, against the rule
written a second time, independently. The case that would be a bug report if it broke is
called out by name: **no terminal and no value is never a prompt.**

`--interactive` reaches past "we would not have asked", never past "there is nobody to
ask" — and when there is nobody, the refusal says so, rather than looking like the flag was
ignored.

## What ships today

### Asking, once it is allowed

`ask()` is the six kinds — `text`, `confirm`, `select`, `multiselect`, `password`, `path` —
each written as a question and a line read back:

```js
import { ask } from 'caique/ask';

await ask(
  { kind: 'select', message: 'Which host?', choices: [{ value: 'ora' }, { value: 'log-update' }] },
  { reader, writer },
);
// Which host?
//   1) ora
//   2) log-update
//   enter a number (1-2):
```

**Line mode is not the fallback, it is the floor.** No raw mode, no cursor movement, no
escape sequence, no redraw — so this *is* the accessible rendering rather than a second
implementation of it, and a screen reader gets the same bytes a terminal does. The raw-mode
renderer that arrows and highlights will sit on top and answer the same questions.

A stream that ends is a **cancellation**, not an empty answer: `Ctrl-D` and a closed pipe
both mean nobody is going to type, and reading that as `''` is how a program writes to a
path nobody chose. Invalid input is re-asked five times and then gives up, because a loop
against a stream that keeps answering wrongly is the same hang wearing a hat.

`projection(spec)` gives the question without the conversation, for a gallery, a `--help`
or a transcript in an issue.

### Wiring it to a CLI

`resolvePrompts()` is the pass a framework calls from its `preAction` hook, once the flags,
environment and config have had their turn:

```js
import { resolvePrompts } from 'caique/binding';

const { values, failure } = await resolvePrompts({
  options,            // { name: { required: true, prompt: { kind: 'text', message: 'Project name?' } } }
  values,             // what every other source resolved
  runtime: processRuntime(),
  flags: { json, yes, interactive },
  io: { reader, writer },
});
if (failure) throw new CliError(failure.code, failure.message, { fix: failure.fix });
```

It walks the options in **declaration order** — the order the help listed — asks only what
has to be asked, and **stops at the first refusal**, because a caller about to exit is
better served by one actionable message than six.

There is one binding, not one per host. What a framework supplies is a record of options,
the values so far and a runtime; none of that needs any particular framework's types, so
`caique` imports none of them.

### On a real terminal

`createIo()` is the reader and writer over actual streams — the only file in the package
that touches a terminal:

```js
import { createIo } from 'caique/terminal';
import { ask } from 'caique/ask';

const io = createIo();   // the terminal the program was started in
await ask({ kind: 'password', message: 'Token?' }, io);
io.close();
```

A `password` prompt is not echoed, and that lives here rather than in the widgets: this is
the only layer that knows what echo *is*, and no widget can leak a secret by writing it
back, because no widget writes what it read. The echo is suppressed for the duration of the
question rather than by turning the terminal's echo off — which would leave it off if the
process died mid-prompt.

### Arrow keys, where there is a terminal to take them

`askList()` draws `select` and `multiselect` with a moving highlight and repaints in place.
It answers the same question `ask()` does and returns the same value, so it is a swap and
not a second implementation:

```js
import { askList, canRender } from 'caique/raw';
import { createIo, streamsOf } from 'caique/terminal';
import { processRuntime } from 'caique';

const rt = processRuntime();
const io = { ...createIo(streamsOf(rt)), keys: rt.stdin };
const spec = { kind: 'select', message: 'Which host?', choices: [{ value: 'ora' }, { value: 'chalk' }] };
const answer = canRender(io.keys) ? await askList(spec, io) : await ask(spec, io);
```

Line mode is the floor, not the fallback: this is decoration on top of it, and the suite
proves the two agree by running the same spec through both and comparing the answers.
`Ctrl-C` cancels — in raw mode it arrives as a byte rather than a signal — and the terminal
is put back the way it was found either way.

### A prompt kind of your own

A plugin adds a kind under `widgets`; the six built-ins cannot be replaced. It is one module
whose default export is a plain object — in full:

```js
// acme-plugin.mjs
export default {
  name: 'acme',
  contract: 1,
  widgets: {
    'acme-rating': {
      // Required. `spec` is the prompt — `{ kind, message, ... }` plus any field your kind reads —
      // and the string is what a pipe, an agent and a screen reader get.
      static: (spec) => `${spec.message} ${'★'.repeat(spec.value ?? 0)}${'☆'.repeat(5 - (spec.value ?? 0))}`,
      // Optional: `(t, spec) => string`, the animated form. Leave it out for line mode only.
      // frame: (t, spec) => '…',
      // Two states of plain data to preview it with; `check` renders `static({ kind, message: 'preview', ...done })`.
      sample: { running: { value: 0 }, done: { value: 4 } },
    },
  },
};
```

Check it before it ships — in a clone of this repository, where `dist/` is not committed, build
caique and the four packages it imports first:

```bash
npx caique check ./acme-plugin.mjs
# in a clone: npx turbo run build --filter=caique && node packages/caique/dist/cli.js check ./acme-plugin.mjs
```

```text
acme — 1 widgets
  acme-rating  static "preview ★★★★☆"
acme: ok
```

The census comes first and `ok` last. A refusal exits 1 with a code and the edit to make —
`E_NO_STATIC_PROJECTION` for a widget with no `static`, or one whose `static` throws on its own
`sample`, `E_PLUGIN_SCHEMA` for a built-in kind or
a `sample` that is not `{ running, done }`.

## Migrating

From **`@inquirer/core`**, one import — `createPrompt`, the hooks and the keypress helpers:

```diff
- import { createPrompt, useState, useKeypress, isEnterKey } from '@inquirer/core';
+ import { createPrompt, useState, useKeypress, isEnterKey } from 'caique/inquirer';
```

`npx burgee migrate --dry-run` lists the imports the codemod would rewrite — only drop-ins graded
level with their incumbent — and `npx burgee migrate` makes the change
([Migrate](https://burgee.interlace.tools/docs/migrate)).

From **`@clack/prompts`** there is no one-import swap: caique takes a prompt as a spec rather
than clack's call signature and does not draw clack's frames, so a CLI moves one prompt at a
time. [Coming from clack](https://caique.interlace.tools/docs/coming-from/clack) maps each clack
export to its caique counterpart, or says there is none.

## Compatibility

Measured against **`@inquirer/prompts`** (28.8 M/wk) and **`@clack/prompts`** — those two, and
not the package whose download count is larger:

- **`inquirer` (34.3 M/wk) is out of scope, deliberately.** Its 34 million are the *legacy*
  `inquirer.prompt([...])` façade, an API its own maintainer moved off; a new CLI written
  today writes `@inquirer/prompts`. Reproducing the legacy object API would be work spent
  on a shape nobody new adopts, and it is not on this package's roadmap.
- **`@inquirer/core`** is what the compatibility oracle grades, because it is where the
  prompt *loop* — the keypress state machine both façades sit on — is actually tested.
  `inquirer`'s own npm tarball ships **no tests at all**, so there is nothing there to grade.

Each is graded by its own unedited suite through `compat-oracle`, run twice: once against the
incumbent (the control — the column that proves the gate works) and once against caique.
`caique/inquirer` is a drop-in for `@inquirer/core`. `caique/clack` is narrower on purpose: it
carries `limitOptions`, the one clack function that is not a drawing, and its row grades the
behavioural remainder of clack's suite as a declared subset. The current grades are generated
under *Benchmarks* below and published on the
[compatibility page](https://burgee.interlace.tools/docs/compatibility).

## Weight

Every subpath is a lock, not a convention: `weight.test.ts` walks each entry's import graph in
`dist/` and asserts its budget and what it may reach, and the figures below are what it
measured. **The ceiling is clack**: `@clack/prompts`
1.8.0 is **101,684 B across six packages** — itself, `@clack/core`, `fast-string-width`,
`fast-string-truncated-width`, `fast-wrap-ansi` and `sisteransi`.

| Subpath | Bytes | Reaches |
| :-- | --: | :-- |
| `caique` (everything but the façades) | 19,549 | `closeout/cursor` and `closeout/exit-hook` — never a façade |
| `caique/spec` | 739 | a leaf — declare prompts without loading a widget |
| `caique/decide` | 2,133 | the spec only |
| `caique/ask` | 4,234 | the six widgets, no terminal, no raw mode |
| `caique/raw` | 8,896 | line mode, which it sits on top of, the key decoder, and `closeout` for the cursor |
| `caique/keys` | 4,991 | `closeout` for raw mode, and nothing else in caique |
| `caique/editor` | 12,389 | the key decoder and the line editing `caique/clack` shares; no I/O |
| `caique/binding` | 8,123 | the decision and the widgets |
| `caique/terminal` | 1,947 | the one file that touches a stream |
| `caique/plugin` | 9,788 | the widgets, and the family schema |
| `caique/clack` | 62,097 | `closeout/cursor`, `closeout/exit-hook` and `linegauge/wrap` |
| `caique/inquirer` | 20,623 | `closeout/cursor`, `closeout/exit-hook` and `linegauge/wrap` |

The root entry is **under a fifth of the lightest incumbent**, and nothing reaches outside this
repository: every `allow` list in `weight.test.ts` names only `closeout` and `linegauge`
subpaths, asserted rather than claimed. Deciding *not* to ask costs 2,133 B and never loads
the machinery of asking — which is the case an agent hits. The two façades are leaves away
from the rest: a program on caique's own API never loads a byte of either.

Measured 2026-09-20 (the root, `caique/raw`, `caique/keys`, `caique/editor` and `caique/clack` on 2026-10-05), the same way every bill in this family is: shipped code and data
(`.js`/`.mjs`/`.cjs` plus imported `.json`, `package.json` never counted), each competitor
counted whole across its own resolved tree.

caique depends on two packages, both from this repository: `closeout`, because a prompt
hides the cursor and owes it back however the process dies, and there is exactly one correct
implementation of that; and `linegauge/wrap`, because the two façades' lists wrap and re-draw, and need the
incumbent's own line-breaking — which this repository publishes as a graded port. Nothing
outside this repository is installed.

The two drop-in subpaths are priced on their own, because a program that imports caique
never loads either. **`caique/clack`** — clack's twelve prompts, its writers, glyphs and
settings — is **62,238 B** against clack's 101,684 B (measured 2026-09-27, budget 64,000 in
`weight.test.ts`); `caique/inquirer` is priced beside it.

## Benchmarks

Every number here is produced by `npm run bench` and published at [burgee.interlace.tools/docs/benchmarks](https://burgee.interlace.tools/docs/benchmarks).

Graded by the incumbent's own test suite:

| suite | passing |
| :-- | --: |
| `clack` | 16 / 16 |
| `inquirer-core` | 41 / 41 |

Weight, installed and tree-inclusive: **243,299 bytes** against **389,049** for the incumbents it replaces — a ratio of **0.6254**.

## For agents

- **No terminal and no value is never a prompt.** `decide()` returns
  `{ action: 'error', code: 'USAGE', message, fix }` naming the flag that would have answered the
  question, so an agent passes it and retries — exit 2, never a hang.
- **Every prompt is a flag first.** A caller who passes the flag is never asked; `--yes` accepts
  every confirmation; `--interactive` asks for every missing required option in one pass.
- **The question without the conversation.** `projection(spec)` renders a prompt for a gallery,
  a `--help` or a transcript.
- **A widget plugin can be checked before it ships.** `npx caique check ./widget.mjs` validates
  it against the family schema and exits 0, 1 with a code and a fix, or 2 on a usage error. The
  whole plugin and the report are under [A prompt kind of your own](#a-prompt-kind-of-your-own).
- **The docs are machine-readable** at
  [caique.interlace.tools/llms.txt](https://caique.interlace.tools/llms.txt) and
  [llms-full.txt](https://caique.interlace.tools/llms-full.txt).

## What it will be

- **Every prompt is a flag first.** A caller who passes the flag is never asked. An agent
  answers before the question, on the command line, in one pass.
- **Non-TTY never hangs.** No human on deck means an error that names the flag, exit 2, with
  a fix a machine can apply and retry.
- **`--interactive`** asks for every missing required option in one pass; **`--yes`** accepts
  every confirmation; cancellation exits `CANCELLED` and restores the terminal.
- **Accessible mode** falls back to line input with no live redraw.
- **A migration path from `@inquirer/prompts` and `@clack/prompts`**, graded by their own
  suites. The current grade is generated under *Benchmarks*, below.

## Following along

The intent and design are committed before the code is, so you can read what it will be —
and argue with it — before it exists:

- [`.sdlc/intents/caique/`](https://github.com/ofri-peretz/burgee/tree/main/.sdlc/intents/caique)
  — the intent and the design.
- [Open an issue](https://github.com/ofri-peretz/burgee/issues) if a prompt in your CLI
  cannot be expressed as a flag. That case is the interesting one.

## API

`decide`, `ask`, `askList`, `resolvePrompts`, `createIo` and `projection` are shown above, each
on its own subpath (see [Weight](#weight)); every export, with its types, is on
[caique.interlace.tools](https://caique.interlace.tools/docs).

## Where it sits

Plugins register under the `widgets` key, against the one schema the whole family shares.

`controlroom` builds on it, and it builds on `closeout`, `linegauge`, `paratext`, `roundel`.

## The family

Ten packages, one repository, one release pipeline. A CLI on burgee declares what it is, roundel
carries its colours, flagstaff flies it and caique answers back; each installs on its own, and none
takes a dependency from outside the family.

| Package | What it is | Replaces |
| :-- | :-- | :-- |
| [burgee](https://burgee.interlace.tools/docs/packages/burgee) | The CLI framework: one declaration, every surface | commander and yargs |
| [roundel](https://roundel.interlace.tools/docs) | Colour: one output policy, semantic tokens, a theme | chalk |
| [flagstaff](https://flagstaff.interlace.tools/docs) | The frame loop: spinners, progress, boxes and tables | ora, log-update, boxen and cli-table3 |
| **caique** (this package) | Prompts that are flags first, and never hang | inquirer and clack |
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

MIT © Ofri Peretz — see [LICENSE](https://github.com/ofri-peretz/burgee/blob/main/packages/caique/LICENSE).
