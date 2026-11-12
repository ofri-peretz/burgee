---
"linegauge": minor
---

`linegauge/strip`, and every measurement made through it, follows ansi-regex 6.6.0, which strip-ansi 7.2.0 resolves since 2026-11-08:

- A CSI is ECMA-48's own shape, so any final byte from `@` to `~` ends it (`ESC[5d` is stripped).
- DCS, SOS, PM and APC strings are stripped to their string terminator. A BEL does not end them.
- The escapes whose final byte is a digit (`ESC 7`, `ESC 8`, `ESC ( 0`, `ESC # 8`) are stripped, and so is the Linux console palette.
- An OSC cancelled by CAN or SUB is left as text.

`linegauge/slice` follows slice-ansi 10.0.1, graded 129 / 129 (control 129 / 129):

- A link's URI separator is looked for only before its terminator.
- A cut that takes back styles with no text after them takes back the link changes after them too.
- A style written between the two halves of a surrogate pair stays inside the one character they make.
