---
'burgee': patch
---

The B1 agent-cost axis now recognises an empty credential as no credential. A workflow that maps an unset repository secret into the environment leaves the variable **present and empty**, not absent, so a guard testing against `undefined` never fired: the axis ran, `claude` failed to authenticate on all 25 task-runs, and the skip reported that `claude` "answered but nothing it produced passed a task's own check" — pointing a reader at a prompt-quality problem that did not exist.
