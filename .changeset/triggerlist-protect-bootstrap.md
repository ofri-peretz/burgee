---
"triggerlist": patch
---

`triggerlist protect` passes, checking nothing, when the base branch has no checklist yet, so the pull request that adds a repository's first `.sdlc/checklist.yaml` no longer fails its own pre-push.
