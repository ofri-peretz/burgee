---
"bellpull": patch
---

Faster lookups:

- `whichSync` and `resolveExecutable` (and therefore `run`) stop at the first hit on `PATH`, instead of stat-ing every directory to keep only the first answer.
- The `bellpull/node-which` façade builds each candidate path as it tries it.
- A miss no longer throws and catches an `ENOENT` per directory (`statSync(…, { throwIfNoEntry: false })`).
- In B5, `bellpull/node-which` ÷ which went from 1.05× on CI (2.9× with a 60-entry `PATH`) to 0.29× locally.
