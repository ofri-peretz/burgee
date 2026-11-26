---
'hookset': minor
---

The Claude Code `guard-bash` hook now lints a `git commit -m …` / `-F …` message before the commit runs. It uses the repo's own commitlint config and, where the repo runs the provedone station, the `Verified-by:` receipt rule, and denies in about half a second with the fix (the valid scopes, "add `Verified-by: <command> -> exit 0`", the 100-character footer limit). Before, the same failures came from `commit-msg` only after the multi-minute `pre-commit` had run. A repo with no commitlint config or install, a commit that opens the editor, and any internal error get no opinion. Re-run `hookset init --claude` to vendor the new copy.
