<p align="center">
  <a href="https://github.com/ofri-peretz/burgee/tree/main/packages/controlroom" target="blank">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/ofri-peretz/burgee/main/brand-assets/controlroom-lockup.svg" />
      <img src="https://raw.githubusercontent.com/ofri-peretz/burgee/main/brand-assets/controlroom-lockup-light.svg" alt="controlroom" width="360" />
    </picture>
  </a>
</p>

<p align="center">
  Full-screen terminal screens that still print clean lines to a pipe. In progress.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/controlroom"><img src="https://img.shields.io/npm/v/controlroom?style=flat-square&color=0a6b47" alt="controlroom on npm: the latest version" /></a>
  <a href="https://www.npmjs.com/package/controlroom"><img src="https://img.shields.io/npm/dm/controlroom?style=flat-square" alt="controlroom downloads per month on npm" /></a>
  <a href="https://github.com/ofri-peretz/burgee/actions/workflows/quality.yml?query=branch%3Amain"><img src="https://img.shields.io/github/actions/workflow/status/ofri-peretz/burgee/quality.yml?branch=main&style=flat-square&label=Quality%20Gate" alt="Quality Gate: the CI status of main" /></a>
  <a href="https://app.codecov.io/gh/ofri-peretz/burgee/components"><img src="https://img.shields.io/codecov/c/github/ofri-peretz/burgee/main?component=controlroom&style=flat-square" alt="controlroom line coverage: its Codecov component" /></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/ofri-peretz/burgee"><img src="https://img.shields.io/ossf-scorecard/github.com/ofri-peretz/burgee?style=flat-square&label=OpenSSF%20Scorecard" alt="OpenSSF Scorecard for the repository" /></a>
  <a href="https://www.npmjs.com/package/controlroom?activeTab=code"><img src="https://img.shields.io/npm/unpacked-size/controlroom?style=flat-square" alt="Unpacked size of the latest controlroom release on npm" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/controlroom/package.json"><img src="https://img.shields.io/badge/dependencies-1%20in%20family%2C%200%20outside-0a6b47?style=flat-square" alt="One dependency, all in the burgee family (linegauge), none outside it" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/controlroom/package.json"><img src="https://img.shields.io/badge/types-included-blue?style=flat-square" alt="TypeScript types included for every entry point" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/controlroom/package.json"><img src="https://img.shields.io/badge/Node.js-20.19%2B%20%7C%2022.13%2B-green?style=flat-square" alt="Node.js 20.19+ or 22.13+" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/controlroom/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License: MIT" /></a>
  <a href="https://www.npmjs.com/package/controlroom#provenance"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fregistry.npmjs.org%2Fcontrolroom%2Flatest&query=%24.dist.attestations.provenance~&label=npm&style=flat-square&color=0a6b47" alt="npm provenance of the latest release, read live from its registry attestation" /></a>
</p>

<p align="center">
  <a href="https://burgee.interlace.tools/docs/compatibility"><img src="https://img.shields.io/badge/ink%20suite-0%2F593-b45309?style=flat-square" alt="controlroom passes 0 of 593 cases of the ink test suite" /></a>
  <a href="https://burgee.interlace.tools/docs/compatibility"><img src="https://img.shields.io/badge/%40inkjs%2Fui%20suite-0%2F103-b45309?style=flat-square" alt="controlroom passes 0 of 103 cases of the @inkjs/ui test suite" /></a>
</p>

<p align="center">
  Docs: <a href="https://burgee.interlace.tools/docs/packages/controlroom">https://burgee.interlace.tools/docs/packages/controlroom</a><br />
  Migrating from: <a href="https://burgee.interlace.tools/docs/coming-from/blessed">blessed</a> · <a href="https://burgee.interlace.tools/docs/coming-from/neo-blessed">neo-blessed</a> · <a href="https://burgee.interlace.tools/docs/coming-from/terminal-kit">terminal-kit</a>
</p>

