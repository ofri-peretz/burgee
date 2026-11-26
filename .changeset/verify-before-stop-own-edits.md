---
"hookset": minor
---

verify-before-stop judges only code this session changed: paths its Edit/Write tools wrote, and paths whose content changed across one of its Bash calls. Another session or a generator rewriting files in the same checkout no longer sends this session's turn back. `hookset init --claude` adds the two new hook entries (PreToolUse Bash, PostToolUse Edit|Write|MultiEdit|NotebookEdit); `hookset check` reports a repo missing them.
