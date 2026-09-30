---
"linegauge": patch
---

`measure` answers a one-unit string without building a grapheme segmenter.

A prompt frame's glyphs (`│`, `●`, `◆`) arrive at `wrap` as words of their own, and segmenting each one was most of what `caique/clack` spent measuring. In B5, `caique/clack` ÷ @clack/prompts went from 1.45× on CI to 1.09× locally.
