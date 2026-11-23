---
'replay': minor
---

replay, which grades the reviewer and the checks against bugs that actually happened: `run` replays each case (a bug PR with a one-sentence answer key, or a size-matched clean control) in a worktree at its head through the configured reviewer and checks, grades each finding against the answer key with at most `--max-findings` grader calls per case, and reports recall per stage, false alarms on controls, and how often every check and checklist item fired and was right, naming the ones that never fired. `propose` drafts cases from reverts and fixes on main; `check` validates the cases and config.
