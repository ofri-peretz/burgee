---
"bellpull": minor
---

`whichSync`, and so `resolveExecutable` and every `run()`, stops at the first `PATH` entry that answers instead of statting every entry after it, and an absent candidate is no longer an exception (`statSync` with `throwIfNoEntry: false`). Resolution on an 18-entry ubuntu-latest `PATH` went from ~195 µs a call to a few µs, which was the whole of `run`'s 6 % over tinyexec's `x` on spawn time. `whichAllSync` still walks every entry. A candidate whose stat fails for any other reason (`ELOOP`, `EACCES`) is still a miss, not a throw.
