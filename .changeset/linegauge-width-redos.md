---
"linegauge": patch
---

Security: a string of combining grapheme joiners could hang `width()`. Deciding whether a cluster occupies no column used the regex `^(?:DI|Control|Format|Mn|Me|Surrogate)+$`, and `U+034F` COMBINING GRAPHEME JOINER belongs to two of those classes, so a run of them followed by one visible character backtracked exponentially: 26 joiners took 2.4 seconds and 1,000 did not finish in ten minutes. Any caller measuring untrusted text, and everything that measures through `width()` (`wrap`, `slice`, `truncate`, `widest`, `lineCount`), could be stalled by a few dozen invisible characters. The check is now a loop over code points, linear in the input: 1,000 joiners measure in under a millisecond and 3,000,000 in about 200 ms, with the answer unchanged on every input the regex finished on. Found by string-width 8.3.0's suite, which added these cases.
