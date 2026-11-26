---
'hookset': patch
---

`hookset worktrees --size` sizes each worktree after every worktree's git has finished. A linked
worktree's index lives under the main one's `.git/worktrees/`, so sizing the main tree while
another worktree's `git status` rewrote that index read a size that was gone a moment later.
