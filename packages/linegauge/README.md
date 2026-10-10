<p align="center">
  <a href="https://github.com/ofri-peretz/burgee/tree/main/packages/linegauge" target="blank">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/ofri-peretz/burgee/main/brand-assets/linegauge-lockup.svg" />
      <img src="https://raw.githubusercontent.com/ofri-peretz/burgee/main/brand-assets/linegauge-lockup-light.svg" alt="linegauge" width="360" />
    </picture>
  </a>
</p>

<p align="center">
  Measuring, wrapping, truncating and slicing styled terminal text — without the edge fraying.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/linegauge"><img src="https://img.shields.io/npm/v/linegauge?style=flat-square&color=0a6b47" alt="linegauge on npm: the latest version" /></a>
  <a href="https://www.npmjs.com/package/linegauge"><img src="https://img.shields.io/npm/dm/linegauge?style=flat-square" alt="linegauge downloads per month on npm" /></a>
  <a href="https://github.com/ofri-peretz/burgee/actions/workflows/quality.yml?query=branch%3Amain"><img src="https://img.shields.io/github/actions/workflow/status/ofri-peretz/burgee/quality.yml?branch=main&style=flat-square&label=Quality%20Gate" alt="Quality Gate: the CI status of main" /></a>
  <a href="https://app.codecov.io/gh/ofri-peretz/burgee/components"><img src="https://img.shields.io/codecov/c/github/ofri-peretz/burgee/main?component=linegauge&style=flat-square" alt="linegauge line coverage: its Codecov component" /></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/ofri-peretz/burgee"><img src="https://img.shields.io/ossf-scorecard/github.com/ofri-peretz/burgee?style=flat-square&label=OpenSSF%20Scorecard" alt="OpenSSF Scorecard for the repository" /></a>
  <a href="https://www.npmjs.com/package/linegauge?activeTab=code"><img src="https://img.shields.io/npm/unpacked-size/linegauge?style=flat-square" alt="Unpacked size of the latest linegauge release on npm" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/linegauge/package.json"><img src="https://img.shields.io/badge/dependencies-0-0a6b47?style=flat-square" alt="Zero dependencies" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/linegauge/package.json"><img src="https://img.shields.io/badge/types-included-blue?style=flat-square" alt="TypeScript types included for every entry point" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/linegauge/package.json"><img src="https://img.shields.io/badge/Node.js-20.19%2B%20%7C%2022.13%2B-green?style=flat-square" alt="Node.js 20.19+ or 22.13+" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/linegauge/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License: MIT" /></a>
  <a href="https://www.npmjs.com/package/linegauge#provenance"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fregistry.npmjs.org%2Flinegauge%2Flatest&query=%24.dist.attestations.provenance~&label=npm&style=flat-square&color=0a6b47" alt="npm provenance of the latest release, read live from its registry attestation" /></a>
</p>

<p align="center">
  <a href="https://burgee.interlace.tools/docs/compatibility"><img src="https://img.shields.io/badge/slice--ansi%20suite-104%2F104-0a6b47?style=flat-square" alt="linegauge/slice passes 104 of 104 cases of the slice-ansi test suite" /></a>
  <a href="https://burgee.interlace.tools/docs/compatibility"><img src="https://img.shields.io/badge/string--width%20suite-233%2F233-0a6b47?style=flat-square" alt="linegauge passes 233 of 233 cases of the string-width test suite" /></a>
  <a href="https://burgee.interlace.tools/docs/compatibility"><img src="https://img.shields.io/badge/strip--ansi%20suite-8%2F8-0a6b47?style=flat-square" alt="linegauge/strip passes 8 of 8 cases of the strip-ansi test suite" /></a>
  <a href="https://burgee.interlace.tools/docs/compatibility"><img src="https://img.shields.io/badge/wrap--ansi%20suite-85%2F85-0a6b47?style=flat-square" alt="linegauge/wrap passes 85 of 85 cases of the wrap-ansi test suite" /></a>
</p>

<p align="center">
  Docs: <a href="https://linegauge.interlace.tools">https://linegauge.interlace.tools</a><br />
  Migrating from: <a href="https://linegauge.interlace.tools/docs/coming-from/string-width">string-width</a> · <a href="https://linegauge.interlace.tools/docs/coming-from/wrap-ansi">wrap-ansi</a> · <a href="https://linegauge.interlace.tools/docs/coming-from/strip-ansi">strip-ansi</a> · <a href="https://linegauge.interlace.tools/docs/coming-from/slice-ansi">slice-ansi</a>
</p>

