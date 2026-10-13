---
"caique": patch
---

`caique/clack`: a validator that throws, or returns a promise that rejects — a network check that fails, say — is now a failed check: the prompt shows the error's message (or the `messages.error` setting when it has none) and stays open, so the person can retry or cancel. It used to escape the keypress listener as an unhandledRejection, which kills a Node process by default; after an abort it escaped from a prompt that had already answered. `@clack/core` 1.5.1 lets it escape the same way.
