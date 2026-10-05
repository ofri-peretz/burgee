<p align="center">
  <a href="https://github.com/ofri-peretz/burgee/tree/main/packages/controlroom" target="blank">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/ofri-peretz/burgee/main/brand-assets/controlroom-lockup.svg" />
      <img src="https://raw.githubusercontent.com/ofri-peretz/burgee/main/brand-assets/controlroom-lockup-light.svg" alt="controlroom" width="360" />
    </picture>
  </a>
</p>

<p align="center">
  Full-screen terminal screens that still print clean lines to a pipe, and a drop-in for ink.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/controlroom"><img src="https://img.shields.io/npm/v/controlroom?style=flat-square&color=0a6b47" alt="controlroom on npm: the latest version" /></a>
  <a href="https://www.npmjs.com/package/controlroom"><img src="https://img.shields.io/npm/dm/controlroom?style=flat-square" alt="controlroom downloads per month on npm" /></a>
  <a href="https://github.com/ofri-peretz/burgee/actions/workflows/quality.yml?query=branch%3Amain"><img src="https://img.shields.io/github/actions/workflow/status/ofri-peretz/burgee/quality.yml?branch=main&style=flat-square&label=Quality%20Gate" alt="Quality Gate: the CI status of main" /></a>
  <a href="https://app.codecov.io/gh/ofri-peretz/burgee/components"><img src="https://img.shields.io/codecov/c/github/ofri-peretz/burgee/main?component=controlroom&style=flat-square" alt="controlroom line coverage: its Codecov component" /></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/ofri-peretz/burgee"><img src="https://img.shields.io/ossf-scorecard/github.com/ofri-peretz/burgee?style=flat-square&label=OpenSSF%20Scorecard" alt="OpenSSF Scorecard for the repository" /></a>
  <a href="https://www.npmjs.com/package/controlroom?activeTab=code"><img src="https://img.shields.io/npm/unpacked-size/controlroom?style=flat-square" alt="Unpacked size of the latest controlroom release on npm" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/controlroom/package.json"><img src="https://img.shields.io/badge/dependencies-6%20in%20family%2C%200%20outside-0a6b47?style=flat-square" alt="Six dependencies, all in the burgee family (caique, closeout, flagstaff, linegauge, paratext, roundel), none outside it" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/controlroom/package.json"><img src="https://img.shields.io/badge/types-included-blue?style=flat-square" alt="TypeScript types included for every entry point" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/controlroom/package.json"><img src="https://img.shields.io/badge/Node.js-20.19%2B%20%7C%2022.13%2B-green?style=flat-square" alt="Node.js 20.19+ or 22.13+" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/controlroom/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License: MIT" /></a>
  <a href="https://www.npmjs.com/package/controlroom#provenance"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fregistry.npmjs.org%2Fcontrolroom%2Flatest&query=%24.dist.attestations.provenance~&label=npm&style=flat-square&color=0a6b47" alt="npm provenance of the latest release, read live from its registry attestation" /></a>
</p>

<p align="center">
  <a href="https://burgee.interlace.tools/docs/compatibility"><img src="https://img.shields.io/badge/ink%20suite-576%2F584-b45309?style=flat-square" alt="controlroom/ink passes 576 of 584 cases of the ink test suite" /></a>
  <a href="https://burgee.interlace.tools/docs/compatibility"><img src="https://img.shields.io/badge/%40inkjs%2Fui%20suite-103%2F103-0a6b47?style=flat-square" alt="controlroom/ink passes 103 of 103 cases of the @inkjs/ui test suite" /></a>
</p>

<p align="center">
  Docs: <a href="https://burgee.interlace.tools/docs/packages/controlroom">https://burgee.interlace.tools/docs/packages/controlroom</a><br />
  Migrating from: <a href="https://burgee.interlace.tools/docs/coming-from/blessed">blessed</a> · <a href="https://burgee.interlace.tools/docs/coming-from/neo-blessed">neo-blessed</a> · <a href="https://burgee.interlace.tools/docs/coming-from/terminal-kit">terminal-kit</a>
</p>

**What it is for.** controlroom replaces **ink** and `@inkjs/ui` in the burgee family. It
draws keyboard-driven terminal screens — panes, tabs with key hints, a checklist, a log tail,
sections that collapse — either **inline**, under a transcript that flows into the terminal's
own scrollback (Ink's shape, and Claude Code's), or in the **alternate screen**, laid out
again on resize. The same program gives every other caller a **static projection**: stable
lines in a pipe, in CI and for a screen reader, and NDJSON events under `--json` for an agent.
It never waits for a key that nobody can press.

An ink program moves by changing its import: `controlroom/ink` is graded by ink's own test
suite, 576 of 584 cases, and `@inkjs/ui`'s, 103 of 103.

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

Resolving `'ink'` to `controlroom/ink` through a `package.json` alias or `overrides` runs
`@inkjs/ui` unchanged — its own suite passes 103 / 103 that way (R17) — and is meant to run
`ink-spinner`, `ink-text-input` and `ink-select-input` the same way, with no façade of their
own.

From **blessed**, **neo-blessed** and **terminal-kit** there is no drop-in — their surfaces are
too large to reproduce honestly. Each has a coming-from guide, and `burgee migrate` reports the
common screen, box, list and key patterns with a link to the matching section (R18).

## Compatibility

Ink's own suite is vendored into `compat-oracle` at ink 6.8.0 and `@inkjs/ui`'s at 2.0.0,
each with a control run against the real package and a baseline that only ratchets (R13,
R17), and both grade `controlroom/ink`. ink's passes **576 of 584** cases: 593 are vendored,
and nine colour cases are excluded with their reason — the suite raises the level on its own
chalk singleton, and the drop-in's colour is roundel's, read from the environment. The eight
that fail are kitty keyboard protocol negotiation, which is not built. `@inkjs/ui`'s passes
**103 / 103**, graded unmodified with `'ink'` resolved to this package, on `@inkjs/ui`'s own
React 18. The rows are on the
[compatibility page](https://burgee.interlace.tools/docs/compatibility).

## Benchmarks

Every number here is produced by `npm run bench` and published at [burgee.interlace.tools/docs/benchmarks](https://burgee.interlace.tools/docs/benchmarks).

Graded by the incumbent's own test suite:

| suite | passing |
| :-- | --: |
| `ink` | 576 / 584 |
| `inkjs-ui` | 103 / 103 |

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
- `controlroom/ink` — ink 6.8's API: `render`, `renderToString`, `Box`, `Text`, `Static`,
  `Transform`, `Newline`, `Spacer`, every hook and `measureElement`.
- `status` — kept for the reserved release's one export.

It builds on its siblings rather than beside them: flagstaff draws the panes and writes every
frame, caique reads the keys, closeout restores the terminal, linegauge measures, and roundel
decides the output mode.

## Where it sits

It hosts no plugin key of its own.

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
