---
'triggerlist': minor
---

triggerlist, a review checklist the diff selects: `match` prints only the items whose triggers fire on `<base>...HEAD`, read from the base branch so a change cannot edit its own checks; `compile` writes REVIEW.md under a byte budget and names the least-fired rules to drop when over; `seed` drafts items from lock-test headers and decision files; `protect` flags a change to a gate file made together with the code it judges.
