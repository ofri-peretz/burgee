---
'roundel': minor
---

Colour correctness, in three parts. The contrast check now covers the 256-colour entry the
terminal actually receives, not just the hex an author wrote — 167 hexes in an sRGB sweep read
at truecolor and failed at 256. That substitution is chosen by nearest-in-OKLab **among
entries that clear the floor**, which is perceptually closer than per-channel rounding and
readable by construction rather than by luck. And `Theme.conformance` takes `'AA'` (default) or
`'AAA'`, raising the floor for the check and the search together.
