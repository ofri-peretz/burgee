---
'linegauge': patch
---

`width` and the style stack now answer what `string-width` and `slice-ansi` answer on
twenty-nine cases they did not. The `string-width` row goes 201 / 229 → **229 / 229**; the
`slice-ansi` row goes 13 / 15 → **15 / 15**. `wrap-ansi` holds
at 80 / 80 and `strip-ansi` at 8 / 8 across the change.

Four defects in `width`, not twenty-eight cases. **Hangul conjoining jamo** are additive
inside a grapheme cluster: `Intl.Segmenter` joins a run of them into one cluster, and
measuring that cluster by its first code point answered 2 where a terminal draws 12. Modern
Hangul composes L + V (+ T) into one two-column syllable and leaves unmatched jamo at their
own East Asian Width. **Spacing combining marks** occupy a column — the zero-width class
matched `\p{Mark}`, which is the spacing marks as well as the non-spacing ones, so
Devanagari vowel sign AA measured 0. **Prepended concatenation marks** (`U+0600`, `U+06DD`,
`U+070F`) are `Format` but not `Default_Ignorable`, so they missed the zero-width class and
were charged a column each — the worst shape of the bug, because a character the cursor never
advances past is invisible until a box comes out short. And **minimally-qualified emoji
sequences** — the same ZWJ sequence or keycap without its `U+FE0F` — are still two columns
in every terminal, but `\p{RGI_Emoji}` matches only the fully-qualified spelling.

One defect in the style stack, which `slice`, `wrap` and `truncate` share. An SGR parameter
with no entry in the close-code table — `ESC[20m`, `ESC[1001m` — was **dropped** at a cut, so
the text survived and its styling did not, silently. It is now carried through and reopened
like any other style, closed with `ESC[0m`. The sequence is the caller's, not this library's
to vet.

Measured cost, stated rather than absorbed: the minified bundle grows 939–1 040 bytes per
entry that measures or cuts — `linegauge` itself from 5 241 to 6 180 bytes, 18%. `strip` is
unchanged. `packages/linegauge/ceilings.json` carries the before, the delta and the after,
and a new `weight.test.ts` ratchets every subpath's `dist/` closure so the next growth cannot
be silent. That file also records, rather than hides, that R9's weight ceiling is **not met**:
one entry of six is under the bar the design names.
