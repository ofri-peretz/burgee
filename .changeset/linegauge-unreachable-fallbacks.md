---
'linegauge': patch
---

Remove 20 unreachable `??` fallbacks from `width` and `wrap`. Each one guarded a value that is
always present: an in-range table index, the code point of a non-empty cluster, the first element
of `String.prototype.split`, or a named group of a regex that declares it. No output changes: the
compat grades are unchanged at 233/85/8/104. The coverage gate is now a plain 100% on lines,
functions, statements and branches, with no per-file exception.
