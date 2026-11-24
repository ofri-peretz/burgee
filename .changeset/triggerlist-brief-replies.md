---
"triggerlist": patch
---

`triggerlist brief --replies <file>` quotes the pull request author's comments and review-thread replies posted after the previous review round (bots left out, at most 10, each trimmed to 1200 characters), and tells the reviewer that a finding the author answered is not repeated unless the new diff changes the facts: it says in one line that it was answered and why that answer holds or does not.
