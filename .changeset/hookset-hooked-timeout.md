---
'hookset': minor
---

guard-bash denies a foreground `git commit` or `git push` under a 5-minute timeout: their hooks are the repo's gate and outlive Claude Code's default 2 minutes. The denial names the fix (`timeout: 600000` or `run_in_background: true`), so a repo's CLAUDE.md no longer has to say "not a hang".
