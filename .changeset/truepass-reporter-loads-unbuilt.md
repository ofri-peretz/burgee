---
"truepass": patch
---

The budget reporter imports nothing outside node until a case is over the budget. bellpull is
loaded only to measure a case alone, and CI is a non-empty `CI`, the same way roundel reads it. A
monorepo that contains truepass's own dependencies can now load the reporter from source in every
suite without building them first.
