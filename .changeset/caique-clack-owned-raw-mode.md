---
"caique": patch
---

`caique/clack`: a prompt's raw mode goes through `closeout/cursor`'s `rawMode`, as `caique/raw` already does. A prompt on a stream that was already raw no longer switches raw mode off when it ends, and raw mode it did turn on is also turned off on `SIGINT` and `SIGTERM`. `caique/clack` still grades 16 / 17 against clack's suite.
