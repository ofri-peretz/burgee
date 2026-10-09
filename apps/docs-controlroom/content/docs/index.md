---
title: controlroom
description: "Keyboard-driven terminal screens, inline or full-screen, with a static projection for pipes, CI and --json — and a drop-in path for ink, graded by ink's own suite. No dependency outside the burgee family; react is an optional peer of controlroom/ink only."
---

**What it is for.** controlroom replaces **ink** and `@inkjs/ui` in the burgee family. It
draws keyboard-driven terminal screens — panes, tabs with key hints, a checklist, a log tail,
sections that collapse — either **inline**, under a transcript that flows into the terminal's
own scrollback (Ink's shape, and Claude Code's), or in the **alternate screen**, laid out
again on resize. The same program gives every other caller a **static projection**: stable
lines in a pipe, in CI and for a screen reader, and NDJSON events under `--json` for an agent.
It never waits for a key that nobody can press.

An ink program moves by changing its import: `controlroom/ink` is graded by ink 8's own test
suite, 1304 of 1304 cases, and `@inkjs/ui`'s, 102 of 102.

A **control room** is where a system is watched and run from.

## Install

```bash
npm install controlroom
pnpm add controlroom
yarn add controlroom
bun add controlroom
```

## Quick start

```js
import { open, processRuntime } from 'controlroom';
import { tasks } from 'flagstaff/tasks';

const steps = [{ title: 'Install', status: 'running' }, { title: 'Configure', status: 'pending' }];
const screen = open(processRuntime(), {
  layout: 'work',
  panes: { work: { component: tasks(), state: { tasks: steps }, label: 'Tasks' } },
});

steps[0].status = 'ok';
screen.update('work', { tasks: steps });
screen.close();
```

On a terminal this is a live pane redrawn in place; piped, it prints each task's line once it settles;
under `--json` it writes one NDJSON event per change to stderr. A pane is any flagstaff
component, and the layout is rows and columns of them.

## Migrating

From **ink**, the path is one import, plus the reconciler ink used to install for you, graded
by ink's own test suite (R11, R13):

```diff
- import { render, Box, Text } from 'ink';
+ import { render, Box, Text } from 'controlroom/ink';
```

```bash
npm install react react-reconciler
```

`react` and `react-reconciler` are optional peers: the program's own React renders through
React's own reconciler, and the native API never loads either. Without them,
`controlroom/ink` refuses on first import with `E_PEER_MISSING` and the install line as its
`fix`. Layout is a TypeScript port of yoga's flexbox for the props ink exposes; there is no
yoga.

