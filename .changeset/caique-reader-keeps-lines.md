---
"caique": patch
---

`caique/terminal`: `createIo()`'s reader no longer drops lines that arrive before a question is asked. It listened for one `line` event per `line()` call, so `printf 'x\ny\n' | cli` lost both answers and `ask()` read the missing line as a cancellation. Lines are now queued from a single listener and handed out in order, before the end of the stream is.
