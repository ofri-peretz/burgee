---
'hookset': minor
---

The Claude pack gains `worktree-sweep.mjs`, a SessionStart hook that runs the repo's own `hookset worktrees --prune` in the background at most once a day per clone, so the worktrees agents leave behind are cleaned up without anyone asking. It removes only worktrees that hold no work. `HOOKSET_WORKTREES=0` turns it off, `HOOKSET_WORKTREES_OLDER_THAN=<days>` sets the age, and `git worktree lock` keeps a worktree out of every sweep. `hookset check` now wants it vendored and wired like the rest of the pack; `hookset init --claude` does both.
