---
"contractdiff": patch
---

The CLI's output reads as it should. A refusal that names its fix prints `error:` and `fix:` once, with no usage block after it, and under `--json` puts the fix in `error.fix` (a missing contract file is now such a refusal, not Node's `ENOENT`). A decision finding's fix line no longer says `fix:` twice. `diff --changeset` names its file `.changeset/contractdiff-<hash>.md` instead of `apicontract-diff-<hash>.md`. `gen`, `extract`, `migrate` and `plugin new` print what they wrote, edited and found as text unless `--json` is passed, instead of their data's fields.
