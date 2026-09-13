---
'linegauge': minor
---

`strip` (R3), and a width bug it found. `util.stripVTControlCharacters` leaves the colon
form of an extended colour — `ESC[38:2::255:0:0m`, how every truecolor library writes one —
in the output as text, so `width()` answered 15 for a three-column string. Measured across
sixteen sequence shapes: Node is exact on fifteen and wrong on that one. Published as
`linegauge/strip`.
