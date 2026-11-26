---
"hookset": minor
---

verify-before-stop judges only code this session changed: paths its Edit/Write tools wrote, and paths whose content changed across one of its Bash calls. Another session or a generator rewriting files in the same checkout no longer sends this session's turn back. `hookset init --claude` adds the two new hook entries (PreToolUse Bash, PostToolUse Edit|Write|MultiEdit|NotebookEdit); `hookset check` reports a repo missing them.

Every pack hook now carries a Claude Code `timeout` (10 s for guard-bash and stop-after-3, 30 s for the rest), so a stuck hook is killed instead of holding the session. `hookset init --claude` adds it to entries wired before, and keeps a timeout the repo set.

The lefthook presets every repo pulls now stop a push at its first failing step (`piped: true`) and give every step a timeout (pre-commit 30 s, commit-msg 1 m, verify 4 m, mutation 5 m, the rest 2 m), so a git hook fails instead of hanging.