In a user's bundle the drop-in is no heavier than ink: `controlroom/ink` with `react` and
`react-reconciler` against `ink` with `react`, as the weight axis measures it (R14, published
on the [benchmarks page](https://burgee.interlace.tools/docs/benchmarks)).

**Packages written for ink run unchanged** when `'ink'` resolves to `controlroom/ink`. A bare
`npm:` alias cannot do that, because it names a package and not a subpath, so `'ink'` would be
the native API. Instead, one line in your `package.json` points `'ink'` at a two-file package
of your own that re-exports the drop-in:

```json
{
  "dependencies": {
    "ink": "file:./ink",
    "controlroom": "*",
    "react": "^19.3.0",
    "react-reconciler": "^0.34.0"
  }
}
```

```js
// ink/index.js — and ink/package.json: { "name": "ink", "version": "8.0.0", "type": "module", "exports": "./index.js" }
export * from 'controlroom/ink';
```

The version is the ink API the drop-in implements, so every component's peer range on ink is
met and npm installs no other ink. That is how `ink-spinner`, `ink-text-input` and
`ink-select-input` run, as published, in
[`examples/ink-ecosystem`](https://github.com/ofri-peretz/burgee/tree/main/examples/ink-ecosystem),
and how [`examples/chat-cli-ink`](https://github.com/ofri-peretz/burgee/tree/main/examples/chat-cli-ink),
a whole Ink app, runs on the drop-in (R17, R22). `@inkjs/ui` runs the same way: its own suite
passes 102 / 102 with `'ink'` resolved to this package. None of them has a façade here.

From **blessed**, **neo-blessed** and **terminal-kit** there is no drop-in — their surfaces are
too large to reproduce honestly. Each has a coming-from guide, and `burgee migrate` reports the
common screen, box, list and key patterns with a link to the matching section (R18).

## Compatibility

Ink's own suite is vendored into `compat-oracle` at ink 8.0.0 and `@inkjs/ui`'s at 2.0.0,
each with a control run against the real package and a baseline that only ratchets (R13,
R17), and both grade `controlroom/ink`. ink's passes **1304 of 1304** cases: 1309 are graded,
four of the five set aside test ink's own repository build and one type-checks its source
tree, which no vendored suite has. `@inkjs/ui`'s passes **102 / 102**, graded unmodified with
`'ink'` resolved to this package, on `@inkjs/ui`'s own React 18; its one spinner case that
expects ink 5's unmount writes is set aside, because real ink 8 fails it too. ink 6.8.0 is
graded as a previous major — 540 / 584, where ink 8 changed what 6 asserted — and not claimed.
The rows are on the
[compatibility page](https://burgee.interlace.tools/docs/compatibility).

## Benchmarks

Every number here is produced by `npm run bench` and published at [burgee.interlace.tools/docs/benchmarks](https://burgee.interlace.tools/docs/benchmarks).

Graded by the incumbent's own test suite:

| suite | passing |
| :-- | --: |
| `ink` | 1304 / 1304 |
| `inkjs-ui` | 102 / 102 |

## For agents

The reason the package exists is that a full-screen program is useless to an agent. The same
program that draws panes on a terminal writes:

- **stable lines** — each pane's static projection, under its label — to a pipe, in CI and for
  a screen reader;
- **NDJSON events under `--json`**, on stderr, one per state change;
- and it never waits for a key: off a terminal, `open()` reads no keys at all, and
  `dispatch(action)` is what a program has instead.

The family's machine-readable docs are at
[burgee.interlace.tools/llms.txt](https://burgee.interlace.tools/llms.txt).

## API

- `open(runtime, options)` — a screen. `screen: 'inline'` (the default) or `'alternate'`;
  `layout`; `panes` (a flagstaff component and its state, by name); `keymap` (key spec →
  action, as data); `tabs`, `focus`, `json`, and `onAction(action, screen)`. Returns
  `{ mode, interactive, state, update(pane, state), commit(text), dispatch(action), close() }`.
  `commit()` writes text above the live region once, into scrollback (ink's `<Static>`).
- `processRuntime()` — the real process, as the `Runtime` every other function takes.
- `layout(tree, area, contents?)` — a rectangle per pane. A part's size is a number of cells,
  `{ fr, min }`, or `'fit'` (measured by linegauge). A terminal too small for the minimums clips
  the later parts and never the first.
- `initial`, `reduce(state, action)` — tabs, focus and collapse; `hints(keymap, labels)` — the
  hint line, generated from the keymap so it cannot name an unbound key.
- `compose`, `fit`, `render`, `collapse`, `distribute` — the compositor's arithmetic.
- `controlroom/ink` — ink 8's API: `render`, `renderToString`, `Box`, `Text`, `Static`,
  `Transform`, `Newline`, `Spacer`, every hook (`useAnimation`, `usePaste`, `useBoxMetrics` and
  `useWindowSize` among them) and `measureElement`.
- `status` — kept for the reserved release's one export.

It builds on its siblings rather than beside them: flagstaff draws the panes and writes every
frame, caique reads the keys, closeout restores the terminal, linegauge measures, and roundel
decides the output mode.

## Plugins

controlroom hosts two keys, **`keymaps`** and **`panes`**, and both are data. A keymap maps a
key, spelled the way `caique/keys` spells it (`left`, `enter`, `ctrl+c`, `shift+tab`, `s`), to
an action name, and labels the actions the hint line should show. A pane names the flagstaff
component that draws it and the label a pipe prints above it. A tab bar is a pane over
flagstaff's `tab-bar`.

```js
import { register } from 'controlroom/plugin';

register({
  name: 'vim-keys',
  keymaps: {
    vim: { keys: { h: 'tab.prev', l: 'tab.next' }, labels: { 'tab.prev': 'switch tab', 'tab.next': 'switch tab' } },
  },
  panes: { log: { component: 'log-tail', label: 'Log' } },
});
```

A screen takes a keymap by name (`keymap: 'vim'`), and a pane by name with its state
(`panes: { main: { pane: 'log', state } }`). The built-in `default` keymap is registered through
the same `register()`; register your own `default` to replace it. Check a plugin file before you
ship it:

```bash
npx controlroom check ./vim-keys.mjs
```

It prints each keymap as the hint line it generates, and each pane as the component that
draws it, then `ok`. A refusal carries a code and a fix.

## Where it sits

Plugins register under the `keymaps` and `panes` keys, against the one schema the whole family shares.

Nothing in this family builds on it yet, and it builds on `caique`, `closeout`, `flagstaff`, `linegauge`, `paratext`, `roundel`.

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
| [paratext](https://paratext.interlace.tools/docs) | Hyperlinks, images, title, clipboard and notifications | ansi-escapes, terminal-link and term-img |
| [seniority](https://seniority.interlace.tools/docs) | Configuration precedence and discovery, with provenance | cosmiconfig, dotenv and rc |
| [closeout](https://closeout.interlace.tools/docs) | Exit handlers, terminal restore and a bounded shutdown | signal-exit, exit-hook and restore-cursor |
| [bellpull](https://bellpull.interlace.tools/docs) | Subprocesses, and which executable actually ran | cross-spawn and which |
| **controlroom** (this package) | Full-screen, keyboard-driven terminal screens | ink, graded by ink's own suite |

Every migration guide, and the family-wide [compatibility](https://burgee.interlace.tools/docs/compatibility)
and [benchmarks](https://burgee.interlace.tools/docs/benchmarks) pages, are on
[burgee.interlace.tools](https://burgee.interlace.tools/docs/packages).

## Contributing

Issues and pull requests are welcome at [ofri-peretz/burgee](https://github.com/ofri-peretz/burgee/issues); read
[CONTRIBUTING.md](https://github.com/ofri-peretz/burgee/blob/main/CONTRIBUTING.md) first. Report a vulnerability privately, as
[SECURITY.md](https://github.com/ofri-peretz/burgee/blob/main/SECURITY.md) describes — never in a public issue.

## Licence

MIT © Ofri Peretz — see [LICENSE](https://github.com/ofri-peretz/burgee/blob/main/packages/controlroom/LICENSE).
