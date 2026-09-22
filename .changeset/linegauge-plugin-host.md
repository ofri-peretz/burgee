---
'linegauge': minor
'flagstaff': patch
'paratext': patch
---

linegauge hosts plugins — `widths`, and it is the ninth of nine.

`scripts/extension-surface-lock.test.ts` has carried `linegauge: { plugin: false }` since it was
written, and the row was empty honestly: a width function is not obviously extensible, and an
extension point invented to fill a table is worse than a gap that says so.

What makes `widths` real is that the package already admits the problem. `width.ts` says
ambiguous-width characters are *"counted narrow, which is what a terminal does unless it has been
told it is rendering an East Asian locale"* — and that covers only the ambiguity Unicode
sanctions. A Nerd Font putting a two-column icon in the Private Use Area, a code point added by a
Unicode release newer than the table compiled into this build, a font drawing U+2500 wide: each
is a real, local disagreement with the built-in answer, and until now a user had no way to settle
it short of patching the package.

```js
export default {
  name: 'nerd-font',
  widths: {
    icons: { ranges: [[0xE000, 0xF8FF]], columns: 2, why: 'Nerd Font patches two-column icons into the PUA; measured in WezTerm' },
  },
};
```

Three fields of plain data, so a plugin can arrive as JSON, be diffed, be generated and be printed
without running its author's code (R7). **`why` is required**, which no other `$def` in the family
does: a width table with no provenance cannot be audited when it turns out to be wrong, and *wrong*
is the normal outcome for ambiguous width.

A later registration wins over an earlier one and over the built-in tables, which is the point —
the built-in answer is right for most terminals and the user is the authority on theirs. An
override applies **before** the zero-width and emoji rules, or it would be decorative. A program
with no plugin pays one `length === 0` per cluster, and the ASCII fast path never reaches it.

The family schema gains `widthRange`, `widthOverride` and `widths`, and because it is one
byte-identical file across every host, **every host that validates against it grows by about
1.3 KB** — five flagstaff budgets and two paratext ones moved for a definition only linegauge
reads. That trade is the design's and is recorded as D-108 rather than absorbed.
