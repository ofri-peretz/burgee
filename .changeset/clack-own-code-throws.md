---
"caique": patch
---

`caique/clack`: a throw from the prompt's own code — a `render`, `onKey` or `finalize` that throws, on a key, on an abort, or on the first frame — now rejects the prompt's promise with that error, after turning raw mode off, removing the keypress listener and showing the cursor again. From a key it used to escape the keypress listener as an unhandledRejection, which kills a Node process by default, and left the prompt unsettled with raw mode on; from an abort it was an uncaught exception; from the first frame the promise rejected but left raw mode on and the keypress listener attached. A validator that throws is still a failed check, as before.
