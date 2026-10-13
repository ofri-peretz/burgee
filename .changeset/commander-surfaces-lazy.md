---
"burgee": patch
---

`burgee/commander` loads the code that serves `completion <shell>` and `--mcp` only when one of them is asked for, which takes 757 B off its start-up bundle (56,418 → 55,661 B on `/docs/weight`). Both surfaces behave as before. `--schema` still answers inside a synchronous `parse()`.