**linegauge** measures, wraps, truncates and slices styled terminal text without the edge
fraying, grapheme-correct over the platform's own `Intl.Segmenter`. Nothing here reads
`process`, so a pipe, `--json` and an agent get the same columns a terminal does — burgee,
caique and flagstaff measure their output with it. Zero dependencies.

Drop-in for **string-width** (the default export), **wrap-ansi**, **strip-ansi** and
**slice-ansi**: `npx burgee migrate` moves the imports, each graded by the incumbent's own suite.

A printer's line gauge is the steel rule marked in picas and points: a compositor holds it
against a line of type and checks it fits the measure it was set to.

## Install

```bash
npm install linegauge
pnpm add linegauge
yarn add linegauge
bun add linegauge
```

## Quick start

```js
import { width, wrap, truncate, slice, widest } from 'linegauge';

width('古代'); // 4 — East Asian wide, two columns each
width('👨‍👩‍👧‍👦'); // 2 — one cluster, not four people

wrap('a long sentence that needs folding', 12);
truncate('the quick brown fox', 10); // 'the quick…'
slice(styled, 2, 4); // columns 2 and 3, styles intact
widest(['a', 'bbb', 'cc']); // 3
```

## One problem wearing five names

`width` · `wrap` · `truncate` · `slice` · `widest`

They look like five utilities. They are one: **cutting styled text without letting the edge
come apart** — no dangling escape sequence, no half a grapheme, no severed emoji cluster.
Each has to know where the ANSI is and where the cluster boundaries are, and once you know
that, you may as well answer all five.

The ecosystem splits it across twelve packages — `strip-ansi`, `string-width`,
`ansi-regex`, `wrap-ansi`, `emoji-regex`, `slice-ansi`, `get-east-asian-width`,
`eastasianwidth`, `string-length`, `wcwidth`, `cli-truncate` and `widest-line` — which
between them sit under most of the terminal ecosystem.

## What "without the edge fraying" means

**A cluster is atomic.** A cut that would land inside a grapheme drops the whole cluster
rather than half of it. Half an emoji is not a narrower emoji, it is mojibake, and a flag
cut down the middle is two unrelated regional-indicator letters.

**A style that was open stays open — and gets closed.** A cut re-emits the styles active at
its start and closes them at its end, so the result is self-contained: paste it anywhere and
it neither loses its colour nor leaks it into what follows.

**The ellipsis is inside the budget, not on top of it.** `truncate(text, 10)` occupies ten
columns or fewer, never eleven. That is the property a table column depends on, and getting
it wrong is how a layout gains a phantom column under one input.

**`widest` takes lines, not a blob.** It accepts any iterable of strings, so the caller says
where the boundaries are rather than having a newline convention assumed for them.

## Design notes

**Ambiguous-width characters count narrow by default**, which is what a terminal does unless
it is rendering with a CJK font. `width(text, { ambiguousIsNarrow: false })` counts them two
columns wide for that context — string-width's option, under its name and with its default.
Nothing can detect which a terminal is doing, so it is the caller's decision.

**Not a terminal emulator.** Semicolon-delimited SGR, colon-delimited extended colour and
OSC 8 hyperlinks are understood. Every other complete CSI or OSC command is carried through
as an opaque zero-width unit, and anything that only looks like an introducer stays plain
text.

**`strip` is exported**, from the root and as the `linegauge/strip` subpath whose default
export is the strip-ansi drop-in. `width` measures what it leaves.

**An ASCII fast path.** A string of printable ASCII is measured by a scan of its code units,
so the segmenter is reached only when it earns its cost.

## Plugins

linegauge hosts one key, **`widths`**, and it answers one question: how many columns a code
point occupies *on this terminal*, when that terminal disagrees with Unicode.

```js
import { register } from 'linegauge/plugin';

register({
  name: 'nerd-font',
  widths: {
    icons: { ranges: [[0xe000, 0xf8ff]], columns: 2, why: 'this Nerd Font draws Private Use icons two columns wide' },
  },
});
```

The disagreements it exists for are real and local: a Nerd Font that put a two-column icon in
the Private Use Area, a code point newer than the table compiled into this release, a font that
draws box-drawing characters wide. Each is a fact about one terminal, so the honest shape for it
is data the user supplies rather than a constant somebody argues about upstream.

- **Plain data, no functions.** `{ ranges, columns, why }` — inclusive code-point pairs, a
  column count of 0, 1 or 2, and a sentence — so a plugin can arrive as JSON, be diffed, and be
  printed by `npx linegauge check` without running its author's code.
- **`why` is required**, which no other key in the family asks for: a width table with no
  provenance cannot be audited when it turns out wrong, and for ambiguous width, wrong is the
  normal outcome.
