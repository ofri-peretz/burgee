---
"oxmutate": patch
---

Each Vitest server's tests now write their temporary files (`TMPDIR`, `TMP`, `TEMP`) inside the run's work directory, which is removed when the run ends. A test interrupted by a kill never runs its own cleanup, and runs had left tens of thousands of entries in the system's temporary directory.
