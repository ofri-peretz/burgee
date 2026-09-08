---
"caique": patch
---

`createIo()` — a reader and writer over real streams, so `ask()` can be used by a program and not only by a test. A `password` prompt is not echoed, and the muting lives in the one layer that knows what echo is.
