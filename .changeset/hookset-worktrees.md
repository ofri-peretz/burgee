---
'hookset': minor
---

`hookset worktrees` lists every linked git worktree of a clone (the ones Claude Code's `--worktree`, subagent isolation and other agents leave behind), with `--size` its size on disk, and why each stays. `--prune` removes only those that hold no work: not the main or current one, not locked, an empty `git status`, every commit on a remote, and unchanged for `--older-than` days (default 3), through `git worktree remove` without `--force`, then `git worktree prune`. Branches are kept. `--include-local-commits` lets a commit that is only on this machine go too, and `git worktree lock` keeps a worktree out of every sweep.
