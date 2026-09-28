---
"caique": patch
"flagstaff": patch
---

Raw mode is paired with its undo through `closeout/cursor`'s `rawMode`, the way the cursor already was.

- `caique/raw`: a list prompt on a stream that was already in raw mode — a prompt library's, or the program's own — no longer switches raw mode off when it ends; it used to call `setRawMode(false)` unconditionally and take the keyboard from its owner. Raw mode the prompt did turn on is now turned off on `SIGINT` and `SIGTERM` too, not only in the prompt's own `finally`. `KeyStream` gains an optional `isRaw`.
- `flagstaff/ora`: stdin-discarder's raw mode goes through the same pairing. Behaviour is unchanged except that an already-raw stdin is no longer written to at all.
