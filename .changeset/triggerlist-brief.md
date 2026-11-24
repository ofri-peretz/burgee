---
"triggerlist": minor
---

`triggerlist brief <base> --head <sha>` prints a reviewer's brief for one round: REVIEW.md as the base branch has it, the checklist items the diff fires, the reviewer's findings from the previous round (`--comments`, the PR's comments as `gh api` lists them) and a marker line naming the commit it reviewed. The composite action `.github/actions/triggerlist-review` hands it to Claude in CI and flags a review whose head moved while it ran.
