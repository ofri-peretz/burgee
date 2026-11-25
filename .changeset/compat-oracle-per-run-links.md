---
'compat-oracle': patch
---

`Host.links`: symlinks a suite reads are made per run beside the vendored suite (`writeLinks`), not committed. find-up's `fixture/directory-link -> .` loops, and a repository holding a loop cannot be downloaded as a GitHub action.
