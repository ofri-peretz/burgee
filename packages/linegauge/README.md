<p align="center">
  <a href="https://github.com/ofri-peretz/burgee/tree/main/packages/linegauge" target="blank">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/ofri-peretz/burgee/main/brand-assets/linegauge-lockup.svg" />
      <img src="https://raw.githubusercontent.com/ofri-peretz/burgee/main/brand-assets/linegauge-lockup-light.svg" alt="linegauge" width="360" />
    </picture>
  </a>
</p>

<p align="center">
  Docs: <a href="https://burgee.interlace.tools/docs/packages/linegauge">https://burgee.interlace.tools/docs/packages/linegauge</a>
</p>

**Measuring, wrapping, truncating and slicing styled terminal text — without the edge
fraying.**

A printer's line gauge is the steel rule marked in picas and points: a compositor holds it
against a line of type and checks it fits the measure it was set to.

Zero dependencies. Grapheme-correct over the platform's own `Intl.Segmenter`.

Drop-in paths for **string-width** (the default export), **wrap-ansi**, **strip-ansi** and
**slice-ansi**. Nothing here reads `process`, so a pipe, `--json` and an agent get the same
columns a terminal does — burgee, caique and flagstaff measure their output with it.

```bash
npm i linegauge
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

## Use

```js
import { width, wrap, truncate, slice, widest } from 'linegauge';

width('古代'); // 4 — East Asian wide, two columns each
width('👨‍👩‍👧‍👦'); // 2 — one cluster, not four people

wrap('a long sentence that needs folding', 12);
truncate('the quick brown fox', 10); // 'the quick…'
slice(styled, 2, 4); // columns 2 and 3, styles intact
widest(['a', 'bbb', 'cc']); // 3
```

### The default export is `string-width`

Byte-for-byte call-compatible, so this resolves without a code change:

```json
{ "overrides": { "string-width": "npm:linegauge@^0.2" } }
```

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

## Graded by the packages it replaces

The incumbent is the specification. `width` runs against `string-width`, `wrap` against
`wrap-ansi`, `slice` against `slice-ansi` and `truncate` against `cli-truncate`.

## API

| | |
| :-- | :-- |
| `width(text, { countAnsiEscapeCodes })` | terminal columns the text occupies |
| `wrap(text, columns, options)` | fold to a width, styles preserved across rows |
| `truncate(text, columns, { position, ellipsis })` | cut to a budget, ellipsis counted inside it |
| `slice(text, start, end)` | the columns `[start, end)`, self-contained |
| `widest(lines)` | the width of the widest line of any iterable |
| `lineCount(text, columns)` | rows the text occupies at that width |
| `measure(text)` | columns of plain text, no escape scan |

Non-strings answer `0` rather than throwing, because a width function is usually reached
with whatever a template produced.

## Design notes

**Ambiguous-width characters count narrow**, which is what a terminal does unless told it is
rendering an East Asian locale. `string-width` makes that an option; nothing above this has
ever needed the other answer, so it is not one here.

**Not a terminal emulator.** Semicolon-delimited SGR, colon-delimited extended colour and
OSC 8 hyperlinks are understood. Every other complete CSI or OSC command is carried through
as an opaque zero-width unit, and anything that only looks like an introducer stays plain
text.

**Still at the Design→Build gate:** an exported `strip`, and the ASCII fast path — a byte
scan when the string has no non-ASCII code unit, so the segmenter is reached only when it
earns its cost.

## Plugins

**linegauge hosts no plugin key, and that is a decision rather than an omission.** Every
other package in the family hosts one — `tokens` in roundel, `spinners` and `borders` and
`glyphs` and `components` in flagstaff, `capabilities` in paratext, `sources` in seniority,
`handlers` in closeout, `resolvers` in bellpull, `widgets` in caique. Each of those keys sits
over a question with more than one right answer: which colour, which glyph, which terminal,
where configuration lives, how an executable is found. A plugin settles it for one program
without making anybody else wrong.

These six functions are not that kind of question. `width('古代')` is 4 because Unicode
classes those code points East Asian Wide and a terminal gives each of them two columns;
`slice` returns the columns it was asked for or it returns the wrong string. A plugin key
here would not extend what linegauge does — it would let a caller redefine what the terminal
does, silently, for everything above it. The failure would not even surface as an error: a
box comes out a column short, a table gains a phantom column, and nothing throws.

There is a second reason, and it is the one that decides it. This package's correctness is
differential — `width` is graded against `string-width`, `wrap` against `wrap-ansi`, `slice`
against `slice-ansi`, `truncate` against `cli-truncate`. A registered contribution would put
answers under the published pass rate that no grader ever saw, so the number would stop
meaning what it says.

The two things that genuinely vary are already handled without a registry:

- **The Unicode data.** The Wide and Fullwidth table is Unicode's, and cluster boundaries
  come from the platform's `Intl.Segmenter`. When Unicode ships a version the table changes —
  that is a release of this package, re-graded, not a registration a caller can make.
- **The environment.** How wide the terminal is, and whether there is one, are the caller's
  to pass; nothing here reads `process`. That is a parameter, not a plugin.

The family's plugin contract records this refusal next to the other layers' keys (R5a), so
"no key" is one of the contract's answers rather than a hole in it. If a real second answer
ever arrives — an ambiguous-width policy some terminal actually needs — it lands as an option
with a differential test behind it, because the graders have to see it.

## Benchmarks

Every number here is produced by `npm run bench` and published at [/docs/benchmarks](/docs/benchmarks).

Graded by the incumbent's own test suite:

| suite | passing |
| :-- | --: |
| `slice-ansi` | 15 / 15 ¹ |
| `string-width` | 229 / 229 |
| `strip-ansi` | 8 / 8 |
| `wrap-ansi` | 80 / 80 |

¹ A case the incumbent marks `test.failing()` — it cannot do the thing and says so in
its own suite — which this package passes. The runner reports that as a failure, because
to the incumbent an unexpected pass means a stale annotation; it is counted here as the
pass it is, and marked rather than left to look like the ones beside it.

Weight, installed and tree-inclusive: **84,642 bytes** against **170,342** for the incumbents it replaces — a ratio of **0.4969**.
## Where it sits

Plugins register under the `widths` key, against the one schema the whole family shares.

`burgee`, `caique`, `flagstaff` build on it, and it builds on nothing in this family.
## Licence

MIT
