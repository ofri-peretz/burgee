---
"contractdiff": patch
---

`diff` and `props` read a `git:<ref>:<path>` side through git, as the README and `--help` say they do. The bin used to refuse every such side with "this build of contractdiff does not run git"; it now runs `git show <ref>:./<path>` (through bellpull) in the folder it was run in, reads the base ref's `contractdiff.config.json` for `--decisions` from the same ref, and refuses a side git cannot show with git's own words and a `fix:` line.
