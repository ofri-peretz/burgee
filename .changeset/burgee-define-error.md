---
'burgee': minor
---

`defineError({ name, code })` declares an error class with its own exit code (7–125). Throw it from a handler and the program leaves with that code, printing the message and any `hint` and `fix` the same way `UsageError` does, with `error.code` in the JSON envelope. Subclasses inherit the code. Defining a second class with the same code throws when the module loads.
