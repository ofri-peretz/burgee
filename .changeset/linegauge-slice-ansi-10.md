---
"linegauge": minor
---

`linegauge/slice` follows slice-ansi 10.0.0 (106 / 106, level with its control): a cut counts the columns `width` counts, so CRLF and every other cluster that draws nothing take no column, and a lone regional indicator takes one, where slice-ansi 9 gave each at least one position and the indicator two. `linegauge/cli-truncate` follows cli-truncate 6.2.0 (17 / 17): `preferTruncationOnSpace` finds its space by terminal column, so a style or a wide or zero-width character before the break no longer moves it, and the text after the mark loses its leading spaces without losing its trailing ones or its closing style. `linegauge/strip` follows ansi-regex 6.5.0, which strip-ansi 7.2.0 now resolves: a CSI's final byte is never a digit, and a private-parameter CSI such as the device attributes reply is stripped whole.
