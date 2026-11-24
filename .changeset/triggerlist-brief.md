---
'triggerlist': minor
---

`triggerlist brief <base> --head <sha>` writes the reviewer's prompt: REVIEW.md and the checklist as the base branch has them, the items the diff fires, and the previous round's findings from the pull request's comments. `triggerlist stale <reviewed> <head>` exits 1 when the head moved past the reviewed SHA. burgee's Claude review now runs through the reusable `.github/workflows/review.yml` that uses both (spec R5).