**In progress, and not a screen yet.** Two pieces are built: `layout()`, which turns a tree
of rows and columns into a rectangle per pane, and the tab, focus and collapse state with a
hint line generated from the keymap. The screen that draws them (R4–R7, R19) and
`controlroom/ink` are not built, so don't build an app on it yet. The design is approved, and
it is set out in the intent:
[`.sdlc/intents/controlroom/`](https://github.com/ofri-peretz/burgee/tree/main/.sdlc/intents/controlroom).

**What it is for.** controlroom will replace **ink** and `@inkjs/ui` in the burgee family. It
draws full-screen, keyboard-driven terminal screens: panes, tabs with key hints, a checklist,
a log tail, and sections that collapse. It uses the alternate screen and lays itself out
again on resize. The same program gives every other caller a **static projection**: stable
lines in a pipe, in CI and for a screen reader, and NDJSON events under `--json` for an
agent. It never waits for a key that nobody can press.

A **control room** is where a system is watched and run from.

## Install

Install it for the layout and the tab state below:

```bash
npm install controlroom
pnpm add controlroom
yarn add controlroom
bun add controlroom
```

## Quick start

```js
import { hints, layout, reduce, initial } from 'controlroom';

const panes = layout(
  { direction: 'row', parts: [{ content: 'learn' }, { size: { fr: 2, min: 30 }, content: 'tasks' }] },
  { x: 0, y: 0, width: 80, height: 24 },
);
panes.get('tasks'); // { x: 27, y: 0, width: 53, height: 24 }

const keymap = { left: 'tab.prev', right: 'tab.next', s: 'toggle:status' };
hints(keymap, { 'tab.prev': 'switch tab', 'tab.next': 'switch tab', 'toggle:status': 'toggle status' });
// '←→ switch tab  s toggle status'

reduce(initial(['Status', 'Logs']), 'tab.next').active; // 1
```

That is what is built. Everything under the headings below that says "planned" is a
requirement in the
[spec](https://github.com/ofri-peretz/burgee/blob/main/.sdlc/intents/controlroom/spec.md); this
README changes when one ships.

## Migrating

**None of this exists yet.** It is what the spec commits to, not something to try.

From **ink**, the planned path is one import, graded by Ink's own test suite (R11, R13):

```diff
- import { render, Box, Text } from 'ink';
+ import { render, Box, Text } from 'controlroom/ink';
```

Resolving `'ink'` to `controlroom/ink` through a `package.json` alias or `overrides` is meant
to run `@inkjs/ui`, `ink-spinner`, `ink-text-input` and `ink-select-input` unchanged (R17),
with no façade of their own.

From **blessed**, **neo-blessed** and **terminal-kit** there will be no drop-in — their surfaces
are too large to reproduce honestly. Each gets a coming-from guide and `burgee migrate`
codemod rules for the common screen, box, list and key patterns instead (R18).

## Compatibility

Graded, and at zero, because there is nothing to pass yet. Ink's own suite is vendored into
`compat-oracle` at ink 6.8.0 (593 cases) and `@inkjs/ui`'s at 2.0.0 (103 cases), each with a
control run against the real package and a baseline that only ratchets (R13, R17). `@inkjs/ui`
is graded unmodified, with `'ink'` resolved to this package. Both rows grade the package root
until `controlroom/ink` exists, and they read 0 there: the root exports `status` and nothing
else. The rows are on the
[compatibility page](https://burgee.interlace.tools/docs/compatibility).

## Benchmarks

Every number here is produced by `npm run bench` and published at [burgee.interlace.tools/docs/benchmarks](https://burgee.interlace.tools/docs/benchmarks).

Graded by the incumbent's own test suite:

| suite | passing |
| :-- | --: |
| `ink` | 0 / 593 |
| `inkjs-ui` | 0 / 103 |

## For agents

Planned, not built: the reason the package exists is that a full-screen program is useless to
an agent today. When it ships, the same program that draws panes on a terminal will write:

- **stable lines** — its static projection — to a pipe, in CI and for a screen reader;
- **NDJSON events under `--json`**, on stderr, one per state change;
- and it will never wait for a key that nobody can press.

The family's machine-readable docs are at
[burgee.interlace.tools/llms.txt](https://burgee.interlace.tools/llms.txt).

## API

- `layout(tree, area, contents?)` — a `Map` from pane name to `{ x, y, width, height }`. A
  part's size is a number of cells, `{ fr, min }`, or `'fit'` (its widest line in a row, its
  wrapped line count in a column, measured by linegauge). A terminal too small for the
  minimums clips the later parts and never the first.
- `distribute(total, sizes)` — the same arithmetic for one axis.
- `initial(tabs, panes)`, `reduce(state, action)` — tabs (`tab.next`, `tab.prev`, `tab:<name>`),
  focus (`focus.next`, `focus.prev`) and collapse (`toggle:<section>`); any other action is the
  program's own and leaves the state alone.
- `hints(keymap, labels)` — the hint line, generated from the keymap so it cannot name an
  unbound key.
- `status` — `'reserved'`, kept until the first release that ships a screen.

When it ships, it will build on its siblings rather than beside them: flagstaff draws the
panes, caique reads the keys, closeout restores the terminal, linegauge measures, and roundel
decides the output mode.

## Where it sits

It hosts no plugin key of its own.

Nothing in this family builds on it yet, and it builds on `linegauge`.

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
| **controlroom** (this package) | Full-screen, keyboard-driven terminal screens | ink |

Every migration guide, and the family-wide [compatibility](https://burgee.interlace.tools/docs/compatibility)
and [benchmarks](https://burgee.interlace.tools/docs/benchmarks) pages, are on
[burgee.interlace.tools](https://burgee.interlace.tools/docs/packages).

## Contributing

Issues and pull requests are welcome at [ofri-peretz/burgee](https://github.com/ofri-peretz/burgee/issues); read
[CONTRIBUTING.md](https://github.com/ofri-peretz/burgee/blob/main/CONTRIBUTING.md) first. Report a vulnerability privately, as
[SECURITY.md](https://github.com/ofri-peretz/burgee/blob/main/SECURITY.md) describes — never in a public issue.

## Licence

MIT © Ofri Peretz — see [LICENSE](https://github.com/ofri-peretz/burgee/blob/main/packages/controlroom/LICENSE).
