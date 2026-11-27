---
'hookset': patch
---

`hookset init` writes `.claude/settings.json`, `.mcp.json` and `.claude/hookset.json` the way Prettier prints them, so a repo whose format gate covers `.claude/` stays green after an upgrade (four repos failed it on the 1.5.0 rollout). `hookset check` now reports `parallel-with-piped` when a repo's own `pre-push` sets `parallel: true` beside the piped preset: lefthook refuses that pair, so the push could not start.
