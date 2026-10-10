---
title: caique
description: "Prompts that are flags first: an agent passes the answer up front, and a non-TTY caller gets an error naming the flag, never a prompt that waits. No dependency outside the burgee family. Drop-in paths for @inquirer/core and @clack/prompts."
---

**caique** asks a question only when someone can answer it. Every prompt is a flag first, so
an agent passes the answer before it is asked, and a non-TTY caller gets an error naming the
flag instead of a prompt that waits. **It never hangs.**

Drop-in for **@inquirer/core** and **@clack/prompts**: `npx burgee migrate` moves the imports
to `caique/inquirer` and `caique/clack`, each graded by its incumbent's own suite.

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

## What it does

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
renderer, with arrow keys and a highlight, sits on top of it and answers the same questions
([below](#arrow-keys-where-there-is-a-terminal-to-take-them)).

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

Weight, installed and tree-inclusive: **244,777 bytes** against **389,049** for the incumbents it replaces — a ratio of **0.6292**.

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

## Guarantees

- **Every prompt is a flag first.** A caller who passes the flag is never asked, so an agent
  answers on the command line, in one pass.
- **Off a terminal, nothing waits.** With nobody to answer, a missing value is a `USAGE`
  error, exit 2, that names the flag and carries a `fix` a program can apply and retry.
- **`--interactive`** asks for every missing required option in one pass, and
  `--interactive=all` for every promptable one; **`--yes`** answers every confirmation; a
  cancelled prompt exits `CANCELLED` with the terminal restored.
- **Line mode is the accessible mode:** numbered choices and line input, with no live redraw.
- **Drop-in paths for `@inquirer/core` and `@clack/prompts`**, each graded by its own suite.
  The current grades are under *Compatibility* and *Benchmarks*, above.

## Design documents

The intent and the design are committed beside the code, with the status of every
requirement: [`.sdlc/intents/caique/`](https://github.com/ofri-peretz/burgee/tree/main/.sdlc/intents/caique).
If a prompt in your CLI cannot be expressed as a flag,
[open an issue](https://github.com/ofri-peretz/burgee/issues): that case shapes the design.

## API

`decide`, `ask`, `askList`, `resolvePrompts`, `createIo` and `projection` are shown above, each
on its own subpath (see [Weight](#weight)); every export, with its types, is on
[caique.interlace.tools](https://caique.interlace.tools/docs).

## Where it sits

Plugins register under the `widgets` key, against the one schema the whole family shares.

`controlroom` builds on it, and it builds on `closeout`, `linegauge`, `paratext`, `roundel`.

## The family

Ten packages, one repository, one release pipeline. Each installs and works on its own, and each
owns one job. Six of them — `bellpull`, `closeout`, `linegauge`, `paratext`, `roundel`, `seniority`
— depend on nothing; the others depend only on packages in this table, and every dependency points
one way, down the [layers](https://burgee.interlace.tools/docs/concepts/family).

No package declares a dependency from outside the family; `react` and `react-reconciler` are
optional peers of `controlroom`, which npm does not install.
[`package-shape-lock`](https://github.com/ofri-peretz/burgee/blob/main/scripts/package-shape-lock.test.ts)
holds that for every manifest, and
[`independence-install-lock`](https://github.com/ofri-peretz/burgee/blob/main/scripts/independence-install-lock.test.ts)
installs each package alone and finds nothing but the family packages it declares.

Releases are published by one workflow through npm trusted publishing: no npm token is used, and
each release carries SLSA provenance, which `npm view <package> dist.attestations` shows.
[`trusted-publishing-lock`](https://github.com/ofri-peretz/burgee/blob/main/scripts/trusted-publishing-lock.test.ts)
keeps both true.

| Package | What it is | Migrates from |
| :-- | :-- | :-- |
| [burgee](https://burgee.interlace.tools/docs/packages/burgee) | The CLI framework: one declaration, every surface | commander, yargs and meow |
| [roundel](https://roundel.interlace.tools/docs) | Colour: one output policy, semantic tokens, a theme | chalk |
| [flagstaff](https://flagstaff.interlace.tools/docs) | The frame loop: spinners, progress, boxes and tables | ora, log-update, boxen and cli-table3 |
| **caique** (this package) | Prompts that are flags first, and never hang | @inquirer/core and @clack/prompts |
| [linegauge](https://linegauge.interlace.tools/docs) | Measuring, wrapping, truncating and slicing styled text | string-width, wrap-ansi, strip-ansi and slice-ansi |
| [paratext](https://paratext.interlace.tools/docs) | Hyperlinks, images, title, clipboard and notifications | ansi-escapes, terminal-link and term-img |
| [seniority](https://seniority.interlace.tools/docs) | Configuration precedence and discovery, with provenance | cosmiconfig, lilconfig, dotenv and rc |
| [closeout](https://closeout.interlace.tools/docs) | Exit handlers, terminal restore and a bounded shutdown | signal-exit, exit-hook and restore-cursor |
| [bellpull](https://bellpull.interlace.tools/docs) | Subprocesses, and which executable actually ran | cross-spawn and which |
| [controlroom](https://controlroom.interlace.tools/docs) | Keyboard-driven terminal screens, inline or full-screen | ink |

Every migration guide, and the family-wide [compatibility](https://burgee.interlace.tools/docs/compatibility)
and [benchmarks](https://burgee.interlace.tools/docs/benchmarks) pages, are on
[burgee.interlace.tools](https://burgee.interlace.tools/docs/packages).

## Contributing

Issues and pull requests are welcome at [ofri-peretz/burgee](https://github.com/ofri-peretz/burgee/issues); read
[CONTRIBUTING.md](https://github.com/ofri-peretz/burgee/blob/main/CONTRIBUTING.md) first. Report a vulnerability privately, as
[SECURITY.md](https://github.com/ofri-peretz/burgee/blob/main/SECURITY.md) describes — never in a public issue.

## Licence

MIT © Ofri Peretz — see [LICENSE](https://github.com/ofri-peretz/burgee/blob/main/packages/caique/LICENSE).
