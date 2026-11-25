---
'hookset': minor
---

`hookset context` measures the always-loaded Claude Code context (CLAUDE.md and its `@`-imports, plus every model-invocable skill, command and subagent description) and fails when it is over the ceiling in `.claude/hookset.json`. `--update` lowers the ceiling to the current size and refuses to raise it.
