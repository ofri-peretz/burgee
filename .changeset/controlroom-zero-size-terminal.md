---
'controlroom': patch
---

A terminal that reports a size of 0 × 0 is drawn at 80 × 24. A pseudo-terminal nobody gave a
window size (`docker run -t` before its first resize, Python's `pty.fork()`, `script` on some
systems) reports 0 columns and 0 rows, and a screen opened on one was laid out on zero rows and
drew nothing for its whole life. A size of 0 now means no size, as it already did in flagstaff's
frame writer and in `controlroom/ink`.