- **Later registrations win**, over earlier ones and over the built-in table — the user is the
  authority on their terminal. A reversed range or a column count of 3 is refused at
  `register()` with a code and a fix.
- **Nothing is registered by default**, and the seam is installed only while something is, so
  what the incumbent suites grade is Unicode's answer, and a program with no plugin pays nothing.

The ambiguous-width policy a CJK terminal needs is not a plugin: it is `ambiguousIsNarrow`, an
option with tests behind it.

## Migrating

One import per incumbent — each default export is the incumbent's:

```diff
- import stringWidth from 'string-width';
+ import stringWidth from 'linegauge';
```

```diff
- import wrapAnsi from 'wrap-ansi';
+ import wrapAnsi from 'linegauge/wrap';
```

```diff
- import stripAnsi from 'strip-ansi';
+ import stripAnsi from 'linegauge/strip';
```

```diff
- import sliceAnsi from 'slice-ansi';
+ import sliceAnsi from 'linegauge/slice';
```

The default export is `string-width`, byte-for-byte call-compatible, so a transitive copy
resolves without a code change too:

```json
{ "overrides": { "string-width": "npm:linegauge@^1" } }
```

Or let the codemod make the import change: `npx burgee migrate --dry-run` lists every import it
would rewrite — only drop-ins graded level with their incumbent — and `npx burgee migrate` makes
it ([Migrate](https://burgee.interlace.tools/docs/migrate)).

## Compatibility

The incumbent is the specification. `width` runs against `string-width`, `wrap` against
`wrap-ansi`, `slice` against `slice-ansi` and `truncate` against `cli-truncate`.

The four drop-in paths are graded by each incumbent's own suite, unedited, through
`compat-oracle`; the grades are generated under *Benchmarks* below and published on the
[compatibility page](https://burgee.interlace.tools/docs/compatibility). `truncate`, which has no
drop-in path, is checked case by case against `cli-truncate` in `truncate.test.ts`.

## Benchmarks

Every number here is produced by `npm run bench` and published at [burgee.interlace.tools/docs/benchmarks](https://burgee.interlace.tools/docs/benchmarks).

Graded by the incumbent's own test suite:

| suite | passing |
| :-- | --: |
| `slice-ansi` | 104 / 104 |
| `string-width` | 233 / 233 |
| `strip-ansi` | 8 / 8 |
| `wrap-ansi` | 85 / 85 |

Weight, installed and tree-inclusive: **108,138 bytes** against **194,329** for the incumbents it replaces — a ratio of **0.5565**.

## For agents

- **The same columns everywhere.** Nothing here reads `process`, so a pipe, `--json` and an agent
  get the columns a terminal does — which is why burgee, caique and flagstaff measure their
  output with it.
- **Non-strings answer `0`** rather than throwing, so a width call reached with whatever a
  template produced never takes a program down.
- **A width plugin can be checked before it ships.** `npx linegauge check ./widths.mjs`
  validates it against the family schema and exits 0, 1 with a code and a fix, or 2 on a usage
  error.
- **The docs are machine-readable** at
  [linegauge.interlace.tools/llms.txt](https://linegauge.interlace.tools/llms.txt) and
  [llms-full.txt](https://linegauge.interlace.tools/llms-full.txt).

## API

| | |
| :-- | :-- |
| `width(text, { ambiguousIsNarrow, countAnsiEscapeCodes })` | terminal columns the text occupies |
| `wrap(text, columns, options)` | fold to a width, styles preserved across rows |
| `truncate(text, columns, { position, ellipsis })` | cut to a budget, ellipsis counted inside it |
| `slice(text, start, end)` | the columns `[start, end)`, self-contained |
| `strip(text)` | the text with its escape sequences removed (`linegauge/strip`) |
| `widest(lines)` | the width of the widest line of any iterable |
| `lineCount(text, columns)` | rows the text occupies at that width |
| `measure(text)` | columns of plain text, no escape scan |

Non-strings answer `0` rather than throwing, because a width function is usually reached
with whatever a template produced.

Every export, with its types, is on [linegauge.interlace.tools](https://linegauge.interlace.tools/docs).

## Where it sits

Plugins register under the `widths` key, against the one schema the whole family shares.

`burgee`, `caique`, `controlroom`, `flagstaff` build on it, and it builds on nothing in this family.

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
| [caique](https://caique.interlace.tools/docs) | Prompts that are flags first, and never hang | @inquirer/core |
| **linegauge** (this package) | Measuring, wrapping, truncating and slicing styled text | string-width, wrap-ansi, strip-ansi and slice-ansi |
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

MIT © Ofri Peretz — see [LICENSE](https://github.com/ofri-peretz/burgee/blob/main/packages/linegauge/LICENSE).
